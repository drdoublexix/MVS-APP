import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { requestDeviceLocation } from '../../lib/location';
import { supabase, type AppRole } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<AppRole>(params.role === 'vet' || params.role === 'merchant' ? params.role : 'client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<View>(null);

  useEffect(() => {
    if (params.role === 'client' || params.role === 'vet' || params.role === 'merchant') {
      queueMicrotask(() => setRole(params.role as AppRole));
    }
  }, [params.role]);

  const handleSignup = async () => {
    const normalizedPhoneNumber = phoneNumber.trim().replace(/[\s()-]/g, '');
    if (!email || !password || !confirmPassword || !fullName || !normalizedPhoneNumber) {
      setError('Please fill in all fields');
      return;
    }

    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhoneNumber)) {
      setError('Enter a valid phone number in international format, for example +2348000000000');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: existingPhone, error: phoneLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone_number', normalizedPhoneNumber)
        .maybeSingle();
      if (phoneLookupError) throw phoneLookupError;
      if (existingPhone) {
        setError('That phone number is already registered. Please use another number.');
        return;
      }

      let userRole: AppRole = 'client';
      if (role === 'vet') userRole = 'vet';
      if (role === 'merchant') userRole = 'merchant';

      if (typeof window !== 'undefined') {
        localStorage.setItem('mvs_pending_signup_role', userRole);
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_number: normalizedPhoneNumber,
            role: userRole,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      console.log('[Signup] Signup successful:', data.user?.id);
      // Check if session was auto-confirmed
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[Signup] Session after signup:', sessionData.session?.user?.id);

      if (sessionData.session?.user) {
        const user = sessionData.session.user;
        const profileName = fullName.trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Merchant';
        let location = { latitude: null as number | null, longitude: null as number | null, city: '', state: '' };
        try {
          location = (await requestDeviceLocation()) || location;
        } catch (locationError) {
          console.warn('[Signup] Location unavailable:', locationError);
        }
        const { error: profileError } = await supabase.from('profiles').upsert(
          { id: user.id, email: user.email, full_name: profileName, phone_number: normalizedPhoneNumber, role: userRole, ...location },
          { onConflict: 'id' },
        );
        if (profileError) {
          if (profileError.code === '23505' && profileError.message.includes('phone_number')) {
            throw new Error('That phone number is already registered. Please use another number.');
          }
          throw profileError;
        }
        if (typeof window !== 'undefined') localStorage.removeItem('mvs_pending_signup_role');
        router.replace(userRole === 'merchant' ? '/(merchant)' : userRole === 'vet' ? '/(vet)' : '/(client)');
      } else {
        console.log('[Signup] Email confirmation required before dashboard access.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    console.log('Google Auth Clicked for role:', role);
    setLoading(true);
    setError('');

    try {
      let userRole: AppRole = 'client';
      if (role === 'vet') userRole = 'vet';
      if (role === 'merchant') userRole = 'merchant';

      if (typeof window !== 'undefined') {
        localStorage.setItem('mvs_selected_role', userRole);
      }

      const redirectUrl = `http://localhost:8081/auth/callback?role=${encodeURIComponent(userRole)}`;

      console.log('Initiating Google OAuth with role:', userRole, 'redirect:', redirectUrl);

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (oauthError) {
        console.error('Supabase OAuth Error:', oauthError.message);
        setError(`OAuth Error: ${oauthError.message}`);
        return;
      }

      if (data?.url && typeof window !== 'undefined') {
        console.log('Redirecting to Google OAuth URL:', data.url);
        window.location.href = data.url;
      } else {
        console.warn('No OAuth URL returned from Supabase');
        setError('Failed to initiate Google Sign-In. Please try again.');
      }
    } catch (err: any) {
      console.error('Unexpected Google Auth Error:', err);
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <MaterialCommunityIcons name="hospital-box-outline" size={25} color="#08111F" />
          </View>
          <Text style={styles.eyebrow}>MOBILE VETERINARY SERVICES</Text>
          <Text style={styles.title}>Your care circle starts here.</Text>
          <Text style={styles.subtitle}>Create one account for trusted veterinary care, products, and support.</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.sectionLabel}>I am joining as</Text>
            <View style={styles.roleRow}>
              {(['client', 'vet', 'merchant'] as AppRole[]).map((option) => {
                const label = option === 'vet' ? 'Veterinarian' : option === 'client' ? 'Pet parent' : 'Merchant';
                const icon = option === 'vet' ? 'stethoscope' : option === 'client' ? 'paw' : 'storefront-outline';
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.roleButton, role === option && styles.roleButtonSelected]}
                    onPress={() => {
                      setRole(option);
                      router.setParams({ role: option });
                    }}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name={icon as any} size={22} color={role === option ? '#08111F' : '#8EA3B8'} />
                    <Text style={[styles.roleButtonText, role === option && styles.roleButtonTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#6F8297"
              value={fullName}
              onChangeText={setFullName}
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#6F8297"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+234 800 000 0000"
              placeholderTextColor="#6F8297"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              editable={!loading}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#6F8297"
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              secureTextEntry
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm your password"
              placeholderTextColor="#6F8297"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.signupButton, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.signupButtonText}>Create my account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          {Platform.OS === 'web' ? (
            <Pressable
              ref={googleButtonRef}
              style={({ pressed }) => ({
                ...styles.googleButton,
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <MaterialCommunityIcons name="google" size={19} color="#F8FAFC" />
              <Text style={styles.googleButtonText}>Sign up with Google</Text>
            </Pressable>
          ) : (
            <TouchableOpacity
              style={[styles.googleButton, loading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <MaterialCommunityIcons name="google" size={19} color="#F8FAFC" />
              <Text style={styles.googleButtonText}>Sign up with Google</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(auth)/login', params: { role } })}>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08111F',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 42,
  },
  header: {
    paddingTop: 18,
    marginBottom: 28,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  eyebrow: {
    color: '#5EEAD4',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#9BAEC2',
    maxWidth: 340,
  },
  form: {
    gap: 17,
  },
  inputGroup: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DCE6F1',
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DCE6F1',
  },
  input: {
    borderWidth: 1,
    borderColor: '#263A50',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#F8FAFC',
    backgroundColor: '#101F31',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 9,
  },
  roleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#263A50',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#101F31',
  },
  roleButtonSelected: {
    backgroundColor: '#5EEAD4',
    borderColor: '#5EEAD4',
  },
  roleButtonText: {
    color: '#8EA3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  roleButtonTextSelected: {
    color: '#08111F',
  },
  errorText: {
    color: '#FDA4AF',
    backgroundColor: '#3A1824',
    borderColor: '#9F1239',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  signupButton: {
    backgroundColor: '#FB7185',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signupButtonText: {
    color: '#180A12',
    fontSize: 16,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  divider: {
    height: 1,
    flex: 1,
    backgroundColor: '#263A50',
  },
  dividerText: {
    color: '#6F8297',
    fontSize: 11,
    fontWeight: '700',
  },
  googleButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#38506A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#132337',
  },
  googleButtonText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
    color: '#8EA3B8',
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5EEAD4',
  },
});
