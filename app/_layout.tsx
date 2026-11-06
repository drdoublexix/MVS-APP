import '../lib/polyfills';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import 'react-native-get-random-values';
import { SafeAreaView as ContextSafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { syncPendingNotifications, type StoredNotification } from '../lib/notifications';
import { readOfflineRecords, subscribeToOfflineQueue, syncOfflineRecords } from '../lib/offlineRecords';
import { logActivity, isSuperAdmin } from '../lib/admin';
import { clearCachedAuthState, readCachedAuthState, safeSupabaseCall, signOutUser, subscribeToNetworkStatus, supabase, syncProfileVerificationStatus, writeCachedAuthState } from '../lib/supabase';
import { LanguageProvider, normalizeAppLanguage, useLanguage } from '../lib/language';
import { DashboardNotificationsProvider, useDashboardNotifications } from '../components/DashboardQuickActions';

const registerForPushNotifications = async (userId: string) => {
  const { registerForPushNotifications: register } = await import('../lib/notifications');
  return register(userId);
};

void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('[Splash Screen] preventAutoHideAsync failed gracefully:', error);
});

const LEGACY_CHAT_CACHE_KEYS = [
  'mvs_inbox_cache',
  'mvs_consultation_cache',
  'mvs_cleared_threads',
  'mvs_cleared_threads_',
  'mvs_inbox_cache:',
  'mvs_consultation_cache:',
  'mvs_cleared_threads_'
];

type AuthProfileState = {
  role?: string | null;
  full_name?: string | null;
  nin_verified?: boolean | null;
  email?: string | null;
  avatar_url?: string | null;
  deleted_at?: string | null;
  is_banned?: boolean | null;
  preferred_language?: string | null;
};

const purgeLegacyChatCaches = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const removals = keys.filter((key) =>
      key.startsWith('mvs_inbox_cache') ||
      key.startsWith('mvs_consultation_cache') ||
      key.startsWith('mvs_cleared_threads') ||
      LEGACY_CHAT_CACHE_KEYS.some((legacyKey) => key === legacyKey || key.startsWith(legacyKey))
    );
    if (removals.length > 0) {
      await AsyncStorage.multiRemove(removals);
    }
  } catch (error) {
    console.warn('[App Init] Legacy chat cache purge failed:', error);
  }
};

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }> {
  state: { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null } = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[App Error Boundary] Unhandled runtime error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private reloadApp = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      let errorMessage = 'Unknown error';
      let stackTrace = 'No stack trace available';

      try {
        errorMessage = this.state.error?.toString() ?? errorMessage;
      } catch {
        errorMessage = 'Unknown error';
      }

      try {
        stackTrace = this.state.error?.stack ?? this.state.errorInfo?.componentStack ?? stackTrace;
      } catch {
        stackTrace = 'No stack trace available';
      }

      return (
        <View style={styles.boundaryContainer}>
          <ScrollView
            contentContainerStyle={styles.boundaryContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.boundaryTitle}>Something went wrong</Text>
            <Text selectable={true} style={styles.boundaryText}>
              {errorMessage}
            </Text>
            <TouchableOpacity style={styles.boundaryButton} onPress={this.reloadApp}>
              <Text style={styles.boundaryButtonText}>Reload App</Text>
            </TouchableOpacity>
            {__DEV__ ? <Text selectable={true} style={styles.boundaryStack}>{stackTrace}</Text> : null}
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

function RootAuthGate() {
  const { applyAccountLanguage } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<Session['user'] | null>(null);
  const [profile, setProfile] = useState<AuthProfileState | null>(null);
  const [ninReminderRole, setNinReminderRole] = useState<'client' | 'vet' | 'merchant' | null>(null);
  const profileRef = useRef(profile);
  const { setNotifications: setPendingNotifications } = useDashboardNotifications();
  const previousAuthUserId = useRef<string | null>(null);
  const pushRegisteredUserId = useRef<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  const applyAccountLanguageRef = useRef(applyAccountLanguage);
  const routePathname = usePathname();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments);
  const routePathnameRef = useRef(routePathname);

  useEffect(() => {
    void purgeLegacyChatCaches();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const updateAuthRefresh = (state: AppState['currentState']) => {
      const refreshOperation = state === 'active'
        ? supabase.auth.startAutoRefresh()
        : supabase.auth.stopAutoRefresh();
      void refreshOperation.catch((error) => {
        console.error('[Auth] Failed to update session auto-refresh for app state:', error);
      });
    };

    updateAuthRefresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateAuthRefresh);

    return () => {
      subscription.remove();
      void supabase.auth.stopAutoRefresh().catch((error) => {
        console.error('[Auth] Failed to stop session auto-refresh:', error);
      });
    };
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    routePathnameRef.current = routePathname;
  }, [routePathname]);

  useEffect(() => {
    routerRef.current = router;
    applyAccountLanguageRef.current = applyAccountLanguage;
  }, [router, applyAccountLanguage]);

  useEffect(() => {
    const userId = authUser?.id;
    if (!userId) {
      return;
    }

    let mounted = true;
    let syncing = false;
    let lastConnected = false;
    const notificationChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (!mounted) return;
          const notification = payload.new as StoredNotification;
          if (notification.user_id !== userId) return;
          setPendingNotifications((current) => [
            notification,
            ...current.filter((item) => item.id !== notification.id),
          ].slice(0, 50));
        },
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Notifications] Realtime subscription failed:', error || status);
        }
      });

    const syncNotifications = async () => {
      if (syncing) return;
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected || networkState.isInternetReachable === false) return;
      syncing = true;
      try {
        const notifications = await syncPendingNotifications(userId);
        if (mounted) setPendingNotifications(notifications);
      } catch (error) {
        console.warn('[Notifications] Pending notification sync failed:', error);
      } finally {
        syncing = false;
      }
    };

    void syncNotifications();
    void syncOfflineRecords(userId).catch((error) => {
      console.error('[Offline Sync] Initial record sync failed:', error);
    });
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      if (connected && !lastConnected) {
        void syncNotifications();
        void syncOfflineRecords(userId).catch((error) => {
          console.error('[Offline Sync] Reconnection sync failed:', error);
        });
      }
      lastConnected = connected;
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncNotifications();
        void syncOfflineRecords(userId).catch((error) => {
          console.error('[Offline Sync] Foreground sync failed:', error);
        });
      }
    });

    return () => {
      mounted = false;
      unsubscribeNetwork();
      appStateSubscription.remove();
      void supabase.removeChannel(notificationChannel);
    };
  }, [authUser?.id, setPendingNotifications]);

  useEffect(() => {
    let mounted = true;
    let splashFallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const hideSplashSafely = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn('[Splash Screen] hideAsync failed gracefully:', error);
      }
    };

    const finalizeLoading = async () => {
      if (splashFallbackTimer) {
        clearTimeout(splashFallbackTimer);
      }
      if (mounted) {
        setLoading(false);
      }
      await hideSplashSafely();
    };

    splashFallbackTimer = setTimeout(() => {
      void hideSplashSafely();
    }, 3000);

    const hydrateCachedAuth = async () => {
      const cachedState = await readCachedAuthState();
      if (!mounted) return;
      if (cachedState.user) {
        setAuthUser(cachedState.user as Session['user']);
      }
      if (cachedState.profile) {
        setProfile(cachedState.profile as { role?: string | null; full_name?: string | null; avatar_url?: string | null; email?: string | null });
      }
    };

    void hydrateCachedAuth();

    const checkAuthAndRoute = async (session: Session | null, event?: AuthChangeEvent) => {
      const logoutRequested = Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' && window.localStorage.getItem('mvs_logout_requested') === '1';
      if (logoutRequested) {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
          window.localStorage.removeItem('mvs_logout_requested');
        }
        if (mounted) routerRef.current.replace('/auth?mode=signin');
        void finalizeLoading();
        return;
      }

      console.log('[AUTH ROUTER] checkAuthAndRoute event:', event, 'email:', session?.user?.email);
      if (mounted) setAuthUser(session?.user || null);
      if (session?.user) previousAuthUserId.current = session.user.id;

      const cachedState = await readCachedAuthState();
      const cachedProfile = (cachedState.profile || profileRef.current) as AuthProfileState | null;

      const href = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : '';
      const pathname = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : '';
      const isAuthPage = pathname === '/auth' || pathname.startsWith('/auth/') || /\/reset-password(?:\/|$)/.test(pathname);
      const isPassportRoute = routePathnameRef.current.startsWith('/passport/') || segmentsRef.current[0] === 'passport';

      if (pathname === '/auth' || pathname.startsWith('/auth/')) {
        console.log('[AUTH ROUTER] Deferring to unified auth page handler...');
        return;
      }

      if (!session?.user) {
        console.log('[AUTH ROUTER] No session:', { href, pathname, isAuthPage });
        if (isPassportRoute) return;
        if (cachedState.user) {
          if (mounted) {
            setAuthUser(cachedState.user as Session['user']);
            if (cachedState.profile) setProfile(cachedState.profile as { role?: string | null; full_name?: string | null; avatar_url?: string | null; email?: string | null; deleted_at?: string | null; is_banned?: boolean | null });
          }
          return;
        }
        if (isAuthPage) return;
        if (mounted) {
          routerRef.current.replace('/auth?mode=signin');
        }
        return;
      }

      try {
        let profileData: AuthProfileState | null = null;
        try {
          profileData = await safeSupabaseCall<AuthProfileState | null>(() => supabase
            .from('profiles')
            .select('role, full_name, nin_verified, email, avatar_url, has_seen_welcome, deleted_at, is_banned, preferred_language')
            .eq('id', session.user.id)
            .maybeSingle());
        } catch (profileError) {
          console.warn('[Auth Layout] Profile unavailable; using cached profile:', profileError);
        }

        if (profileData?.deleted_at) {
          await signOutUser();
          if (mounted) {
            setAuthUser(null);
            setProfile(null);
            routerRef.current.replace('/auth?mode=signin');
          }
          return;
        }

        if (profileData?.is_banned) {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) console.error('[Auth] Could not end suspended user session:', signOutError);
          await clearCachedAuthState();
          if (mounted) {
            setAuthUser(null);
            setProfile(null);
            routerRef.current.replace('/auth?mode=signin&suspended=1');
          }
          return;
        }

        console.log('[AUTH ROUTER] Profile query result:', { profileData });
        const resolvedProfile = profileData || cachedProfile || null;
        if (resolvedProfile?.preferred_language) {
          await applyAccountLanguageRef.current(normalizeAppLanguage(resolvedProfile.preferred_language));
        }
        const pendingManualRole = Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
          ? window.localStorage.getItem('mvs_pending_signup_role')
          : null;
        const pendingRole = pendingManualRole;
        let userRole = pendingRole || resolvedProfile?.role || profileData?.role;

        if (!userRole) {
          // If no role exists yet, use metadata only. Profile creation belongs to signup.
          userRole = session.user.user_metadata?.role || pendingRole || 'client';
        }
        if (profileData?.nin_verified === false && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          setNinReminderRole(userRole === 'vet' || userRole === 'veterinarian' ? 'vet' : userRole === 'merchant' ? 'merchant' : 'client');
        }

        if (pendingManualRole && Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
          window.localStorage.removeItem('mvs_pending_signup_role');
        }

        if (mounted) setProfile(userRole === resolvedProfile?.role || !resolvedProfile
          ? resolvedProfile
          : { ...resolvedProfile, role: userRole });
        if (session.user) {
          await writeCachedAuthState(session.user, {
            ...(resolvedProfile || session.user.user_metadata || {}),
            role: userRole,
          });
        }

        if (pushRegisteredUserId.current !== session.user.id) {
          pushRegisteredUserId.current = session.user.id;
          void registerForPushNotifications(session.user.id).catch((error) => {
            console.warn('[Notifications] Push registration failed:', error);
          });
        }

        if (!mounted) return;

        console.log('[AUTH ROUTER] Navigating authenticated user:', session.user.email, 'Role:', userRole);
        if (isPassportRoute) return;
        const currentRootSegment = segmentsRef.current[0];
        if (currentRootSegment === '(admin)' && isSuperAdmin(session.user.email)) {
          return;
        }
        const expectedRootSegment = userRole === 'vet' || userRole === 'veterinarian'
          ? '(vet)'
          : userRole === 'merchant'
            ? '(merchant)'
            : '(client)';
        if (currentRootSegment !== expectedRootSegment) {
          routerRef.current.replace(`/${expectedRootSegment}` as '/(client)' | '/(vet)' | '/(merchant)');
        }
      } catch (err) {
        console.error('[Auth Layout] Error in auth layout guard:', err);
        if (mounted && cachedProfile) {
          setProfile(cachedProfile);
          void finalizeLoading();
          return;
        }
        if (mounted) routerRef.current.replace('/auth?mode=signin');
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const combined = `${hash}${search}`;
      const recoveryParams = new URLSearchParams(
        `${search.replace(/^\?/, '')}&${hash.replace(/^#/, '')}`,
      );
      const hasRecoveryType = /(?:^|[?&#])type=recovery(?:&|$)/i.test(combined);
      const hasRecoveryToken = /(?:^|[?&#])(?:token|token_hash|code)=[^&]+/i.test(combined)
        || /(?:^|[#?&])access_token=[^&]+/i.test(combined);
      const isResetPasswordRoute = window.location.pathname.replace(/\/+$/, '') === '/reset-password';

      if ((hasRecoveryType && hasRecoveryToken)
        || (isResetPasswordRoute && Boolean(recoveryParams.get('code')))) {
        const accessToken = recoveryParams.get('access_token');
        const refreshToken = recoveryParams.get('refresh_token');
        const tokenHash = recoveryParams.get('token_hash') || recoveryParams.get('token');
        const code = recoveryParams.get('code');

        void (async () => {
          let recoveryError: string | undefined;
          try {
            const result = accessToken && refreshToken
              ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
              : tokenHash
                ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
                : code
                  ? await supabase.auth.exchangeCodeForSession(code)
                  : { error: new Error('The password reset link is missing recovery credentials.') };
            if (result.error) throw result.error;
          } catch (error) {
            console.error('[Auth] Failed to establish password recovery session:', error);
            recoveryError = error instanceof Error ? error.message : 'The password reset link could not be verified.';
          }

          if (!mounted) return;
          routerRef.current.replace(recoveryError
            ? { pathname: '/reset-password', params: { recoveryError } }
            : '/reset-password');
          if (mounted) setLoading(false);
          void hideSplashSafely();
        })();
        return;
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      console.log('[Auth Layout] onAuthStateChange fired:', event, 'session:', session?.user?.id);

      if (event === 'SIGNED_OUT') {
        previousAuthUserId.current = null;
        pushRegisteredUserId.current = null;
        if (mounted) {
          setAuthUser(null);
          setProfile(null);
          setPendingNotifications([]);
        }
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
          window.localStorage.setItem('mvs_logout_requested', '1');
        }
        if (mounted) routerRef.current.replace('/auth?mode=signin');
        if (mounted) setLoading(false);
        void hideSplashSafely();
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        if (mounted) routerRef.current.replace('/reset-password');
        if (mounted) setLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session?.user?.id === previousAuthUserId.current) {
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        previousAuthUserId.current = session.user.id;
        if (event === 'SIGNED_IN') void logActivity('user_login', session.user.id);
        if (event === 'SIGNED_IN') {
          void syncProfileVerificationStatus(session.user.id).catch((error) => {
            console.warn('[Auth Layout] Verification sync failed after auth event:', error);
          });
        }
      }

      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'INITIAL_SESSION') return;

      checkAuthAndRoute(session, event).finally(() => {
        void finalizeLoading();
      });
    });

    void supabase.auth.getSession()
      .then(({ data: sessionData, error }) => {
        if (error) throw error;
        return checkAuthAndRoute(sessionData.session, 'INITIAL_SESSION');
      })
      .catch((error) => {
        console.error('[Auth Layout] Initial session lookup failed:', error);
        if (mounted) routerRef.current.replace('/auth?mode=signin');
      })
      .finally(() => {
        void finalizeLoading();
      });

    return () => {
      mounted = false;
      if (splashFallbackTimer) {
        clearTimeout(splashFallbackTimer);
      }
      authListener.subscription.unsubscribe();
    };
  }, [setPendingNotifications]);

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

  return (
    <>
      <OfflineSyncBanner userId={authUser?.id} />
      <Modal visible={Boolean(ninReminderRole)} transparent animationType="fade" onRequestClose={() => setNinReminderRole(null)}>
        <View style={styles.ninReminderBackdrop}>
          <View style={styles.ninReminderCard}>
            <Text style={styles.ninReminderTitle}>Verify your NIN</Text>
            <Text style={styles.ninReminderBody}>Add and verify your NIN in your profile to confirm your legal name. Your NIN and name will be locked to your account after verification.</Text>
            <View style={styles.ninReminderActions}>
              <TouchableOpacity style={styles.ninReminderLater} onPress={() => setNinReminderRole(null)}>
                <Text style={styles.ninReminderLaterText}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ninReminderButton}
                onPress={() => {
                  const role = ninReminderRole;
                  setNinReminderRole(null);
                  if (role === 'vet') router.push({ pathname: '/(vet)/profile', params: { openNin: '1' } });
                  else if (role === 'merchant') router.push({ pathname: '/(merchant)/profile', params: { openNin: '1' } });
                  else router.push({ pathname: '/(client)/profile', params: { openNin: '1' } });
                }}
              >
                <Text style={styles.ninReminderButtonText}>Add NIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function OfflineSyncBanner({ userId }: { userId?: string }) {
  const [queueState, setQueueState] = useState<{ userId: string; pendingCount: number; error: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const operations = await readOfflineRecords(userId);
        if (!mounted) return;
        setQueueState({
          userId,
          pendingCount: operations.length,
          error: operations.find((operation) => operation.lastError)?.lastError || null,
        });
      } catch (error) {
        console.error('[Offline Sync] Could not read pending record queue:', error);
        if (mounted) setQueueState({
          userId,
          pendingCount: 1,
          error: 'Could not read saved offline records. Keep the app data on this device and retry.',
        });
      }
    };
    void refresh();
    const unsubscribe = subscribeToOfflineQueue((changedUserId) => {
      if (changedUserId === userId) void refresh();
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [userId]);

  const currentQueueState = userId && queueState?.userId === userId ? queueState : null;
  const pendingCount = currentQueueState?.pendingCount ?? 0;
  const syncError = currentQueueState?.error ?? null;
  if (!userId || pendingCount === 0) return null;

  const retrySync = async () => {
    setSyncing(true);
    setQueueState((current) => current?.userId === userId ? { ...current, error: null } : current);
    try {
      const result = await syncOfflineRecords(userId);
      setQueueState({ userId, pendingCount: result.remaining, error: result.error || null });
    } catch (error) {
      console.error('[Offline Sync] Manual record sync failed:', error);
      setQueueState({
        userId,
        pendingCount,
        error: error instanceof Error ? error.message : 'Could not sync saved records.',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.offlineSyncBanner}>
      <View style={styles.offlineSyncCopy}>
        <Text style={styles.offlineSyncText}>
          {syncError ? `${pendingCount} saved record${pendingCount === 1 ? '' : 's'} waiting. ${syncError}` : `${pendingCount} record${pendingCount === 1 ? '' : 's'} saved on this device and waiting to sync.`}
        </Text>
      </View>
      <Pressable onPress={() => void retrySync()} disabled={syncing} accessibilityRole="button" accessibilityLabel="Sync saved offline records">
        {syncing ? <ActivityIndicator color="#6EE7B7" size="small" /> : <Text style={styles.offlineSyncAction}>Sync</Text>}
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#0B132B' }}>
        <LanguageProvider>
          <DashboardNotificationsProvider>
            <ContextSafeAreaView style={styles.rootSafeArea} edges={[]}>
              <RootAuthGate />
              <NetworkStatusBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" options={{ title: 'MVS - Splash' }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="passport/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="(client)" options={{ headerShown: false }} />
                <Stack.Screen name="(vet)" options={{ headerShown: false }} />
                <Stack.Screen name="(merchant)" options={{ headerShown: false }} />
              </Stack>
            </ContextSafeAreaView>
          </DashboardNotificationsProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function NetworkStatusBanner() {
  const [status, setStatus] = useState<'retrying' | 'offline' | null>(null);

  useEffect(() => subscribeToNetworkStatus((nextStatus) => {
    setStatus(nextStatus === 'recovered' ? null : nextStatus);
  }), []);

  if (!status) return null;
  return (
    <View style={styles.networkBanner}>
      <Text style={styles.networkBannerText}>
        {status === 'retrying' ? 'Connection hiccup. Retrying...' : 'Connection unavailable. Your saved session is still active.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ninReminderBackdrop: { flex: 1, backgroundColor: '#000000A6', alignItems: 'center', justifyContent: 'center', padding: 24 },
  ninReminderCard: { width: '100%', maxWidth: 420, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 16, padding: 22 },
  ninReminderTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  ninReminderBody: { color: '#CBD5E1', fontSize: 14, lineHeight: 21 },
  ninReminderActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 22 },
  ninReminderLater: { paddingHorizontal: 16, paddingVertical: 11 },
  ninReminderLaterText: { color: '#CBD5E1', fontSize: 14, fontWeight: '700' },
  ninReminderButton: { backgroundColor: '#10B981', borderRadius: 9, paddingHorizontal: 18, paddingVertical: 11 },
  ninReminderButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  rootSafeArea: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  boundaryContainer: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  boundaryContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: '#0B132B',
  },
  boundaryTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  boundaryText: {
    color: '#CBD5E1',
    fontSize: 16,
    textAlign: 'left',
    lineHeight: 24,
    marginBottom: 16,
  },
  boundaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 20,
  },
  boundaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  boundaryStack: {
    color: '#E2E8F0',
    fontSize: 12,
    textAlign: 'left',
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  networkBanner: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
  },
  networkBannerText: {
    color: '#E2E8F0',
    fontSize: 12,
    textAlign: 'center',
  },
  offlineSyncBanner: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    zIndex: 99,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  offlineSyncCopy: { flex: 1 },
  offlineSyncText: { color: '#D1FAE5', fontSize: 11, lineHeight: 16 },
  offlineSyncAction: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', paddingHorizontal: 4 },
});
