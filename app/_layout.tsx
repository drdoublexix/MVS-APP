import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForPushNotifications } from '../lib/notifications';
import { supabase } from '../lib/supabase';

function RootAuthGate() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<Session['user'] | null>(null);
  const [profile, setProfile] = useState<{ role?: string | null; full_name?: string | null } | null>(null);
  const isAuthInitialized = useRef(false);
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    let mounted = true;

    const checkAuthAndRoute = async (session: Session | null, event?: AuthChangeEvent) => {
      const logoutRequested = typeof window !== 'undefined' && window.localStorage.getItem('mvs_logout_requested') === '1';
      if (logoutRequested) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('mvs_logout_requested');
        }
        if (mounted) router.replace('/(auth)/login');
        return;
      }

      console.log('[AUTH ROUTER] checkAuthAndRoute event:', event, 'email:', session?.user?.email);
      if (mounted) setAuthUser(session?.user || null);

      const href = typeof window !== 'undefined' ? window.location.href : '';
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const isAuthPage = /\/(?:signup|login|reset-password)(?:\/|$)/.test(pathname) || /\/auth\/(?:signup|login)(?:\/|$)/.test(pathname);
      const isOAuthCallback = /\/auth\/callback(?:[/?#]|$)/.test(href) || pathname.includes('/auth/callback');

      if (isOAuthCallback) {
        console.log('[AUTH ROUTER] Deferring to OAuth callback page handler...');
        return;
      }

      if (!session?.user) {
        console.log('[AUTH ROUTER] No session:', { href, pathname, isAuthPage });
        if (isAuthPage) return;
        if (mounted) {
          router.replace('/(auth)/login');
        }
        return;
      }

      const activeRootSegment = segmentsRef.current[0];
      const isInsideApplication = activeRootSegment === '(tabs)' || activeRootSegment === '(client)' || activeRootSegment === '(vet)' || activeRootSegment === '(merchant)';
      if (isInsideApplication) return;

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        console.log('[AUTH ROUTER] Profile query result:', { profile, error });
        if (mounted) setProfile(profile || null);

        const pendingRole = typeof window !== 'undefined' ? window.localStorage.getItem('mvs_pending_signup_role') : null;
        // STRICT ROLE RESOLUTION: Prioritize database role first
        let userRole = profile?.role;

        if (!userRole) {
          // If no role exists yet, use metadata only. Profile creation belongs to signup.
          userRole = session.user.user_metadata?.role || pendingRole || 'client';
        }

        // Always clean up pending signup role after role determination
        if (pendingRole && typeof window !== 'undefined') {
          window.localStorage.removeItem('mvs_pending_signup_role');
        }

        void registerForPushNotifications(session.user.id).catch((error) => {
          console.warn('[Notifications] Push registration failed:', error);
        });

        if (!mounted) return;

        const currentRootSegment = segmentsRef.current[0];
        const currentlyInsideApplication = currentRootSegment === '(tabs)' || currentRootSegment === '(client)' || currentRootSegment === '(vet)' || currentRootSegment === '(merchant)';
        if (currentlyInsideApplication) return;

        console.log('[AUTH ROUTER] Navigating authenticated user:', session.user.email, 'Role:', userRole);
        if (userRole === 'vet' || userRole === 'veterinarian') {
          router.replace('/(vet)');
        } else if (userRole === 'merchant') {
          router.replace('/(merchant)');
        } else {
          router.replace('/(client)');
        }
      } catch (err) {
        console.error('[Auth Layout] Error in auth layout guard:', err);
        if (mounted) router.replace('/(auth)/login');
      }
    };

    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const combined = `${hash}${search}`;
      const hasRecoveryType = /(?:^|[?&#])type=recovery(?:&|$)/i.test(combined);
      const hasRecoveryToken = /(?:^|[?&#])token=[^&]+/i.test(combined) || /(?:^|[#?&])access_token=[^&]+/i.test(combined);

      if (hasRecoveryType && hasRecoveryToken) {
        router.replace('/reset-password');
        queueMicrotask(() => {
          if (mounted) setLoading(false);
        });
        return;
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      console.log('[Auth Layout] onAuthStateChange fired:', event, 'session:', session?.user?.id);

      if (event === 'SIGNED_OUT') {
        if (mounted) {
          setAuthUser(null);
          setProfile(null);
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('mvs_logout_requested', '1');
        }
        if (mounted) router.replace('/(auth)/login');
        if (mounted) setLoading(false);
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        if (mounted) router.replace('/reset-password');
        if (mounted) setLoading(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        void supabase
          .from('profiles')
          .select('role, full_name, email')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (mounted) setProfile(data || null);
          });
      }

      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'INITIAL_SESSION' && isAuthInitialized.current) {
        return;
      }

      checkAuthAndRoute(session, event).finally(() => {
        isAuthInitialized.current = true;
        if (mounted) setLoading(false);
      });
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 10,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0B132B',
        }}
      >
        <ActivityIndicator color="#10B981" size="large" />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#0B132B' }}>
      <RootAuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'MVS - Splash' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(client)" options={{ headerShown: false }} />
        <Stack.Screen name="(vet)" options={{ headerShown: false }} />
        <Stack.Screen name="(merchant)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
