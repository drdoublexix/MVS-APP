import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getRoleNavPath, supabase, type AppRole } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { role: queryRole } = useLocalSearchParams<{ role?: string }>();

  useEffect(() => {
    let mounted = true;
    let navigating = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const savedRole = typeof window !== 'undefined' ? localStorage.getItem('mvs_selected_role') : null;
    const requestedRole = queryRole || savedRole || 'client';

    const processAuthenticatedUser = async (
      user: {
        id: string;
        email?: string | null;
        user_metadata?: { full_name?: string; name?: string; display_name?: string };
      },
      roleOverride: string | string[] | undefined = requestedRole,
    ) => {
      if (navigating) return;
      navigating = true;

      try {
        const targetRole: AppRole = roleOverride === 'vet' || roleOverride === 'merchant' ? roleOverride : 'client';
        const finalRole: AppRole = targetRole;
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
            role: finalRole,
            specialty: finalRole === 'vet' ? 'General Veterinary Practitioner' : null,
            title: finalRole === 'vet' ? 'Dr.' : null,
          }, { onConflict: 'id' });
        if (upsertError) throw upsertError;

        if (typeof window !== 'undefined') localStorage.removeItem('mvs_selected_role');

        if (!mounted) return;
        const navPath = getRoleNavPath(finalRole);
        console.log('[Auth Callback] Redirecting user to role route:', finalRole, navPath);
        router.replace(navPath);
      } catch (error) {
        console.error('[Auth Callback] Profile sync error:', error);
        if (mounted) router.replace('/(client)');
      }
    };

    const handleOAuthCallback = async () => {
      try {
        const href = typeof window !== 'undefined' ? window.location.href : '';
        const url = href ? new URL(href) : null;
        const search = url?.search ? url.search.slice(1) : '';
        const hash = url?.hash ? url.hash.slice(1) : '';
        const values = new URLSearchParams(`${search}&${hash}`);

        const urlRole = values.get('role');
        const callbackRole = urlRole || queryRole || savedRole || 'client';
        console.log('[Auth Callback] Processing OAuth return URL:', href, 'role:', callbackRole);

        const code = values.get('code');
        const accessToken = values.get('access_token');
        const refreshToken = values.get('refresh_token');

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
          await processAuthenticatedUser(session.user, callbackRole);
          return;
        }

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          console.log('[Auth Callback] Auth State Event:', event);
          if (currentSession?.user && mounted) await processAuthenticatedUser(currentSession.user, callbackRole);
        });
        unsubscribe = () => authListener.subscription.unsubscribe();

        timeout = setTimeout(() => {
          if (mounted && !navigating) {
            console.warn('[Auth Callback] Session resolution timed out. Force checking session...');
            supabase.auth.getSession().then(({ data: { session: fallbackSession } }) => {
              if (fallbackSession?.user) processAuthenticatedUser(fallbackSession.user, callbackRole);
              else router.replace('/(auth)/signup');
            });
          }
        }, 5000);
      } catch (error) {
        console.error('[Auth Callback] OAuth callback error:', error);
        if (mounted) router.replace('/(auth)/signup');
      }
    };

    handleOAuthCallback();

    return () => {
      mounted = false;
      if (timeout) clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [queryRole, router]);

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
