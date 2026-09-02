import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, isUuid, normalizeUuid, sendRealtimeMessage, subscribeToMessages, supabase, uploadChatAttachment, type RealtimeMessage } from '../lib/supabase';

type ChatParams = {
  conversationId?: string;
  recipientId?: string;
  merchantId?: string;
  merchantName?: string;
  vet_id?: string;
  receiver_id?: string;
  vet?: string;
  category?: string;
  productId?: string;
  productName?: string;
  productPrice?: string;
  starterMessage?: string;
};

type Thread = {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: string;
  productName?: string;
  messages: RealtimeMessage[];
};

const firstParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const conversationIdFor = (firstId: string, secondId: string) => {
  const ids = [firstId, secondId].sort();
  return `conv_${ids[0]}_${ids[1]}`;
};

export default function ChatScreen() {
  const params = useLocalSearchParams<ChatParams>();
  const router = useRouter();
  const conversationIdParam = firstParam(params.conversationId);
  const recipientIdParam = firstParam(params.recipientId);
  const merchantIdParam = firstParam(params.merchantId);
  const merchantNameParam = firstParam(params.merchantName);
  const vetIdParam = firstParam(params.vet_id);
  const receiverIdParam = firstParam(params.receiver_id);
  const vetParam = firstParam(params.vet);
  const productNameParam = firstParam(params.productName);
  const starterMessageParam = firstParam(params.starterMessage);
  const [currentUserId, setCurrentUserId] = useState('');
  const [userRole, setUserRole] = useState('client');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [message, setMessage] = useState(starterMessageParam || '');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const openedRoute = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadInbox = async () => {
      try {
        const user = await getCurrentUser();
        const cleanUserId = normalizeUuid(user?.id);
        if (!cleanUserId) return;
        const roleResult = await supabase.from('profiles').select('role').eq('id', cleanUserId).maybeSingle();
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${cleanUserId},receiver_id.eq.${cleanUserId}`)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const rows = (data || []) as RealtimeMessage[];
        const participantIds = [...new Set(rows.map((row) => normalizeUuid(row.sender_id === cleanUserId ? row.receiver_id : row.sender_id)).filter((id): id is string => Boolean(id)))];
        const profiles = participantIds.length > 0
          ? await supabase.from('profiles').select('id, full_name, email, role').in('id', participantIds)
          : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const profileMap = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
        const grouped = new Map<string, RealtimeMessage[]>();
        for (const row of rows) {
          const participantId = normalizeUuid(row.sender_id === cleanUserId ? row.receiver_id : row.sender_id);
          if (!participantId) continue;
          grouped.set(participantId, [...(grouped.get(participantId) || []), row]);
        }
        if (!mounted) return;
        setCurrentUserId(cleanUserId);
        setUserRole(roleResult.data?.role || 'client');
        setThreads(Array.from(grouped.entries()).map(([participantId, participantMessages]) => {
          const profile = profileMap.get(participantId);
          return {
            id: conversationIdFor(cleanUserId, participantId),
            participantId,
            participantName: profile?.full_name || profile?.email || 'Contact',
            participantRole: profile?.role || 'user',
            messages: [...participantMessages].sort((first, second) => first.created_at.localeCompare(second.created_at)),
          };
        }));
      } catch (error) {
        console.error('[Chat] Failed to load conversations:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadInbox();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const routeRecipient = normalizeUuid(recipientIdParam || merchantIdParam || vetIdParam || receiverIdParam);
    const routeKey = conversationIdParam || '';
    if (!currentUserId || !routeRecipient || !conversationIdParam || openedRoute.current === routeKey) return;
    openedRoute.current = routeKey;
    let cancelled = false;
    const participantName = merchantNameParam || vetParam || 'Merchant';
    const nextActive: Thread = {
      id: conversationIdFor(currentUserId, routeRecipient),
      participantId: routeRecipient,
      participantName,
      participantRole: vetParam ? 'veterinarian' : 'merchant',
      productName: productNameParam,
      messages: [],
    };
    queueMicrotask(() => {
      if (cancelled) return;
      setActive(nextActive);
      setMessage(starterMessageParam || '');
    });
    return () => { cancelled = true; };
  }, [currentUserId, conversationIdParam, recipientIdParam, merchantIdParam, merchantNameParam, receiverIdParam, vetIdParam, vetParam, productNameParam, starterMessageParam]);

  useEffect(() => {
    if (!active || !isUuid(currentUserId) || !isUuid(active.participantId)) return;
    let mounted = true;
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${active.participantId}),and(sender_id.eq.${active.participantId},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });
      if (!error && mounted) setMessages((data || []) as RealtimeMessage[]);
    };
    void loadMessages();
    const unsubscribe = subscribeToMessages(active.id, (incoming) => {
      if (mounted) setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
    });
    return () => { mounted = false; unsubscribe(); };
  }, [active, currentUserId]);

  const openThread = (thread: Thread) => {
    setActive(thread);
    setMessages(thread.messages);
    setMessage('');
  };

  const handleBack = () => {
    setActive(null);
    setMessages([]);
    setMessage('');
    router.setParams({ conversationId: undefined, recipientId: undefined, merchantId: undefined, vet_id: undefined, receiver_id: undefined, productId: undefined, productName: undefined, productPrice: undefined, starterMessage: undefined });
    router.replace('/chat');
  };

  const sendMessage = async () => {
    const cleanSenderId = normalizeUuid(currentUserId);
    const cleanReceiverId = normalizeUuid(active?.participantId);
    const text = message.trim();
    if (!active || !text || !cleanSenderId || !cleanReceiverId) {
      console.error('[Chat Error]: Missing sender or receiver ID');
      return;
    }
    const conversationId = conversationIdFor(cleanSenderId, cleanReceiverId);
    const optimistic: RealtimeMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: cleanSenderId,
      receiver_id: cleanReceiverId,
      content: text,
      message_type: 'text',
      metadata: { sender_name: 'Chat participant' },
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      await sendRealtimeMessage({ conversation_id: conversationId, sender_id: cleanSenderId, receiver_id: cleanReceiverId, content: text, message_type: 'text', metadata: optimistic.metadata });
      setMessage('');
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      console.error('[Supabase Chat Insert Error]:', error);
      Alert.alert('Message failed', error instanceof Error ? error.message : 'Failed to send message.');
    }
  };

  const attachMessage = async () => {
    const cleanSenderId = normalizeUuid(currentUserId);
    const cleanReceiverId = normalizeUuid(active?.participantId);
    if (!active || !cleanSenderId || !cleanReceiverId || uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], selectionLimit: 1 });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true);
      const uploaded = await uploadChatAttachment(conversationIdFor(cleanSenderId, cleanReceiverId), result.assets[0]);
      await sendRealtimeMessage({ conversation_id: conversationIdFor(cleanSenderId, cleanReceiverId), sender_id: cleanSenderId, receiver_id: cleanReceiverId, content: message.trim(), message_type: 'text', media_url: uploaded.publicUrl, media_type: uploaded.mediaType });
      setMessage('');
    } catch (error) {
      Alert.alert('Attachment failed', error instanceof Error ? error.message : 'Could not upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  if (active) return <ChatRoom active={active} currentUserId={currentUserId} messages={messages} message={message} setMessage={setMessage} onBack={handleBack} onSend={sendMessage} onAttach={attachMessage} uploading={uploading} />;

  return <SafeAreaView style={styles.container}><View style={styles.header}><View><Text style={styles.title}>Messages</Text><Text style={styles.subtitle}>{userRole === 'merchant' ? 'Connect with pet parents, vets, and customers' : 'Connect with pet parents, vets, and merchants'}</Text></View><MaterialCommunityIcons name="message-text" size={25} color="#10B981" /></View><ScrollView contentContainerStyle={styles.list}>{loading ? <ActivityIndicator color="#10B981" /> : threads.length === 0 ? <Text style={styles.empty}>No conversations yet.</Text> : threads.map((thread) => <TouchableOpacity key={thread.id} style={styles.thread} onPress={() => openThread(thread)}><View style={styles.avatar}><MaterialCommunityIcons name={thread.participantRole === 'merchant' ? 'store' : thread.participantRole === 'vet' || thread.participantRole === 'veterinarian' ? 'hospital-box' : 'account'} size={22} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.primary}>{thread.participantName}</Text><Text style={styles.muted}>{thread.participantRole === 'merchant' ? 'Merchant' : thread.participantRole === 'vet' || thread.participantRole === 'veterinarian' ? 'Veterinarian' : 'Pet parent'}</Text><Text style={styles.message} numberOfLines={1}>{thread.messages[thread.messages.length - 1]?.content}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color="#64748B" /></TouchableOpacity>)}</ScrollView></SafeAreaView>;
}

function ChatRoom({ active, currentUserId, messages, message, setMessage, onBack, onSend, onAttach, uploading }: { active: Thread; currentUserId: string; messages: RealtimeMessage[]; message: string; setMessage: (value: string) => void; onBack: () => void; onSend: () => void; onAttach: () => void; uploading: boolean }) {
  return <SafeAreaView style={styles.container}><View style={styles.roomHeader}><TouchableOpacity onPress={onBack}><MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" /></TouchableOpacity><View style={styles.flex}><Text style={styles.title}>{active.productName || active.participantName}</Text><Text style={styles.subtitle}>{active.productName ? `${active.participantName} · Marketplace` : active.participantName}</Text></View></View><ScrollView contentContainerStyle={styles.messages}>{messages.length === 0 ? <Text style={styles.empty}>No messages yet. Start the conversation.</Text> : messages.map((item) => <View key={item.id} style={[styles.bubble, item.sender_id === currentUserId ? styles.outgoing : styles.incoming]}>{item.media_url && item.media_type === 'image' ? <Image source={{ uri: item.media_url }} style={styles.attachment} /> : null}{item.content ? <Text style={styles.primary}>{item.content}</Text> : null}</View>)}</ScrollView><View style={styles.composer}><TouchableOpacity style={styles.attach} onPress={onAttach} disabled={uploading}><MaterialCommunityIcons name="paperclip" size={21} color="#FFFFFF" /></TouchableOpacity><TextInput value={message} onChangeText={setMessage} placeholder="Write a message..." placeholderTextColor="#64748B" style={[styles.input, styles.flex]} multiline /><TouchableOpacity style={styles.send} onPress={onSend}><MaterialCommunityIcons name="send" size={19} color="#FFFFFF" /></TouchableOpacity></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  list: { padding: 16 },
  messages: { padding: 16, flexGrow: 1 },
  thread: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 12, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  primary: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  muted: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  message: { color: '#CBD5E1', fontSize: 12, marginTop: 7 },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 24 },
  bubble: { maxWidth: '84%', padding: 13, borderRadius: 12, marginBottom: 10 },
  outgoing: { alignSelf: 'flex-end', backgroundColor: '#0E7490' },
  incoming: { alignSelf: 'flex-start', backgroundColor: '#1E293B' },
  attachment: { width: 220, height: 180, borderRadius: 10, marginBottom: 8 },
  composer: { padding: 12, borderTopWidth: 1, borderTopColor: '#334155', flexDirection: 'row', gap: 8 },
  attach: { width: 44, borderRadius: 8, backgroundColor: '#475569', alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#FFFFFF', padding: 11 },
  send: { width: 44, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
});
