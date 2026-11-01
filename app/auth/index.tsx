import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getProfileRole, getRoleNavPath, sendPasswordResetLink, supabase } from '../../lib/supabase';
import { languageOptions, useLanguage } from '../../lib/language';
import { getNinVerificationErrorMessage } from '../../lib/ninVerification';

type Role = 'client' | 'vet' | 'merchant';
type AuthMode = 'sign-in' | 'sign-up';
type VerifiedIdentity = {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  verificationId: string;
};
const VERIFIED_NOTICE_KEY = 'mvs_verified_auth_notice';
const PRODUCTION_AUTH_URL = 'https://mvsapp.com.ng/auth?mode=signin';
const PRIVACY_POLICY_URL = 'https://www.mvsc.com.ng/privacyPolicy';

const normalizeNigerianPhoneInput = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('234')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

const getAuthRedirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `${window.location.origin}/auth?mode=signin`;
  }
  return PRODUCTION_AUTH_URL;
};

const getPasswordResetRedirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `${window.location.origin}/reset-password`;
  }
  return 'https://mvsapp.com.ng/reset-password';
};

const getWebHashParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location?.hash) {
    return null;
  }
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
};

const getVerifiedNotice = () => {
  if (typeof window === 'undefined') return { email: '', exists: false };
  try {
    const rawNotice = window.sessionStorage.getItem(VERIFIED_NOTICE_KEY);
    if (!rawNotice) return { email: '', exists: false };
    window.sessionStorage.removeItem(VERIFIED_NOTICE_KEY);
    const notice = JSON.parse(rawNotice) as { email?: string };
    return { email: notice.email || '', exists: true };
  } catch {
    return { email: '', exists: false };
  }
};

export default function AuthScreen() {
  const { language, ready: languageReady, selectLanguage, t } = useLanguage();
  const router = useRouter();
  const { code, mode: modeParam, type: typeParam, suspended } = useLocalSearchParams<{ code?: string; mode?: string; type?: string; suspended?: string }>();
  const hashValues = getWebHashParams();
  const hasHashSession = Boolean(hashValues?.get('access_token') && hashValues.get('refresh_token'));
  const verifiedNotice = getVerifiedNotice();
  const isAuthRedirect = Boolean(code || hasHashSession);
  const isVerificationState = isAuthRedirect || verifiedNotice.exists || typeParam === 'signup' || typeParam === 'email_confirmation';
  const initialMode: AuthMode = isVerificationState || modeParam === 'signin' ? 'sign-in' : 'sign-up';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<Role>('client');
  const [email, setEmail] = useState(verifiedNotice.email);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nin, setNin] = useState('');
  const [ninConsent, setNinConsent] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [verifiedIdentity, setVerifiedIdentity] = useState<VerifiedIdentity | null>(null);
  const [ninLoading, setNinLoading] = useState(false);
  const [loading, setLoading] = useState(Boolean(code || hasHashSession));
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; title: string; message: string } | null>(
    suspended === '1'
      ? { kind: 'error', title: 'Account suspended', message: 'This account has been suspended. Contact MVS Support if you believe this is a mistake.' }
      : verifiedNotice.exists || typeParam === 'signup' || typeParam === 'email_confirmation'
        ? { kind: 'success', title: 'Email verified', message: 'Email successfully verified! Please sign in to your account.' }
        : null,
  );
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetNotice, setResetNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const hashValues = getWebHashParams();
    const accessToken = hashValues?.get('access_token');
    const refreshToken = hashValues?.get('refresh_token');
    if (!code && !hasHashSession) return;

    let mounted = true;
    const finishAuthRedirect = async () => {
      const exchangeError = code
        ? (await supabase.auth.exchangeCodeForSession(code)).error
        : (!accessToken || !refreshToken)
          ? new Error('The confirmation link is missing session tokens.')
          : (await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })).error;
      if (!mounted) return;
      if (exchangeError) setError(exchangeError.message);
      setLoading(false);
      if (!exchangeError) {
        const { data: { session } } = await supabase.auth.getSession();
        const verifiedEmail = session?.user?.email || '';
        if (verifiedEmail) {
          setEmail(verifiedEmail);
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(VERIFIED_NOTICE_KEY, JSON.stringify({ email: verifiedEmail }));
          }
        }
        await supabase.auth.signOut();
        setMode('sign-in');
        router.replace({ pathname: '/auth', params: { mode: 'signin' } });
        setNotice({ kind: 'success', title: 'Email verified', message: 'Email successfully verified! Please sign in to your account.' });
      }
    };

    void finishAuthRedirect();
    return () => {
      mounted = false;
    };
  }, [code, hasHashSession, router]);

  const updateMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setResetNotice(null);
    router.replace({ pathname: '/auth', params: { mode: nextMode === 'sign-in' ? 'signin' : 'signup' } });
  };

  const verifyNin = async () => {
    const cleanNin = nin.replace(/\D/g, '');
    if (!ninConsent) {
      setError('Please consent to NIN verification before continuing.');
      return;
    }
    if (!/^\d{11}$/.test(cleanNin)) {
      setError('Enter your 11-digit NIN to continue.');
      return;
    }

    setNinLoading(true);
    setError('');
    setVerifiedIdentity(null);
    try {
      const { data, error: verificationError } = await supabase.functions.invoke('verify-nin', {
        body: { nin: cleanNin, consent: true },
      });
      if (verificationError) throw verificationError;
      if (
        !data ||
        typeof data.verificationId !== 'string' ||
        typeof data.firstName !== 'string' ||
        typeof data.lastName !== 'string'
      ) {
        throw new Error('NIN verification returned incomplete identity details. Please try again.');
      }

      const firstName = data.firstName.trim();
      const middleName = typeof data.middleName === 'string' ? data.middleName.trim() : '';
      const lastName = data.lastName.trim();
      if (!firstName || !lastName) {
        throw new Error('The NIN record did not include a first and last name.');
      }

      setNin(cleanNin);
      setVerifiedIdentity({
        firstName,
        middleName,
        lastName,
        fullName: [firstName, middleName, lastName].filter(Boolean).join(' '),
        verificationId: data.verificationId,
      });
    } catch (verificationError) {
      setError(getNinVerificationErrorMessage(verificationError));
    } finally {
      setNinLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setResetNotice({ kind: 'error', message: 'Enter your email to receive a password reset link.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setResetNotice({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }

    setResetLoading(true);
    setResetNotice(null);
    try {
      await sendPasswordResetLink(trimmedEmail, getPasswordResetRedirectUrl());
      setResetNotice({ kind: 'success', message: 'Password reset instructions were sent. Check your inbox or spam folder.' });
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'We could not send a password reset link. Please try again.';
      setResetNotice({ kind: 'error', message });
    } finally {
      setResetLoading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    setNotice(null);
    setPasswordError('');

    try {
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) throw new Error(t('auth.emailRequired'));
      if (mode === 'sign-up' && !policyAccepted) {
        throw new Error('Please accept the Terms and Policy before creating an account.');
      }
      if (mode === 'sign-up' && (!verifiedIdentity || !ninConsent)) {
        throw new Error('Verify your NIN before creating your account.');
      }
      if (mode === 'sign-up' && !/^[789]\d{9}$/.test(phoneNumber)) {
        throw new Error(t('auth.invalidPhone'));
      }
      if (mode === 'sign-up' && role === 'vet' && !licenseNumber.trim()) {
        throw new Error(t('auth.vcnRequired'));
      }
      if (mode === 'sign-up' && !/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])/.test(password)) {
        const validationMessage = 'Password must include an uppercase letter, lowercase letter, number, and special symbol (@$!%*?&).';
        setPasswordError(validationMessage);
        throw new Error(validationMessage);
      }

      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: verifiedIdentity!.fullName,
              first_name: verifiedIdentity!.firstName,
              middle_name: verifiedIdentity!.middleName,
              last_name: verifiedIdentity!.lastName,
              nin_verification_id: verifiedIdentity!.verificationId,
              phone_number: `+234${phoneNumber}`,
              role,
              preferred_language: language,
              ...(role === 'vet' ? { license_number: licenseNumber.trim() } : {}),
            },
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });
        if (signUpError) throw signUpError;
        setNotice({
          kind: 'success',
          title: 'Account created successfully',
          message: data.session
            ? 'Your account is ready. You are now being redirected to your workspace.'
            : 'Check your email for a confirmation link to verify your account before signing in. Don’t forget to check your spam folder if it doesn’t show up in your inbox!',
        });
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
        if (!signInData.user) throw new Error('Sign-in completed without an active user session.');
        const profileRole = await getProfileRole(signInData.user.id);
        if (!profileRole) throw new Error('Your account profile is still being prepared. Please try signing in again shortly.');
        router.replace(getRoleNavPath(profileRole));
      }
    } catch (submitError) {
      const rawError = submitError instanceof Error ? submitError.message : 'Authentication failed. Please try again.';
      const nextError = /banned|suspend/i.test(rawError)
        ? 'This account has been suspended. Contact MVS Support if you believe this is a mistake.'
        : rawError;
      setError(nextError);
      setNotice({
        kind: 'error',
        title: mode === 'sign-up' ? 'Account creation failed' : 'Sign-in failed',
        message: nextError,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#10B981" size="large" />
        <Text style={styles.loadingText}>Connecting to MVS...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.content}>
        <View style={styles.logoFrame}>
          <Image source={require('../../assets/images/mvsfp.jpeg')} resizeMode="contain" style={styles.logo} />
        </View>
        <Text style={styles.eyebrow}>{t('auth.eyebrow')}</Text>
        <Text style={styles.title}>{t('auth.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        {mode === 'sign-up' ? (
          <View style={styles.languageChooser}>
            <Text style={styles.languageTitle}>{t('auth.selectLanguage')}</Text>
            <View style={styles.languageOptions}>
              {languageOptions.map((option) => {
                const selected = language === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: !languageReady }}
                    disabled={!languageReady}
                    onPress={() => {
                      void selectLanguage(option.value).catch((languageError) => {
                        console.error('[Auth] Could not save selected language:', languageError);
                        setError(t('settings.languageSaveFailed'));
                      });
                    }}
                    style={[styles.languageOption, selected && styles.languageOptionSelected]}
                  >
                    <Text style={[styles.languageOptionText, selected && styles.languageOptionTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
        <View style={styles.modeSwitch}>
          <TouchableOpacity style={[styles.modeButton, mode === 'sign-in' && styles.activeMode]} onPress={() => updateMode('sign-in')}>
            <Text style={[styles.modeText, mode === 'sign-in' && styles.activeModeText]}>{t('auth.signIn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeButton, mode === 'sign-up' && styles.activeMode]} onPress={() => updateMode('sign-up')}>
            <Text style={[styles.modeText, mode === 'sign-up' && styles.activeModeText]}>{t('auth.createAccount')}</Text>
          </TouchableOpacity>
        </View>

        {mode === 'sign-up' ? <Text style={styles.registrationPrompt}>{t('auth.registrationType')}</Text> : null}

        {mode === 'sign-up' ? (
          <View style={styles.ninVerification}>
            <Text style={styles.ninLabel}>National Identification Number (NIN)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your 11-digit NIN"
              placeholderTextColor="#718096"
              value={verifiedIdentity ? `•••••••${nin.slice(-4)}` : nin}
              onChangeText={(value) => {
                setNin(value.replace(/\D/g, '').slice(0, 11));
                setVerifiedIdentity(null);
                setError('');
              }}
              editable={!ninLoading && !verifiedIdentity}
              keyboardType="number-pad"
              maxLength={11}
              accessibilityLabel="National Identification Number"
            />
            <TouchableOpacity
              style={styles.ninConsent}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ninConsent }}
              onPress={() => {
                if (ninConsent) {
                  setNinConsent(false);
                  setVerifiedIdentity(null);
                  setNin('');
                } else {
                  setNinConsent(true);
                }
              }}
            >
              <View style={[styles.ninConsentCheck, ninConsent && styles.ninConsentChecked]}>
                {ninConsent ? <Text style={styles.ninConsentCheckmark}>✓</Text> : null}
              </View>
              <Text style={styles.ninConsentText}>
                I consent to checking my NIN with Prembly and storing my NIN and verified legal name in my MVS profile.
              </Text>
            </TouchableOpacity>
            {verifiedIdentity ? (
              <View style={styles.verifiedIdentity}>
                <Text style={styles.verifiedIdentityLabel}>Verified legal name</Text>
                <Text style={styles.verifiedIdentityName}>{verifiedIdentity.fullName}</Text>
                <Text style={styles.verifiedIdentityHint}>This name and NIN are locked to your account.</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    setVerifiedIdentity(null);
                    setNin('');
                  }}
                >
                  <Text style={styles.changeNinText}>Use a different NIN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.verifyNinButton} onPress={() => void verifyNin()} disabled={ninLoading || !ninConsent}>
                {ninLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.verifyNinText}>Verify NIN</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {mode === 'sign-up' && verifiedIdentity ? (
          <View style={styles.roles}>
            {(['client', 'vet', 'merchant'] as Role[]).map((roleOption) => (
              <TouchableOpacity key={roleOption} style={[styles.role, role === roleOption && styles.selectedRole]} onPress={() => setRole(roleOption)}>
                <Text style={[styles.roleText, role === roleOption && styles.selectedRoleText]}>{t(roleOption === 'client' ? 'auth.petOwner' : roleOption === 'vet' ? 'auth.veterinarian' : 'auth.merchant')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {(mode === 'sign-in' || verifiedIdentity) ? <TextInput style={styles.input} placeholder={t('auth.email')} placeholderTextColor="#718096" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} /> : null}
        {mode === 'sign-up' && verifiedIdentity ? (
          <View style={styles.phoneInputContainer}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>+234</Text>
            </View>
            <TextInput
              accessibilityLabel={t('auth.phone')}
              style={styles.phoneInput}
              placeholder="9012345678"
              placeholderTextColor="#718096"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={(value) => setPhoneNumber(normalizeNigerianPhoneInput(value))}
            />
          </View>
        ) : null}
        {mode === 'sign-up' && verifiedIdentity && role === 'vet' ? (
          <TextInput
            accessibilityLabel="Veterinary Council of Nigeria (VCN) number"
            style={styles.input}
            placeholder={t('auth.vcn')}
            placeholderTextColor="#718096"
            value={licenseNumber}
            onChangeText={setLicenseNumber}
          />
        ) : null}
        {(mode === 'sign-in' || verifiedIdentity) ? <View style={styles.passwordInputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t('auth.password')}
            placeholderTextColor="#718096"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError('');
            }}
          />
          <TouchableOpacity
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            onPress={() => setShowPassword((visible) => !visible)}
            style={styles.passwordToggle}
          >
            {showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
          </TouchableOpacity>
        </View> : null}
        {mode === 'sign-up' && verifiedIdentity ? <Text style={styles.passwordHint}>{t('auth.passwordHint')}</Text> : null}
        {passwordError ? <Text style={styles.passwordError}>{passwordError}</Text> : null}

        {mode === 'sign-in' ? (
          <View style={styles.forgotPasswordRow}>
            <TouchableOpacity onPress={() => void handleForgotPassword()} disabled={resetLoading || !email.trim()}>
              <Text style={[styles.forgotPasswordText, (resetLoading || !email.trim()) && styles.forgotPasswordTextDisabled]}>
                {resetLoading ? 'Sending...' : 'Forgot password?'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {resetNotice ? (
          <Text style={[styles.resetNotice, resetNotice.kind === 'success' ? styles.resetNoticeSuccess : styles.resetNoticeError]}>
            {resetNotice.message}
          </Text>
        ) : null}

        {mode === 'sign-up' && verifiedIdentity ? (
          <TouchableOpacity
            style={styles.policyConsent}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: policyAccepted }}
            onPress={() => setPolicyAccepted((accepted) => !accepted)}
          >
            <View style={[styles.ninConsentCheck, policyAccepted && styles.ninConsentChecked]}>
              {policyAccepted ? <Text style={styles.ninConsentCheckmark}>✓</Text> : null}
            </View>
            <Text style={styles.ninConsentText}>
              I have read and agree to the{' '}
              <Text
                style={styles.policyLink}
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(PRIVACY_POLICY_URL).catch((linkError) => {
                    console.error('[Auth] Could not open privacy policy:', linkError);
                    setError('The Privacy Policy could not be opened. Please try again.');
                  });
                }}
              >
                Terms and Policy
              </Text>
              .
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.modeHelper}>
          {mode === 'sign-in' ? t('auth.welcomeBack') : t('auth.fillDetails')}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {(mode === 'sign-in' || verifiedIdentity) ? <TouchableOpacity style={styles.primaryButton} onPress={() => void submit()} disabled={loading || (mode === 'sign-up' && !policyAccepted)}>
          <Text style={styles.primaryText}>{mode === 'sign-up' ? t('auth.submitSignUp') : t('auth.submitSignIn')}</Text>
        </TouchableOpacity> : null}
        </View>
      </ScrollView>

      <Modal visible={Boolean(notice)} transparent animationType="fade" onRequestClose={() => setNotice(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.noticeModal, notice?.kind === 'error' ? styles.noticeModalError : styles.noticeModalSuccess]}>
            <Text style={[styles.noticeTitle, notice?.kind === 'error' ? styles.noticeTitleError : styles.noticeTitleSuccess]}>{notice?.title ?? 'Notice'}</Text>
            <Text style={styles.noticeMessage}>{notice?.message ?? ''}</Text>
            <TouchableOpacity style={[styles.noticeButton, notice?.kind === 'error' ? styles.noticeButtonError : styles.noticeButtonSuccess]} onPress={() => setNotice(null)}>
              <Text style={styles.noticeButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1, backgroundColor: '#08111F' },
  scrollContent: { backgroundColor: '#08111F', flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 14 },
  ninVerification: { gap: 10 },
  policyConsent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 },
  ninLabel: { color: '#E2E8F0', fontSize: 14, fontWeight: '700' },
  ninConsent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ninConsentCheck: { width: 20, height: 20, borderColor: '#94A3B8', borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  ninConsentChecked: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  ninConsentCheckmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  ninConsentText: { flex: 1, color: '#CBD5E1', fontSize: 12, lineHeight: 18 },
  policyLink: { color: '#6EE7B7', textDecorationLine: 'underline', fontWeight: '700' },
  verifyNinButton: { backgroundColor: '#0F766E', borderRadius: 10, padding: 14, alignItems: 'center' },
  verifyNinText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  verifiedIdentity: { backgroundColor: '#0F2C2B', borderColor: '#10B981', borderWidth: 1, borderRadius: 10, padding: 14, gap: 4 },
  verifiedIdentityLabel: { color: '#6EE7B7', fontSize: 12, fontWeight: '700' },
  verifiedIdentityName: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  verifiedIdentityHint: { color: '#CBD5E1', fontSize: 12 },
  changeNinText: { color: '#6EE7B7', fontSize: 13, fontWeight: '700', marginTop: 6 },
  logoFrame: { alignSelf: 'center', backgroundColor: '#08111F', borderRadius: 62, height: 124, overflow: 'hidden', width: 124 },
  logo: { borderRadius: 62, height: 124, width: 124 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.72)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  noticeModal: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 22, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  noticeModalSuccess: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC' },
  noticeModalError: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' },
  noticeTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  noticeTitleSuccess: { color: '#166534' },
  noticeTitleError: { color: '#991B1B' },
  noticeMessage: { color: '#0F172A', fontSize: 16, lineHeight: 24, marginBottom: 20 },
  noticeButton: { alignItems: 'center', borderRadius: 10, paddingVertical: 12 },
  noticeButtonSuccess: { backgroundColor: '#16A34A' },
  noticeButtonError: { backgroundColor: '#DC2626' },
  noticeButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  eyebrow: { color: '#34D399', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  title: { color: '#F8FAFC', fontSize: 34, fontWeight: '800', lineHeight: 40, textAlign: 'center' },
  subtitle: { color: '#F8FAFC', fontSize: 16, lineHeight: 24, marginBottom: 4, textAlign: 'center' },
  registrationPrompt: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', lineHeight: 24, marginTop: 4, textAlign: 'center' },
  modeHelper: { color: '#CBD5E1', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#111C2E', borderRadius: 8, padding: 4 },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 6 },
  activeMode: { backgroundColor: '#10B981' },
  modeText: { color: '#94A3B8', fontWeight: '700' },
  activeModeText: { color: '#052E2B' },
  input: { backgroundColor: '#E8F0FC', borderRadius: 8, color: '#08111F', paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  phoneInputContainer: { alignItems: 'center', backgroundColor: '#E8F0FC', borderRadius: 8, flexDirection: 'row' },
  countryCode: { paddingLeft: 16, paddingRight: 8, paddingVertical: 14 },
  countryCodeText: { color: '#059669', fontSize: 16, fontWeight: '800' },
  phoneInput: { color: '#08111F', flex: 1, fontSize: 16, paddingHorizontal: 8, paddingVertical: 14 },
  passwordInputContainer: { alignItems: 'center', backgroundColor: '#E8F0FC', borderRadius: 8, flexDirection: 'row' },
  passwordInput: { color: '#08111F', flex: 1, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14 },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 12 },
  passwordHint: { color: '#94A3B8', fontSize: 12, marginTop: -6 },
  passwordError: { color: '#FDA4AF', fontSize: 12, marginTop: -6 },
  roles: { flexDirection: 'row', gap: 8 },
  role: { flex: 1, borderColor: '#334155', borderRadius: 8, borderWidth: 1, padding: 12, alignItems: 'center', justifyContent: 'center' },
  selectedRole: { backgroundColor: '#10B981', borderColor: '#10B981' },
  roleText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', textAlign: 'center', width: '100%' },
  selectedRoleText: { color: '#052E2B' },
  forgotPasswordRow: { alignItems: 'flex-end', marginTop: -4 },
  forgotPasswordText: { color: '#6EE7B7', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  forgotPasswordTextDisabled: { opacity: 0.6 },
  resetNotice: { borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 18, marginTop: 2 },
  resetNoticeSuccess: { backgroundColor: '#12352F', borderWidth: 1, borderColor: '#10B981', color: '#D1FAE5' },
  resetNoticeError: { backgroundColor: '#3B1725', borderWidth: 1, borderColor: '#FCA5A5', color: '#FECACA' },
  error: { color: '#FDA4AF', backgroundColor: '#3B1725', borderRadius: 8, padding: 12 },
  message: { color: '#6EE7B7', backgroundColor: '#12352F', borderRadius: 8, padding: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: '#FB7185', borderRadius: 8, paddingVertical: 15, marginTop: 4 },
  primaryText: { color: '#3B0A16', fontSize: 16, fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08111F', gap: 14 },
  loadingText: { color: '#CBD5E1', fontSize: 16 },
  languageChooser: { gap: 8 },
  languageTitle: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  languageOptions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 7 },
  languageOption: { minWidth: 72, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#334155', backgroundColor: '#111C2E' },
  languageOptionSelected: { backgroundColor: '#0C3B31', borderColor: '#10B981' },
  languageOptionText: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },
  languageOptionTextSelected: { color: '#6EE7B7' },
});
