import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import KnowledgeHubSection from '../../components/KnowledgeHubSection';
import { requestAiAssistant } from '../../lib/aiAssistant';
import { fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { sanitizeInput } from '../../lib/sanitize';
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

export default function VetDashboardScreen() {
  const router = useRouter();
  const { products } = useMarketplace();
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
    void fetchMarketplaceProducts().catch(() => undefined);
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
        const sessionId = `vet-ai-${userId}`;

        if (mounted) {
          setAiSession({ sessionId, userId });
        }

        // Load existing messages for this session
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

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadPatientCount = async () => {
        const user = await getCurrentUser();
        const currentUserId = normalizeUuid(user?.id);
        if (!currentUserId) return;
        const { count, error } = await supabase
          .from('consultations')
          .select('*', { count: 'exact', head: true })
          .eq('vet_id', currentUserId)
          .eq('status', 'active');
        if (!error && mounted) setTotalPatients(count || 0);
        const { data: earningsData, error: earningsError } = await supabase
          .from('orders')
          .select('amount')
          .eq('merchant_id', currentUserId)
          .in('status', ['paid', 'completed']);
        if (!earningsError && mounted) {
          setTotalEarnings(earningsData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0);
        }
        const { data: ratingData, error: ratingError } = await supabase.rpc('get_vet_rating_summary', { target_vet_id: currentUserId });
        if (!ratingError && mounted) {
          const ratingSummary = Array.isArray(ratingData) ? ratingData[0] : ratingData;
          setOverallRating(Number(ratingSummary?.average_rating || 0));
        }
      };
      void loadPatientCount();
      return () => { mounted = false; };
    }, [])
  );

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user || !normalizeUuid(product.merchantId)) return;
    const conversationId = `conv_${[user.id, product.merchantId].sort().join('_')}`;
    router.push({ pathname: '/chat', params: { conversationId, merchantId: product.merchantId, merchantName: product.merchant, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} listed for ₦${product.price}.` } });
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
        supabase.from('chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'user', content: userMsg.content }),
        supabase.from('chat_messages').insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: 'assistant', content: assistantMsg.content }),
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

  const openVetChat = () => {
    setAiVisible(false);
    router.push('/(client)/vets');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        <Text style={styles.title}>Practice Dashboard</Text>
        <Text style={styles.subtitle}>Manage consultations and earnings</Text>

        <View style={styles.metrics}>
          <Metric icon="paw" label="Total Patients" value={String(totalPatients)} color="#3B82F6" />
          <Metric icon="star" label="Overall Rating" value={`${overallRating.toFixed(1)} ★`} color="#F59E0B" />
          <Metric icon="cash" label="Total Earnings" value={`₦${totalEarnings.toLocaleString('en-NG')}`} color="#10B981" />
        </View>

        <KnowledgeHubSection />

        <Text style={styles.sectionTitle}>Global Marketplace</Text>
        <View style={styles.marketplace}>
          {products.map((product) => <View key={product.id} style={styles.marketProduct}><MaterialCommunityIcons name={product.icon as any} size={24} color="#CBD5E1" /><Text style={styles.marketName} numberOfLines={1}>{product.name}</Text><Text style={styles.marketPrice}>₦{product.price.toLocaleString('en-NG')}</Text><Text style={styles.muted}>{product.merchant}</Text><TouchableOpacity style={{ backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 10 }} onPress={() => inquireAboutProduct(product)}><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Inquire / Buy</Text></TouchableOpacity></View>)}
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
            <ScrollView style={styles.aiConversation} ref={messagesScrollRef} contentContainerStyle={styles.aiConversationContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}>
              {messages.length === 0 && !aiLoading && (
                <Text style={styles.aiHint}>Ask about symptoms, feeding, vaccination, hydration, or general animal care.</Text>
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
              <Text style={styles.markdownBulletMark}>-</Text>
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
  aiError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#451A1A', borderRadius: 10, padding: 12, marginBottom: 12 },
  aiErrorText: { flex: 1, color: '#FCA5A5', fontSize: 13, marginRight: 12 },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    aiCard: { backgroundColor: '#0E7490', borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    aiIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#FFFFFF24', alignItems: 'center', justifyContent: 'center' },
    aiCardCopy: { flex: 1, marginHorizontal: 12 },
    aiTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    aiText: { color: '#CFFAFE', fontSize: 12, lineHeight: 18, marginTop: 3 },
  container: { flex: 1, backgroundColor: '#0F172A' }, content: { padding: 16, paddingBottom: 36 }, title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' }, subtitle: { color: '#94A3B8', marginTop: 4, marginBottom: 24 }, metrics: { flexDirection: 'row', gap: 10, marginBottom: 28 }, metric: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' }, metricIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, muted: { color: '#94A3B8', fontSize: 12 }, metricValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 5, textAlign: 'center' }, sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 12 }, invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#334155' }, invoiceRight: { flexDirection: 'row', alignItems: 'center', gap: 10 }, price: { color: '#3B82F6', fontWeight: '700' }, formRow: { flexDirection: 'row', gap: 8, marginVertical: 16 }, input: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 10, fontSize: 12 }, serviceInput: { flex: 2 }, amountInput: { flex: 1 }, addButton: { width: 40, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, summary: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 14 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, divider: { height: 1, backgroundColor: '#334155', marginVertical: 3 }, strongLabel: { color: '#10B981', fontWeight: '700', fontSize: 13 }, strongValue: { color: '#10B981', fontWeight: '700', fontSize: 15 }, sendButton: { backgroundColor: '#10B981', borderRadius: 9, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, sendText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  marketplace: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, marketProduct: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 12 }, marketName: { color: '#FFFFFF', fontWeight: '600', fontSize: 12, marginTop: 8 }, marketPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14, marginTop: 4 },
});
