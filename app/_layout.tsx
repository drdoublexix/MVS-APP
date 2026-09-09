import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForPushNotifications } from '../lib/notifications';
import { supabase } from '../lib/supabase';

function RootAuthGate() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let authListenerReady = false;

    const checkAuthAndRoute = async (session: any) => {
      const logoutRequested = typeof window !== 'undefined' && window.localStorage.getItem('mvs_logout_requested') === '1';
      if (logoutRequested) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('mvs_logout_requested');
        }
        if (mounted) router.replace('/(auth)/login');
        return;
      }

      console.log('[AUTH ROUTER] checkAuthAndRoute:', session?.user?.email);
      if (!session?.user) {
        const href = typeof window !== 'undefined' ? window.location.href : '';
        const isOAuthCallback = /\/auth\/callback(?:[/?#]|$)/.test(href) && /(?:code|access_token|refresh_token)/.test(href);
        console.log('[AUTH ROUTER] No session:', { href, isOAuthCallback });
        if (isOAuthCallback) return;
        if (mounted) {
          router.replace('/(auth)/login');
        }
        return;
      }

      const href = typeof window !== 'undefined' ? window.location.href : '';
      const isOAuthCallback = /\/auth\/callback(?:[/?#]|$)/.test(href) && /(?:code|access_token|refresh_token)/.test(href);
      if (isOAuthCallback) {
        console.log('[AUTH ROUTER] Deferring to OAuth callback:', href);
        return;
      }

      try {
        // 1. Fetch user role from profiles table
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        console.log('[AUTH ROUTER] Profile query result:', { profile, error });

        const pendingRole = typeof window !== 'undefined' ? window.localStorage.getItem('mvs_pending_signup_role') : null;
        let userRole = pendingRole || profile?.role || session.user.user_metadata?.role;
        const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Pet Parent';

        // 2. If profile is missing or lacks a role, default to client
        if (!userRole) {
          console.log('[AUTH ROUTER] No profile/role found, creating default client profile');
          userRole = 'client';
          userRole = 'client';
        }

        await supabase
          .from('profiles')
          .upsert({ id: session.user.id, email: session.user.email, full_name: fullName, role: userRole }, { onConflict: 'id' });
        void registerForPushNotifications(session.user.id).catch((error) => {
          console.warn('[Notifications] Push registration failed:', error);
        });
        if (pendingRole && typeof window !== 'undefined') window.localStorage.removeItem('mvs_pending_signup_role');

        if (!mounted) return;

        // 3. Route cleanly to role home stack
        console.log('[AUTH ROUTER]', session.user.email, userRole);
        if (userRole === 'vet' || userRole === 'veterinarian') {
          router.replace('/(vet)');
        } else if (userRole === 'merchant') {
          router.replace('/(merchant)');
        } else {
          router.replace('/(client)');
        }
      } catch (err) {
        console.error('[Auth Layout] Error in auth layout guard:', err);
        if (mounted) router.replace('/(client)');
      }
    };

    // Check for password recovery first
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const combined = `${hash}${search}`;
      const hasRecoveryType = /(?:^|[?&#])type=recovery(?:&|$)/i.test(combined);
      const hasRecoveryToken = /(?:^|[?&#])token=[^&]+/i.test(combined) || /(?:^|[#?&])access_token=[^&]+/i.test(combined);

      if (hasRecoveryType && hasRecoveryToken) {
        router.replace('/reset-password');
        return;
      }
    }

    // Listen for session changes FIRST
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      authListenerReady = true;
      console.log('[Auth Layout] onAuthStateChange fired:', _event, 'session:', session?.user?.id);

      if (_event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('mvs_logout_requested', '1');
        }
        if (mounted) router.replace('/(auth)/login');
        return;
      }

      // Handle password recovery event
      if (_event === 'PASSWORD_RECOVERY') {
        if (mounted) router.replace('/reset-password');
        return;
      }

      checkAuthAndRoute(session);
      if (mounted) setLoading(false);
    });

    // Get initial session on launch
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth Layout] getSession returned:', session?.user?.id);
      // Only handle initial session if listener isn't already processing it
      if (!authListenerReady && mounted) {
        console.log('[Auth Layout] Using getSession result (listener not ready)');
        checkAuthAndRoute(session);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // Show loading screen while initializing
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#08111F" size="large" />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
