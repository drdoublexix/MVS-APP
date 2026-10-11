import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchAdminRecipients, type AdminRecipient } from '../../lib/admin';
import { sendAdminEmail } from '../../lib/admin-service';

const PAGE_SIZE = 50;
const roles = ['All roles', 'client', 'vet', 'merchant'];

export default function AdminEmailManager() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [recipients, setRecipients] = useState<AdminRecipient[]>([]);
  const [selected, setSelected] = useState<AdminRecipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreRecipients, setHasMoreRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const recipientRequestId = useRef(0);

  const loadRecipients = useCallback(async (offset = 0) => {
    const requestId = ++recipientRequestId.current;
    try {
      if (offset === 0) {
        setLoadingRecipients(true);
        setRecipients([]);
        setHasMoreRecipients(false);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      const nextRecipients = await fetchAdminRecipients({ search, role, limit: PAGE_SIZE, offset });
      if (requestId !== recipientRequestId.current) return;
      setRecipients((current) => offset === 0 ? nextRecipients : [...current, ...nextRecipients]);
      setHasMoreRecipients(nextRecipients.length === PAGE_SIZE);
    } catch (reason) {
      if (requestId !== recipientRequestId.current) return;
      console.error('[Admin Email] Could not search app users:', reason);
      setError(reason instanceof Error ? reason.message : 'Could not search users.');
    } finally {
      if (requestId === recipientRequestId.current) {
        setLoadingRecipients(false);
        setLoadingMore(false);
      }
    }
  }, [role, search]);

  useEffect(() => {
    const timer = setTimeout(() => void loadRecipients(), 250);
    return () => clearTimeout(timer);
  }, [loadRecipients]);

  const toggleRecipient = (recipient: AdminRecipient) => {
    setSelected((current) => current.some((item) => item.id === recipient.id)
      ? current.filter((item) => item.id !== recipient.id)
      : [...current, recipient]);
  };

  const send = async () => {
    if (selected.length === 0) {
      setNotice({ type: 'error', message: 'Select at least one app user before sending.' });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setNotice({ type: 'error', message: 'Enter both an email title and body.' });
      return;
    }

    setConfirmationVisible(false);
    setNotice(null);
    setSending(true);
    const failedRecipients: AdminRecipient[] = [];
    const failures: string[] = [];
    const auditWarnings: string[] = [];
    try {
      for (const recipient of selected) {
        try {
          const result = await sendAdminEmail(recipient.id, subject.trim(), body.trim());
          if (result.auditWarning) auditWarnings.push(recipient.email);
        } catch (reason) {
          console.error(`[Admin Email] Send failed for ${recipient.email}:`, reason);
          failedRecipients.push(recipient);
          failures.push(`${recipient.email}: ${reason instanceof Error ? reason.message : 'Please try again.'}`);
        }
      }

      const sentCount = selected.length - failedRecipients.length;
      setSelected(failedRecipients);
      if (failedRecipients.length === 0) {
        setSubject('');
        setBody('');
      }

      setNotice({
        type: failedRecipients.length > 0 ? 'error' : 'success',
        message: [
          `${sentCount} of ${selected.length} emails sent.`,
          failures.length ? `Failed:\n${failures.join('\n')}` : '',
          auditWarnings.length ? `Audit entries could not be saved for: ${auditWarnings.join(', ')}.` : '',
        ].filter(Boolean).join('\n\n'),
      });
    } catch (reason) {
      console.error('[Admin Email] Could not complete the send operation:', reason);
      setNotice({
        type: 'error',
        message: reason instanceof Error ? reason.message : 'Could not send the email. Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  const confirmSend = () => {
    setNotice(null);
    if (selected.length === 0) {
      setNotice({ type: 'error', message: 'Select at least one app user before sending.' });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setNotice({ type: 'error', message: 'Enter both an email title and body.' });
      return;
    }
    setConfirmationVisible(true);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Send a branded email</Text>
        <Text style={styles.label}>Email title</Text>
        <TextInput
          style={styles.input}
          placeholder="Write a clear subject"
          placeholderTextColor="#64748b"
          value={subject}
          onChangeText={setSubject}
          maxLength={160}
          accessibilityLabel="Email title"
        />
        <Text style={styles.label}>Email body</Text>
        <TextInput
          style={[styles.input, styles.bodyInput]}
          placeholder="Write your message"
          placeholderTextColor="#64748b"
          value={body}
          onChangeText={setBody}
          maxLength={8000}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Email body"
        />
        <Text style={styles.helper}>The body is sent as readable text inside the MVS dark-background email template; HTML entered here is safely escaped.</Text>
        <Pressable style={[styles.sendButton, (selected.length === 0 || sending) && styles.sendDisabled]} onPress={confirmSend} disabled={selected.length === 0 || sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send email</Text>}
        </Pressable>
        {notice ? (
          <Text style={[styles.notice, notice.type === 'error' ? styles.noticeError : styles.noticeSuccess]} accessibilityRole="alert">
            {notice.message}
          </Text>
        ) : null}

        <View style={styles.recipientsSection}>
          <Text style={styles.label}>Find recipients</Text>
          <TextInput
            style={styles.input}
            placeholder="Search by name or email"
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            accessibilityLabel="Search registered app users"
          />
          <View style={styles.chips}>
            {roles.map((item) => {
              const value = item === 'All roles' ? '' : item;
              const active = role === value;
              return (
                <Pressable key={item} style={[styles.chip, active && styles.chipActive]} onPress={() => setRole(value)}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Accounts</Text>
            <Text style={styles.selectedCount}>{selected.length} selected</Text>
            {recipients.length > 0 ? (
              <Pressable
                onPress={() => setSelected((current) => {
                  const selectedIds = new Set(current.map((recipient) => recipient.id));
                  return [...current, ...recipients.filter((recipient) => !selectedIds.has(recipient.id))];
                })}
                disabled={sending || loadingRecipients || loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Select all listed recipients"
              >
                <Text style={styles.selectAll}>Select all</Text>
              </Pressable>
            ) : null}
            {selected.length > 0 ? (
              <Pressable onPress={() => setSelected([])} disabled={sending} accessibilityRole="button" accessibilityLabel="Clear selected recipients">
                <Text style={styles.clearSelection}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          {loadingRecipients ? <ActivityIndicator color="#00C853" style={{ padding: 18 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loadingRecipients && !error && recipients.length === 0 ? <Text style={styles.empty}>No users found. Try a different search.</Text> : null}
          {!loadingRecipients && recipients.map((recipient) => {
            const isSelected = selected.some((item) => item.id === recipient.id);
            const displayRole = recipient.role === 'veterinarian' ? 'vet' : recipient.role || 'unknown role';
            return (
              <Pressable
                key={recipient.id}
                style={[styles.recipient, isSelected && styles.recipientSelected]}
                onPress={() => toggleRecipient(recipient)}
                disabled={sending}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${recipient.email}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recipientName}>{recipient.full_name || recipient.email}</Text>
                  <Text style={styles.recipientEmail}>{recipient.email} · {displayRole}</Text>
                </View>
                <Text style={[styles.choose, isSelected && styles.chooseSelected]}>{isSelected ? 'Selected' : 'Select'}</Text>
              </Pressable>
            );
          })}
          {hasMoreRecipients && !loadingRecipients && !error ? (
            <Pressable style={styles.loadMore} onPress={() => void loadRecipients(recipients.length)} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator color="#00C853" /> : <Text style={styles.loadMoreText}>Load more accounts</Text>}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        visible={confirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!sending) setConfirmationVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmationCard}>
            <Text style={styles.confirmationTitle}>Send this email?</Text>
            <Text style={styles.confirmationMessage}>
              Send “{subject.trim()}” to {selected.length === 1 ? selected[0].email : `${selected.length} recipients`}?
            </Text>
            <View style={styles.confirmationActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setConfirmationVisible(false)}
                disabled={sending}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmSendButton, sending && styles.sendDisabled]}
                onPress={() => void send()}
                disabled={sending}
                accessibilityRole="button"
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send email</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000A14' },
  pageScroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  heading: { color: '#fff', fontSize: 23, fontWeight: '700' },
  label: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: { minHeight: 46, color: '#fff', backgroundColor: '#0f1c2e', borderColor: '#334155', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  bodyInput: { minHeight: 90, maxHeight: 120, paddingTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderColor: '#334155', borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { borderColor: '#00C853', backgroundColor: '#064e3b' },
  chipText: { color: '#cbd5e1', fontSize: 12 },
  chipTextActive: { color: '#fff' },
  helper: { color: '#64748b', fontSize: 11, lineHeight: 15, marginTop: 5 },
  sendButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#008f3b', borderRadius: 8, marginTop: 9 },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  notice: { fontSize: 13, lineHeight: 19, marginTop: 10, padding: 12, borderRadius: 8 },
  noticeError: { color: '#fecaca', backgroundColor: '#451a1a', borderColor: '#7f1d1d', borderWidth: 1 },
  noticeSuccess: { color: '#bbf7d0', backgroundColor: '#052e1b', borderColor: '#166534', borderWidth: 1 },
  recipientsSection: { marginTop: 4 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 6 },
  listTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  selectedCount: { color: '#8a9ba8', fontSize: 12, flex: 1 },
  selectAll: { color: '#00C853', fontSize: 12, fontWeight: '600' },
  clearSelection: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  recipient: { backgroundColor: '#0f1c2e', borderColor: '#1e293b', borderWidth: 1, borderRadius: 8, marginBottom: 7, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recipientSelected: { borderColor: '#00C853', backgroundColor: '#0b2b25' },
  recipientName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  recipientEmail: { color: '#8a9ba8', fontSize: 11, marginTop: 4 },
  choose: { color: '#00C853', fontSize: 12, fontWeight: '600' },
  chooseSelected: { color: '#86efac' },
  empty: { color: '#8a9ba8', padding: 16, textAlign: 'center' },
  error: { color: '#fca5a5', padding: 12 },
  loadMore: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderColor: '#334155', borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  loadMoreText: { color: '#00C853', fontWeight: '600', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)', justifyContent: 'center', padding: 24 },
  confirmationCard: { backgroundColor: '#0f1c2e', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 20 },
  confirmationTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  confirmationMessage: { color: '#cbd5e1', fontSize: 14, lineHeight: 21, marginTop: 10 },
  confirmationActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, borderColor: '#475569', borderWidth: 1 },
  cancelButtonText: { color: '#cbd5e1', fontWeight: '600' },
  confirmSendButton: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#008f3b', borderRadius: 8 },
});
