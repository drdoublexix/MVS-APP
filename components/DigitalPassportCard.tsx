import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type Svg from 'react-native-svg';
import { createDigitalPassportHtml, getPublicDigitalPassport, type DigitalPassport } from '../lib/digitalPassports';
import { supabase } from '../lib/supabase';

export type { DigitalPassport, PassportMedicalRecord, PassportSoapRecord } from '../lib/digitalPassports';

type Props = {
  recordId: string;
  recordType: 'pet' | 'farm';
};

const PASSPORT_BASE_URL = 'https://mvsapp.com.ng/passport';

export default function DigitalPassportCard({ recordId, recordType }: Props) {
  const [passportId, setPassportId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [passport, setPassport] = useState<DigitalPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const qrSvgRef = useRef<Svg | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPassportId(null);
      setAccessToken(null);
      setPassport(null);
      try {
        const passportColumn = recordType === 'pet' ? 'pet_id' : 'farm_record_id';
        const { data, error: passportError } = await supabase
          .from('digital_passports')
          .select('id, access_token')
          .eq(passportColumn, recordId)
          .maybeSingle();
        if (passportError) throw passportError;
        if (!data) {
          if (mounted) setError('This record does not have a passport yet.');
          return;
        }

        const details = await getPublicDigitalPassport(data.id, data.access_token);
        if (!details) throw new Error('This passport could not be verified.');
        if (mounted) {
          setPassportId(data.id);
          setAccessToken(data.access_token);
          setPassport(details);
        }
      } catch (loadError) {
        console.error('[Digital Passport] Could not load passport:', loadError);
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Could not load this passport. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [recordId, recordType, reloadKey]);

  const passportUrl = useMemo(() => passportId && accessToken
    ? `${PASSPORT_BASE_URL}/${passportId}?token=${encodeURIComponent(accessToken)}`
    : null, [accessToken, passportId]);

  const sharePassport = async () => {
    if (!passport || !passportUrl) return;
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        const passportWindow = window.open(passportUrl, '_blank');
        if (!passportWindow) throw new Error('Allow pop-ups to open the printable passport.');
        passportWindow.opener = null;
        return;
      }
      if (!qrSvgRef.current) throw new Error('The passport QR code is not ready yet.');
      const qrImage = await new Promise<string>((resolve) => qrSvgRef.current?.toDataURL(resolve));
      const html = createDigitalPassportHtml(passport, passportUrl, qrImage);
      const file = await Print.printToFileAsync({ html });
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Share Digital Health Passport' });
    } catch (reason) {
      console.error('[Digital Passport] Could not export passport:', reason);
      const message = reason instanceof Error ? reason.message : 'Could not export this passport.';
      if (Platform.OS === 'web') window.alert(`Passport export failed\n\n${message}`);
      else Alert.alert('Passport export failed', message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="shield-check" size={22} color="#10B981" />
        <View style={styles.headerText}>
          <Text style={styles.title}>Digital Health Passport</Text>
          <Text style={styles.subtitle}>Secure, read-only MVS medical record</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator color="#10B981" style={styles.loader} /> : error ? (
        <View>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => setReloadKey((key) => key + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : passport && passportUrl ? (
        <>
          <View style={styles.qrArea}>
            <QRCode getRef={(element) => { qrSvgRef.current = element; }} value={passportUrl} size={168} backgroundColor="#FFFFFF" color="#0B132B" />
            <Text style={styles.scanText}>Scan to view this verified MVS record</Text>
          </View>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{passport.name}</Text>
            <Text style={styles.summaryLine}>
              {passport.species}{passport.species_verified ? ' · species verified' : ' · species not yet verified'}
              {' · '}{passport.breed || 'Breed not recorded'}{passport.breed_verified ? ' · breed verified' : ''}
            </Text>
            <Text style={styles.summaryLine}>
              {passport.medical_records.length} medical treatment record{passport.medical_records.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.status}>{passport.active_medical_status}</Text>
          </View>
          <Pressable style={styles.shareButton} onPress={() => void sharePassport()} disabled={sharing}>
            {sharing ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialCommunityIcons name="share-variant" size={18} color="#FFFFFF" /><Text style={styles.shareText}>View / Share / Download Passport</Text></>}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 14, backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  subtitle: { color: '#94A3B8', fontSize: 11, marginTop: 3 },
  loader: { padding: 18 },
  error: { color: '#FCA5A5', fontSize: 12, marginTop: 12 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6 },
  retryText: { color: '#6EE7B7', fontSize: 12, fontWeight: '700' },
  qrArea: { alignItems: 'center', gap: 8, marginVertical: 16 },
  scanText: { color: '#94A3B8', fontSize: 11, textAlign: 'center' },
  summary: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12, gap: 5 },
  summaryTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  summaryLine: { color: '#CBD5E1', fontSize: 12 },
  status: { color: '#6EE7B7', fontSize: 12, fontWeight: '600', marginTop: 3 },
  shareButton: { minHeight: 44, marginTop: 14, borderRadius: 8, backgroundColor: '#047857', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
