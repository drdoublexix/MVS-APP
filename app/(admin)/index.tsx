import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchActivityLogs, fetchAdminUserCount, type ActivityLog } from '../../lib/admin';

const actions = [
  { label: 'Manage users', icon: 'account-cancel-outline', route: '/(admin)/users', color: '#F87171' },
  { label: 'Activity logs', icon: 'history', route: '/(admin)/activity-logs', color: '#00C853' },
  { label: 'Send an email', icon: 'email-edit-outline', route: '/(admin)/email-manager', color: '#60A5FA' },
  { label: 'Email history', icon: 'email-check-outline', route: '/(admin)/email-logs', color: '#F59E0B' },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loadingUserCount, setLoadingUserCount] = useState(true);
  const [userCountError, setUserCountError] = useState(false);

  const loadUserCount = useCallback(async () => {
    setLoadingUserCount(true);
    setUserCountError(false);
    try {
      setUserCount(await fetchAdminUserCount());
    } catch (error) {
      console.error('[Admin Dashboard] Could not load total user count:', error);
      setUserCountError(true);
    } finally {
      setLoadingUserCount(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      setLogs(await fetchActivityLogs({ limit: 10 }));
    } catch (error) {
      console.error('[Admin Dashboard] Could not load recent audit events:', error);
      Alert.alert('Dashboard unavailable', error instanceof Error ? error.message : 'Could not load recent activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadRecent(), 0);
    return () => clearTimeout(timer);
  }, [loadRecent]);

  useEffect(() => {
    const timer = setTimeout(() => void loadUserCount(), 0);
    return () => clearTimeout(timer);
  }, [loadUserCount]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Super Admin</Text>
      <Text style={styles.subtitle}>Signed in as the authorized owner account</Text>
      <View style={styles.notice}>
        <MaterialCommunityIcons name="shield-check-outline" size={20} color="#00C853" />
        <Text style={styles.noticeText}>Audit events include authentication and changes to key account, pet, consultation, order, message, invoice, and product records.</Text>
      </View>

      <View style={styles.userCountCard} accessibilityLabel="Total registered users">
        <View style={styles.userCountIcon}>
          <MaterialCommunityIcons name="account-group-outline" size={24} color="#00C853" />
        </View>
        <View style={styles.userCountContent}>
          <Text style={styles.userCountLabel}>Total users</Text>
          {loadingUserCount ? (
            <ActivityIndicator color="#00C853" style={styles.userCountLoader} />
          ) : userCountError ? (
            <Text style={styles.userCountError}>Could not load user count</Text>
          ) : (
            <Text style={styles.userCountValue}>{userCount?.toLocaleString() ?? '—'}</Text>
          )}
        </View>
        {userCountError ? (
          <Pressable
            onPress={() => void loadUserCount()}
            disabled={loadingUserCount}
            accessibilityRole="button"
            accessibilityLabel="Retry loading total users"
          >
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        {actions.map((item) => (
          <Pressable key={item.route} style={styles.action} onPress={() => router.push(item.route)}>
            <View style={[styles.icon, { backgroundColor: `${item.color}20` }]}>
              <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
            </View>
            <Text style={styles.actionText}>{item.label}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#64748B" />
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Latest audit events</Text>
        <Pressable onPress={() => router.push('/(admin)/activity-logs')}>
          <Text style={styles.link}>View all</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color="#00C853" style={styles.loader} /> : null}
      {!loading && logs.length === 0 ? <Text style={styles.empty}>No audit events recorded yet.</Text> : null}
      {logs.map((log) => (
        <View key={log.id} style={styles.log}>
          <Text style={styles.logAction}>{log.action.replaceAll('_', ' ')}{log.resource_type ? ` · ${log.resource_type}` : ''}</Text>
          <Text style={styles.logMeta}>{log.email || 'Account unavailable'} · {log.role || 'unknown role'}</Text>
          <Text style={styles.logTime}>{new Date(log.created_at).toLocaleString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000A14' },
  content: { padding: 18, paddingBottom: 40 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#8a9ba8', fontSize: 14, marginTop: 5 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, padding: 14, borderRadius: 10, marginTop: 20 },
  noticeText: { flex: 1, color: '#cbd5e1', fontSize: 13, lineHeight: 19 },
  actions: { gap: 10, marginVertical: 22 },
  action: { minHeight: 66, backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  userCountCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 22 },
  userCountIcon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00C85320' },
  userCountContent: { flex: 1 },
  userCountLabel: { color: '#8a9ba8', fontSize: 13, fontWeight: '600' },
  userCountValue: { color: '#fff', fontSize: 25, fontWeight: '700', marginTop: 2 },
  userCountLoader: { alignSelf: 'flex-start', marginTop: 8 },
  userCountError: { color: '#fca5a5', fontSize: 12, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { color: '#00C853', fontWeight: '600' },
  loader: { marginVertical: 28 },
  empty: { color: '#8a9ba8', textAlign: 'center', paddingVertical: 26 },
  log: { backgroundColor: '#0f1c2e', borderRadius: 8, padding: 13, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#00C853' },
  logAction: { color: '#fff', fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  logMeta: { color: '#8a9ba8', fontSize: 12, marginTop: 5 },
  logTime: { color: '#64748b', fontSize: 11, marginTop: 4 },
});
