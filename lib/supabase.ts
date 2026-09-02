import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { ImagePickerAsset } from 'expo-image-picker';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const hasValidSupabaseUrl = /^https?:\/\//.test(supabaseUrl);
const clientUrl = hasValidSupabaseUrl ? supabaseUrl : 'https://placeholder.supabase.co';
const clientKey = supabaseAnonKey || 'local-development-placeholder';

export const isSupabaseConfigured = hasValidSupabaseUrl && Boolean(supabaseAnonKey);

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

// Helper function to sign out
export const signOutUser = async () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('mvs_logout_requested', '1');
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
export const loginUser = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export type AppRole = 'client' | 'vet' | 'merchant';
export type DatabaseRole = 'client' | 'veterinarian' | 'merchant';
export type RealtimeMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: 'text' | 'invoice';
  metadata?: Record<string, unknown> | null;
  media_url?: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
};

export const isUuid = (value: string | undefined | null): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const MAX_CHAT_ATTACHMENT_SIZE = 104857600;

export const uploadProductImage = async (asset: ImagePickerAsset) => {
  const response = await fetch(asset.uri);
  const file = await response.blob();
  const fileName = asset.fileName || asset.uri.split('/').pop() || `product-${Date.now()}.jpg`;
  const fileExt = fileName.split('.').pop() || 'jpg';
  const filePath = `products/${Date.now()}.${fileExt}`;
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

// Normalize role from UI ('vet', 'client', 'merchant') to database ('veterinarian', 'client', 'merchant')
export const normalizeRole = (role: string | AppRole | DatabaseRole): DatabaseRole => {
  if (role === 'vet') return 'veterinarian';
  if (role === 'veterinarian') return 'veterinarian';
  if (role === 'merchant') return 'merchant';
  return 'client';
};

// Get the app role from database role
export const denormalizeRole = (dbRole: DatabaseRole | string): AppRole => {
  if (dbRole === 'veterinarian') return 'vet';
  if (dbRole === 'merchant') return 'merchant';
  return 'client';
};

// Get navigation path from normalized role
export const getRoleNavPath = (role: DatabaseRole | AppRole | string): string => {
  const normalized = normalizeRole(role);
  if (normalized === 'veterinarian') return '/(vet)';
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
  const { data, error } = await supabase.from('messages').insert(message).select().single();
  if (error) throw error;
  return data as RealtimeMessage;
};

export const getConversationMessages = async (conversationId: string) => {
  const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at');
  if (error) throw error;
  return (data || []) as RealtimeMessage[];
};

export const subscribeToMessages = (conversationId: string, onMessage: (message: RealtimeMessage) => void) => {
  const channel = supabase.channel(`messages:${conversationId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage(payload.new as RealtimeMessage)).subscribe();
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
