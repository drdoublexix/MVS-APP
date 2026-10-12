import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import KnowledgeHubSection from '../../components/KnowledgeHubSection';
import HomeAnimalTools from '../../components/HomeAnimalTools';
import MarketplaceBrowseModal from '../../components/MarketplaceBrowseModal';
import ProductImageCarousel from '../../components/ProductImageCarousel';
import WelcomeModal from '../../components/WelcomeModal';
import { requestAiAssistant } from '../../lib/aiAssistant';
import { requestDeviceLocation } from '../../lib/location';
import { fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, normalizeUuid, supabase } from '../../lib/supabase';
import { useLanguage } from '../../lib/language';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AiSession {
  sessionId: string;
  userId: string;
}

export default function VetDashboardScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { openMarketplace } = useLocalSearchParams<{ openMarketplace?: string }>();
  const { products } = useMarketplace();
  const [selectedProduct, setSelectedProduct] = useState<(typeof products)[number] | null>(null);
  const [marketplaceBrowseVisible, setMarketplaceBrowseVisible] = useState(false);
  const [totalPatients, setTotalPatients] = useState(0);
  const [overallRating, setOverallRating] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [aiVisible, setAiVisible] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [retryPrompt, setRetryPrompt] = useState('');
  const [aiSession, setAiSession] = useState<AiSession | null>(null);
  const messagesScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (openMarketplace !== 'true') return;
    const frameId = requestAnimationFrame(() => {
      setMarketplaceBrowseVisible(true);
      router.setParams({ openMarketplace: undefined });
    });
    return () => cancelAnimationFrame(frameId);
  }, [openMarketplace, router]);

  useEffect(() => {
    // 1. Fetch marketplace products
    void fetchMarketplaceProducts().catch(() => undefined);

    // 2. Prompt device location permission on initial load
    void requestDeviceLocation().catch((err) => {
      console.warn('[Vet Dashboard] Location request skipped or denied:', err);
    });
  }, []);

  // Load AI chat history when modal opens
  useEffect(() => {
    if (!aiVisible) return;
    let mounted = true;

    const loadChatHistory = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;

        const userId = normalizeUuid(user.id);
        if (!userId) return; // <-- Add this check

        const sessionId = `vet-ai-${userId}`;

        if (mounted) {
          setAiSession({ sessionId, userId });
        }

        // Load existing messages for this session
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
          const loadedMessages = data.map((msg: any) => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    void loadChatHistory();
    return () => {
      mounted = false;
    };
  }, [aiVisible]);

  const refreshDashboardMetrics = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      const currentUserId = normalizeUuid(user?.id);
      if (!currentUserId) return;

      const { data: activeConsultations, error: consultationsError } = await supabase
        .from('consultations')
        .select('id, client_id')
        .eq('vet_id', currentUserId)
        .eq('status', 'active');

      if (consultationsError) {
        console.error('[Vet Dashboard] Failed to load active patient count:', consultationsError.message);
      } else {
        const activePatientIds = new Set(
          (activeConsultations || [])
            .map((consultation) => consultation.client_id)
            .filter((clientId): clientId is string => Boolean(clientId))
        );
        setTotalPatients(activePatientIds.size);
      }

      const { data: earningsData, error: earningsError } = await supabase
        .from('orders')
        .select('amount')
        .eq('merchant_id', currentUserId)
        .in('status', ['paid', 'completed']);

      if (!earningsError) {
        setTotalEarnings(earningsData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0);
      }

      const { data: ratingData, error: ratingError } = await supabase.rpc('get_vet_rating_summary', { target_vet_id: currentUserId });
      if (!ratingError) {
        const ratingSummary = Array.isArray(ratingData) ? ratingData[0] : ratingData;
        setOverallRating(Number(ratingSummary?.average_rating || 0));
      }
    } catch (error) {
      console.warn('[Vet Dashboard] Failed to refresh metrics:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      void refreshDashboardMetrics();

      const consultationChannel = supabase
        .channel('vet-dashboard-consultations')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'consultations' },
          (payload) => {
            if (!mounted) return;
            const changedConsultation = payload.eventType === 'DELETE'
              ? payload.old as { vet_id?: string }
              : payload.new as { vet_id?: string };
            if (!changedConsultation.vet_id) return;
            void refreshDashboardMetrics();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          () => {
            if (!mounted) return;
            void refreshDashboardMetrics();
          }
        )
        .subscribe();

      return () => {
        mounted = false;
        void supabase.removeChannel(consultationChannel);
      };
    }, [refreshDashboardMetrics])
  );

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user || !normalizeUuid(product.merchantId)) return;
    const conversationId = `conv_${[user.id, product.merchantId].sort().join('_')}`;
    router.push({ pathname: '/(vet)/chat', params: { conversationId, merchantId: product.merchantId, merchantName: product.merchant, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} for ₦${product.price}.`, inquiryKey: `${product.id}-${Date.now()}` } });
  };

  const proceedToBuy = async () => {
    if (!selectedProduct) return;
    const product = selectedProduct;
    setSelectedProduct(null);
    await inquireAboutProduct(product);
  };

  const askAiAssistant = async (isRetry = false) => {
    const prompt = sanitizeInput(isRetry ? retryPrompt : userQuery);
    if (!prompt || aiLoading || !aiSession) return;

    const userMsg: Message = { role: 'user', content: prompt };
    const messagesPayload = isRetry ? messages : [...messages, userMsg];

    if (!isRetry) {
      setMessages((prev) => [...prev, userMsg]);
      setUserQuery('');
    }
    setAiError('');
    setAiLoading(true);

    try {
      const assistantContent = await requestAiAssistant(messagesPayload, 'vet');

      const assistantMsg: Message = { role: 'assistant', content: assistantContent };
      setMessages((prev) => [...prev, assistantMsg]);

      void Promise.all([
        supabase.from('mvsai_chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'user', content: userMsg.content }),
        supabase.from('mvsai_chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'assistant', content: assistantMsg.content }),
      ]).then(([userResult, assistantResult]) => {
        if (userResult.error) console.error('Error saving user message:', userResult.error);
        if (assistantResult.error) console.error('Error saving assistant message:', assistantResult.error);
      });

      setRetryPrompt('');
      setTimeout(() => {
        messagesScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('AI assistant request failed:', errorMessage);
      setRetryPrompt(prompt);
      setAiError('Unable to connect to MVS Assistant. Please try again.');
    } finally {
      setAiLoading(false);
    }
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

  return (
    <SafeAreaView style={styles.container}>
      <WelcomeModal />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        <Text style={styles.title}>{t('dashboard.practice')}</Text>
        <Text style={styles.subtitle}>{t('dashboard.managePractice')}</Text>

        <View style={styles.metrics}>
          <Metric icon="paw" label={t('dashboard.consultations')} value={String(totalPatients)} color="#3B82F6" />
          <Metric icon="star" label={t('dashboard.overallRating')} value={`${overallRating.toFixed(1)} ★`} color="#F59E0B" />
          <Metric icon="cash" label={t('dashboard.totalEarnings')} value={`₦${totalEarnings.toLocaleString('en-NG')}`} color="#10B981" />
        </View>

        <KnowledgeHubSection />

        <View style={styles.animalToolsSection}>
          <HomeAnimalTools onContactVendor={() => setMarketplaceBrowseVisible(true)} />
        </View>

        <View style={styles.marketplaceHeader}>
          <Text style={styles.sectionTitle}>{t('dashboard.marketplace')}</Text>
          <TouchableOpacity onPress={() => setMarketplaceBrowseVisible(true)}>
            <Text style={styles.browseAction}>{t('home.browseAll')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.marketplace}>
          {products.map((product) => <TouchableOpacity key={product.id} style={styles.marketProduct} activeOpacity={0.85} onPress={() => setSelectedProduct(product)}>{product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.marketProductImage} /> : <View style={styles.marketProductPlaceholder}><MaterialCommunityIcons name={product.icon as any} size={24} color="#CBD5E1" /></View>}<Text style={styles.marketName} numberOfLines={1}>{product.name}</Text><Text style={styles.marketPrice}>₦{product.price.toLocaleString('en-NG')}</Text><Text style={styles.muted}>{product.merchant}</Text><View style={styles.marketDetailsButton}><Text style={styles.marketDetailsText}>View Details</Text></View></TouchableOpacity>)}
        </View>
      </ScrollView>

      <MarketplaceBrowseModal
        visible={marketplaceBrowseVisible}
        products={products}
        onClose={() => setMarketplaceBrowseVisible(false)}
        onSelectProduct={setSelectedProduct}
      />

      <Modal visible={selectedProduct !== null} transparent animationType="fade" onRequestClose={() => setSelectedProduct(null)}>
        <View style={styles.productModalOverlay}>
          <View style={styles.productModal}>
            <View style={styles.productModalHeader}><Text style={styles.productModalTitle}>Product Details</Text><TouchableOpacity onPress={() => setSelectedProduct(null)} accessibilityLabel="Close product details"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View>
            <ProductImageCarousel images={selectedProduct?.images} fallbackImage={selectedProduct?.imageUrl} height={180} />
            <Text style={styles.productModalName}>{selectedProduct?.name}</Text>
            <Text style={styles.productModalLabel}>Description</Text>
            <Text style={styles.productModalText}>{selectedProduct?.description || 'No description available.'}</Text>
            <View style={styles.productModalMeta}><View style={styles.modalColumn}><Text style={styles.productModalLabel}>Price</Text><Text style={styles.productModalPrice}>{selectedProduct ? `₦${selectedProduct.price.toLocaleString('en-NG')}` : ''}</Text></View><View style={styles.modalColumn}><Text style={styles.productModalLabel}>Category</Text><Text style={styles.productModalText}>{selectedProduct?.category || 'General'}</Text></View></View>
            <TouchableOpacity style={styles.proceedButton} onPress={() => void proceedToBuy()}><Text style={styles.proceedButtonText}>Proceed to Buy</Text></TouchableOpacity>
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
            <ScrollView style={styles.aiConversation} ref={messagesScrollRef} contentContainerStyle={styles.aiConversationContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}>
              {messages.length === 0 && !aiLoading && (
                <Text style={styles.aiHint}>Ask about symptoms, feeding, vaccination, hydration, or general animal care.</Text>
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
              {!!aiError && (
                <View style={styles.aiError}>
                  <Text style={styles.aiErrorText}>{aiError}</Text>
                  <TouchableOpacity onPress={() => { void askAiAssistant(true); }} disabled={aiLoading}>
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
            <TextInput value={userQuery} onChangeText={setUserQuery} placeholder="What would you like to know?" placeholderTextColor="#64748B" multiline style={styles.aiInput} editable={!aiLoading} />
            <TouchableOpacity style={[styles.askButton, (!userQuery.trim() || aiLoading) && styles.askButtonDisabled]} onPress={() => { void askAiAssistant(); }} disabled={!userQuery.trim() || aiLoading}>
              {aiLoading ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialCommunityIcons name="send" size={18} color="#FFFFFF" /><Text style={styles.askButtonText}>Ask Assistant</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <SupportFab role="vet" />
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

        return <Text key={`paragraph-${index}`} style={styles.aiResponse}>{renderInlineMarkdown(trimmedLine)}</Text>;
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

function Metric({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}><MaterialCommunityIcons name={icon as any} size={24} color={color} /></View><Text style={styles.muted}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
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
  aiOverlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  aiModal: { maxHeight: '85%', backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 14, marginBottom: 14 },
  aiHeaderCopy: { flex: 1 },
  aiModalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  aiModalSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  aiConversation: { minHeight: 150, maxHeight: 360, marginVertical: 14 },
  aiConversationContent: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 4 },
  messageBubble: { marginBottom: 12, borderRadius: 10, padding: 12 },
  userMessage: { backgroundColor: '#10B98120', borderLeftWidth: 3, borderLeftColor: '#10B981', alignSelf: 'flex-end', maxWidth: '85%' },
  assistantMessage: { backgroundColor: '#3B82F620', borderLeftWidth: 3, borderLeftColor: '#3B82F6', alignSelf: 'flex-start', maxWidth: '95%', textAlign: 'left' },
  userMessageText: { color: '#E2E8F0', fontSize: 14, lineHeight: 21 },
  aiResponse: { color: '#E2E8F0', fontSize: 15, lineHeight: 22 },
  markdownHeading: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '700', marginBottom: 10 },
  markdownBold: { color: '#FFFFFF', fontWeight: '700' },
  markdownBullet: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  markdownBulletMark: { color: '#10B981', fontSize: 15, lineHeight: 22, marginRight: 8 },
  markdownBulletText: { flex: 1, color: '#E2E8F0', fontSize: 15, lineHeight: 22 },
  markdownSpacer: { height: 6 },
  aiHint: { color: '#94A3B8', fontSize: 14, lineHeight: 21 },
  aiInput: { minHeight: 52, maxHeight: 110, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, color: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, textAlignVertical: 'top' },
  askButton: { backgroundColor: '#10B981', borderRadius: 10, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  askButtonDisabled: { opacity: 0.5 },
  askButtonText: { color: '#FFFFFF', fontWeight: '700' },
  vetCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, marginTop: 5 },
  vetCtaText: { color: '#10B981', fontSize: 13, fontWeight: '700' },
  supportFab: { position: 'absolute', bottom: 16, right: 20, zIndex: 9999, width: 56, height: 56, borderRadius: 28, backgroundColor: '#005F53', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  aiError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#451A1A', borderRadius: 10, padding: 12, marginBottom: 12 },
  aiErrorText: { flex: 1, color: '#FCA5A5', fontSize: 13, marginRight: 12 },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  aiCard: { backgroundColor: '#0E7490', borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  aiIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#FFFFFF24', alignItems: 'center', justifyContent: 'center' },
  aiCardCopy: { flex: 1, marginHorizontal: 12 },
  aiTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  aiText: { color: '#CFFAFE', fontSize: 12, lineHeight: 18, marginTop: 3 },
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16, paddingBottom: 36 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#94A3B8', marginTop: 4, marginBottom: 24 },
  metrics: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  animalToolsSection: { marginTop: 12 },
  metric: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155', elevation: 3, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5 },
  metricIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  muted: { color: '#94A3B8', fontSize: 12 },
  metricValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  marketplaceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  browseAction: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  marketplace: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  marketProduct: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 12, elevation: 3, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5 },
  marketProductImage: { width: '100%', height: 96, borderRadius: 8, resizeMode: 'cover' },
  marketProductPlaceholder: { width: '100%', height: 96, borderRadius: 8, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  marketName: { color: '#FFFFFF', fontWeight: '600', fontSize: 12, marginTop: 8 },
  marketPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14, marginTop: 4 },
  marketDetailsButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
  marketDetailsText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  productModalOverlay: { flex: 1, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center', padding: 20 },
  productModal: { width: '100%', maxWidth: 440, maxHeight: '85%', backgroundColor: '#1E293B', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#334155' },
  productModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  productModalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  productModalImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 14, backgroundColor: '#0F172A' },
  productModalName: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  productModalLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  productModalText: { color: '#CBD5E1', fontSize: 14, lineHeight: 20 },
  productModalMeta: { flexDirection: 'row', gap: 20 },
  modalColumn: { flex: 1 },
  productModalPrice: { color: '#10B981', fontSize: 18, fontWeight: '700' },
  proceedButton: { backgroundColor: '#10B981', borderRadius: 9, paddingVertical: 13, alignItems: 'center', marginTop: 22 },
  proceedButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
