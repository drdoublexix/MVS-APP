import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatPaymentRef, initializePayment } from '../../lib/flutterwave';
import { useMarketplace, type VetConversation } from '../../lib/marketplace';
import { getConversationMessages, getCurrentUser, sendRealtimeMessage, subscribeToMessages, supabase, uploadChatAttachment, type RealtimeMessage } from '../../lib/supabase';

type Params = { conversationId?: string; category?: string; vet?: string; receiver_id?: string; vet_id?: string; productId?: string; merchantId?: string; productName?: string; productPrice?: string; starterMessage?: string };

export default function ClientChatScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { conversations } = useMarketplace();
  const [backendVetConversations, setBackendVetConversations] = useState<VetConversation[]>([]);
  const [backendVetConversationsLoaded, setBackendVetConversationsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(params.conversationId || '');
  const [activeVet, setActiveVet] = useState<VetConversation | null>(null);
  const [message, setMessage] = useState(params.starterMessage || '');
  const [remoteMessages, setRemoteMessages] = useState<RealtimeMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  useEffect(() => {
    if (params.starterMessage) queueMicrotask(() => setMessage(params.starterMessage!));
  }, [params.starterMessage]);

  // Get current user
  useEffect(() => {
    let mounted = true;

    void getCurrentUser().then(async (user) => {
      if (!user) {
        if (mounted) setBackendVetConversationsLoaded(true);
        return;
      }
      setCurrentUserId(user.id);

      const { data: messageRows, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: true });
      if (messagesError) {
        console.error('[Client Chat] Failed to load inbox:', messagesError);
        if (mounted) setBackendVetConversationsLoaded(true);
        return;
      }

      const rows = (messageRows || []) as RealtimeMessage[];
      const participantIds = [...new Set(rows.map((item) => item.sender_id === user.id ? item.receiver_id : item.sender_id))];
      if (participantIds.length === 0) {
        if (mounted) {
          setBackendVetConversations([]);
          setBackendVetConversationsLoaded(true);
        }
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', participantIds)
        .in('role', ['vet', 'veterinarian']);
      if (profilesError) {
        console.error('[Client Chat] Failed to load vet profiles:', profilesError);
        if (mounted) setBackendVetConversationsLoaded(true);
        return;
      }

      const vets = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const grouped = new Map<string, RealtimeMessage[]>();
      for (const item of rows) {
        const participantId = item.sender_id === user.id ? item.receiver_id : item.sender_id;
        if (!vets.has(participantId)) continue;
        const thread = grouped.get(participantId) || [];
        thread.push(item);
        grouped.set(participantId, thread);
      }

      if (mounted) setBackendVetConversations(Array.from(grouped.entries()).map(([participantId, messages]) => {
        const profile = vets.get(participantId);
        return {
          id: `vet-${user.id}-${participantId}`,
          participantId,
          vet: profile?.full_name || profile?.email || 'Veterinarian',
          category: 'Client consultation',
          messages: messages.map((item) => ({ id: item.id, sender: item.sender_id === user.id ? 'client' : 'vet', text: item.content, createdAt: Date.parse(item.created_at) })),
        };
      }));
      if (mounted) setBackendVetConversationsLoaded(true);
    }).catch((error) => {
      console.error('[Client Chat] Failed to initialize inbox:', error);
      if (mounted) setBackendVetConversationsLoaded(true);
    });

    return () => { mounted = false; };
  }, []);
  
  useEffect(() => {
    if (!params.category || !params.vet || !params.vet_id || !currentUserId || activeVet) return;
    const category = params.category;
    const vetName = params.vet;
    const vetId = params.vet_id;

    const initializeVetConversation = async () => {
      let conversationId = `vet-${currentUserId}-${vetId}`;
      setActiveVet({ id: conversationId, vet: vetName, category, messages: [], participantId: vetId });
      setSelectedId(conversationId);
    };

    void initializeVetConversation();
  }, [params.category, params.vet, params.vet_id, currentUserId, activeVet]);
  
  const productConversation = conversations.find((item) => item.id === selectedId);
  const vetConversation = activeVet;

  useEffect(() => {
    queueMicrotask(() => setSelectedId(params.conversationId || ''));
  }, [params.conversationId]);
  useEffect(() => {
    const conversationId = selectedId || (activeVet ? activeVet.id : null);
    if (!conversationId) return;
    let mounted = true;
    const loadMessages = async () => {
      const participantId = activeVet?.participantId || params.vet_id;
      if (activeVet && participantId && currentUserId) {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${participantId}),and(sender_id.eq.${participantId},receiver_id.eq.${currentUserId})`)
          .order('created_at', { ascending: true });
        if (mounted) setRemoteMessages((data || []) as RealtimeMessage[]);
      } else {
        const items = await getConversationMessages(conversationId);
        if (mounted) setRemoteMessages(items);
      }
    };
    void loadMessages().catch(() => undefined);
    const unsubscribe = subscribeToMessages(conversationId, (item) => setRemoteMessages((items) => {
      if (items.some((current) => current.id === item.id)) return items;
      const temporaryIndex = items.findIndex((current) => current.id.startsWith('temp-')
        && current.sender_id === item.sender_id
        && current.content === item.content);
      if (temporaryIndex === -1) return [...items, item];
      return items.map((current, index) => index === temporaryIndex ? item : current);
    }));
    return () => { mounted = false; unsubscribe(); };
  }, [selectedId, activeVet?.id, params.vet_id, currentUserId]);

  const send = async (conversationId: string, receiverId: string) => {
    const content = message.trim();
    if (!content) return;
    
    try {
      const user = await getCurrentUser();
      if (user) {
        const senderName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || 'Pet Parent';
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, email: user.email, full_name: senderName, role: 'client' }, { onConflict: 'id' });
        if (profileError) console.warn('[Client Chat] Could not sync sender profile:', profileError);

        // Optimistic update - add message to display immediately
        const tempMessage: RealtimeMessage = {
          id: `temp-${Date.now()}`,
          conversation_id: conversationId,
          sender_id: user.id,
          receiver_id: receiverId,
          content,
          message_type: 'text',
          metadata: { sender_name: senderName },
          created_at: new Date().toISOString(),
        };
        setRemoteMessages((prev) => [...prev, tempMessage]);
        
        // Send to Supabase
        await sendRealtimeMessage({ conversation_id: conversationId, sender_id: user.id, receiver_id: receiverId, content, message_type: 'text', metadata: { sender_name: senderName } });
      }
    } catch (error) {
      console.error('[Client Chat] Failed to send message:', error);
      return;
    }
    setMessage('');
  };

  const attachMedia = async (conversationId: string, receiverId: string) => {
    if (uploadingAttachment) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], selectionLimit: 1 });
      if (result.canceled || !result.assets[0]) return;
      setUploadingAttachment(true);
      const asset = result.assets[0];
      const uploaded = await uploadChatAttachment(conversationId, asset);
      const user = await getCurrentUser();
      if (!user) return;
      const caption = message.trim();
      const mediaMessage: RealtimeMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user.id,
        receiver_id: receiverId,
        content: caption,
        message_type: 'text',
        media_url: uploaded.publicUrl,
        media_type: uploaded.mediaType,
        created_at: new Date().toISOString(),
      };
      setRemoteMessages((items) => [...items, mediaMessage]);
      await sendRealtimeMessage({ conversation_id: conversationId, sender_id: user.id, receiver_id: receiverId, content: caption, message_type: 'text', media_url: uploaded.publicUrl, media_type: uploaded.mediaType });
      setMessage('');
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Could not upload attachment.';
      Alert.alert('Attachment failed', messageText);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const returnToChatInbox = () => {
    setActiveVet(null);
    setSelectedId('');
    setRemoteMessages([]);
    setMessage('');
    router.replace('/(client)/chat');
  };

  if (productConversation) return <ChatRoom title={productConversation.product.merchant} subtitle={productConversation.product.name} messages={remoteMessages} message={message} setMessage={setMessage} onBack={() => setSelectedId('')} onSend={() => void send(productConversation.id, productConversation.product.merchantId)} onAttach={() => void attachMedia(productConversation.id, productConversation.product.merchantId)} uploadingAttachment={uploadingAttachment} isProduct={true} productId={productConversation.productId} productPrice={parseInt(params.productPrice || '0')} productName={params.productName} conversationId={productConversation.id} paymentStatus={productConversation.paymentStatus} merchantId={productConversation.product.merchantId} />;
  if (vetConversation) return <ChatRoom title={vetConversation.vet} subtitle={vetConversation.category} messages={remoteMessages} message={message} setMessage={setMessage} onBack={returnToChatInbox} onSend={() => void send(vetConversation.id, vetConversation.participantId || params.receiver_id || params.vet_id || 'vet')} onAttach={() => void attachMedia(vetConversation.id, vetConversation.participantId || params.receiver_id || params.vet_id || 'vet')} uploadingAttachment={uploadingAttachment} isProduct={false} />;

  return <SafeAreaView style={styles.container}><View style={styles.header}><Text style={styles.title}>Active Chats</Text><TouchableOpacity onPress={() => router.replace('/')}><MaterialCommunityIcons name="arrow-left" size={22} color="#3B82F6" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.list}>
    {conversations.map((conversation) => <TouchableOpacity key={conversation.id} style={styles.thread} onPress={() => setSelectedId(conversation.id)}><View style={styles.avatar}><MaterialCommunityIcons name="store" size={22} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.primary}>{conversation.product.merchant}</Text><Text style={styles.muted}>{conversation.product.name}</Text></View></TouchableOpacity>)}
    {!backendVetConversationsLoaded ? <ActivityIndicator size="small" color="#3B82F6" /> : backendVetConversations.map((conversation) => <TouchableOpacity key={conversation.id} style={styles.thread} onPress={() => setActiveVet(conversation)}><View style={styles.avatar}><MaterialCommunityIcons name="hospital-box" size={22} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.primary}>{conversation.vet}</Text><Text style={styles.muted}>{conversation.category}</Text></View></TouchableOpacity>)}
  </ScrollView></SafeAreaView>;
}

function ChatRoom({ title, subtitle, messages, message, setMessage, onBack, onSend, onAttach, uploadingAttachment = false, isProduct = false, productId, productPrice, productName, conversationId, paymentStatus, merchantId }: { title: string; subtitle: string; messages: RealtimeMessage[]; message: string; setMessage: (value: string) => void; onBack: () => void; onSend: () => void; onAttach?: () => void; uploadingAttachment?: boolean; isProduct?: boolean; productId?: string; productPrice?: number; productName?: string; conversationId?: string; paymentStatus?: 'paid' | 'unpaid'; merchantId?: string }) {
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [order, setOrder] = useState<{ id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' } | null>(null);

  const orderStatus = order?.status;
  const isOrderCompleted = orderStatus === 'completed' || orderStatus === 'confirmed';
  const isAwaitingMerchantConfirmation = orderStatus === 'paid';
  const canShowProceedToPayment = !order || orderStatus === 'pending_payment';
  
  useEffect(() => {
    void getCurrentUser().then((user) => { 
      if (user) {
        setCurrentUserId(user.id);
        setUserEmail(user.email || '');
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isProduct || !conversationId) return;
    void (async () => {
      try {
        const { data } = await supabase.from('orders').select('id, status').eq('conversation_id', conversationId).maybeSingle();
        if (data) setOrder(data as { id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' });
      } catch (error) {
        console.error('[Client Chat] Failed to load order:', error);
      }
    })();
  }, [conversationId, isProduct]);

  const handleInitiatePayment = async () => {
    if (!productPrice || !productName || !userEmail) return;
    setIsProcessingPayment(true);
    try {
      const paymentPayload = await initializePayment(
        productPrice,
        productName,
        userEmail,
        currentUserId,
        conversationId
      );

      await sendRealtimeMessage({
        conversation_id: conversationId || '',
        sender_id: currentUserId,
        receiver_id: merchantId || 'merchant',
        content: `Payment initiated: ₦${productPrice.toLocaleString('en-NG')} (Ref: ${formatPaymentRef(paymentPayload.tx_ref)})`,
        message_type: 'invoice',
      });

      if (order?.id) {
        const { data: updatedOrder, error: orderError } = await supabase
          .from('orders')
          .update({
            status: 'paid',
            amount: productPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
          .select('id, status')
          .single();

        if (orderError) throw orderError;
        setOrder(updatedOrder as { id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' });
      } else {
        const { data: createdOrder, error: orderError } = await supabase.from('orders').insert({
          conversation_id: conversationId,
          product_id: productId || productName || 'product',
          buyer_id: currentUserId,
          merchant_id: merchantId,
          amount: productPrice,
          status: 'paid',
        }).select('id, status').single();

        if (orderError) throw orderError;
        setOrder(createdOrder as { id: string; status: 'pending' | 'pending_payment' | 'awaiting_payment' | 'paid' | 'completed' | 'confirmed' });
      }

      setMessage('');
    } catch (error) {
      console.error('Payment initialization failed:', error);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const completeOrder = async () => {
    if (!order) return;
    const { error } = await supabase.from('orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', order.id);
    if (error) return console.error('[Client Chat] Failed to complete order:', error);
    setOrder({ ...order, status: 'completed' });
  };
  
  return <SafeAreaView style={styles.container}>
    <View style={styles.roomHeader}>
      <TouchableOpacity onPress={onBack}>
        <MaterialCommunityIcons name="arrow-left" size={23} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.flex}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
    </View>
    
    <ScrollView contentContainerStyle={styles.room}>
      {isProduct && productPrice && (
        <View style={styles.productBanner}>
          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Price</Text>
            <Text style={styles.priceValue}>₦{productPrice.toLocaleString('en-NG')}</Text>
          </View>
          <View style={styles.statusSection}>
            <Text style={styles.statusLabel}>
              {isOrderCompleted ? '✓ Paid' : isAwaitingMerchantConfirmation ? '⏳ Payment Sent' : 'Awaiting Payment'}
            </Text>
            <Text style={[styles.statusValue, { color: isOrderCompleted ? '#10B981' : isAwaitingMerchantConfirmation ? '#F59E0B' : '#F59E0B' }]}>
              {isOrderCompleted
                ? '✅ Payment Confirmed & Order Completed'
                : isAwaitingMerchantConfirmation
                  ? '⏳ Payment Sent - Awaiting Merchant Confirmation'
                  : 'Ready to checkout'}
            </Text>
          </View>
        </View>
      )}
      
      {messages && messages.length > 0 ? (
        messages.map((item) => (
          <View 
            key={item.id} 
            style={[
              styles.bubble, 
              item.sender_id === currentUserId ? styles.clientBubble : styles.vetBubble
            ]}
          >
            {item.media_url && item.media_type === 'image' && <TouchableOpacity onPress={() => setPreview({ url: item.media_url!, type: 'image' })}><Image source={{ uri: item.media_url }} style={styles.imageAttachment} /></TouchableOpacity>}
            {item.media_url && item.media_type === 'video' && <TouchableOpacity onPress={() => setPreview({ url: item.media_url!, type: 'video' })}><Video source={{ uri: item.media_url }} useNativeControls style={styles.videoAttachment} resizeMode={ResizeMode.CONTAIN} /></TouchableOpacity>}
            {item.content ? <Text style={styles.primary}>{item.content}</Text> : null}
          </View>
        ))
      ) : (
        <Text style={styles.emptyMessage}>No messages yet. Start the conversation!</Text>
      )}
    </ScrollView>
    
    {isProduct && canShowProceedToPayment && (
      <TouchableOpacity 
        style={styles.paymentButton}
        onPress={handleInitiatePayment}
        disabled={isProcessingPayment}
      >
        <MaterialCommunityIcons name="credit-card" size={20} color="#FFFFFF" />
        <Text style={styles.paymentButtonText}>
          {isProcessingPayment ? 'Processing...' : `Proceed to Payment (₦${productPrice?.toLocaleString('en-NG')})`}
        </Text>
      </TouchableOpacity>
    )}
    {isProduct && isOrderCompleted && <View style={styles.successBadge}><MaterialCommunityIcons name="check-circle" size={18} color="#FFFFFF" /><Text style={styles.successBadgeText}>✅ Payment Confirmed & Order Completed</Text></View>}
    
    {(!isProduct || paymentStatus !== 'paid') && (
      <View style={styles.composer}>
        <TouchableOpacity style={styles.attach} onPress={onAttach} disabled={!onAttach || uploadingAttachment}>
          {uploadingAttachment ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialCommunityIcons name="paperclip" size={20} color="#FFFFFF" />}
        </TouchableOpacity>
        <TextInput 
          value={message} 
          onChangeText={setMessage} 
          placeholder="Write a message..." 
          placeholderTextColor="#64748B" 
          style={[styles.input, styles.flex]} 
          multiline
        />
        <TouchableOpacity style={styles.send} onPress={onSend}>
          <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    )}
    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
      <View style={styles.previewOverlay}>
        <TouchableOpacity style={styles.previewClose} onPress={() => setPreview(null)}>
          <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        {preview?.type === 'image' && <Image source={{ uri: preview.url }} style={styles.previewImage} resizeMode="contain" />}
        {preview?.type === 'video' && <Video source={{ uri: preview.url }} useNativeControls style={styles.previewVideo} resizeMode={ResizeMode.CONTAIN} shouldPlay />}
      </View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ 
  container: { flex: 1, backgroundColor: '#0F172A' }, 
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, 
  roomHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 12 }, 
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' }, 
  list: { padding: 16 }, 
  room: { padding: 16 }, 
  thread: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }, 
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, 
  flex: { flex: 1 }, 
  primary: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, 
  muted: { color: '#94A3B8', fontSize: 12, marginTop: 3 }, 
  bubble: { backgroundColor: '#1E293B', borderRadius: 12, padding: 13, alignSelf: 'flex-start', maxWidth: '86%', marginBottom: 10 }, 
  vetBubble: { backgroundColor: '#1E293B', alignSelf: 'flex-start' },
  clientBubble: { backgroundColor: '#0E7490', alignSelf: 'flex-end' }, 
  emptyMessage: { color: '#94A3B8', textAlign: 'center', marginTop: 20, fontSize: 14 },
  composer: { padding: 12, borderTopWidth: 1, borderTopColor: '#334155', flexDirection: 'row', gap: 8 }, 
  attach: { width: 44, borderRadius: 8, backgroundColor: '#475569', justifyContent: 'center', alignItems: 'center' },
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#FFFFFF', padding: 11 }, 
  send: { width: 44, borderRadius: 8, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' }, 
  imageAttachment: { width: 200, height: 200, borderRadius: 12, marginBottom: 8 },
  videoAttachment: { width: 220, height: 160, borderRadius: 12, marginBottom: 8 },
  previewOverlay: { flex: 1, backgroundColor: '#000000E6', justifyContent: 'center', alignItems: 'center', padding: 16 },
  previewClose: { position: 'absolute', top: 24, right: 20, zIndex: 1, padding: 8 },
  previewImage: { width: '100%', height: '80%' },
  previewVideo: { width: '100%', height: '70%' },
  productBanner: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 16, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, 
  priceSection: { flex: 1 }, 
  priceLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' }, 
  priceValue: { color: '#10B981', fontSize: 24, fontWeight: '700', marginTop: 4 }, 
  statusSection: { alignItems: 'flex-end' }, 
  statusLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' }, 
  statusValue: { color: '#F59E0B', fontSize: 14, fontWeight: '700', marginTop: 4 }, 
  paymentButton: { backgroundColor: '#10B981', padding: 16, margin: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, 
  paymentButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  successBadge: { backgroundColor: '#10B981', padding: 14, margin: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  successBadgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' }
});
