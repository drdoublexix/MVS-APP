import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { addVetConversationMessage, useMarketplace, type VetConversation } from '../../lib/marketplace';
import { getConversationMessages, getCurrentUser, sendRealtimeMessage, subscribeToMessages, supabase, uploadChatAttachment, type RealtimeMessage } from '../../lib/supabase';

export default function VetChatScreen() {
  const params = useLocalSearchParams<{ merchantId?: string; productName?: string; productPrice?: string; starterMessage?: string }>();
  const { vetConversations } = useMarketplace();
  const [active, setActive] = useState<VetConversation | null>(null);
  const [inbox, setInbox] = useState<VetConversation[]>([]);
  const [message, setMessage] = useState('');
  const [remoteMessages, setRemoteMessages] = useState<RealtimeMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

    useEffect(() => {
      if (!params.merchantId || !params.productName || !currentUserId || active) return;
      setMessage(params.starterMessage || `Hi! I would like to inquire about purchasing ${params.productName} listed for ₦${params.productPrice || '0'}.`);
      setActive({ id: `product-${currentUserId}-${params.merchantId}`, participantId: params.merchantId, vet: params.productName, category: 'Product inquiry', messages: [] });
    }, [params.merchantId, params.productName, params.productPrice, params.starterMessage, currentUserId, active]);
  
  // Get current user
  useEffect(() => {
    void getCurrentUser().then(async (user) => {
      if (!user) return;
      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Vet Chat] Failed to load inbox:', error);
        return;
      }

      const grouped = new Map<string, RealtimeMessage[]>();
      for (const item of (data || []) as RealtimeMessage[]) {
        const thread = grouped.get(item.sender_id) || [];
        thread.push(item);
        grouped.set(item.sender_id, thread);
      }

      const senderIds = [...new Set((data || []).map((item) => (item as RealtimeMessage).sender_id).filter((id) => id !== user.id))];
      const senderNames = new Map<string, string>();
      if (senderIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', senderIds);

        if (profilesError) {
          console.warn('[Vet Chat] Failed to load client names:', profilesError);
        } else {
          for (const profile of profiles || []) {
            senderNames.set(profile.id, profile.full_name || profile.email || '');
          }
        }
      }

      setInbox(Array.from(grouped.entries()).map(([clientId, messages]) => ({
        id: `vet-${clientId}-${user.id}`,
        clientId,
        vet: senderNames.get(messages[0]?.sender_id || '')
          || String(messages[0]?.metadata?.sender_name || 'Pet Parent'),
        category: 'Client consultation',
        messages: messages.map((item) => ({
          id: item.id,
          sender: item.sender_id === user.id ? 'vet' : 'client',
          text: item.content,
          createdAt: Date.parse(item.created_at),
        })),
      })));
    }).catch((error) => console.error('[Vet Chat] Failed to initialize inbox:', error));
  }, []);
  
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const loadMessages = async () => {
      if ((active.clientId || active.participantId) && currentUserId) {
        const participantId = active.clientId || active.participantId;
        const { data } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${participantId},receiver_id.eq.${currentUserId}),and(sender_id.eq.${currentUserId},receiver_id.eq.${participantId})`)
          .order('created_at', { ascending: true });
        if (mounted) setRemoteMessages((data || []) as RealtimeMessage[]);
      } else {
        const items = await getConversationMessages(active.id);
        if (mounted) setRemoteMessages(items);
      }
    };
    void loadMessages().catch(() => undefined);
    const unsubscribe = subscribeToMessages(active.id, (item) => setRemoteMessages((items) => {
      if (items.some((current) => current.id === item.id)) return items;
      const temporaryIndex = items.findIndex((current) => current.id.startsWith('temp-')
        && current.sender_id === item.sender_id
        && current.content === item.content);
      if (temporaryIndex === -1) return [...items, item];
      return items.map((current, index) => index === temporaryIndex ? item : current);
    }));
    return () => { mounted = false; unsubscribe(); };
  }, [active]);
  
  const send = async () => { 
    if (!active || !message.trim()) return; 
    const content = message.trim(); 
    addVetConversationMessage(active.id, 'vet', content);
    
    try {
      const user = await getCurrentUser();
      if (user) {
        const clientId = active.participantId || remoteMessages.find((item) => item.sender_id !== user.id)?.sender_id;
        if (!clientId) {
          console.warn('[Vet Chat] No client recipient found for conversation:', active.id);
          return;
        }
        // Optimistic update - add message to display immediately
        const tempMessage: RealtimeMessage = {
          id: `temp-${Date.now()}`,
          conversation_id: active.id,
          sender_id: user.id,
          receiver_id: clientId,
          content,
          message_type: 'text',
          created_at: new Date().toISOString(),
        };
        setRemoteMessages((prev) => [...prev, tempMessage]);
        
        // Send to Supabase
        await sendRealtimeMessage({ 
          conversation_id: active.id, 
          sender_id: user.id, 
          receiver_id: clientId,
          content, 
          message_type: 'text' 
        });
      }
    } catch (error) {
      console.error('[Vet Chat] Failed to send message:', error);
      return;
    }
    setMessage(''); 
  };
  const attachMedia = async () => {
    if (!active || !currentUserId || uploadingAttachment) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], selectionLimit: 1 });
      if (result.canceled || !result.assets[0]) return;
      setUploadingAttachment(true);
      const uploaded = await uploadChatAttachment(active.id, result.assets[0]);
      const clientId = remoteMessages.find((item) => item.sender_id !== currentUserId)?.sender_id;
      if (!clientId) throw new Error('No pet parent found for this conversation.');
      const content = message.trim();
      const mediaMessage: RealtimeMessage = { id: `temp-${Date.now()}`, conversation_id: active.id, sender_id: currentUserId, receiver_id: clientId, content, message_type: 'text', media_url: uploaded.publicUrl, media_type: uploaded.mediaType, created_at: new Date().toISOString() };
      setRemoteMessages((items) => [...items, mediaMessage]);
      await sendRealtimeMessage({ conversation_id: active.id, sender_id: currentUserId, receiver_id: clientId, content, message_type: 'text', media_url: uploaded.publicUrl, media_type: uploaded.mediaType });
      setMessage('');
    } catch (error) {
      Alert.alert('Attachment failed', error instanceof Error ? error.message : 'Could not upload attachment.');
    } finally {
      setUploadingAttachment(false);
    }
  };
  if (!active) return <SafeAreaView style={styles.container}><View style={styles.header}><View><Text style={styles.title}>Patient Messages</Text><Text style={styles.muted}>Consultations and client replies</Text></View><MaterialCommunityIcons name="message-text" size={24} color="#10B981" /></View><ScrollView contentContainerStyle={styles.list}>{[...inbox, ...vetConversations].map((conversation) => <TouchableOpacity key={conversation.id} style={styles.thread} onPress={() => setActive(conversation)}><View style={styles.avatar}><MaterialCommunityIcons name="paw" size={23} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.primary}>{conversation.vet}</Text><Text style={styles.category}>{conversation.category}</Text><Text style={styles.muted}>{conversation.messages[conversation.messages.length - 1]?.text}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color="#64748B" /></TouchableOpacity>)}</ScrollView></SafeAreaView>;
  
  // Merge local and remote messages, prioritizing remote messages
  const displayMessages = remoteMessages.length > 0 ? remoteMessages : active.messages;
  
  return <SafeAreaView style={styles.container}><View style={styles.roomHeader}><TouchableOpacity onPress={() => setActive(null)}><MaterialCommunityIcons name="arrow-left" size={23} color="#FFFFFF" /></TouchableOpacity><View style={styles.flex}><Text style={styles.title}>{active.vet}</Text><Text style={styles.muted}>{active.category}</Text></View></View><ScrollView contentContainerStyle={styles.room}><View style={styles.categoryBanner}><MaterialCommunityIcons name="clipboard-text" size={18} color="#10B981" /><Text style={styles.categoryText}>{active.category}</Text></View>{displayMessages && displayMessages.length > 0 ? displayMessages.map((item) => {
    const isVet = typeof item === 'object' && 'sender' in item ? item.sender === 'vet' : item.sender_id === currentUserId;
    const messageText = typeof item === 'object' && 'content' in item ? item.content : item.text;
    const messageId = typeof item === 'object' && 'id' in item ? item.id : `${Math.random()}`;
    const remoteMessage = typeof item === 'object' && 'media_url' in item ? item as RealtimeMessage : null;
    return <View key={messageId} style={[styles.bubble, isVet ? styles.vetBubble : styles.clientBubble]}>{remoteMessage?.media_url && remoteMessage.media_type === 'image' && <TouchableOpacity onPress={() => setPreview({ url: remoteMessage.media_url!, type: 'image' })}><Image source={{ uri: remoteMessage.media_url }} style={styles.imageAttachment} /></TouchableOpacity>}{remoteMessage?.media_url && remoteMessage.media_type === 'video' && <TouchableOpacity onPress={() => setPreview({ url: remoteMessage.media_url!, type: 'video' })}><Video source={{ uri: remoteMessage.media_url }} useNativeControls style={styles.videoAttachment} resizeMode={ResizeMode.CONTAIN} /></TouchableOpacity>}{messageText ? <Text style={styles.primary}>{messageText}</Text> : null}<MediaPreview preview={preview} onClose={() => setPreview(null)} /></View>;
  }) : <Text style={styles.emptyMessage}>No messages yet. Waiting for client...</Text>}<Text style={styles.infoText}>Client messages appear on the left. Your replies appear on the right.</Text></ScrollView><View style={styles.composer}><TouchableOpacity style={styles.attach} onPress={() => void attachMedia()} disabled={uploadingAttachment}>{uploadingAttachment ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialCommunityIcons name="paperclip" size={20} color="#FFFFFF" />}</TouchableOpacity><TextInput value={message} onChangeText={setMessage} placeholder="Reply to client..." placeholderTextColor="#64748B" style={[styles.input, styles.flex]} multiline /><TouchableOpacity style={styles.send} onPress={send}><MaterialCommunityIcons name="send" size={19} color="#FFFFFF" /></TouchableOpacity></View></SafeAreaView>;
}

function MediaPreview({ preview, onClose }: { preview: { url: string; type: 'image' | 'video' } | null; onClose: () => void }) {
  return <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: '#000000E6', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <TouchableOpacity style={{ position: 'absolute', top: 24, right: 20, zIndex: 1, padding: 8 }} onPress={onClose}>
        <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      {preview?.type === 'image' && <Image source={{ uri: preview.url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
      {preview?.type === 'video' && <Video source={{ uri: preview.url }} useNativeControls style={{ width: '100%', height: '70%' }} resizeMode={ResizeMode.CONTAIN} shouldPlay />}
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0F172A' }, header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, roomHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' }, muted: { color: '#94A3B8', fontSize: 12, marginTop: 4 }, list: { padding: 16 }, thread: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }, avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, primary: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, category: { color: '#3B82F6', fontSize: 12, fontWeight: '600', marginTop: 4 }, room: { padding: 16 }, categoryBanner: { backgroundColor: '#10B98120', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 }, categoryText: { color: '#10B981', fontWeight: '700', fontSize: 12 }, bubble: { maxWidth: '84%', padding: 13, borderRadius: 12, marginBottom: 10 }, clientBubble: { alignSelf: 'flex-start', backgroundColor: '#1E293B' }, vetBubble: { alignSelf: 'flex-end', backgroundColor: '#0E7490' }, imageAttachment: { width: 200, height: 200, borderRadius: 12, marginBottom: 8 }, videoAttachment: { width: 220, height: 160, borderRadius: 12, marginBottom: 8 }, emptyMessage: { color: '#94A3B8', textAlign: 'center', marginTop: 20, fontSize: 14 }, infoText: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 16, fontStyle: 'italic' }, composer: { padding: 12, borderTopWidth: 1, borderTopColor: '#334155', flexDirection: 'row', gap: 8 }, attach: { width: 44, borderRadius: 8, backgroundColor: '#475569', alignItems: 'center', justifyContent: 'center' }, input: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', padding: 11 }, send: { width: 44, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' } });
