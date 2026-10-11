import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchEmailLogs, type EmailLog } from '../../lib/admin';

export default function AdminEmailLogs() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLogs(await fetchEmailLogs());
    } catch (error) {
      console.error('[Admin Email Logs] Could not fetch send history:', error);
      Alert.alert('Could not load email history', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Email history</Text>
          <Text style={styles.caption}>Most recent 50 messages sent from this dashboard.</Text>
        </View>
        <Pressable onPress={() => { setLoading(true); void load(); }}><Text style={styles.refresh}>Refresh</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color="#00C853" style={{ marginTop: 30 }} /> : null}
      {!loading && logs.length === 0 ? <Text style={styles.empty}>No dashboard emails have been sent.</Text> : null}
      {logs.map((log) => (
        <View key={log.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.subject}>{log.subject}</Text>
            <Text style={[styles.status, log.status === 'sent' ? styles.success : styles.failed]}>{log.status}</Text>
          </View>
          <Text style={styles.email}>{log.recipient_email}</Text>
          <Text style={styles.date}>{new Date(log.sent_at).toLocaleString()}</Text>
          {log.error_message ? <Text style={styles.error}>{log.error_message}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000A14' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { color: '#fff', fontSize: 23, fontWeight: '700' },
  caption: { color: '#8a9ba8', fontSize: 12, marginTop: 5 },
  refresh: { color: '#00C853', fontWeight: '600' },
  empty: { color: '#8a9ba8', textAlign: 'center', paddingVertical: 32 },
  card: { backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, borderRadius: 9, padding: 13, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  subject: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  status: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  success: { color: '#4ade80' },
  failed: { color: '#f87171' },
  email: { color: '#cbd5e1', fontSize: 12, marginTop: 7 },
  date: { color: '#64748b', fontSize: 11, marginTop: 5 },
  error: { color: '#fca5a5', fontSize: 11, marginTop: 7 },
});
