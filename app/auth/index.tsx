import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getProfileRole, getRoleNavPath, supabase } from '../../lib/supabase';

type Role = 'client' | 'vet' | 'merchant';
type AuthMode = 'sign-in' | 'sign-up';
const VERIFIED_NOTICE_KEY = 'mvs_verified_auth_notice';
const PRODUCTION_AUTH_URL = 'https://mvsapp.com.ng/auth?mode=signin';

const getAuthRedirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `${window.location.origin}/auth?mode=signin`;
  }
  return PRODUCTION_AUTH_URL;
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

const roles: { value: Role; label: string }[] = [
  { value: 'client', label: 'Pet parent' },
  { value: 'vet', label: 'Veterinarian' },
  { value: 'merchant', label: 'Merchant' },
];

export default function AuthScreen() {
  const router = useRouter();
  const { code, mode: modeParam, type: typeParam } = useLocalSearchParams<{ code?: string; mode?: string; type?: string }>();
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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(Boolean(code || hasHashSession));
  const [message, setMessage] = useState(verifiedNotice.exists || typeParam === 'signup' || typeParam === 'email_confirmation'
    ? 'Email successfully verified! Please sign in to your account.'
    : '');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');

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
        setMessage('Email successfully verified! Please sign in to your account.');
      }
    };

    void finishAuthRedirect();
    return () => {
      mounted = false;
    };
  }, [code, hasHashSession, router]);

  const updateMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    router.replace({ pathname: '/auth', params: { mode: nextMode === 'sign-in' ? 'signin' : 'signup' } });
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setPasswordError('');

    try {
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) throw new Error('Enter your email and password to continue.');
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
              full_name: fullName.trim(),
              phone_number: phoneNumber.trim(),
              role,
            },
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });
        if (signUpError) throw signUpError;
        setMessage(data.session ? 'Account created. Loading your workspace...' : 'Check your email to confirm your account.');
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
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed. Please try again.');
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
        {message ? <Text style={styles.verificationBanner}>{message}</Text> : null}
        <View style={styles.logoFrame}>
          <Image source={require('../../assets/images/mvsfp.jpeg')} resizeMode="contain" style={styles.logo} />
        </View>
        <Text style={styles.eyebrow}>MOBILE VETERINARY SERVICES</Text>
        <Text style={styles.title}>Your farm animals/pet care circle starts here.</Text>
        <Text style={styles.subtitle}>Create an account or sign in to access trusted animal care and supplies, or join us as a certified veterinary professional or merchant to serve our growing ecosystem.</Text>
        <View style={styles.modeSwitch}>
          <TouchableOpacity style={[styles.modeButton, mode === 'sign-in' && styles.activeMode]} onPress={() => updateMode('sign-in')}>
            <Text style={[styles.modeText, mode === 'sign-in' && styles.activeModeText]}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeButton, mode === 'sign-up' && styles.activeMode]} onPress={() => updateMode('sign-up')}>
            <Text style={[styles.modeText, mode === 'sign-up' && styles.activeModeText]}>Create account</Text>
          </TouchableOpacity>
        </View>

        {mode === 'sign-up' ? <Text style={styles.registrationPrompt}>Please select your registration type to proceed:</Text> : null}

        {mode === 'sign-up' ? (
          <View style={styles.roles}>
            {roles.map((option) => (
              <TouchableOpacity key={option.value} style={[styles.role, role === option.value && styles.selectedRole]} onPress={() => setRole(option.value)}>
                <Text style={[styles.roleText, role === option.value && styles.selectedRoleText]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mode === 'sign-up' ? <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#718096" value={fullName} onChangeText={setFullName} /> : null}
        <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#718096" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        {mode === 'sign-up' ? <TextInput style={styles.input} placeholder="e.g. +2349012345678" placeholderTextColor="#718096" keyboardType="phone-pad" value={phoneNumber} onChangeText={setPhoneNumber} /> : null}
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
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
        </View>
        {mode === 'sign-up' ? <Text style={styles.passwordHint}>Use uppercase, lowercase, a number, and a special symbol (@$!%*?&).</Text> : null}
        {passwordError ? <Text style={styles.passwordError}>{passwordError}</Text> : null}

        <Text style={styles.modeHelper}>
          {mode === 'sign-in'
            ? 'Welcome back! Enter your credentials to access your dashboard.'
            : 'Fill in your details above to get started.'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.primaryButton} onPress={() => void submit()} disabled={loading}>
          <Text style={styles.primaryText}>{mode === 'sign-up' ? 'Create account' : 'Sign in'}</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1, backgroundColor: '#08111F' },
  scrollContent: { backgroundColor: '#08111F', flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 14 },
  logoFrame: { alignSelf: 'center', backgroundColor: '#08111F', borderRadius: 62, height: 124, overflow: 'hidden', width: 124 },
  logo: { borderRadius: 62, height: 124, width: 124 },
  verificationBanner: { backgroundColor: '#12352F', borderColor: '#34D399', borderRadius: 8, borderWidth: 1, color: '#A7F3D0', fontSize: 15, fontWeight: '700', lineHeight: 22, padding: 14, textAlign: 'center' },
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
  passwordInputContainer: { alignItems: 'center', backgroundColor: '#E8F0FC', borderRadius: 8, flexDirection: 'row' },
  passwordInput: { color: '#08111F', flex: 1, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14 },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 12 },
  passwordHint: { color: '#94A3B8', fontSize: 12, marginTop: -6 },
  passwordError: { color: '#FDA4AF', fontSize: 12, marginTop: -6 },
  roles: { flexDirection: 'row', gap: 8 },
  role: { flex: 1, borderColor: '#334155', borderRadius: 8, borderWidth: 1, padding: 12, alignItems: 'center' },
  selectedRole: { backgroundColor: '#10B981', borderColor: '#10B981' },
  roleText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  selectedRoleText: { color: '#052E2B' },
  error: { color: '#FDA4AF', backgroundColor: '#3B1725', borderRadius: 8, padding: 12 },
  message: { color: '#6EE7B7', backgroundColor: '#12352F', borderRadius: 8, padding: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: '#FB7185', borderRadius: 8, paddingVertical: 15, marginTop: 4 },
  primaryText: { color: '#3B0A16', fontSize: 16, fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08111F', gap: 14 },
  loadingText: { color: '#CBD5E1', fontSize: 16 },
});
