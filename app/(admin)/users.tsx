import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchAdminUserAccounts, setAdminUserBan, type AdminUserAccount } from '../../lib/admin';

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserAccount | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isSuspending = selectedUser ? !selectedUser.is_banned : false;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await fetchAdminUserAccounts(search));
    } catch (loadError) {
      console.error('[Admin Users] Could not load user accounts:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load user accounts.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => void loadUsers(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadUsers, search]);

  const submitAction = async () => {
    if (!selectedUser || saving || (isSuspending && !reason.trim())) return;
    setSaving(true);
    try {
      await setAdminUserBan(selectedUser.id, isSuspending, reason);
      setSelectedUser(null);
      setReason('');
      await loadUsers();
    } catch (saveError) {
      console.error('[Admin Users] Could not update user suspension:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Could not update this account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Manage users</Text>
      <Text style={styles.subtitle}>Suspend accounts to block sign-in, or restore access when appropriate.</Text>
      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or email"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          style={styles.searchInput}
          accessibilityLabel="Search users by name or email"
        />
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void loadUsers()}><Text style={styles.retry}>Retry</Text></Pressable>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color="#00C853" style={styles.loader} /> : null}
      {!loading && !error && users.length === 0 ? <Text style={styles.empty}>No matching user accounts.</Text> : null}
      {users.map((user) => (
        <View key={user.id} style={styles.userCard}>
          <View style={styles.userCopy}>
            <Text style={styles.name}>{user.full_name || 'Name unavailable'}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <Text style={styles.role}>{user.role || 'Unknown role'} · {user.is_banned ? 'Suspended' : 'Active'}</Text>
            {user.is_banned && user.ban_reason ? <Text style={styles.reason}>Reason: {user.ban_reason}</Text> : null}
          </View>
          <Pressable
            style={[styles.userAction, user.is_banned && styles.restoreAction]}
            onPress={() => { setSelectedUser(user); setReason(''); }}
            accessibilityRole="button"
            accessibilityLabel={`${user.is_banned ? 'Restore' : 'Suspend'} ${user.email}`}
          >
            <Text style={[styles.userActionText, user.is_banned && styles.restoreActionText]}>{user.is_banned ? 'Restore' : 'Suspend'}</Text>
          </Pressable>
        </View>
      ))}
      {!loading && users.length === 100 ? <Text style={styles.limitNote}>Showing the first 100 matching accounts. Refine your search to find a specific user.</Text> : null}

      <Modal visible={selectedUser !== null} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{isSuspending ? 'Suspend account?' : 'Restore account?'}</Text>
            <Text style={styles.modalCopy}>
              {isSuspending
                ? `${selectedUser?.email} will be blocked from signing in until restored by a super administrator.`
                : `Restore sign-in access for ${selectedUser?.email}?`}
            </Text>
            {isSuspending ? (
              <>
                <Text style={styles.inputLabel}>Reason for suspension</Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Enter the reason (required)"
                  placeholderTextColor="#64748B"
                  multiline
                  maxLength={1000}
                  style={styles.reasonInput}
                  accessibilityLabel="Reason for suspension"
                />
              </>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setSelectedUser(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, !isSuspending && styles.restoreAction, isSuspending && !reason.trim() && styles.disabledButton]}
                onPress={() => void submitAction()}
                disabled={saving || (isSuspending && !reason.trim())}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.confirmText}>{isSuspending ? 'Suspend user' : 'Restore access'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000A14' },
  content: { padding: 18, paddingBottom: 40 },
  heading: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#8A9BA8', fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 18 },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#0F1C2E', borderColor: '#1E293B', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 14 },
  searchInput: { flex: 1, color: '#FFFFFF', paddingVertical: 10, fontSize: 14 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0F1C2E', borderColor: '#1E293B', borderWidth: 1, borderRadius: 10, padding: 13, marginBottom: 9 },
  userCopy: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  email: { color: '#CBD5E1', fontSize: 12, marginTop: 3 },
  role: { color: '#8A9BA8', fontSize: 11, textTransform: 'capitalize', marginTop: 5 },
  reason: { color: '#FCA5A5', fontSize: 11, marginTop: 5 },
  userAction: { backgroundColor: '#7F1D1D', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9 },
  userActionText: { color: '#FECACA', fontSize: 12, fontWeight: '700' },
  restoreAction: { backgroundColor: '#065F46' },
  restoreActionText: { color: '#A7F3D0' },
  loader: { marginVertical: 26 },
  empty: { color: '#8A9BA8', textAlign: 'center', paddingVertical: 24 },
  errorBox: { backgroundColor: '#3F1D25', borderRadius: 9, padding: 12, marginBottom: 12 },
  errorText: { color: '#FECACA', fontSize: 12 },
  retry: { color: '#6EE7B7', fontWeight: '700', marginTop: 8 },
  limitNote: { color: '#8A9BA8', fontSize: 11, lineHeight: 16, marginTop: 7 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#000000B8' },
  modal: { backgroundColor: '#0F1C2E', borderColor: '#334155', borderWidth: 1, borderRadius: 14, padding: 18 },
  modalTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  modalCopy: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, marginTop: 9 },
  inputLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '600', marginTop: 17, marginBottom: 7 },
  reasonInput: { minHeight: 82, backgroundColor: '#07111F', borderColor: '#334155', borderWidth: 1, borderRadius: 9, padding: 11, color: '#FFFFFF', textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancelButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: '#CBD5E1', fontWeight: '600' },
  confirmButton: { backgroundColor: '#991B1B', borderRadius: 8, minWidth: 110, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  confirmText: { color: '#FFFFFF', fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
});
