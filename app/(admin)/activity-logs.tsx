import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchActivityLogs, fetchAdminUserCount, type ActivityLog } from '../../lib/admin';

const PAGE_SIZE = 50;
const roleOptions = ['All roles', 'client', 'vet', 'merchant'];
const actionOptions = ['All activity', 'insert', 'update', 'delete', 'user_login', 'user_logout', 'admin_viewed_user_nin'];
const dateOptions = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'All time', days: 0 },
];

export default function ActivityLogsScreen() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [action, setAction] = useState('');
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loadingUserCount, setLoadingUserCount] = useState(true);
  const [userCountError, setUserCountError] = useState<string | null>(null);

  const loadUserCount = useCallback(async () => {
    setLoadingUserCount(true);
    setUserCountError(null);
    try {
      setUserCount(await fetchAdminUserCount());
    } catch (error) {
      console.error('[Admin Activity] Could not load total user count:', error);
      setUserCountError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoadingUserCount(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
      setLogs(await fetchActivityLogs({
        limit: PAGE_SIZE,
        email,
        role,
        action,
        since,
      }));
    } catch (error) {
      console.error('[Admin Activity] Could not load filtered audit events:', error);
      Alert.alert('Could not load activity', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [action, days, email, role]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void loadUserCount(), 0);
    return () => clearTimeout(timer);
  }, [loadUserCount]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
      const more = await fetchActivityLogs({
        limit: PAGE_SIZE,
        offset: logs.length,
        email,
        role,
        action,
        since,
      });
      setLogs((current) => [...current, ...more]);
    } catch (error) {
      Alert.alert('Could not load more activity', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Activity audit</Text>
      <Text style={styles.caption}>Filter recorded events by account email, role, action, and date.</Text>

      <View style={styles.userCountCard} accessibilityLabel="Total registered users">
        <View style={styles.userCountCopy}>
          <Text style={styles.userCountLabel}>Total users</Text>
          {loadingUserCount ? (
            <ActivityIndicator color="#00C853" style={styles.userCountLoading} />
          ) : userCountError ? (
            <Text style={styles.userCountError}>{userCountError}</Text>
          ) : (
            <Text style={styles.userCountValue}>{userCount?.toLocaleString() ?? '—'}</Text>
          )}
        </View>
        <Pressable
          onPress={() => void loadUserCount()}
          disabled={loadingUserCount}
          accessibilityRole="button"
          accessibilityLabel="Refresh total user count"
        >
          <Text style={styles.refresh}>{loadingUserCount ? 'Loading' : 'Refresh'}</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Filter by account email"
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Filter activity by account email"
      />
      <Text style={styles.filterLabel}>Role</Text>
      <View style={styles.chips}>
        {roleOptions.map((option) => {
          const value = option === 'All roles' ? '' : option;
          return <FilterChip key={option} label={option} selected={role === value} onPress={() => setRole(value)} />;
        })}
      </View>
      <Text style={styles.filterLabel}>Action</Text>
      <View style={styles.chips}>
        {actionOptions.map((option) => {
          const value = option === 'All activity' ? '' : option;
          const label = option === 'admin_viewed_user_nin' ? 'Viewed user NIN' : option.replaceAll('_', ' ');
          return <FilterChip key={option} label={label} selected={action === value} onPress={() => setAction(value)} />;
        })}
      </View>
      <Text style={styles.filterLabel}>When</Text>
      <View style={styles.chips}>
        {dateOptions.map((option) => (
          <FilterChip key={option.label} label={option.label} selected={days === option.days} onPress={() => setDays(option.days)} />
        ))}
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.sectionTitle}>Events</Text>
        <Pressable onPress={() => { setLoading(true); void load(); void loadUserCount(); }} accessibilityRole="button"><Text style={styles.refresh}>Refresh</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color="#00C853" style={{ marginVertical: 30 }} /> : null}
      {!loading && logs.length === 0 ? <Text style={styles.empty}>No events match these filters.</Text> : null}
      {logs.map((log) => (
        <View key={log.id} style={styles.card}>
          <Text style={styles.action}>{log.action.replaceAll('_', ' ')}{log.resource_type ? ` · ${log.resource_type}` : ''}</Text>
          <Text style={styles.meta}>{log.email || 'Account unavailable'}{log.role ? ` · ${log.role === 'veterinarian' ? 'vet' : log.role}` : ''}</Text>
          <Text style={styles.date}>{new Date(log.created_at).toLocaleString()}</Text>
          {log.details?.operation ? <Text style={styles.details}>Changed: {String(log.details.operation).toLowerCase()}{Array.isArray(log.details.changed_columns) && log.details.changed_columns.length ? ` (${log.details.changed_columns.join(', ')})` : ''}</Text> : null}
        </View>
      ))}
      {!loading && logs.length >= PAGE_SIZE ? (
        <Pressable style={styles.more} onPress={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? <ActivityIndicator color="#00C853" /> : <Text style={styles.moreText}>Load more</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000A14' },
  content: { padding: 16, paddingBottom: 40 },
  heading: { color: '#fff', fontSize: 23, fontWeight: '700' },
  caption: { color: '#8a9ba8', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 15 },
  userCountCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, borderRadius: 9, padding: 15, marginBottom: 18 },
  userCountCopy: { flex: 1, paddingRight: 12 },
  userCountLabel: { color: '#8a9ba8', fontSize: 13, fontWeight: '600' },
  userCountValue: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 4 },
  userCountLoading: { alignSelf: 'flex-start', marginTop: 9 },
  userCountError: { color: '#fca5a5', fontSize: 12, marginTop: 5 },
  input: { minHeight: 46, color: '#fff', backgroundColor: '#0f1c2e', borderColor: '#334155', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 },
  filterLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: '#334155', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  chipSelected: { backgroundColor: '#064e3b', borderColor: '#00C853' },
  chipText: { color: '#cbd5e1', fontSize: 12, textTransform: 'capitalize' },
  chipTextSelected: { color: '#fff' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  refresh: { color: '#00C853', fontWeight: '600' },
  empty: { color: '#8a9ba8', textAlign: 'center', paddingVertical: 28 },
  card: { backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, borderRadius: 9, padding: 13, marginBottom: 9 },
  action: { color: '#fff', fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  meta: { color: '#cbd5e1', fontSize: 12, marginTop: 6 },
  date: { color: '#64748b', fontSize: 11, marginTop: 5 },
  details: { color: '#8a9ba8', fontSize: 11, marginTop: 8 },
  more: { alignItems: 'center', padding: 14 },
  moreText: { color: '#00C853', fontWeight: '600' },
});
