import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Print from 'expo-print';
import QRCode from 'react-native-qrcode-svg';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type Svg from 'react-native-svg';
import { createDigitalPassportHtml, getPublicDigitalPassport, type DigitalPassport } from '../../lib/digitalPassports';

const formatDate = (date: string | null) => date
  ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : 'Not scheduled';

const PASSPORT_BASE_URL = 'https://mvsapp.com.ng/passport';

export default function PublicDigitalPassport() {
  const { id, token } = useLocalSearchParams<{ id: string; token?: string }>();
  const [passport, setPassport] = useState<DigitalPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const qrSvgRef = useRef<Svg | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadPassport = async () => {
      setLoading(true);
      setError(false);
      setPassport(null);
      if (!id || !token) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }
      try {
        const data = await getPublicDigitalPassport(id, token);
        if (mounted) setPassport(data);
      } catch (requestError) {
        console.error('[Public Digital Passport] Could not fetch passport:', requestError);
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadPassport();
    return () => { mounted = false; };
  }, [id, token, reloadKey]);

  const vaccinations = passport?.medical_records.filter((record) => record.treatment_type.toLowerCase().includes('vaccin')) || [];
  const deworming = passport?.medical_records.filter((record) => record.treatment_type.toLowerCase().includes('deworm')) || [];
  const otherRecords = passport?.medical_records.filter((record) => (
    !record.treatment_type.toLowerCase().includes('vaccin')
    && !record.treatment_type.toLowerCase().includes('deworm')
  )) || [];
  const passportUrl = passport && token
    ? `${PASSPORT_BASE_URL}/${passport.id}?token=${encodeURIComponent(token)}`
    : null;

  const printPassport = async () => {
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({});
        return;
      }
      if (!passport || !passportUrl) throw new Error('The passport is not ready to print.');
      if (!qrSvgRef.current) throw new Error('The passport QR code is not ready yet.');
      const qrImage = await new Promise<string>((resolve) => qrSvgRef.current?.toDataURL(resolve));
      await Print.printAsync({ html: createDigitalPassportHtml(passport, passportUrl, qrImage) });
    } catch (printError) {
      console.error('[Public Digital Passport] Could not print passport:', printError);
      const message = 'Could not open the print dialog. Please try again.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Could not print passport', message);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <MaterialCommunityIcons name="shield-check" size={30} color="#10B981" />
        <Text style={styles.brandName}>MVS DIGITAL HEALTH PASSPORT</Text>
      </View>
      {loading ? <ActivityIndicator color="#10B981" size="large" style={styles.loader} /> : !passport ? (
        <View style={styles.messageCard}>
          <MaterialCommunityIcons name={error ? 'wifi-alert' : 'alert-circle-outline'} size={30} color="#FCA5A5" />
          <Text style={styles.messageTitle}>{error ? 'Passport unavailable' : 'Passport not found'}</Text>
          <Text style={styles.muted}>{error ? 'We could not verify this passport right now. Check your connection and scan again.' : 'This link is invalid or the passport is no longer public.'}</Text>
          {error ? <Pressable style={styles.retryButton} onPress={() => setReloadKey((key) => key + 1)}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
        </View>
      ) : (
        <>
          <View style={styles.certificate}>
            <View style={styles.verifiedBanner}>
              <MaterialCommunityIcons name="check-decagram" size={21} color="#6EE7B7" />
              <Text style={styles.verifiedText}>MVS DIGITAL HEALTH PASSPORT · RECORD VERIFIED</Text>
            </View>
            <Text style={styles.name}>{passport.name}</Text>
            <Text style={styles.species}>
              {passport.species}{passport.species_verified ? ' · Verified' : ' · Not yet verified'}
              {'\n'}{passport.breed || 'Breed not recorded'}{passport.breed_verified ? ' · Verified' : ''}
            </Text>
            {passport.species_verified_by?.name ? (
              <View style={styles.verifier}>
                <Text style={styles.muted}>Species verified by {passport.species_verified_by.name}</Text>
                {passport.species_verified_by.email ? <Text style={styles.muted}>Email: {passport.species_verified_by.email}</Text> : null}
              </View>
            ) : null}
            {passport.breed_verified_by?.name && passport.breed_verified ? (
              <View style={styles.verifier}>
                <Text style={styles.muted}>Breed verified by {passport.breed_verified_by.name}</Text>
                {passport.breed_verified_by.email ? <Text style={styles.muted}>Email: {passport.breed_verified_by.email}</Text> : null}
              </View>
            ) : null}
            <View style={styles.divider} />
            <Info label="Record type" value={passport.record_type === 'pet' ? 'Pet record' : 'Farm / livestock record'} />
            {passport.flock_size ? <Info label="Recorded herd / flock size" value={String(passport.flock_size)} /> : null}
            <Info label="Owner" value={passport.owner_name} />
            <Info label="Current medical status" value={passport.active_medical_status} />
            {passport.vaccination_status_reported ? <Info label="Owner-reported vaccination status" value={passport.vaccination_status_reported} /> : null}
            {passport.record_details.date_of_birth ? <Info label="Date of birth" value={formatDate(passport.record_details.date_of_birth)} /> : null}
            {passport.record_details.medical_notes ? <Info label="Medical notes" value={passport.record_details.medical_notes} /> : null}
            {passport.record_details.location ? <Info label="Location" value={passport.record_details.location} /> : null}
            {passport.record_details.restock_date ? <Info label="Restock date" value={formatDate(passport.record_details.restock_date)} /> : null}
            {passport.record_details.medical_log ? <Info label="Medical log" value={passport.record_details.medical_log} /> : null}
            {passport.record_details.production_summary ? <Info label="Production summary" value={passport.record_details.production_summary} /> : null}
            <Text style={styles.disclaimer}>Species and breed are explicitly marked when verified by an MVS-verified veterinarian. Medical entries below are veterinarian-entered; a verified badge indicates an MVS-verified veterinarian profile.</Text>
          </View>

          {passportUrl ? (
            <View style={styles.qrCard}>
              <QRCode getRef={(element) => { qrSvgRef.current = element; }} value={passportUrl} size={160} backgroundColor="#FFFFFF" color="#0B132B" />
              <Text style={styles.muted}>Scan this code to verify and view this passport.</Text>
            </View>
          ) : null}
          <Pressable style={styles.printButton} onPress={() => void printPassport()}>
            <MaterialCommunityIcons name="download" size={19} color="#FFFFFF" />
            <Text style={styles.printText}>Download / Print Passport</Text>
          </Pressable>

          <MedicalSection title="Vaccination history" records={vaccinations} empty="No veterinarian-entered vaccination records." />
          <MedicalSection title="Deworming history" records={deworming} empty="No veterinarian-entered deworming records." />
          {otherRecords.length > 0 ? <MedicalSection title="Other medical records" records={otherRecords} empty="" /> : null}

          <Text style={styles.footer}>MVS confirms that this information matches a valid passport record. This certificate is read-only and does not replace veterinary advice.</Text>
        </>
      )}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function MedicalSection({ title, records, empty }: { title: string; records: DigitalPassport['medical_records']; empty: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {records.length === 0 ? <Text style={styles.muted}>{empty}</Text> : records.map((record, index) => (
        <View key={`${record.administered_date}-${record.title}-${index}`} style={styles.record}>
          <Text style={styles.recordTitle}>{record.title}</Text>
          <Text style={styles.muted}>{record.treatment_type} · Administered {formatDate(record.administered_date)}</Text>
          {record.dose_series_number && record.total_series_doses && record.total_series_doses > 1 ? (
            <Text style={styles.muted}>Dose {record.dose_series_number} of {record.total_series_doses}</Text>
          ) : null}
          {record.dosage ? <Text style={styles.muted}>Dosage: {record.dosage}</Text> : null}
          {record.next_due_date ? <Text style={styles.due}>Next due: {formatDate(record.next_due_date)}</Text> : null}
          {record.status ? <Text style={styles.muted}>Status: {record.status}</Text> : null}
          <Text style={styles.followUp}>{record.follow_up_status}</Text>
          {record.notes ? <Text style={styles.muted}>Notes: {record.notes}</Text> : null}
          <Text style={styles.vet}>Vet: {record.vet_name}</Text>
          {record.vet_email ? <Text style={styles.vet}>Email: {record.vet_email}</Text> : null}
          {record.vet_verified ? <Text style={styles.vetVerified}>MVS-verified veterinarian</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#07111F' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 20 },
  brandName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  loader: { padding: 48 },
  messageCard: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 14, backgroundColor: '#0F1C2E', borderWidth: 1, borderColor: '#1E293B' },
  messageTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  retryButton: { marginTop: 7, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#047857' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  muted: { color: '#94A3B8', fontSize: 13, lineHeight: 19, marginTop: 4 },
  certificate: { padding: 20, backgroundColor: '#0F1C2E', borderRadius: 14, borderWidth: 1, borderColor: '#1E293B' },
  verifiedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  verifiedText: { color: '#6EE7B7', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  name: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  species: { color: '#CBD5E1', fontSize: 14, marginTop: 5 },
  verifier: { marginTop: 7 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 16 },
  infoRow: { marginBottom: 12 },
  infoLabel: { color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 4 },
  disclaimer: { color: '#94A3B8', fontSize: 11, lineHeight: 16, marginTop: 8 },
  qrCard: { alignItems: 'center', gap: 10, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 12, marginTop: 14 },
  printButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#047857', borderRadius: 10, marginTop: 14 },
  printText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  section: { padding: 16, backgroundColor: '#0F1C2E', borderRadius: 12, borderWidth: 1, borderColor: '#1E293B', marginTop: 14 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  record: { borderTopWidth: 1, borderTopColor: '#263449', paddingVertical: 12 },
  recordTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  due: { color: '#FCD34D', fontSize: 12, marginTop: 4 },
  followUp: { color: '#6EE7B7', fontSize: 12, fontWeight: '700', marginTop: 4 },
  vet: { color: '#CBD5E1', fontSize: 12, marginTop: 7 },
  vetVerified: { color: '#6EE7B7', fontSize: 11, fontWeight: '700', marginTop: 3 },
  footer: { color: '#64748B', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },
});
