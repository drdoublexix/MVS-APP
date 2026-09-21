import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getProfileRole, getRoleNavPath, supabase, writeCachedAuthState } from '../../lib/supabase';

const AUTH_NOTICE_KEY = 'mvs_auth_notice';

const persistAuthNotice = async (kind: 'success' | 'error', message: string) => {
  try {
    await AsyncStorage.setItem(AUTH_NOTICE_KEY, JSON.stringify({ kind, message }));
  } catch {
    // ignore storage failures in callback flow
  }
};

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let navigating = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const processAuthenticatedUser = async (user: {
      id: string;
      email?: string | null;
      user_metadata?: {
        full_name?: string;
        name?: string;
        display_name?: string;
        avatar_url?: string | null;
        picture?: string | null;
      };
    }, requestedRole?: 'client' | 'vet' | 'merchant') => {
      if (navigating) return;
      navigating = true;

      try {
        if (requestedRole) {
          const { error: metadataError } = await supabase.auth.updateUser({
            data: { role: requestedRole },
          });
          if (metadataError) throw metadataError;
        }

        const profileRole = requestedRole || await getProfileRole(user.id);
        if (!profileRole) {
          await supabase.auth.signOut().catch(() => undefined);
          await persistAuthNotice('error', 'This account does not exist. Please sign up first.');
          if (mounted) router.replace('/(auth)/login');
          return;
        }

        const fullName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.user_metadata?.display_name
          || user.email?.split('@')[0]
          || 'Pet Parent';

        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: fullName,
            role: profileRole,
          }, { onConflict: 'id' });
        if (upsertError) throw upsertError;

        await writeCachedAuthState(user, {
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: profileRole,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        });

        if (!mounted) return;
        const navPath = getRoleNavPath(profileRole);
        console.log('[Auth Callback] Redirecting user to role route:', profileRole, navPath);
        router.replace(navPath);
      } catch (error) {
        console.error('[Auth Callback] Profile sync error:', error);
        await persistAuthNotice('error', 'This account does not exist. Please sign up first.');
        if (mounted) router.replace('/(auth)/login');
      }
    };

    const handleOAuthCallback = async () => {
      try {
        const href = typeof window !== 'undefined' ? window.location.href : '';
        const url = href ? new URL(href) : null;
        const search = url?.search ? url.search.slice(1) : '';
        const hash = url?.hash ? url.hash.slice(1) : '';
        const values = new URLSearchParams(`${search}&${hash}`);

        const flowType = values.get('type');
        const requestedRole = values.get('role');
        const oauthRole = requestedRole === 'vet' || requestedRole === 'merchant' || requestedRole === 'client'
          ? requestedRole
          : undefined;
        const successMessage = 'Email verified successfully! Please sign in to MVS.';
        console.log('[Auth Callback] Processing OAuth return URL:', href, 'type:', flowType);

        const code = values.get('code');
        const accessToken = values.get('access_token');
        const refreshToken = values.get('refresh_token');

        if (flowType === 'signup' || flowType === 'email_change' || flowType === 'magiclink' || flowType === 'invite' || flowType === 'email_confirmation') {
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }

          await persistAuthNotice('success', successMessage);
          if (mounted) router.replace('/(auth)/login');
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        }

        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Auth Callback] Active session detected:', session?.user?.email);
        if (session?.user) {
          await processAuthenticatedUser(session.user, oauthRole);
          return;
        }

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          console.log('[Auth Callback] Auth State Event:', event);
          if (currentSession?.user && mounted) await processAuthenticatedUser(currentSession.user, oauthRole);
        });
        unsubscribe = () => authListener.subscription.unsubscribe();

        timeout = setTimeout(() => {
          if (mounted && !navigating) {
            console.warn('[Auth Callback] Session resolution timed out. Force checking session...');
            supabase.auth.getSession().then(({ data: { session: fallbackSession } }) => {
              if (fallbackSession?.user) processAuthenticatedUser(fallbackSession.user);
              else {
                persistAuthNotice('error', 'This account does not exist. Please sign up first.');
                router.replace('/(auth)/login');
              }
            });
          }
        }, 5000);
      } catch (error) {
        console.error('[Auth Callback] OAuth callback error:', error);
        await persistAuthNotice('error', 'This account does not exist. Please sign up first.');
        if (mounted) router.replace('/(auth)/login');
      }
    };

    handleOAuthCallback();

    return () => {
      mounted = false;
      if (timeout) clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#08111F" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    gap: 14,
  },
  text: {
    color: '#08111F',
    fontSize: 16,
    fontWeight: '600',
  },
});
