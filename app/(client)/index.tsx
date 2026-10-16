import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import KnowledgeHubSection from '../../components/KnowledgeHubSection';
import HomeAnimalTools from '../../components/HomeAnimalTools';
import PulletRearingPlanGenerator from '../../components/PulletRearingPlanGenerator';
import MarketplaceBrowseModal from '../../components/MarketplaceBrowseModal';
import ProductImageCarousel from '../../components/ProductImageCarousel';
import WelcomeModal from '../../components/WelcomeModal';
import { requestAiAssistant } from '../../lib/aiAssistant';
import { requestDeviceLocation } from '../../lib/location';
import { fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { sanitizeInput } from '../../lib/sanitize';
import { useLanguage } from '../../lib/language';
import { getCurrentUser, normalizeUuid, readCachedAuthState, supabase } from '../../lib/supabase';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AiSession {
  sessionId: string;
  userId: string;
}

const naira = (price: number) => `₦${price.toLocaleString()}`;

export default function ClientHome() {
  const { t } = useLanguage();
  const router = useRouter();
  const { openMarketplace } = useLocalSearchParams<{ openMarketplace?: string }>();
  const role = 'client';
  const { products } = useMarketplace();
  const [aiVisible, setAiVisible] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSession, setAiSession] = useState<AiSession | null>(null);
  const [productOrderStatuses, setProductOrderStatuses] = useState<Record<string, string>>({});
  const [user, setUser] = useState<Awaited<ReturnType<typeof getCurrentUser>>>(null);
  const [selectedProduct, setSelectedProduct] = useState<(typeof products)[number] | null>(null);
  const [marketplaceBrowseVisible, setMarketplaceBrowseVisible] = useState(false);
  const messagesScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (openMarketplace !== 'true') return;
    const frameId = requestAnimationFrame(() => {
      setMarketplaceBrowseVisible(true);
      router.setParams({ openMarketplace: undefined });
    });
    return () => cancelAnimationFrame(frameId);
  }, [openMarketplace, router]);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.user_metadata?.first_name || 'there';

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user || !normalizeUuid(product.merchantId)) return;
    const conversationId = `conv_${[user.id, product.merchantId].sort().join('_')}`;
    router.push({ pathname: '/chat', params: { conversationId, productId: product.id, merchantId: product.merchantId, merchantName: product.merchant, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} for ₦${product.price}.`, inquiryKey: `${product.id}-${Date.now()}` } });
  };

  const openProductDetails = (product: (typeof products)[number]) => {
    setSelectedProduct(product);
  };

  const proceedToBuy = async () => {
    if (!selectedProduct) return;
    const product = selectedProduct;
    setSelectedProduct(null);
    await inquireAboutProduct(product);
  };

  useFocusEffect(
    useCallback(() => {
      void fetchMarketplaceProducts().catch(() => undefined);
    }, [])
  );

  const hydrateUser = useCallback(async () => {
    const cachedState = await readCachedAuthState();
    if (cachedState.user) {
      setUser(cachedState.user as Awaited<ReturnType<typeof getCurrentUser>>);
    }

    try {
      const freshUser = await getCurrentUser();
      setUser(freshUser);
    } catch {
      setUser(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void hydrateUser();
    }, [hydrateUser])
  );

  useEffect(() => {
    // 1. Fetch marketplace products
    void fetchMarketplaceProducts().catch(() => undefined);

    // 2. Automatically prompt location permission on initial load
    void requestDeviceLocation().catch((err) => {
      console.warn('[Client Home] Location request skipped or denied:', err);
    });
  }, []);

  useEffect(() => {
    if (!aiVisible) return;
    let mounted = true;

    const loadChatHistory = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        const userId = normalizeUuid(user.id);
        if (!userId) return;
        const sessionId = `client-ai-${userId}`;
        if (mounted) setAiSession({ sessionId, userId });

        const { data, error } = await supabase
          .from('mvsai_chat_messages')
          .select('id, role, content, created_at')
          .eq('user_id', userId)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true });
        if (error) {
          console.error('Error loading chat history:', error);
          return;
        }
        if (mounted && data) {
          setMessages(data.map((msg: any) => ({ id: msg.id, role: msg.role as 'user' | 'assistant', content: msg.content })));
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    void loadChatHistory();
    return () => { mounted = false; };
  }, [aiVisible]);

  const loadOrderStatuses = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, error } = await supabase.from('orders').select('product_id, status').eq('buyer_id', user.id);
      if (error) throw error;
      const statusMap: Record<string, string> = {};
      for (const item of data || []) {
        if (item?.product_id) statusMap[String(item.product_id)] = item.status;
      }
      setProductOrderStatuses(statusMap);
    } catch (error) {
      console.warn('[Client Home] Failed to load order statuses:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOrderStatuses();
    }, [loadOrderStatuses])
  );

  useEffect(() => {
    let mounted = true;
    const channelName = `client-home-orders:${Date.now()}`;
    const ordersChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          if (!mounted) return;
          void loadOrderStatuses();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(ordersChannel);
    };
  }, [loadOrderStatuses]);

  const getOrderBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'paid':
        return { label: 'Payment sent', color: '#F59E0B' };
      case 'completed':
      case 'confirmed':
        return { label: 'Completed', color: '#10B981' };
      case 'pending':
      case 'pending_payment':
      case 'awaiting_payment':
        return { label: 'Awaiting payment', color: '#F59E0B' };
      default:
        return { label: 'In progress', color: '#3B82F6' };
    }
  };

  const askAiAssistant = async () => {
    const prompt = sanitizeInput(userQuery);
    if (!prompt || aiLoading || !aiSession) return;

    const serviceError = 'Unable to connect to MVS Assistant service. Please try again.';
    const userMsg: Message = { role: 'user', content: prompt };

    setMessages((prev) => [...prev, userMsg]);
    setUserQuery('');
    setAiLoading(true);

    let assistantContent = serviceError;
    try {
      assistantContent = await requestAiAssistant([...messages, userMsg], 'client');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('AI assistant request failed:', errorMessage);
    }

    const assistantMsg: Message = { role: 'assistant', content: assistantContent };
    setMessages((prev) => [...prev, assistantMsg]);
    setAiLoading(false);

    void Promise.all([
      supabase.from('mvsai_chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'user', content: userMsg.content }),
      supabase.from('mvsai_chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'assistant', content: assistantMsg.content }),
    ]).then(([userResult, assistantResult]) => {
      if (userResult.error) console.error('Error saving user message:', userResult.error);
      if (assistantResult.error) console.error('Error saving assistant message:', assistantResult.error);
    });

    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const copyAiMessage = async (content: string) => {
    try {
      await Clipboard.setStringAsync(content);
      if (Platform.OS === 'web') window.alert('Message copied to clipboard.');
      else Alert.alert('Copied', 'Message copied to clipboard.');
    } catch (error) {
      console.error('[MVS AI] Could not copy message:', error);
      if (Platform.OS === 'web') window.alert('Could not copy this message.');
      else Alert.alert('Copy failed', 'Could not copy this message.');
    }
  };

  const showAiMessageOptions = (content: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Copy this message to the clipboard?')) void copyAiMessage(content);
      return;
    }
    Alert.alert('Message options', 'Choose an action for this message.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy message', onPress: () => { void copyAiMessage(content); } },
    ]);
  };

  const openVetChat = () => {
    setAiVisible(false);
    router.push('/(client)/vets');
  };

  return (
    <SafeAreaView style={styles.container}>
      <WelcomeModal />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>{t('home.hello', { name: firstName })} 👋</Text>
          <Text style={styles.greetingSubtitle}>{t('home.subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.aiCard} onPress={() => setAiVisible(true)}>
          <View style={styles.aiIcon}>
            <MaterialCommunityIcons name="robot-outline" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.aiCardCopy}>
            <Text style={styles.aiTitle}>{t('home.askAssistant')}</Text>
            <Text style={styles.aiText}>{t('home.assistantDescription')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <KnowledgeHubSection />

        <View style={styles.banner}>
          <View style={styles.flex}>
            <Text style={styles.bannerTitle}>{t('home.consultVet')}</Text>
            <Text style={styles.bannerText}>{t('home.consultDescription')}</Text>
          </View>
          <TouchableOpacity style={styles.bannerButton} onPress={() => router.push('/(client)/vets')}>
            <Text style={styles.bannerButtonText}>{t('home.consult')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.clinicBrowseCard}
          onPress={() => router.push('/(client)/explore-clinics')}
          accessibilityRole="button"
          accessibilityLabel="Explore veterinary clinics near you"
        >
          <View style={styles.clinicBrowseIcon}>
            <MaterialCommunityIcons name="hospital-building" size={25} color="#93C5FD" />
          </View>
          <View style={styles.clinicBrowseCopy}>
            <Text style={styles.clinicBrowseTitle}>Explore Vet Clinics</Text>
            <Text style={styles.clinicBrowseText}>Find nearby clinics on the map and contact a practice.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={23} color="#93C5FD" />
        </TouchableOpacity>

        <HomeAnimalTools
          onContactVendor={() => setMarketplaceBrowseVisible(true)}
          onContactVet={() => router.push('/(client)/vets')}
        />
        <View style={styles.farmToolsColumn}>
          <PulletRearingPlanGenerator audience="client" compact />
          <TouchableOpacity
            style={[styles.farmTrackerCard, styles.farmTrackerCompact, styles.farmTrackerFullWidth]}
            onPress={() => router.push('/(client)/farm-performance')}
            accessibilityRole="button"
            accessibilityLabel="Open MVS Farm Performance Tracker"
          >
            <View style={styles.farmTrackerIcon}>
              <MaterialCommunityIcons name="chart-box-outline" size={21} color="#10B981" />
            </View>
            <View style={styles.farmTrackerCopy}>
              <Text style={styles.farmTrackerCompactTitle}>MVS Farm Performance Tracker</Text>
              <Text style={styles.farmTrackerText}>Monitor feed, growth, mortality & profit.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <SectionHeader title={t('home.marketplace')} action={t('home.browseAll')} onAction={() => setMarketplaceBrowseVisible(true)} />
        <View style={styles.grid}>
          {products.map((product) => {
            const badge = getOrderBadge(productOrderStatuses[String(product.id)]);
            return (
              <TouchableOpacity key={product.id} style={styles.product} onPress={() => openProductDetails(product)} activeOpacity={0.85}>
                <View style={styles.productImage}>
                  {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productPhoto} /> : <MaterialCommunityIcons name={product.icon as any} size={38} color="#CBD5E1" />}
                </View>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productPrice}>{naira(product.price)}</Text>
                <Text style={styles.muted}>{product.merchant}</Text>
                {badge && (
                  <View style={[styles.orderBadge, { backgroundColor: badge.color }]}>
                    <Text style={styles.orderBadgeText}>{badge.label}</Text>
                  </View>
                )}
                <View style={styles.inquireButton}><Text style={styles.inquireText}>View Details</Text></View>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      <MarketplaceBrowseModal
        visible={marketplaceBrowseVisible}
        products={products}
        onClose={() => setMarketplaceBrowseVisible(false)}
        onSelectProduct={openProductDetails}
      />

      <Modal visible={selectedProduct !== null} transparent animationType="fade" onRequestClose={() => setSelectedProduct(null)}>
        <View style={styles.productModalOverlay}>
          <View style={styles.productModal}>
            <View style={styles.productModalHeader}>
              <Text style={styles.productModalTitle}>Product Details</Text>
              <TouchableOpacity onPress={() => setSelectedProduct(null)} accessibilityLabel="Close product details">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ProductImageCarousel images={selectedProduct?.images} fallbackImage={selectedProduct?.imageUrl} height={180} />
            <Text style={styles.productModalName}>{selectedProduct?.name}</Text>
            <Text style={styles.productModalLabel}>Description</Text>
            <Text style={styles.productModalText}>{selectedProduct?.description || 'No description available.'}</Text>
            <View style={styles.productModalMeta}>
              <View style={styles.flex}><Text style={styles.productModalLabel}>Price</Text><Text style={styles.productModalPrice}>{selectedProduct ? naira(selectedProduct.price) : ''}</Text></View>
              <View style={styles.flex}><Text style={styles.productModalLabel}>Category</Text><Text style={styles.productModalText}>{selectedProduct?.category || 'General'}</Text></View>
            </View>
            <TouchableOpacity style={styles.proceedButton} onPress={() => void proceedToBuy()}>
              <Text style={styles.proceedButtonText}>Proceed to Buy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={aiVisible} animationType="slide" transparent onRequestClose={() => setAiVisible(false)}>
        <KeyboardAvoidingView style={styles.aiOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.aiModal}>
            <View style={styles.aiHeader}>
              <View style={styles.aiHeaderCopy}>
                <Text style={styles.aiModalTitle}>MVS AI Assistant</Text>
                <Text style={styles.aiModalSubtitle}>Pet and livestock care guidance · hold a message to copy</Text>
              </View>
              <TouchableOpacity onPress={() => setAiVisible(false)} accessibilityLabel="Close AI assistant">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.aiConversation}
              ref={messagesScrollRef}
              contentContainerStyle={styles.aiConversationContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.length === 0 && !aiLoading && (
                <Text style={styles.aiHint}>
                  Ask about symptoms, feeding, vaccination, hydration, or general animal care.
                </Text>
              )}
              {messages.map((msg, index) => (
                <TouchableOpacity key={msg.id || `msg-${index}`} activeOpacity={0.9} onLongPress={() => showAiMessageOptions(msg.content)} accessibilityRole="button" accessibilityLabel={`Message options for ${msg.role} message`}>
                  {msg.role === 'assistant' ? (
                    <View style={[styles.messageBubble, styles.assistantMessage]}>
                      <MarkdownResponse text={msg.content} />
                    </View>
                  ) : (
                    <View style={[styles.messageBubble, styles.userMessage]}>
                      <Text style={styles.userMessageText}>{msg.content}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {aiLoading && (
                <View style={[styles.messageBubble, styles.assistantMessage]}>
                  <ActivityIndicator color="#10B981" />
                  <Text style={styles.aiHint}>Thinking through your question...</Text>
                </View>
              )}
            </ScrollView>
            <TextInput
              value={userQuery}
              onChangeText={setUserQuery}
              placeholder="What would you like to know?"
              placeholderTextColor="#64748B"
              multiline
              style={styles.aiInput}
              editable={!aiLoading}
            />
            <TouchableOpacity style={[styles.askButton, (!userQuery.trim() || aiLoading) && styles.askButtonDisabled]} onPress={() => { void askAiAssistant(); }} disabled={!userQuery.trim() || aiLoading}>
              {aiLoading ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialCommunityIcons name="send" size={18} color="#FFFFFF" /><Text style={styles.askButtonText}>Ask Assistant</Text></>}
            </TouchableOpacity>
            {role === 'client' ? (
              <TouchableOpacity style={styles.vetCta} onPress={openVetChat}>
                <MaterialCommunityIcons name="stethoscope" size={18} color="#10B981" />
                <Text style={styles.vetCtaText}>Connect with a Licensed Vet Now</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <SupportFab role="client" />

    </SafeAreaView>
  );
}

function MarkdownResponse({ text }: { text: string }) {
  return (
    <View>
      {text.split(/\r?\n/).map((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return <View key={`space-${index}`} style={styles.markdownSpacer} />;

        const heading = trimmedLine.match(/^#{1,3}\s+(.+)$/);
        if (heading) return <Text key={`heading-${index}`} style={styles.markdownHeading}>{renderInlineMarkdown(heading[1])}</Text>;

        const bullet = trimmedLine.match(/^(?:[-*])\s+(.+)$/);
        if (bullet) {
          return (
            <View key={`bullet-${index}`} style={styles.markdownBullet}>
              <Text style={styles.markdownBulletMark}>•</Text>
              <Text style={styles.markdownBulletText}>{renderInlineMarkdown(bullet[1])}</Text>
            </View>
          );
        }

        return <Text key={`paragraph-${index}`} style={styles.answerText}>{renderInlineMarkdown(trimmedLine)}</Text>;
      })}
    </View>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const boldText = part.match(/^\*\*(.+)\*\*$/);
    return boldText ? <Text key={`bold-${index}`} style={styles.markdownBold}>{boldText[1]}</Text> : part;
  });
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction?: () => void }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onAction} disabled={!onAction}>
        <Text style={styles.action}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SupportFab({ role }: { role: string }) {
  const [offsetY, setOffsetY] = useState(0);
  const openSupport = async () => {
    const message = `Hello MVS Support, I need assistance with my account. Role: ${role}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `whatsapp://send?phone=2349074874395&text=${encodedMessage}`;
    const webUrl = `https://wa.me/2349074874395?text=${encodedMessage}`;
    try {
      if (await Linking.canOpenURL(whatsappUrl)) await Linking.openURL(whatsappUrl);
      else await Linking.openURL(webUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  };
  const [panResponder] = useState(() => {
    let currentOffset = 0;
    let startOffset = 0;
    let moved = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startOffset = currentOffset; moved = false; },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dy) > 6) moved = true;
        currentOffset = Math.max(-300, Math.min(300, startOffset + gesture.dy));
        setOffsetY(currentOffset);
      },
      onPanResponderRelease: () => { if (!moved) void openSupport(); },
      onPanResponderTerminate: () => { moved = true; },
    });
  });
  return <View {...panResponder.panHandlers} style={[styles.supportFab, { transform: [{ translateY: offsetY }] }]}><MaterialCommunityIcons name="whatsapp" size={29} color="#FFFFFF" /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16 },
  contentContainer: { paddingBottom: 96 },
  greeting: { marginBottom: 18 },
  greetingTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  greetingSubtitle: { color: '#94A3B8', fontSize: 13, marginTop: 5 },
  aiCard: { backgroundColor: '#0E7490', borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 24, elevation: 4, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6 },
  farmTrackerCard: { backgroundColor: '#101D2D', borderColor: '#213249', borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  farmToolsColumn: { width: '100%', alignItems: 'stretch', gap: 9, marginBottom: 16 },
  farmTrackerCompact: { minHeight: 76, padding: 10, borderRadius: 12, gap: 8, marginBottom: 0 },
  farmTrackerFullWidth: { alignSelf: 'stretch', width: '100%' },
  farmTrackerIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#34D39918', alignItems: 'center', justifyContent: 'center' },
  farmTrackerCopy: { flex: 1 },
  farmTrackerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  farmTrackerCompactTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  farmTrackerText: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  aiIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#FFFFFF24', alignItems: 'center', justifyContent: 'center' },
  aiCardCopy: { flex: 1, marginHorizontal: 12 },
  aiTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  aiText: { color: '#CFFAFE', fontSize: 12, lineHeight: 18, marginTop: 3 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  action: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  banner: { backgroundColor: '#10B981', borderRadius: 15, padding: 18, flexDirection: 'row', alignItems: 'center', marginVertical: 26, elevation: 4, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
  clinicBrowseCard: { backgroundColor: '#17263B', borderColor: '#2B4A71', borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -14, marginBottom: 20 },
  clinicBrowseIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#2563EB24', alignItems: 'center', justifyContent: 'center' },
  clinicBrowseCopy: { flex: 1 },
  clinicBrowseTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  clinicBrowseText: { color: '#BFDBFE', fontSize: 12, lineHeight: 17, marginTop: 3 },
  flex: { flex: 1 },
  bannerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  bannerText: { color: '#D1FAE5', marginTop: 4, fontSize: 13 },
  bannerButton: { backgroundColor: '#FFFFFF', borderRadius: 9, padding: 11, alignItems: 'center' },
  bannerButtonText: { color: '#10B981', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  product: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, elevation: 3, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5 },
  productImage: { height: 96, backgroundColor: '#0F172A', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  productPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    resizeMode: 'cover',
  },
  productName: { color: '#FFFFFF', fontWeight: '600', fontSize: 13, marginBottom: 7 },
  productPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14 },
  muted: { color: '#94A3B8', fontSize: 11 },
  orderBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8, marginBottom: 4 },
  orderBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  inquireButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  inquireText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  productModalOverlay: { flex: 1, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center', padding: 20 },
  productModal: { width: '100%', maxWidth: 440, maxHeight: '85%', backgroundColor: '#1E293B', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#334155' },
  productModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  productModalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  productModalImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 14, backgroundColor: '#0F172A' },
  productModalName: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  productModalLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  productModalText: { color: '#CBD5E1', fontSize: 14, lineHeight: 20 },
  productModalMeta: { flexDirection: 'row', gap: 20 },
  productModalPrice: { color: '#10B981', fontSize: 18, fontWeight: '700' },
  proceedButton: { backgroundColor: '#10B981', borderRadius: 9, paddingVertical: 13, alignItems: 'center', marginTop: 22 },
  proceedButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  supportFab: { position: 'absolute', bottom: 16, right: 20, zIndex: 9999, width: 56, height: 56, borderRadius: 28, backgroundColor: '#005F53', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  backButton: { borderColor: '#3B82F6', borderWidth: 1, borderRadius: 9, padding: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 30 },
  backText: { color: '#3B82F6', fontWeight: '600' },
  aiOverlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  aiModal: { maxHeight: '85%', backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 14 },
  aiHeaderCopy: { flex: 1 },
  aiModalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  aiModalSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  aiConversation: { minHeight: 150, maxHeight: 360, marginVertical: 14 },
  aiConversationContent: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 4 },
  messageBubble: { marginBottom: 12, borderRadius: 10, padding: 12 },
  userMessage: { backgroundColor: '#10B98120', borderLeftWidth: 3, borderLeftColor: '#10B981', alignSelf: 'flex-end', maxWidth: '85%' },
  assistantMessage: {
    backgroundColor: '#3B82F620',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    alignSelf: 'flex-start', // <-- Updated from 'start'
    maxWidth: '95%',
    textAlign: 'left',
  },
  userMessageText: { color: '#E2E8F0', fontSize: 14, lineHeight: 21 },
  aiHint: { color: '#94A3B8', fontSize: 14, lineHeight: 21 },
  answerText: { color: '#E2E8F0', fontSize: 15, lineHeight: 22 },
  markdownHeading: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '700', marginBottom: 10 },
  markdownBold: { fontWeight: '700', color: '#FFFFFF' },
  markdownBullet: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  markdownBulletMark: { color: '#10B981', fontSize: 15, lineHeight: 22, marginRight: 8 },
  markdownBulletText: { flex: 1, color: '#E2E8F0', fontSize: 15, lineHeight: 22 },
  markdownSpacer: { height: 6 },
  aiInput: { minHeight: 52, maxHeight: 110, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, color: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, textAlignVertical: 'top' },
  askButton: { backgroundColor: '#10B981', borderRadius: 10, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  askButtonDisabled: { opacity: 0.5 },
  askButtonText: { color: '#FFFFFF', fontWeight: '700' },
  vetCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, marginTop: 5 },
  vetCtaText: { color: '#10B981', fontSize: 13, fontWeight: '700' },
});
