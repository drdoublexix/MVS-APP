import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import 'react-native-get-random-values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { markNotificationRead, syncPendingNotifications, type StoredNotification } from '../lib/notifications';
import { readCachedAuthState, safeSupabaseCall, subscribeToNetworkStatus, supabase, syncProfileVerificationStatus, writeCachedAuthState } from '../lib/supabase';

const registerForPushNotifications = async (userId: string) => {
  const { registerForPushNotifications: register } = await import('../lib/notifications');
  return register(userId);
};

void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('[Splash Screen] preventAutoHideAsync failed gracefully:', error);
});

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
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<Session['user'] | null>(null);
  const [profile, setProfile] = useState<{ role?: string | null; full_name?: string | null } | null>(null);
  const [pendingNotifications, setPendingNotifications] = useState<StoredNotification[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    const userId = authUser?.id;
    if (!userId) {
      return;
    }

    let mounted = true;
    let syncing = false;
    let lastConnected = false;
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
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      if (connected && !lastConnected) void syncNotifications();
      lastConnected = connected;
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNotifications();
    });

    return () => {
      mounted = false;
      unsubscribeNetwork();
      appStateSubscription.remove();
    };
  }, [authUser?.id]);

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
        if (mounted) router.replace('/auth?mode=signin');
        void finalizeLoading();
        return;
      }

      console.log('[AUTH ROUTER] checkAuthAndRoute event:', event, 'email:', session?.user?.email);
      if (mounted) setAuthUser(session?.user || null);

      const cachedState = await readCachedAuthState();
      const cachedProfile = cachedState.profile || profile;

      const href = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : '';
      const pathname = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : '';
      const isAuthPage = pathname === '/auth' || pathname.startsWith('/auth/') || /\/reset-password(?:\/|$)/.test(pathname);

      if (pathname === '/auth' || pathname.startsWith('/auth/')) {
        console.log('[AUTH ROUTER] Deferring to unified auth page handler...');
        return;
      }

      if (!session?.user) {
        console.log('[AUTH ROUTER] No session:', { href, pathname, isAuthPage });
        if (cachedState.user) {
          if (mounted) {
            setAuthUser(cachedState.user as Session['user']);
            if (cachedState.profile) setProfile(cachedState.profile as { role?: string | null; full_name?: string | null; avatar_url?: string | null; email?: string | null });
          }
          return;
        }
        if (isAuthPage) return;
        if (mounted) {
          router.replace('/auth?mode=signin');
        }
        return;
      }

      try {
        let profileData: { role?: string | null; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null = null;
        try {
          profileData = await safeSupabaseCall(() => supabase
            .from('profiles')
            .select('role, full_name, email, avatar_url, has_seen_welcome')
            .eq('id', session.user.id)
            .maybeSingle());
        } catch (profileError) {
          console.warn('[Auth Layout] Profile unavailable; using cached profile:', profileError);
        }

        console.log('[AUTH ROUTER] Profile query result:', { profileData });
        const resolvedProfile = profileData || cachedProfile || null;
        const pendingManualRole = Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
          ? window.localStorage.getItem('mvs_pending_signup_role')
          : null;
        const pendingRole = pendingManualRole;
        let userRole = pendingRole || resolvedProfile?.role || profileData?.role;

        if (!userRole) {
          // If no role exists yet, use metadata only. Profile creation belongs to signup.
          userRole = session.user.user_metadata?.role || pendingRole || 'client';
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

        void registerForPushNotifications(session.user.id).catch((error) => {
          console.warn('[Notifications] Push registration failed:', error);
        });

        if (!mounted) return;

        console.log('[AUTH ROUTER] Navigating authenticated user:', session.user.email, 'Role:', userRole);
        const currentRootSegment = segmentsRef.current[0];
        const expectedRootSegment = userRole === 'vet' || userRole === 'veterinarian'
          ? '(vet)'
          : userRole === 'merchant'
            ? '(merchant)'
            : '(client)';
        if (currentRootSegment !== expectedRootSegment) {
          router.replace(`/${expectedRootSegment}` as '/(client)' | '/(vet)' | '/(merchant)');
        }
      } catch (err) {
        console.error('[Auth Layout] Error in auth layout guard:', err);
        if (mounted && cachedProfile) {
          setProfile(cachedProfile);
          void finalizeLoading();
          return;
        }
        if (mounted) router.replace('/auth?mode=signin');
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const combined = `${hash}${search}`;
      const hasRecoveryType = /(?:^|[?&#])type=recovery(?:&|$)/i.test(combined);
      const hasRecoveryToken = /(?:^|[?&#])token=[^&]+/i.test(combined) || /(?:^|[#?&])access_token=[^&]+/i.test(combined);

      if (hasRecoveryType && hasRecoveryToken) {
        router.replace('/reset-password');
        queueMicrotask(() => {
          if (mounted) setLoading(false);
          void hideSplashSafely();
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
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
          window.localStorage.setItem('mvs_logout_requested', '1');
        }
        if (mounted) router.replace('/auth?mode=signin');
        if (mounted) setLoading(false);
        void hideSplashSafely();
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        if (mounted) router.replace('/reset-password');
        if (mounted) setLoading(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        void safeSupabaseCall(() => supabase
          .from('profiles')
          .select('role, full_name, email, avatar_url, has_seen_welcome')
          .eq('id', session.user.id)
          .maybeSingle())
          .then(async (data) => {
            if (mounted) setProfile(data || null);
            await writeCachedAuthState(session.user, data || session.user.user_metadata || null);
          })
          .catch((error) => {
            console.warn('[Auth Layout] Profile refresh unavailable; retaining cached auth state:', error);
          });

        void syncProfileVerificationStatus(session.user.id).catch((error) => {
          console.warn('[Auth Layout] Verification sync failed after auth event:', error);
        });
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
        if (mounted) router.replace('/auth?mode=signin');
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

  return (
    <NotificationCenter
      notifications={authUser && pathname === '/' ? pendingNotifications : []}
      onRead={async (notificationId) => {
        try {
          await markNotificationRead(notificationId);
          setPendingNotifications((current) => current.filter((notification) => notification.id !== notificationId));
        } catch (error) {
          console.warn('[Notifications] Failed to mark notification as read:', error);
        }
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#0B132B' }}>
        <RootAuthGate />
        <NetworkStatusBanner />
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: 'MVS - Splash' }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="(client)" options={{ headerShown: false }} />
          <Stack.Screen name="(vet)" options={{ headerShown: false }} />
          <Stack.Screen name="(merchant)" options={{ headerShown: false }} />
        </Stack>
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

function NotificationCenter({ notifications, onRead }: { notifications: StoredNotification[]; onRead: (notificationId: string) => Promise<void> }) {
  const [visible, setVisible] = useState(false);
  if (notifications.length === 0) return null;

  return (
    <>
      <TouchableOpacity style={styles.notificationBell} onPress={() => setVisible(true)} accessibilityLabel={`${notifications.length} unread notifications`}>
        <MaterialCommunityIcons name="bell-outline" size={22} color="#FFFFFF" />
        <View style={styles.notificationCount}><Text style={styles.notificationCountText}>{notifications.length > 99 ? '99+' : notifications.length}</Text></View>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.notificationBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.notificationPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setVisible(false)} accessibilityLabel="Close notifications">
                <MaterialCommunityIcons name="close" size={22} color="#CBD5E1" />
              </TouchableOpacity>
            </View>
            {notifications.map((notification) => (
              <TouchableOpacity key={notification.id} style={styles.notificationItem} onPress={() => void onRead(notification.id)}>
                <Text style={styles.notificationItemTitle}>{notification.title}</Text>
                <Text style={styles.notificationItemBody}>{notification.body}</Text>
                <Text style={styles.notificationItemTime}>{new Date(notification.created_at).toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  notificationBell: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 110,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E7490',
    borderWidth: 1,
    borderColor: '#67E8F9',
  },
  notificationCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
  },
  notificationCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  notificationBackdrop: { flex: 1, alignItems: 'flex-end', paddingTop: 64, paddingHorizontal: 16, backgroundColor: '#00000066' },
  notificationPanel: { width: '100%', maxWidth: 380, maxHeight: '75%', backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#475569', padding: 14 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  notificationTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  notificationItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  notificationItemTitle: { color: '#6EE7B7', fontSize: 13, fontWeight: '800' },
  notificationItemBody: { color: '#E2E8F0', fontSize: 13, lineHeight: 19, marginTop: 4 },
  notificationItemTime: { color: '#94A3B8', fontSize: 10, marginTop: 6 },
});
