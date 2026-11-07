import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchVetApplications, setVetApproval, type VetApplication } from '../../lib/admin';

export default function VetApprovalsScreen() {
  const [vets, setVets] = useState<VetApplication[]>([]);
  const [search, setSearch] = useState('');
  const [showApproved, setShowApproved] = useState(false);
  const [selectedVet, setSelectedVet] = useState<VetApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVetId, setSavingVetId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadVets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setVets(await fetchVetApplications(search, showApproved));
    } catch (loadError) {
      console.error('[Vet Approvals] Could not load veterinarian applications:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load veterinarian applications.');
    } finally {
      setLoading(false);
    }
  }, [search, showApproved]);

  useEffect(() => {
    const timer = setTimeout(() => void loadVets(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadVets, search]);

  const approveSelectedVet = async () => {
    if (!selectedVet || savingVetId) return;
    const vet = selectedVet;
    setSavingVetId(vet.id);
    setError('');
    try {
      await setVetApproval(vet.id, true);
      setSelectedVet(null);
      await loadVets();
      const professionalLabel = vet.role === 'paravet' ? 'Veterinary paraprofessional' : 'Veterinarian';
      Alert.alert(`${professionalLabel} approved`, `${vet.full_name || vet.email} can now appear in the client directory.`);
    } catch (saveError) {
      console.error('[Vet Approvals] Could not approve veterinarian:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Could not approve this veterinarian.');
    } finally {
      setSavingVetId(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Veterinary professional approvals</Text>
      <Text style={styles.subtitle}>
        New veterinarian and paraprofessional accounts stay out of the client directory until approved.
      </Text>

      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email, or license"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          style={styles.searchInput}
          accessibilityLabel="Search veterinary professional applications"
        />
      </View>

      <Pressable
        style={styles.filterButton}
        onPress={() => setShowApproved((current) => !current)}
        accessibilityRole="button"
      >
        <Text style={styles.filterText}>{showApproved ? 'Showing approved vets' : 'Showing pending approvals'}</Text>
        <Text style={styles.filterAction}>{showApproved ? 'View pending' : 'View approved'}</Text>
      </Pressable>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void loadVets()}><Text style={styles.retry}>Retry</Text></Pressable>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color="#00C853" style={styles.loader} /> : null}
      {!loading && !error && vets.length === 0 ? (
        <Text style={styles.empty}>
          {showApproved ? 'No approved veterinary professional accounts found.' : 'No pending veterinary professional approvals.'}
        </Text>
      ) : null}

      {vets.map((vet) => (
        <View key={vet.id} style={styles.vetCard}>
          <View style={styles.vetCopy}>
            <Text style={styles.name}>{vet.full_name || 'Name unavailable'}</Text>
            <Text style={styles.meta}>{vet.role === 'paravet' ? 'Licensed veterinary paraprofessional' : 'Veterinarian'}</Text>
            <Text style={styles.email}>{vet.email || 'Email unavailable'}</Text>
            <Text style={styles.meta}>License: {vet.license_number || 'Not provided'}</Text>
            {vet.specialty ? <Text style={styles.meta}>Specialty: {vet.specialty}</Text> : null}
            {vet.phone_number ? <Text style={styles.meta}>Phone: {vet.phone_number}</Text> : null}
            <Text style={styles.created}>Registered {new Date(vet.created_at).toLocaleDateString()}</Text>
          </View>
          {showApproved ? (
            <View style={styles.approvedBadge}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#A7F3D0" />
              <Text style={styles.approvedText}>Approved</Text>
            </View>
          ) : (
            <Pressable
              style={styles.approveButton}
              onPress={() => setSelectedVet(vet)}
              accessibilityRole="button"
              accessibilityLabel={`Approve ${vet.email}`}
            >
              <Text style={styles.approveText}>Approve</Text>
            </Pressable>
          )}
        </View>
      ))}
      {!loading && vets.length === 100 ? (
        <Text style={styles.limitNote}>Showing the first 100 accounts. Refine your search to find a specific veterinarian.</Text>
      ) : null}

      <Modal visible={selectedVet !== null} transparent animationType="fade" onRequestClose={() => setSelectedVet(null)}>
        <View style={styles.modalOverlay}>
          {selectedVet ? (
          <View style={styles.confirmation}>
            <Text style={styles.modalTitle}>Approve this {selectedVet.role === 'paravet' ? 'veterinary paraprofessional' : 'veterinarian'}?</Text>
            <Text style={styles.modalCopy}>
              {selectedVet.full_name || selectedVet.email} will become visible in the client directory.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setSelectedVet(null)} disabled={savingVetId !== null}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmButton}
                onPress={() => void approveSelectedVet()}
                disabled={savingVetId !== null}
              >
                {savingVetId === selectedVet.id
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.confirmText}>Approve</Text>}
              </Pressable>
            </View>
          </View>
          ) : null}
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
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#0F1C2E', borderColor: '#1E293B', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, color: '#FFFFFF', paddingVertical: 10, fontSize: 14 },
  filterButton: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, backgroundColor: '#0F1C2E', borderColor: '#1E293B', borderWidth: 1, borderRadius: 9, marginBottom: 14 },
  filterText: { color: '#CBD5E1', fontSize: 12, fontWeight: '600' },
  filterAction: { color: '#00C853', fontSize: 12, fontWeight: '700' },
  vetCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0F1C2E', borderColor: '#1E293B', borderWidth: 1, borderRadius: 10, padding: 13, marginBottom: 9 },
  vetCopy: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  email: { color: '#CBD5E1', fontSize: 12, marginTop: 3 },
  meta: { color: '#8A9BA8', fontSize: 11, marginTop: 5 },
  created: { color: '#64748B', fontSize: 10, marginTop: 6 },
  approveButton: { backgroundColor: '#065F46', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9 },
  approveText: { color: '#A7F3D0', fontSize: 12, fontWeight: '700' },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#065F4630', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  approvedText: { color: '#A7F3D0', fontSize: 11, fontWeight: '700' },
  loader: { marginVertical: 26 },
  empty: { color: '#8A9BA8', textAlign: 'center', paddingVertical: 24 },
  errorBox: { backgroundColor: '#3F1D25', borderRadius: 9, padding: 12, marginBottom: 12 },
  errorText: { color: '#FECACA', fontSize: 12 },
  retry: { color: '#6EE7B7', fontWeight: '700', marginTop: 8 },
  limitNote: { color: '#8A9BA8', fontSize: 11, lineHeight: 16, marginTop: 7 },
  modalOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', padding: 22, backgroundColor: '#000000B8' },
  confirmation: { backgroundColor: '#0F1C2E', borderColor: '#334155', borderWidth: 1, borderRadius: 14, padding: 18 },
  modalTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  modalCopy: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, marginTop: 9 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancelButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: '#CBD5E1', fontWeight: '600' },
  confirmButton: { backgroundColor: '#047857', borderRadius: 8, minWidth: 110, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  confirmText: { color: '#FFFFFF', fontWeight: '700' },
});
