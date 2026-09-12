import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, supabase } from '../../lib/supabase';

type Profile = { full_name: string | null; avatar_url: string | null; role: string | null };
type CommunityMessage = { id: string; user_id: string; content: string; media_urls: string[] | null; created_at: string; profiles: Profile | Profile[] | null };
type PendingImage = ImagePicker.ImagePickerAsset;

const roleLabels: Record<string, string> = { vet: 'Vet', veterinarian: 'Vet', merchant: 'Merchant', client: 'Client' };
const emptyProfile: Profile = { full_name: null, avatar_url: null, role: null };

const getProfile = (profile: CommunityMessage['profiles']): Profile => Array.isArray(profile) ? profile[0] || emptyProfile : profile || emptyProfile;
const getAvatarUrl = (avatarPath: string | null) => {
  if (!avatarPath) return null;
  return /^https?:\/\//i.test(avatarPath) ? avatarPath : supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl;
};
const formatMessageTime = (createdAt: string) => new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function CommunityScreen() {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const deletePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<CommunityMessage>>(null);

  const loadMessages = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const { data, error } = await supabase
      .from('community_messages')
      .select('id, user_id, content, media_urls, created_at, profiles(full_name, avatar_url, role)')
      .order('created_at', { ascending: true });
    if (error) Alert.alert('Could not load community', error.message);
    else setMessages((data || []) as CommunityMessage[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      const user = await getCurrentUser();
      if (mounted) setCurrentUserId(user?.id || null);
      await loadMessages();
    };
    void initialize();

    const channel = supabase
      .channel('public:community_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_messages' }, async (payload) => {
        const messageId = String(payload.eventType === 'DELETE' ? payload.old.id : payload.new.id);
        if (payload.eventType === 'DELETE') {
          if (mounted) setMessages((current) => current.filter((message) => message.id !== messageId));
          return;
        }

        if (payload.eventType === 'INSERT') {
          const { data, error } = await supabase
            .from('community_messages')
            .select('id, user_id, content, media_urls, created_at, profiles(full_name, avatar_url, role)')
            .eq('id', messageId)
            .single();
          if (mounted && !error && data) {
            setMessages((current) => current.some((message) => message.id === messageId) ? current : [...current, data as CommunityMessage]);
          }
        }
      })
      .subscribe();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setCurrentUserId(session?.user.id || null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: false });
  }, [messages.length]);

  useEffect(() => () => {
    if (deletePressTimer.current) clearTimeout(deletePressTimer.current);
  }, []);

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.8 });
    if (!result.canceled) setPendingImages(result.assets.slice(0, 4));
  };

  const sendMessage = async () => {
    const trimmedContent = sanitizeInput(content);
    if (!trimmedContent && pendingImages.length === 0) return;
    const user = await getCurrentUser();
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in before sending a message.');
      return;
    }

    setSending(true);
    try {
      const mediaUrls = await Promise.all(pendingImages.map(async (asset, index) => {
        const file = await (await fetch(asset.uri)).blob();
        const fileName = asset.fileName || `community-${Date.now()}-${index}.jpg`;
        const extension = fileName.split('.').pop() || 'jpg';
        const path = `${user.id}/${Date.now()}-${index}.${extension}`;
        const { error } = await supabase.storage.from('community-uploads').upload(path, file, { contentType: asset.mimeType || file.type || 'image/jpeg', upsert: false });
        if (error) throw error;
        return supabase.storage.from('community-uploads').getPublicUrl(path).data.publicUrl;
      }));
      const { error } = await supabase.from('community_messages').insert({ user_id: user.id, content: trimmedContent, media_urls: mediaUrls });
      if (error) throw error;
      setContent('');
      setPendingImages([]);
    } catch (error) {
      Alert.alert('Could not send message', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = (messageId: string) => {
    setDeleteCandidateId(messageId);
  };

  const deleteMessage = async () => {
    if (!deleteCandidateId) return;
    const messageId = deleteCandidateId;
    const user = await getCurrentUser();
    const message = messages.find((item) => item.id === messageId);
    if (!user || !message || message.user_id !== user.id) {
      setDeleteCandidateId(null);
      Alert.alert('Delete failed', 'You can only delete your own messages.');
      return;
    }

    setDeletingMessage(true);
    const { data, error } = await supabase
      .from('community_messages')
      .delete()
      .eq('id', messageId)
      .select('id')
      .maybeSingle();
    setDeletingMessage(false);
    if (error) {
      Alert.alert('Could not delete message', error.message);
      return;
    }
    if (!data) {
      Alert.alert('Could not delete message', 'The message was not deleted. Check your account permissions.');
      return;
    }
    setDeleteCandidateId(null);
    setMessages((current) => current.filter((item) => item.id !== messageId));
  };

  const startDeletePress = (messageId: string, isOwnMessage: boolean) => {
    if (!isOwnMessage) return;
    if (deletePressTimer.current) clearTimeout(deletePressTimer.current);
    deletePressTimer.current = setTimeout(() => confirmDelete(messageId), 600);
  };

  const cancelDeletePress = () => {
    if (deletePressTimer.current) {
      clearTimeout(deletePressTimer.current);
      deletePressTimer.current = null;
    }
  };

  const renderMessage = ({ item }: { item: CommunityMessage }) => {
    const profile = getProfile(item.profiles);
    const isOwnMessage = item.user_id === currentUserId;
    const avatarUrl = getAvatarUrl(profile.avatar_url);
    return (
      <View style={[styles.messageRow, isOwnMessage && styles.messageRowOwn]}>
        {!isOwnMessage && (avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><MaterialCommunityIcons name="account" size={18} color="#10B981" /></View>)}
        <View style={[styles.messageColumn, isOwnMessage && styles.messageColumnOwn]}>
          <View style={[styles.senderRow, isOwnMessage && styles.senderRowOwn]}><Text style={styles.senderName}>{profile.full_name || 'MVS member'}</Text><Text style={styles.roleBadge}>{roleLabels[profile.role || ''] || 'Member'}</Text></View>
          <TouchableOpacity activeOpacity={0.85} onPressIn={() => startDeletePress(item.id, isOwnMessage)} onPressOut={cancelDeletePress} disabled={!isOwnMessage} style={[styles.bubble, isOwnMessage ? styles.bubbleOwn : styles.bubbleOther]}>
            {item.content ? <Text style={[styles.messageText, isOwnMessage && styles.messageTextOwn]}>{item.content}</Text> : null}
            {item.media_urls?.length ? <View style={styles.mediaGrid}>{item.media_urls.map((url, index) => <Image key={`${url}-${index}`} source={{ uri: url }} style={item.media_urls && item.media_urls.length === 1 ? styles.mediaSingle : styles.mediaTile} />)}</View> : null}
            <View style={styles.messageFooter}><Text style={[styles.time, isOwnMessage && styles.timeOwn]}>{formatMessageTime(item.created_at)}</Text></View>
          </TouchableOpacity>
        </View>
        {isOwnMessage && (avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarOwn} /> : <View style={styles.avatarFallbackOwn}><MaterialCommunityIcons name="account" size={18} color="#10B981" /></View>)}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={styles.banner}><Text style={styles.heroTitle}>MVS Community Hub</Text><Text style={styles.kicker}>MVS COMMUNITY</Text><Text style={styles.heading}>A trusted place to share, sell, and support.</Text></View>
      <FlatList ref={listRef} data={messages} renderItem={renderMessage} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void loadMessages(true); }} tintColor="#10B981" />} onContentSizeChange={() => { if (messages.length) listRef.current?.scrollToEnd({ animated: false }); }} ListEmptyComponent={loading ? <ActivityIndicator color="#10B981" style={styles.loader} /> : <Text style={styles.empty}>Be the first to say hello.</Text>} />
      {pendingImages.length > 0 ? <View style={styles.pendingRow}>{pendingImages.map((image) => <Image key={image.assetId || image.uri} source={{ uri: image.uri }} style={styles.pendingImage} />)}<TouchableOpacity onPress={() => setPendingImages([])} accessibilityLabel="Remove selected images"><MaterialCommunityIcons name="close-circle" size={24} color="#64748B" /></TouchableOpacity></View> : null}
      <View style={styles.composer}><TouchableOpacity style={styles.iconButton} onPress={() => { void pickImages(); }} disabled={sending} accessibilityLabel="Attach images"><MaterialCommunityIcons name="image-outline" size={24} color="#10B981" /></TouchableOpacity><TextInput value={content} onChangeText={setContent} placeholder="Message the MVS community" placeholderTextColor="#64748B" style={styles.input} editable={!sending} multiline maxLength={2000} /><TouchableOpacity style={styles.sendButton} onPress={() => { void sendMessage(); }} disabled={sending || (!content.trim() && pendingImages.length === 0)} accessibilityLabel="Send message">{sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />}</TouchableOpacity></View>
      <Modal visible={deleteCandidateId !== null} transparent animationType="fade" onRequestClose={() => { if (!deletingMessage) setDeleteCandidateId(null); }}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete message?</Text>
            <Text style={styles.confirmText}>This message will be removed for everyone.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setDeleteCandidateId(null)} disabled={deletingMessage}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirmButton} onPress={() => { void deleteMessage(); }} disabled={deletingMessage}>{deletingMessage ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.deleteConfirmText}>Delete</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  keyboardRoot: { flex: 1, backgroundColor: '#0F172A' },
  banner: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20, backgroundColor: '#0D1527', borderBottomWidth: 1, borderBottomColor: '#334155', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 10 },
  kicker: { color: '#10B981', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: 5 },
  list: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12, flexGrow: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  messageRowOwn: { justifyContent: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 7 },
  avatarFallback: { width: 32, height: 32, borderRadius: 16, marginRight: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' },
  avatarOwn: { width: 32, height: 32, borderRadius: 16, marginLeft: 7 },
  avatarFallbackOwn: { width: 32, height: 32, borderRadius: 16, marginLeft: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' },
  messageColumn: { maxWidth: '84%' },
  messageColumnOwn: { alignItems: 'flex-end' },
  confirmOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000B8', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 360, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 14, padding: 20 },
  confirmTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  confirmText: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelButton: { borderColor: '#475569', borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10 },
  cancelButtonText: { color: '#CBD5E1', fontWeight: '700' },
  deleteConfirmButton: { minWidth: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10 },
  deleteConfirmText: { color: '#FFFFFF', fontWeight: '700' },
  senderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, marginLeft: 4 },
  senderRowOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 4 },
  senderName: { color: '#F8FAFC', fontSize: 11, fontWeight: '800', marginRight: 6 },
  roleBadge: { color: '#10B981', backgroundColor: '#065F46', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '800' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, minWidth: 70 },
  bubbleOther: { backgroundColor: '#1E293B', borderBottomLeftRadius: 4, borderLeftWidth: 2, borderLeftColor: '#10B981' },
  bubbleOwn: { backgroundColor: '#0E7490', borderBottomRightRadius: 4, borderRightWidth: 2, borderRightColor: '#10B981' },
  messageText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  messageTextOwn: { color: '#FFFFFF' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2, marginBottom: 4 },
  mediaSingle: { width: 220, height: 170, borderRadius: 10 },
  mediaTile: { width: 96, height: 96, borderRadius: 8 },
  time: { color: '#94A3B8', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  timeOwn: { color: '#A7F3D0' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  loader: { marginTop: 30 },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 30 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#334155' },
  pendingImage: { width: 52, height: 52, borderRadius: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#334155' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 110, minHeight: 42, borderWidth: 1, borderColor: '#334155', borderRadius: 22, color: '#FFFFFF', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#1E293B', fontSize: 15 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981' },
});
