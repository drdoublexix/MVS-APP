import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getNinVerificationErrorMessage } from '../lib/ninVerification';
import { supabase } from '../lib/supabase';

type NinVerification = {
  verificationId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  ninSuffix: string;
};

export default function NinVerificationFields({
  verified,
  fullName,
  onVerified,
}: {
  verified: boolean;
  fullName: string;
  onVerified: (verification: NinVerification) => void;
}) {
  const [nin, setNin] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingVerification, setPendingVerification] = useState<NinVerification | null>(null);

  const verifyNin = async () => {
    if (!consent) {
      setError('Consent is required before verifying your NIN.');
      return;
    }
    if (!/^\d{11}$/.test(nin)) {
      setError('Enter your 11-digit NIN.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data, error: requestError } = await supabase.functions.invoke('verify-nin', {
        body: { nin, consent: true, mode: 'profile' },
      });
      if (requestError) throw requestError;
      if (
        typeof data?.verificationId !== 'string' ||
        typeof data.firstName !== 'string' ||
        typeof data.lastName !== 'string' ||
        typeof data.ninSuffix !== 'string'
      ) {
        throw new Error('NIN verification returned incomplete details. Please try again.');
      }

      const verification = {
        verificationId: data.verificationId,
        firstName: data.firstName.trim(),
        middleName: typeof data.middleName === 'string' ? data.middleName.trim() : '',
        lastName: data.lastName.trim(),
        ninSuffix: data.ninSuffix,
      };
      if (!verification.firstName || !verification.lastName) {
        throw new Error('The NIN record did not include a first and last name.');
      }
      setPendingVerification(verification);
      onVerified(verification);
    } catch (verificationError) {
      setError(getNinVerificationErrorMessage(verificationError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>National Identification Number (NIN)</Text>
      {verified ? (
        <View style={styles.verifiedBox}>
          <Text style={styles.verifiedTitle}>NIN verified · •••••••{pendingVerification?.ninSuffix || '****'}</Text>
          <Text style={styles.name}>{fullName || 'Your verified name'}</Text>
          <Text style={styles.hint}>Your NIN and legal name are permanently locked to this account.</Text>
        </View>
      ) : pendingVerification ? (
        <View style={styles.verifiedBox}>
          <Text style={styles.verifiedTitle}>NIN verified · •••••••{pendingVerification.ninSuffix}</Text>
          <Text style={styles.name}>
            {[pendingVerification.firstName, pendingVerification.middleName, pendingVerification.lastName].filter(Boolean).join(' ')}
          </Text>
          <Text style={styles.hint}>Save your profile to permanently link this NIN to your account.</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={nin}
            onChangeText={(value) => {
              setNin(value.replace(/\D/g, '').slice(0, 11));
              setError('');
            }}
            placeholder="Enter your 11-digit NIN"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={11}
            accessibilityLabel="National Identification Number"
          />
          <TouchableOpacity
            style={styles.consentRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent((accepted) => !accepted)}
          >
            <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
              {consent ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.hint}>I consent to having my NIN verified and my legal name and NIN stored with my MVS account.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.verifyButton} onPress={() => void verifyNin()} disabled={loading || !consent}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.verifyText}>Verify NIN</Text>}
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9, marginBottom: 8 },
  label: { color: '#CBD5E1', fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 9, color: '#FFFFFF', padding: 13, fontSize: 15 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  checkbox: { width: 19, height: 19, borderColor: '#64748B', borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  hint: { flex: 1, color: '#94A3B8', fontSize: 12, lineHeight: 17 },
  verifyButton: { backgroundColor: '#0F766E', alignItems: 'center', borderRadius: 9, padding: 12 },
  verifyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  verifiedBox: { backgroundColor: '#0F2C2B', borderColor: '#10B981', borderWidth: 1, borderRadius: 9, padding: 12, gap: 4 },
  verifiedTitle: { color: '#6EE7B7', fontSize: 12, fontWeight: '700' },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  error: { color: '#FCA5A5', fontSize: 12 },
});
