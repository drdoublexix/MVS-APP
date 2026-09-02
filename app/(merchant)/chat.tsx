import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fetchMerchantProductThreads, markConversationPaid, useMarketplace, type ProductConversation } from '../../lib/marketplace';
import { getConversationMessages, getCurrentUser, sendRealtimeMessage, subscribeToMessages, supabase, type RealtimeMessage } from '../../lib/supabase';

const naira = (value: number) => `₦${value.toLocaleString('en-NG')}`;

export default function MerchantChatScreen() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const { conversations } = useMarketplace();
  const [selectedId, setSelectedId] = useState(params.conversationId || '');
  const [reply, setReply] = useState('');
  const [remoteMessages, setRemoteMessages] = useState<RealtimeMessage[]>([]);
  const [order, setOrder] = useState<{ id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' } | null>(null);
  const selected = conversations.find((conversation) => conversation.id === selectedId);

  useEffect(() => {
    let mounted = true;
    const loadThreads = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        const nextThreads = await fetchMerchantProductThreads(user.id);
        if (mounted && nextThreads.length > 0 && !selectedId) {
          setSelectedId(nextThreads[0].id);
        }
      } catch (error) {
        console.warn('Failed to load merchant product threads', error);
      }
    };

    void loadThreads();
    return () => { mounted = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void (async () => {
      try {
        const { data } = await supabase.from('orders').select('id, status').eq('conversation_id', selectedId).maybeSingle();
        setOrder(data as { id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' } | null);
      } catch (error) {
        console.error('[Merchant Chat] Failed to load order:', error);
      }
    })();
  }, [selectedId]);
  
  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    void getConversationMessages(selectedId).then((items) => { if (mounted) setRemoteMessages(items); }).catch(() => undefined);
    const unsubscribe = subscribeToMessages(selectedId, (item) => setRemoteMessages((items) => items.some((current) => current.id === item.id) ? items : [...items, item]));
    return () => { mounted = false; unsubscribe(); };
  }, [selectedId]);

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    const content = reply.trim();
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const receiverId = selected.clientId || '';
      if (!receiverId) return;

      const savedMessage = await sendRealtimeMessage({
        conversation_id: selected.id,
        sender_id: user.id,
        receiver_id: receiverId,
        content,
        message_type: 'text',
      });

      setRemoteMessages((prev) => prev.some((item) => item.id === savedMessage.id) ? prev : [...prev, savedMessage]);
    } catch { /* Supabase errors should not break the local composer. */ }
    setReply('');
  };

  const handleConfirmPayment = async () => {
    if (!selected || !order) return;

    const { error } = await supabase.from('orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', order.id);
    if (error) {
      console.error('[Merchant Chat] Failed to confirm payment:', error);
      return;
    }

    setOrder({ ...order, status: 'completed' });
    markConversationPaid(selected.id);
    setReply('Payment confirmed. Order is ready for delivery!');
    void sendReply();
  };

  const markOrderCompleted = async () => {
    if (!order) return;
    const { error } = await supabase.from('orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', order.id);
    if (error) return console.error('[Merchant Chat] Failed to complete order:', error);
    setOrder({ ...order, status: 'completed' });
  };

  return <SafeAreaView style={styles.container}>
    {!selected ? <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Product Chats</Text>
      <Text style={styles.subtitle}>Reply to marketplace inquiries and confirm orders</Text>
      {conversations.length === 0 && <Text style={styles.empty}>No product inquiries yet.</Text>}
      {conversations.map((conversation) => {
        const lastMessage = remoteMessages.length > 0 
          ? remoteMessages[remoteMessages.length - 1]?.content 
          : conversation.messages[conversation.messages.length - 1]?.text;
        return (
          <TouchableOpacity key={conversation.id} style={styles.thread} onPress={() => setSelectedId(conversation.id)}>
            <View style={styles.icon}><MaterialCommunityIcons name="shopping" size={22} color="#FFFFFF" /></View>
            <View style={styles.flex}>
              <Text style={styles.primary}>{conversation.product.name}</Text>
              <Text style={styles.muted}>{conversation.clientName} · {conversation.product.merchant}</Text>
              <Text style={styles.message} numberOfLines={1}>{lastMessage}</Text>
            </View>
            {conversation.paymentStatus === 'paid' && <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />}
            {conversation.paymentStatus === 'unpaid' && <MaterialCommunityIcons name="chevron-right" size={20} color="#64748B" />}
          </TouchableOpacity>
        );
      })}
    </ScrollView> : <MerchantConversation conversation={selected} remoteMessages={remoteMessages} reply={reply} setReply={setReply} sendReply={sendReply} onBack={() => setSelectedId('')} onConfirmPayment={handleConfirmPayment} order={order} onMarkOrderCompleted={markOrderCompleted} />}
  </SafeAreaView>;
}

function MerchantConversation({ conversation, remoteMessages, reply, setReply, sendReply, onBack, onConfirmPayment, order, onMarkOrderCompleted }: { conversation: ProductConversation; remoteMessages: RealtimeMessage[]; reply: string; setReply: (value: string) => void; sendReply: () => void; onBack: () => void; onConfirmPayment: () => void; order: { id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' } | null; onMarkOrderCompleted: () => void }) {
  const [currentUserId, setCurrentUserId] = useState<string>('');
  
  useEffect(() => {
    void getCurrentUser().then((user) => { if (user) setCurrentUserId(user.id); }).catch(() => undefined);
  }, []);

  const displayMessages = remoteMessages.length > 0 ? remoteMessages : conversation.messages;
  const orderStatus = order?.status;
  const isOrderCompleted = orderStatus === 'completed' || orderStatus === 'confirmed';
  const isAwaitingClientPayment = !order || orderStatus === 'pending' || orderStatus === 'pending_payment' || orderStatus === 'awaiting_payment';

  return <>
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack}>
        <MaterialCommunityIcons name="arrow-left" size={23} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.flex}>
        <Text style={styles.title}>{conversation.product.name}</Text>
        <Text style={styles.muted}>{conversation.clientName}</Text>
      </View>
    </View>
    
    <ScrollView contentContainerStyle={styles.conversation}>
      <View style={styles.productCard}>
        <MaterialCommunityIcons name={conversation.product.icon as any} size={28} color="#CBD5E1" />
        <View style={styles.flex}>
          <Text style={styles.primary}>{conversation.product.name}</Text>
          <Text style={styles.muted}>{conversation.product.merchant}</Text>
          <Text style={styles.price}>{naira(conversation.product.price)}</Text>
        </View>
      </View>
      
      {displayMessages.map((message, index) => {
        const isMerchant = typeof message === 'object' && 'sender' in message ? message.sender === 'merchant' : message.sender_id === currentUserId;
        const messageText = typeof message === 'object' && 'content' in message ? message.content : message.text;
        const messageId = typeof message === 'object' && 'id' in message ? message.id : `message-${index}`;
        return (
          <View key={messageId} style={[styles.bubble, isMerchant ? styles.merchantBubble : styles.clientBubble]}>
            <Text style={styles.primary}>{messageText}</Text>
          </View>
        );
      })}
      {displayMessages.length === 0 && <Text style={styles.emptyMessage}>No messages yet. Waiting for client inquiry...</Text>}

      {isOrderCompleted ? (
        <Text style={styles.statusSuccess}>✅ Payment Confirmed & Order Completed</Text>
      ) : orderStatus === 'paid' ? (
        <TouchableOpacity style={styles.confirmPaymentButton} onPress={() => void onConfirmPayment()}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
          <Text style={styles.confirmPaymentText}>Confirm Payment Received</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.status}>⏳ Awaiting client payment</Text>
      )}

      {orderStatus === 'pending' && <TouchableOpacity style={styles.confirmPaymentButton} onPress={() => void onMarkOrderCompleted()}><MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" /><Text style={styles.confirmPaymentText}>Order Received / Mark Completed</Text></TouchableOpacity>}
    </ScrollView>

    {!isOrderCompleted && orderStatus !== 'paid' && (
      <View style={styles.composer}>
        <TextInput value={reply} onChangeText={setReply} placeholder="Reply to client..." placeholderTextColor="#64748B" style={[styles.input, styles.flex]} />
        <TouchableOpacity style={styles.send} onPress={sendReply}>
          <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    )}
  </>;
}

const styles = StyleSheet.create({ 
  container: { flex: 1, backgroundColor: '#0F172A' }, 
  content: { padding: 16 }, 
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' }, 
  subtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4, marginBottom: 22 }, 
  empty: { color: '#94A3B8', marginTop: 20 }, 
  thread: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 12, marginBottom: 10 }, 
  icon: { width: 44, height: 44, borderRadius: 11, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }, 
  flex: { flex: 1 }, 
  primary: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }, 
  muted: { color: '#94A3B8', fontSize: 12, marginTop: 3 }, 
  message: { color: '#CBD5E1', fontSize: 12, marginTop: 7 }, 
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', gap: 12, alignItems: 'center' }, 
  conversation: { padding: 16 }, 
  productCard: { flexDirection: 'row', gap: 12, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 14, marginBottom: 18 }, 
  price: { color: '#10B981', fontWeight: '700', marginTop: 5 }, 
  bubble: { backgroundColor: '#1E293B', borderRadius: 12, padding: 13, alignSelf: 'flex-start', maxWidth: '86%', marginBottom: 10 }, 
  clientBubble: { backgroundColor: '#1E293B', alignSelf: 'flex-start' },
  merchantBubble: { backgroundColor: '#0E7490', alignSelf: 'flex-end' }, 
  emptyMessage: { color: '#94A3B8', textAlign: 'center', marginTop: 20, fontSize: 14 },
  status: { color: '#F59E0B', textAlign: 'center', fontSize: 12, marginTop: 14 }, 
  statusSuccess: { color: '#10B981', textAlign: 'center', fontSize: 12, marginTop: 14, fontWeight: '700' },
  composer: { padding: 12, borderTopWidth: 1, borderTopColor: '#334155', flexDirection: 'row', gap: 8 }, 
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#FFFFFF', padding: 11 }, 
  send: { width: 44, borderRadius: 8, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  confirmPaymentButton: { backgroundColor: '#10B981', padding: 16, margin: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmPaymentText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});
