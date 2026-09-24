import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as Clipboard from 'expo-clipboard';
import type { ImagePickerAsset } from 'expo-image-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SwipeableMessage from '../../components/SwipeableMessage';
import { createOfflineMessageId, enqueueOfflineMessage, readOfflineMessages, removeOfflineMessage, type OfflineCommunityMessage } from '../../lib/offlineMessageQueue';
import { getCurrentUser, readCachedAuthState, supabase, type MessageReactions } from '../../lib/supabase';

type Profile = { full_name: string | null; avatar_url: string | null; role: string | null };
type ReplySnippet = { id: string; sender_name: string; content: string };
type CommunityMessage = { id: string; user_id: string; content: string; media_urls: string[] | null; created_at: string; profiles: Profile | Profile[] | null; reply_to?: ReplySnippet | null; hidden_for_users?: string[] | null; reactions?: MessageReactions | null; is_pending?: boolean };
type PendingImage = ImagePickerAsset;
type ReplyTarget = { id: string; senderName: string; content: string };

const roleLabels: Record<string, string> = { vet: 'Vet', veterinarian: 'Vet', merchant: 'Merchant', client: 'Client' };
const emptyProfile: Profile = { full_name: null, avatar_url: null, role: null };
const reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '💯'] as const;

const getProfile = (profile: CommunityMessage['profiles']): Profile => Array.isArray(profile) ? profile[0] || emptyProfile : profile || emptyProfile;
const getAvatarUrl = (avatarPath: string | null) => {
  if (!avatarPath) return null;
  return /^https?:\/\//i.test(avatarPath) ? avatarPath : supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl;
};
const formatMessageTime = (createdAt: string) => new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export default function CommunityScreen() {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [inputHeight, setInputHeight] = useState(42);
  const [copyToast, setCopyToast] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const deletePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<CommunityMessage>>(null);
  const composerInputRef = useRef<TextInput>(null);

  const pendingToCommunityMessage = (item: OfflineCommunityMessage): CommunityMessage => ({
    id: item.id,
    user_id: item.userId,
    content: item.content,
    media_urls: item.assets.map((asset) => asset.uri),
    created_at: item.createdAt,
    profiles: emptyProfile,
    reply_to: item.replyTo ? { id: item.replyTo.id, sender_name: item.replyTo.sender_name, content: item.replyTo.content } : null,
    is_pending: true,
  });

  const loadOfflineMessages = useCallback(async () => {
    if (!currentUserId) return;
    const queued = await readOfflineMessages();
    const mine = queued.filter((item): item is OfflineCommunityMessage => item.kind === 'community' && item.userId === currentUserId);
    setMessages((current) => [...current.filter((message) => !message.id.startsWith('offline-')), ...mine.map(pendingToCommunityMessage)]);
  }, [currentUserId]);

  useEffect(() => { queueMicrotask(() => { void loadOfflineMessages(); }); }, [loadOfflineMessages]);

  const pickImages = async () => {
    if (sending || pendingImages.length >= 5) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 5 - pendingImages.length,
        quality: 0.8,
      });
      if (!result.canceled) {
        setPendingImages((current) => {
          const combined = [...current, ...result.assets];
          return combined.filter((item, index, items) => items.findIndex((candidate) => candidate.uri === item.uri) === index).slice(0, 5);
        });
      }
    } catch (error) {
      Alert.alert('Attachment failed', error instanceof Error ? error.message : 'Could not select images.');
    }
  };

  const sendMessage = async () => {
    const trimmedContent = content.trim();
    if ((!trimmedContent && pendingImages.length === 0) || sending || !currentUserId) return;
    setSending(true);
    const reply = replyTarget ? {
      id: replyTarget.id,
      sender_name: replyTarget.senderName,
      content: replyTarget.content,
    } : null;
    const network = await NetInfo.fetch();
    if (network.isConnected !== true || network.isInternetReachable === false) {
      const offlineMessage: OfflineCommunityMessage = {
        id: createOfflineMessageId(), kind: 'community', userId: currentUserId, content: trimmedContent,
        assets: pendingImages.map((image) => ({ uri: image.uri, type: 'image', fileName: image.fileName, mimeType: image.mimeType, fileSize: image.fileSize })),
        replyTo: reply, createdAt: new Date().toISOString(),
      };
      await enqueueOfflineMessage(offlineMessage);
      setMessages((current) => [...current, pendingToCommunityMessage(offlineMessage)]);
      setContent(''); setPendingImages([]); setReplyTarget(null); setSending(false);
      return;
    }
    let mediaUrls: string[] = [];
    try {
      mediaUrls = await Promise.all(pendingImages.map(async (image, index) => {
        const blob = await (await fetch(image.uri)).blob();
        const fileName = image.fileName || `community-chat-${Date.now()}-${index}.jpg`;
        const extension = fileName.split('.').pop() || 'jpg';
        const filePath = `${currentUserId}/${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('community-uploads').upload(filePath, blob, {
          contentType: image.mimeType || blob.type || 'image/jpeg',
          upsert: false,
        });
        if (uploadError) throw uploadError;
        return supabase.storage.from('community-uploads').getPublicUrl(filePath).data.publicUrl;
      }));
    } catch (error) {
      Alert.alert('Attachment failed', error instanceof Error ? error.message : 'Could not upload images.');
      setSending(false);
      return;
    }
    const { error } = await supabase.from('community_messages').insert({
      user_id: currentUserId,
      content: trimmedContent,
      media_urls: mediaUrls,
      reply_to: reply,
    });
    if (error) {
      Alert.alert('Message failed', 'Could not send your message. Please try again.');
    } else {
      setContent('');
      setInputHeight(42);
      setPendingImages([]);
      setReplyTarget(null);
    }
    setSending(false);
  };

  const flushOfflineMessages = useCallback(async () => {
    const network = await NetInfo.fetch();
    if (network.isConnected !== true || network.isInternetReachable === false || !currentUserId) return;
    const queued = (await readOfflineMessages()).filter((item): item is OfflineCommunityMessage => item.kind === 'community' && item.userId === currentUserId);
    for (const item of queued) {
      try {
        const mediaUrls = await Promise.all(item.assets.map(async (asset, index) => {
          const blob = await (await fetch(asset.uri)).blob();
          const path = `${currentUserId}/${Date.now()}-${index}.jpg`;
          const upload = await supabase.storage.from('community-uploads').upload(path, blob, { contentType: asset.mimeType || 'image/jpeg', upsert: false });
          if (upload.error) throw upload.error;
          return supabase.storage.from('community-uploads').getPublicUrl(path).data.publicUrl;
        }));
        const { error } = await supabase.from('community_messages').insert({ user_id: currentUserId, content: item.content, media_urls: mediaUrls, reply_to: item.replyTo || null });
        if (error) throw error;
        await removeOfflineMessage(item.id);
        setMessages((current) => current.filter((message) => message.id !== item.id));
      } catch (error) {
        console.warn('[Offline Community] Flush paused:', error);
        break;
      }
    }
  }, [currentUserId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => { if (state.isConnected === true && state.isInternetReachable !== false) void flushOfflineMessages(); });
    queueMicrotask(() => { void flushOfflineMessages(); });
    return unsubscribe;
  }, [flushOfflineMessages]);

  const handleInputContentSizeChange = (event: any) => {
    const nextHeight = Math.min(Math.max(event.nativeEvent.contentSize.height + 4, 42), 132);
    setInputHeight(nextHeight);
  };

  const scrollToLatest = (animated = false) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    });
  };

  const loadMessages = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const { data, error } = await supabase
      .from('community_messages')
      .select('id, user_id, content, media_urls, created_at, reply_to, hidden_for_users, reactions, profiles(full_name, avatar_url, role)')
      .order('created_at', { ascending: true });
    if (error) Alert.alert('Could not load community', error.message);
    else setMessages((data || []) as CommunityMessage[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      const cachedState = await readCachedAuthState();
      if (mounted && cachedState.user) {
        setCurrentUserId(cachedState.user.id || null);
      }

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

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const { data, error } = await supabase
            .from('community_messages')
            .select('id, user_id, content, media_urls, created_at, reply_to, hidden_for_users, reactions, profiles(full_name, avatar_url, role)')
            .eq('id', messageId)
            .single();
          if (mounted && !error && data && !(Array.isArray((data as CommunityMessage).hidden_for_users) && (data as CommunityMessage).hidden_for_users!.includes(currentUserId || ''))) {
            setMessages((current) => current.some((message) => message.id === messageId)
              ? current.map((message) => message.id === messageId ? data as CommunityMessage : message)
              : [...current, data as CommunityMessage]);
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
  }, [currentUserId, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) scrollToLatest();
  }, [messages.length]);

  useEffect(() => () => {
    if (deletePressTimer.current) clearTimeout(deletePressTimer.current);
  }, []);

  const confirmDelete = (messageId: string) => {
    setActionMessageId(null);
    setDeleteCandidateId(messageId);
  };

  const copyMessage = async () => {
    const message = messages.find((item) => item.id === actionMessageId);
    if (!message?.content) return;
    await Clipboard.setStringAsync(message.content);
    setActionMessageId(null);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 1800);
  };

  const reactToMessage = async (messageId: string, emoji: string) => {
    const user = await getCurrentUser();
    if (!user) return;
    const message = messages.find((item) => item.id === messageId);
    if (!message) return;
    const nextReactions: MessageReactions = { ...(message.reactions || {}) };
    if (emoji) nextReactions[user.id] = emoji;
    else delete nextReactions[user.id];
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, reactions: nextReactions } : item));
    setActionMessageId(null);
    setDeleteCandidateId(null);
    const { error } = await supabase.from('community_messages').update({ reactions: nextReactions }).eq('id', messageId);
    if (error) {
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, reactions: message.reactions || {} } : item));
      Alert.alert('Reaction failed', 'Could not save your reaction. Please try again.');
    }
  };

  const deleteMessage = async (mode: 'everyone' | 'me') => {
    if (!deleteCandidateId) return;
    const messageId = deleteCandidateId;
    const user = await getCurrentUser();
    const message = messages.find((item) => item.id === messageId);
    if (!user || !message || (mode === 'everyone' && message.user_id !== user.id)) {
      setDeleteCandidateId(null);
      Alert.alert('Delete failed', mode === 'everyone' ? 'You can only delete your own messages for everyone.' : 'Could not delete this message for you.');
      return;
    }

    setDeletingMessage(true);
    const hiddenUsers = Array.isArray(message.hidden_for_users) ? message.hidden_for_users : [];
    const result = mode === 'everyone'
      ? await supabase.from('community_messages').delete().eq('id', messageId).select('id').maybeSingle()
      : await supabase.from('community_messages').update({ hidden_for_users: Array.from(new Set([...hiddenUsers, user.id])) }).eq('id', messageId).select('id').maybeSingle();
    const { data, error } = result;
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

  const renderMessage = ({ item }: { item: CommunityMessage }) => {
    const profile = getProfile(item.profiles);
    const isOwnMessage = item.user_id === currentUserId;
    const avatarUrl = getAvatarUrl(profile.avatar_url);
    const hasImage = Boolean(item.media_urls?.length);
    const previewImageUrl = item.media_urls?.[0] ?? null;

    return (
      <View style={[styles.messageRow, isOwnMessage && styles.messageRowOwn]}>
        {!isOwnMessage && (avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><MaterialCommunityIcons name="account" size={18} color="#10B981" /></View>)}
        <View style={[styles.messageColumn, isOwnMessage && styles.messageColumnOwn]}>
          <View style={[styles.senderRow, isOwnMessage && styles.senderRowOwn]}><Text style={styles.senderName}>{profile.full_name || 'MVS member'}</Text><Text style={styles.roleBadge}>{roleLabels[profile.role || ''] || 'Member'}</Text></View>
          <SwipeableMessage
            onReply={() => {
              setReplyTarget({ id: item.id, senderName: profile.full_name || 'MVS member', content: item.content || 'Image' });
              requestAnimationFrame(() => composerInputRef.current?.focus());
            }}
          >
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => {
              if (item.is_pending) {
                void removeOfflineMessage(item.id);
                setMessages((current) => current.filter((message) => message.id !== item.id));
                return;
              }
              setActionMessageId(item.id);
            }}
            onPress={() => {
              if (previewImageUrl) setSelectedImagePreview(previewImageUrl);
            }}
            disabled={!isOwnMessage && !hasImage}
            style={[styles.bubble, isOwnMessage ? styles.bubbleOwn : styles.bubbleOther, item.is_pending && styles.bubblePending]}
          >
            {item.reply_to ? <View style={styles.quotedMessage}><Text style={styles.quotedMessageSender} numberOfLines={1}>{item.reply_to.sender_name}</Text><Text style={styles.quotedMessageText} numberOfLines={2}>{item.reply_to.content}</Text></View> : null}
            {hasImage ? (
              <View style={styles.mediaGrid}>
                {item.media_urls!.map((url, index) => (
                  <TouchableOpacity
                    key={`${url}-${index}`}
                    activeOpacity={0.9}
                    onPress={() => setSelectedImagePreview(url)}
                    style={item.media_urls!.length === 1 ? styles.mediaSingleWrapper : styles.mediaTileWrapper}
                  >
                    <Image
                      source={{ uri: url }}
                      style={item.media_urls!.length === 1 ? styles.mediaSingle : styles.mediaTile}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {item.content ? <Text style={[styles.messageText, isOwnMessage && styles.messageTextOwn]}>{item.content}</Text> : null}
            <View style={styles.messageFooter}><Text style={[styles.time, isOwnMessage && styles.timeOwn]}>{item.is_pending ? 'Pending' : formatMessageTime(item.created_at)}</Text>{item.is_pending ? <MaterialCommunityIcons name="clock-outline" size={13} color="#94A3B8" /> : null}</View>
            {Object.values(item.reactions || {}).length > 0 ? <TouchableOpacity style={styles.reactionBadge} onPress={() => { if (item.reactions?.[currentUserId || '']) void reactToMessage(item.id, ''); }} disabled={!item.reactions?.[currentUserId || '']} accessibilityLabel={item.reactions?.[currentUserId || ''] ? 'Remove your reaction' : 'Message reactions'}><Text style={styles.reactionBadgeText}>{Array.from(new Set(Object.values(item.reactions || {}))).join(' ')}</Text></TouchableOpacity> : null}
          </TouchableOpacity>
          </SwipeableMessage>
        </View>
        {isOwnMessage && (avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarOwn} /> : <View style={styles.avatarFallbackOwn}><MaterialCommunityIcons name="account" size={18} color="#10B981" /></View>)}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={styles.banner}><Text style={styles.heroTitle}>MVS Hub</Text><Text style={styles.kicker}>Community + Marketplace</Text><Text style={styles.heading}>A trusted place to share, sell, and support.</Text></View>
        <FlatList ref={listRef} data={messages.filter((item) => !(item.hidden_for_users || []).includes(currentUserId || ''))} renderItem={renderMessage} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} onLayout={() => scrollToLatest()} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void loadMessages(true); }} tintColor="#10B981" />} onContentSizeChange={() => scrollToLatest()} ListEmptyComponent={loading ? <ActivityIndicator color="#10B981" style={styles.loader} /> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 }}><Text style={{ fontSize: 28, fontWeight: '700', color: '#10B981', textAlign: 'center', letterSpacing: 0.5 }}>Coming soon.</Text><Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>The community and marketplace experience is on its way.</Text></View>} />
        {replyTarget ? <View style={styles.replyPreview}><View style={styles.replyPreviewCopy}><Text style={styles.replyPreviewName}>{replyTarget.senderName}</Text><Text style={styles.replyPreviewText} numberOfLines={1}>{replyTarget.content}</Text></View><TouchableOpacity onPress={() => setReplyTarget(null)} accessibilityLabel="Cancel reply"><MaterialCommunityIcons name="close" size={20} color="#CBD5E1" /></TouchableOpacity></View> : null}
        {pendingImages.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingRow}>{pendingImages.map((image, index) => <View key={image.assetId || image.uri} style={styles.pendingItem}><Image source={{ uri: image.uri }} style={styles.pendingImage} /><TouchableOpacity style={styles.pendingRemove} onPress={() => setPendingImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} accessibilityLabel={`Remove selected image ${index + 1}`}><MaterialCommunityIcons name="close-circle" size={20} color="#F87171" /></TouchableOpacity></View>)}</ScrollView> : null}
        {/* <View style={styles.composer}>
          <TouchableOpacity style={styles.iconButton} onPress={() => { void pickImages(); }} disabled={sending || pendingImages.length >= 5} accessibilityLabel="Attach images">
            <MaterialCommunityIcons name="paperclip" size={24} color="#10B981" />
          </TouchableOpacity>
          <View style={[styles.inputShell, { height: inputHeight, maxHeight: 132 }]}>
            <TextInput ref={composerInputRef} value={content} onChangeText={setContent} placeholder="Message the MVS community" placeholderTextColor="#64748B" style={[styles.input, { height: inputHeight, lineHeight: 22 }]} editable={!sending} multiline maxLength={2000} scrollEnabled={inputHeight >= 132} onContentSizeChange={handleInputContentSizeChange} />
          </View>
          <TouchableOpacity style={styles.sendButton} onPress={() => { void sendMessage(); }} disabled={sending || (!content.trim() && pendingImages.length === 0)} accessibilityLabel="Send community message">
            {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />}
          </TouchableOpacity>
        </View> */}
        <Modal visible={actionMessageId !== null} transparent animationType="fade" onRequestClose={() => setActionMessageId(null)}>
          <View style={styles.confirmOverlay}><View style={styles.confirmCard}><View style={styles.reactionBar}>{reactionOptions.map((emoji) => <TouchableOpacity key={emoji} style={styles.reactionButton} onPress={() => { void reactToMessage(actionMessageId!, emoji); }} accessibilityLabel={`React ${emoji}`}><Text style={styles.reactionEmoji}>{emoji}</Text></TouchableOpacity>)}</View><Text style={styles.confirmTitle}>Message actions</Text><TouchableOpacity style={styles.actionOption} onPress={() => void copyMessage()}><MaterialCommunityIcons name="content-copy" size={20} color="#10B981" /><Text style={styles.actionOptionText}>Copy</Text></TouchableOpacity><TouchableOpacity style={styles.actionOption} onPress={() => confirmDelete(actionMessageId!)}><MaterialCommunityIcons name="delete-outline" size={20} color="#F87171" /><Text style={styles.actionOptionText}>Delete</Text></TouchableOpacity><TouchableOpacity style={styles.locationCancelAction} onPress={() => setActionMessageId(null)}><Text style={styles.locationCancelActionText}>Cancel</Text></TouchableOpacity></View></View>
        </Modal>
        {copyToast ? <View style={styles.copyToast}><Text style={styles.copyToastText}>Message copied</Text></View> : null}
        <Modal visible={deleteCandidateId !== null} transparent animationType="fade" onRequestClose={() => { if (!deletingMessage) setDeleteCandidateId(null); }}>
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Delete message?</Text>
              <Text style={styles.confirmText}>{messages.find((item) => item.id === deleteCandidateId)?.user_id === currentUserId ? 'Choose who should no longer see this message.' : 'This message will be removed for you.'}</Text>
              <View style={styles.confirmActions}>
                {messages.find((item) => item.id === deleteCandidateId)?.user_id === currentUserId ? <TouchableOpacity style={styles.deleteConfirmButton} onPress={() => { void deleteMessage('everyone'); }} disabled={deletingMessage}><Text style={styles.deleteConfirmText}>Delete for Everyone</Text></TouchableOpacity> : null}
                <TouchableOpacity style={styles.deleteConfirmButton} onPress={() => { void deleteMessage('me'); }} disabled={deletingMessage}>{deletingMessage ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.deleteConfirmText}>Delete for Me</Text>}</TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setDeleteCandidateId(null)} disabled={deletingMessage}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal visible={selectedImagePreview !== null} transparent animationType="fade" onRequestClose={() => setSelectedImagePreview(null)}>
          <Pressable style={styles.imagePreviewOverlay} onPress={() => setSelectedImagePreview(null)} accessibilityLabel="Close image preview">
            <Image source={{ uri: selectedImagePreview ?? undefined }} style={styles.imagePreview} resizeMode="contain" />
            <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setSelectedImagePreview(null)} accessibilityLabel="Close image preview">
              <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </Pressable>
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
  confirmCard: { width: '100%', maxWidth: 360, minHeight: 270, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 14, padding: 20, justifyContent: 'center' },
  confirmTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  confirmText: { color: '#94A3B8', fontSize: 14, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: 'column', alignItems: 'stretch', gap: 12, marginTop: 20, width: '100%' },
  cancelButton: { width: '100%', alignItems: 'center', borderColor: '#475569', borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12 },
  cancelButtonText: { color: '#CBD5E1', fontWeight: '700' },
  deleteConfirmButton: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12 },
  deleteConfirmText: { color: '#FFFFFF', fontWeight: '700' },
  senderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, marginLeft: 4 },
  senderRowOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 4 },
  senderName: { color: '#F8FAFC', fontSize: 11, fontWeight: '800', marginRight: 6 },
  roleBadge: { color: '#10B981', backgroundColor: '#065F46', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '800' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, minWidth: 70 },
  reactionBadge: { position: 'absolute', right: -8, bottom: -12, minWidth: 28, height: 28, paddingHorizontal: 5, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', zIndex: 2, elevation: 2 },
  reactionBadgeText: { fontSize: 17 },
  bubbleOther: { backgroundColor: '#1E293B', borderBottomLeftRadius: 4, borderLeftWidth: 2, borderLeftColor: '#10B981' },
  bubbleOwn: { backgroundColor: '#0E7490', borderBottomRightRadius: 4, borderRightWidth: 2, borderRightColor: '#10B981' },
  bubblePending: { opacity: 0.7, borderColor: '#64748B', borderWidth: 1 },
  messageText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  messageTextOwn: { color: '#FFFFFF' },
  quotedMessage: { borderLeftWidth: 3, borderLeftColor: '#6EE7B7', backgroundColor: '#0F172A66', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 8 },
  quotedMessageSender: { color: '#6EE7B7', fontSize: 11, fontWeight: '700' },
  quotedMessageText: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2, marginBottom: 4 },
  mediaSingleWrapper: { width: 220, height: 170, borderRadius: 10, overflow: 'hidden' },
  mediaTileWrapper: { width: 96, height: 96, borderRadius: 8, overflow: 'hidden' },
  mediaSingle: { width: '100%', height: '100%', borderRadius: 10 },
  mediaTile: { width: '100%', height: '100%', borderRadius: 8 },
  time: { color: '#94A3B8', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  timeOwn: { color: '#A7F3D0' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  imagePreviewOverlay: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  imagePreview: { width: '100%', height: '100%' },
  imagePreviewClose: { position: 'absolute', top: 48, right: 16, zIndex: 2, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000099' },
  loader: { marginTop: 30 },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 30 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#334155' },
  pendingItem: { position: 'relative' },
  pendingImage: { width: 52, height: 52, borderRadius: 8 },
  pendingRemove: { position: 'absolute', top: -4, right: -4, backgroundColor: '#0F172A', borderRadius: 10 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#334155' },
  replyPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderLeftWidth: 3, borderLeftColor: '#10B981', backgroundColor: '#1E293B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  replyPreviewCopy: { flex: 1, minWidth: 0 },
  replyPreviewName: { color: '#6EE7B7', fontSize: 11, fontWeight: '700' },
  replyPreviewText: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  actionOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#334155' },
  actionOptionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  reactionBar: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', backgroundColor: '#0F172A', borderColor: '#475569', borderWidth: 1, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 5, marginBottom: 12 },
  reactionButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  reactionEmoji: { fontSize: 23 },
  locationCancelAction: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  locationCancelActionText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  copyToast: { position: 'absolute', alignSelf: 'center', bottom: 86, backgroundColor: '#1E293B', borderColor: '#475569', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, zIndex: 20 },
  copyToastText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  inputShell: { flex: 1, minHeight: 42, maxHeight: 132, justifyContent: 'center', borderWidth: 1, borderColor: '#334155', borderRadius: 22, paddingHorizontal: 15, paddingVertical: 6, backgroundColor: '#1E293B' },
  input: { flex: 1, color: '#FFFFFF', paddingVertical: 0, paddingHorizontal: 0, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}), fontSize: 16, textAlignVertical: 'top' },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981' },
});
