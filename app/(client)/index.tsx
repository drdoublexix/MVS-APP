import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import KnowledgeHubSection from '../../components/KnowledgeHubSection';
import { requestAiAssistant } from '../../lib/aiAssistant';
import { fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { getCurrentUser, normalizeUuid, supabase } from '../../lib/supabase';

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
  const router = useRouter();
  const { products } = useMarketplace();
  const [aiVisible, setAiVisible] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSession, setAiSession] = useState<AiSession | null>(null);
  const [productOrderStatuses, setProductOrderStatuses] = useState<Record<string, string>>({});
  const messagesScrollRef = useRef<ScrollView>(null);

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user || !normalizeUuid(product.merchantId)) return;
    const conversationId = `conv_${[user.id, product.merchantId].sort().join('_')}`;
    router.push({ pathname: '/chat', params: { conversationId, productId: product.id, merchantId: product.merchantId, merchantName: product.merchant, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} listed for ₦${product.price}.` } });
  };

  useFocusEffect(
    useCallback(() => {
      void fetchMarketplaceProducts().catch(() => undefined);
    }, [])
  );

  useEffect(() => {
    void fetchMarketplaceProducts().catch(() => undefined);
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
          .from('chat_messages')
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

  useEffect(() => {
    void (async () => {
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
    })();
  }, []);
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
    const prompt = userQuery.trim();
    if (!prompt || aiLoading || !aiSession) return;

    const serviceError = 'Unable to connect to MVS Assistant service. Please try again.';
    const userMsg: Message = { role: 'user', content: prompt };
    const conversation = [...messages, userMsg];

    setMessages((prev) => [...prev, userMsg]);
    setUserQuery('');
    setAiLoading(true);

    let assistantContent = serviceError;
    try {
      assistantContent = await requestAiAssistant(conversation, 'client');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('AI assistant request failed:', errorMessage);
    }

    const assistantMsg: Message = { role: 'assistant', content: assistantContent };
    setMessages((prev) => [...prev, assistantMsg]);
    setAiLoading(false);

    void Promise.all([
      supabase.from('chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'user', content: userMsg.content }),
      supabase.from('chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'assistant', content: assistantMsg.content }),
    ]).then(([userResult, assistantResult]) => {
      if (userResult.error) console.error('Error saving user message:', userResult.error);
      if (assistantResult.error) console.error('Error saving assistant message:', assistantResult.error);
    });

    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const openVetChat = () => {
    setAiVisible(false);
    router.push('/(client)/vets');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.aiCard} onPress={() => setAiVisible(true)}>
          <View style={styles.aiIcon}>
            <MaterialCommunityIcons name="robot-outline" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.aiCardCopy}>
            <Text style={styles.aiTitle}>Ask AI Assistant</Text>
            <Text style={styles.aiText}>Get quick triage and animal care guidance.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <KnowledgeHubSection />

        <View style={styles.banner}>
          <View style={styles.flex}>
            <Text style={styles.bannerTitle}>Consult a Vet Now</Text>
            <Text style={styles.bannerText}>Get professional advice instantly</Text>
          </View>
          <TouchableOpacity style={styles.bannerButton} onPress={() => router.push('/(client)/vets')}>
            <Text style={styles.bannerButtonText}>Consult</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="Marketplace" action="Browse All" />
        <View style={styles.grid}>
          {products.map((product) => {
            const badge = getOrderBadge(productOrderStatuses[String(product.id)]);
            return (
              <View key={product.id} style={styles.product}>
                <TouchableOpacity onPress={() => inquireAboutProduct(product)}>
                  <View style={styles.productImage}>
                    {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productPhoto} /> : <MaterialCommunityIcons name={product.icon as any} size={38} color="#CBD5E1" />}
                  </View>
                </TouchableOpacity>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productPrice}>{naira(product.price)}</Text>
                <Text style={styles.muted}>{product.merchant}</Text>
                {badge && (
                  <View style={[styles.orderBadge, { backgroundColor: badge.color }]}>
                    <Text style={styles.orderBadgeText}>{badge.label}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.inquireButton} onPress={() => inquireAboutProduct(product)}><Text style={styles.inquireText}>Inquire / Buy</Text></TouchableOpacity>
              </View>
            );
          })}
        </View>

      </ScrollView>

      <Modal visible={aiVisible} animationType="slide" transparent onRequestClose={() => setAiVisible(false)}>
        <KeyboardAvoidingView style={styles.aiOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.aiModal}>
            <View style={styles.aiHeader}>
              <View style={styles.aiHeaderCopy}>
                <Text style={styles.aiModalTitle}>MVS AI Assistant</Text>
                <Text style={styles.aiModalSubtitle}>Pet and livestock care guidance</Text>
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
                <View key={msg.id || `msg-${index}`} style={[styles.messageBubble, msg.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
                  {msg.role === 'assistant' ? (
                    <MarkdownResponse text={msg.content} />
                  ) : (
                    <Text style={styles.userMessageText}>{msg.content}</Text>
                  )}
                </View>
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
            <TouchableOpacity style={styles.vetCta} onPress={openVetChat}>
              <MaterialCommunityIcons name="stethoscope" size={18} color="#10B981" />
              <Text style={styles.vetCtaText}>Connect with a Licensed Vet Now</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16, paddingBottom: 35 },
  aiCard: { backgroundColor: '#0E7490', borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  aiIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#FFFFFF24', alignItems: 'center', justifyContent: 'center' },
  aiCardCopy: { flex: 1, marginHorizontal: 12 },
  aiTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  aiText: { color: '#CFFAFE', fontSize: 12, lineHeight: 18, marginTop: 3 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  action: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  banner: { backgroundColor: '#10B981', borderRadius: 15, padding: 18, flexDirection: 'row', alignItems: 'center', marginVertical: 26 },
  flex: { flex: 1 },
  bannerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  bannerText: { color: '#D1FAE5', marginTop: 4, fontSize: 13 },
  bannerButton: { backgroundColor: '#FFFFFF', borderRadius: 9, padding: 11, alignItems: 'center' },
  bannerButtonText: { color: '#10B981', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  product: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12 },
  productImage: { height: 96, backgroundColor: '#0F172A', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  productPhoto: { width: '100%', height: '100%', borderRadius: 8 },
  productName: { color: '#FFFFFF', fontWeight: '600', fontSize: 13, marginBottom: 7 },
  productPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14 },
  muted: { color: '#94A3B8', fontSize: 11 },
  orderBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8, marginBottom: 4 },
  orderBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  inquireButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  inquireText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
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
  assistantMessage: { backgroundColor: '#3B82F620', borderLeftWidth: 3, borderLeftColor: '#3B82F6', alignSelf: 'flex-start', maxWidth: '95%', textAlign: 'left' },
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
