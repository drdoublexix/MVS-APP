import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { ImagePickerAsset } from 'expo-image-picker';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const hasValidSupabaseUrl = /^https?:\/\//.test(supabaseUrl);
const hasSupabaseAnonKey = Boolean(supabaseAnonKey);
const clientUrl = hasValidSupabaseUrl ? supabaseUrl : 'https://placeholder.supabase.co';
const clientKey = hasSupabaseAnonKey ? supabaseAnonKey : 'local-development-placeholder';

export const isSupabaseConfigured = hasValidSupabaseUrl && hasSupabaseAnonKey;

if (!isSupabaseConfigured) {
  console.warn('[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Falling back to placeholder client.');
}

const AUTH_CACHE_KEY = 'mvs_auth_cache';

export type NetworkStatus = 'retrying' | 'offline' | 'recovered';
type NetworkStatusListener = (status: NetworkStatus) => void;

const networkStatusListeners = new Set<NetworkStatusListener>();

export const subscribeToNetworkStatus = (listener: NetworkStatusListener) => {
  networkStatusListeners.add(listener);
  return () => {
    networkStatusListeners.delete(listener);
  };
};

const notifyNetworkStatus = (status: NetworkStatus) => {
  networkStatusListeners.forEach((listener) => listener(status));
};

const getErrorStatus = (error: any): number | undefined => {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return typeof status === 'number' ? status : undefined;
};

const isTransientSupabaseError = (error: any) => {
  const status = getErrorStatus(error);
  if (status === 502 || status === 503 || status === 504 || status === 408 || status === 429) return true;
  const message = String(error?.message || error || '').toLowerCase();
  return /network|timeout|timed out|fetch failed|failed to fetch|connection|offline|gateway/.test(message);
};

export const safeSupabaseCall = async <T>(
  apiCall: () => PromiseLike<{ data: T | null; error: any }>,
): Promise<T> => {
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const { data, error } = await apiCall();
      if (!error) {
        if (attempt > 0) notifyNetworkStatus('recovered');
        return data as T;
      }
      lastError = error;
    } catch (error) {
      lastError = error;
    }

    if (!isTransientSupabaseError(lastError) || attempt === maxRetries) {
      if (attempt > 0) notifyNetworkStatus('offline');
      throw lastError;
    }

    const delayMs = 1000 * (2 ** attempt);
    console.warn(`[Supabase] Temporary request failure. Retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries}).`);
    notifyNetworkStatus('retrying');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw lastError || new Error('Supabase request failed.');
};

export type CachedAuthState = {
  user: Record<string, any> | null;
  profile: Record<string, any> | null;
};

export const readCachedAuthState = async (): Promise<CachedAuthState> => {
  try {
    const rawValue = await AsyncStorage.getItem(AUTH_CACHE_KEY);
    if (!rawValue) return { user: null, profile: null };

    const parsed = JSON.parse(rawValue) as Partial<CachedAuthState>;
    return {
      user: parsed.user ?? null,
      profile: parsed.profile ?? null,
    };
  } catch (error) {
    console.warn('[Auth Cache] Failed to read cached auth state:', error);
    return { user: null, profile: null };
  }
};

export const writeCachedAuthState = async (user: Record<string, any> | null, profile?: Record<string, any> | null) => {
  try {
    await AsyncStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        user: user ?? null,
        profile: profile ?? null,
      })
    );
  } catch (error) {
    console.warn('[Auth Cache] Failed to persist cached auth state:', error);
  }
};

export const clearCachedAuthState = async () => {
  try {
    await AsyncStorage.removeItem(AUTH_CACHE_KEY);
  } catch (error) {
    console.warn('[Auth Cache] Failed to clear cached auth state:', error);
  }
};

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Helper function to get the current authenticated user
export const getCurrentUser = async () => {
  const cachedState = await readCachedAuthState();
  if (cachedState.user) {
    return cachedState.user as Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'];
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

// Helper function to sign out
export const signOutUser = async () => {
  const currentUser = await getCurrentUser().catch(() => null);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem('mvs_logout_requested', '1');
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }
    }
  } catch (cleanupError) {
    console.warn('[Auth SignOut] Failed to unsubscribe web push subscription:', cleanupError);
  }

  if (currentUser?.id) {
    try {
      await supabase.from('profiles').update({ web_push_subscription: null }).eq('id', currentUser.id);
    } catch (profileError) {
      console.warn('[Auth SignOut] Failed to clear web push subscription from profile:', profileError);
    }
  }

  await AsyncStorage.clear();
  await clearCachedAuthState();
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
};

export const signOutAndRedirect = async (router?: { replace: (path: string) => void }) => {
  try {
    await signOutUser();
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    router?.replace('/');
  }
};

export const sendPasswordResetLink = async (email: string, redirectTo?: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
};

export const updatePassword = async (password: string) => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
};

export const deleteAccount = async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error('No user found');

  const { error } = await supabase.rpc('delete_user_account');
  if (error) throw error;

  await supabase.auth.signOut();
};

// Helper function for user signup
export const signUpUser = async (email: string, password: string, userData: Record<string, any>) => {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        ...(userData || {}),
        full_name: String(userData?.full_name || '').trim(),
        role: userData?.role || 'client',
      },
    },
  });
  if (error) throw error;
  return data;
};

// Helper function for user login
export const syncProfileVerificationStatus = async (userId?: string | null): Promise<boolean> => {
  if (!userId) return false;

  const { data: { user }, error: getUserError } = await supabase.auth.getUser();
  if (getUserError || !user) {
    console.warn('[Auth Sync] Unable to load auth user for verification sync:', getUserError ?? 'No user found');
    return false;
  }

  if (!user.email_confirmed_at) {
    return false;
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_verified: true })
    .eq('id', userId);

  if (error) {
    console.warn('[Auth Sync] Failed to sync profile verification flag:', error);
    return false;
  }

  return true;
};

export const loginUser = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  await syncProfileVerificationStatus(data.user?.id).catch((syncError) => {
    console.warn('[Auth Sync] verification sync failed after login:', syncError);
  });

  return data;
};

export type AppRole = 'client' | 'vet' | 'merchant';
export type DatabaseRole = 'client' | 'vet' | 'merchant';
export type ReplySnippet = {
  id: string;
  sender_name: string;
  content: string;
};
export type RealtimeMessage = {
  id: string;
  temp_id?: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: 'text' | 'video' | 'invoice' | 'location_exact' | 'location_live' | 'voice_note' | 'prescription';
  location_data?: {
    latitude: number;
    longitude: number;
    addressName?: string;
  } | null;
  metadata?: Record<string, unknown> | null;
  reply_to?: ReplySnippet | null;
  media_url?: string | null;
  media_type?: 'image' | 'video' | null;
  hidden_for_users?: string[] | null;
  is_deleted?: boolean | null;
  created_at: string;
};

export const isUuid = (value: string | undefined | null): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const normalizeUuid = (value: string | undefined | null): string | null => {
  const rawValue = value?.replace(/^(merchant_|vet_|client_)/i, '');
  return isUuid(rawValue) ? rawValue : null;
};

export const MAX_CHAT_ATTACHMENT_SIZE = 104857600;

export const uploadProductImage = async (asset: ImagePickerAsset) => {
  const response = await fetch(asset.uri);
  const file = await response.blob();
  const fileName = asset.fileName || asset.uri.split('/').pop() || `product-${Date.now()}.jpg`;
  const fileExt = fileName.split('.').pop() || 'jpg';
  const filePath = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: asset.mimeType || file.type });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
  return publicUrl;
};

export const uploadChatAttachment = async (chatId: string, asset: ImagePickerAsset) => {
  const response = await fetch(asset.uri);
  const file = await response.blob();
  const fileSize = asset.fileSize ?? file.size;
  if (fileSize > MAX_CHAT_ATTACHMENT_SIZE) {
    throw new Error('Attachments must be smaller than 100MB.');
  }

  const fileName = asset.fileName || asset.uri.split('/').pop() || `attachment.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
  const fileExt = fileName.split('.').pop() || (asset.type === 'video' ? 'mp4' : 'jpg');
  const filePath = `${chatId}/${Date.now()}.${fileExt}`;
  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: asset.mimeType || file.type });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
  return { publicUrl, mediaType: asset.type === 'video' ? 'video' as const : 'image' as const };
};

// Normalize role from UI or legacy database values to the current database enum.
export const normalizeRole = (role: string | AppRole | DatabaseRole): DatabaseRole => {
  if (role === 'vet' || role === 'veterinarian') return 'vet';
  if (role === 'merchant') return 'merchant';
  return 'client';
};

// Get the app role from database role
export const denormalizeRole = (dbRole: DatabaseRole | string): AppRole => {
  if (dbRole === 'vet' || dbRole === 'veterinarian') return 'vet';
  if (dbRole === 'merchant') return 'merchant';
  return 'client';
};

// Get navigation path from normalized role
export const getRoleNavPath = (role: DatabaseRole | AppRole | string): string => {
  const normalized = normalizeRole(role);
  if (normalized === 'vet') return '/(vet)';
  if (normalized === 'merchant') return '/(merchant)';
  return '/(client)';
};

export const upsertProfile = async (userId: string, role: AppRole, fullName?: string) => {
  const normalizedRole = normalizeRole(role);
  const profilePayload: Record<string, any> = {
    id: userId,
    role: normalizedRole,
    ...(fullName ? { full_name: fullName } : {}),
  };

  const { error } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
  if (error) throw error;
};

export const getProfileRole = async (userId: string): Promise<AppRole | null> => {
  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data?.role) return null;
  return denormalizeRole(data.role);
};

export const sendRealtimeMessage = async (message: Omit<RealtimeMessage, 'id' | 'created_at'>) => {
  const senderId = normalizeUuid(message.sender_id);
  const receiverId = normalizeUuid(message.receiver_id);
  if (!senderId || !receiverId) throw new Error('Chat participants must use valid UUIDs.');
  const { data, error } = await supabase.from('messages').insert({ ...message, sender_id: senderId, receiver_id: receiverId }).select().single();
  if (error) throw error;
  return data as RealtimeMessage;
};

export const deleteRealtimeMessage = async (messageId: string, userId: string) => {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', userId);
  if (error) throw error;
};

export const hideMessageForCurrentUser = async (messageId: string, userId: string) => {
  const { data, error } = await supabase
    .from('messages')
    .select('hidden_for_users')
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;

  const currentHiddenUsers = Array.isArray(data?.hidden_for_users) ? data.hidden_for_users : [];
  const nextHiddenUsers = Array.from(new Set([...currentHiddenUsers, userId]));

  const { error: updateError } = await supabase
    .from('messages')
    .update({ hidden_for_users: nextHiddenUsers })
    .eq('id', messageId);
  if (updateError) throw updateError;
};

export const deleteMessageForEveryone = async (messageId: string, userId: string) => {
  const { data: existingMessage, error: readError } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('sender_id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!existingMessage) throw new Error('Message not found or you are not the sender.');

  const { error: updateError } = await supabase
    .from('messages')
    .update({
      is_deleted: true,
      content: 'This message was deleted',
      media_url: null,
      media_type: null,
      metadata: { ...(existingMessage.metadata || {}), deleted_for_everyone: true },
    })
    .eq('id', messageId)
    .eq('sender_id', userId);
  if (updateError) throw updateError;
};

export type ConsultationStatus = 'active' | 'completed';

export const ensureConsultationRecord = async (conversationId: string, currentUserId: string, recipientId: string, currentUserRole: string, recipientRole: string, serviceType?: string, activateExisting = true) => {
  const currentRole = normalizeRole(currentUserRole);
  const normalizedRecipientRole = normalizeRole(recipientRole);
  if (!['client', 'vet'].includes(currentRole) || !['client', 'vet'].includes(normalizedRecipientRole)) return null;

  const clientId = currentRole === 'client' ? currentUserId : recipientId;
  const vetId = currentRole === 'vet' ? currentUserId : recipientId;
  const { data: existing, error: lookupError } = await supabase
    .from('consultations')
    .select('id, conversation_id, client_id, vet_id, status, service_type')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (!activateExisting) return existing as { id: string; conversation_id: string; client_id: string; vet_id: string; status: ConsultationStatus; service_type?: string | null };
    const { data, error } = await supabase
      .from('consultations')
      .update({
        client_id: clientId,
        vet_id: vetId,
        status: 'active',
        ...(serviceType ? { service_type: serviceType } : {}),
      })
      .eq('id', existing.id)
      .select('id, conversation_id, client_id, vet_id, status, service_type')
      .single();
    if (error) throw error;
    return data as { id: string; conversation_id: string; client_id: string; vet_id: string; status: ConsultationStatus; service_type?: string | null };
  }

  const { data, error } = await supabase
    .from('consultations')
    .insert({ conversation_id: conversationId, client_id: clientId, vet_id: vetId, status: 'active', ...(serviceType ? { service_type: serviceType } : {}) })
    .select('id, conversation_id, client_id, vet_id, status, service_type')
    .single();
  if (error) {
    const { data: concurrent } = await supabase
      .from('consultations')
      .select('id, conversation_id, client_id, vet_id, status, service_type')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (concurrent) return concurrent as { id: string; conversation_id: string; client_id: string; vet_id: string; status: ConsultationStatus; service_type?: string | null };
    throw error;
  }
  return data as { id: string; conversation_id: string; client_id: string; vet_id: string; status: ConsultationStatus; service_type?: string | null };
};

export const getConversationMessages = async (conversationId: string) => {
  const { data, error } = await supabase.from('messages').select('*, reply_to').eq('conversation_id', conversationId).order('created_at');
  if (error) throw error;
  return (data || []) as RealtimeMessage[];
};

export const subscribeToMessages = (conversationId: string, onMessage: (message: RealtimeMessage) => void, onDelete?: (messageId: string) => void) => {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage(payload.new as RealtimeMessage))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const message = payload.new as RealtimeMessage;
      if (message.is_deleted && onDelete) onDelete(String(message.id));
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      if (onDelete) onDelete(String((payload.old as Partial<RealtimeMessage>).id));
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
};

export const startGoogleLogin = async (redirectTo: string, role: AppRole = 'client') => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: false,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) throw error;

    // Explicit fallback for Expo Web: force Google Auth consent screen redirect
    if (data?.url && typeof window !== 'undefined') {
      console.log('Redirecting to Google OAuth URL:', data.url);
      window.location.href = data.url;
    }

    return data.url;
  } catch (error: any) {
    console.error('Google login initiation error:', error.message);
    throw error;
  }
};

export const finishGoogleLogin = async (callbackUrl: string) => {
  const query = callbackUrl.split('?')[1]?.split('#')[0] || '';
  const hash = callbackUrl.split('#')[1] || '';
  const values = new URLSearchParams(`${query}&${hash}`);
  const code = values.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data;
  }
  const accessToken = values.get('access_token');
  const refreshToken = values.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('Google login did not return a session.');
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
 return data;
};

// Helper function to invoke the send-push-notification edge function
export const sendPushNotification = async (
  recipientId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) => {
  try {
    const { data: res, error } = await supabase.functions.invoke('send-push-notification', {
      body: { recipientId, title, body, data },
    });
    if (error) console.error('Error invoking send-push-notification function:', error);
    return res;
  } catch (err) {
    console.error('Push notification trigger failed:', err);
  }
};
