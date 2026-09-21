import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser, normalizeUuid, supabase } from './supabase';

export type UnreadCounts = Record<string, number>;

const conversationKeyFor = (userId: string, participantId: string) => {
  const ids = [userId, participantId].sort();
  return `conv_${ids[0]}_${ids[1]}`;
};

let sharedCounts: UnreadCounts = {};
const countListeners = new Set<(counts: UnreadCounts) => void>();
let unreadChannelUserId: string | null = null;
let unreadChannel: ReturnType<typeof supabase.channel> | null = null;
const unreadUpdateListeners = new Set<() => void>();
let countRequestVersion = 0;

const publishCounts = (counts: UnreadCounts) => {
  sharedCounts = counts;
  countListeners.forEach((listener) => listener(sharedCounts));
};

export const subscribeToUnreadMessages = (userId: string, onUpdate: () => void) => {
  if (!userId) return () => {};

  if (unreadChannelUserId !== userId || !unreadChannel) {
    if (unreadChannel) void supabase.removeChannel(unreadChannel);
    const channelName = `unread-messages:${userId}`;
    supabase.getChannels()
      .filter((channel) => channel.topic === `realtime:${channelName}`)
      .forEach((channel) => { void supabase.removeChannel(channel); });
    unreadChannelUserId = userId;
    unreadChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        unreadUpdateListeners.forEach((listener) => listener());
      })
      .subscribe();
  }

  unreadUpdateListeners.add(onUpdate);
  return () => {
    unreadUpdateListeners.delete(onUpdate);
    if (unreadUpdateListeners.size === 0 && unreadChannel) {
      void supabase.removeChannel(unreadChannel);
      unreadChannel = null;
      unreadChannelUserId = null;
    }
  };
};

export const loadUnreadCounts = async (userId: string) => {
  const { data, error } = await supabase
    .from('messages')
    .select('sender_id', { count: 'exact' })
    .eq('is_read', false)
    .eq('receiver_id', userId)
    .neq('sender_id', userId);
  if (error) throw error;

  return (data || []).reduce<UnreadCounts>((counts, row) => {
    const participantId = normalizeUuid(row.sender_id);
    if (!participantId) return counts;
    const conversationKey = conversationKeyFor(userId, participantId);
    counts[conversationKey] = (counts[conversationKey] || 0) + 1;
    return counts;
  }, {});
};

export const markConversationRead = async (conversationId: string, userId: string, participantId: string) => {
  const nextCounts = { ...sharedCounts };
  delete nextCounts[conversationId];
  publishCounts(nextCounts);
  countRequestVersion += 1;

  const { data, error } = await supabase
    .from('messages')
    .update({ is_delivered: true, is_read: true })
    .eq('conversation_id', conversationId)
    .eq('receiver_id', userId)
    .eq('sender_id', participantId)
    .eq('is_read', false)
    .select('id');
  if (error) console.error('[Unread Messages] Failed to mark messages as read:', error);
  if (!error && !data?.length) {
    console.warn('[Unread Messages] No unread rows were updated for conversation:', conversationId);
  }
  await refreshUnreadCountsFor(userId);
};

const refreshUnreadCountsFor = async (userId: string) => {
  const requestVersion = ++countRequestVersion;
  try {
    const counts = await loadUnreadCounts(userId);
    if (requestVersion === countRequestVersion) publishCounts(counts);
  } catch (error) {
    console.error('[Unread Messages] Failed to load counts:', error);
  }
};

export const useUnreadMessages = () => {
  const [counts, setCounts] = useState<UnreadCounts>(sharedCounts);
  const [userId, setUserId] = useState<string | null>(null);

  const refreshUnreadCounts = useCallback(async () => {
    if (!userId) return;
    await refreshUnreadCountsFor(userId);
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    void getCurrentUser().then((user) => {
      const cleanUserId = normalizeUuid(user?.id);
      if (mounted) setUserId(cleanUserId);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const listener = (nextCounts: UnreadCounts) => setCounts(nextCounts);
    countListeners.add(listener);
    setCounts(sharedCounts);
    return () => { countListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refreshUnreadCounts();
    const unsubscribe = subscribeToUnreadMessages(userId, () => { void refreshUnreadCounts(); });
    return () => {
      unsubscribe();
    };
  }, [userId, refreshUnreadCounts]);

  return {
    counts,
    totalUnreadCount: Object.values(counts).reduce((total, count) => total + count, 0),
    refreshUnreadCounts,
  };
};