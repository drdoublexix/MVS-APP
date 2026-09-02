import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loginUser, sendPasswordResetLink, supabase, type AppRole } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const selectedRole: AppRole = params.role === 'vet' || params.role === 'merchant' ? params.role : 'client';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const googleButtonRef = useRef<View>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    setResetMessage('');

    try {
      const { user } = await loginUser(email, password);
      if (!user) throw new Error('Login did not return a user.');
      
      // Don't manually route - let the root layout auth listener handle it
      // The onAuthStateChange will fire and trigger proper routing
      console.log('Login successful, waiting for auth state update...');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email first so we can send the reset link.');
      setResetMessage('');
      return;
    }
    setLoading(true);
    setError('');
    setResetMessage('');
    try {
      await sendPasswordResetLink(email.trim(), 'http://localhost:8081/reset-password');
      setResetMessage('A reset password link has been sent to your email.');
    } catch (err: any) {
      setError(err.message || 'We could not send the reset password link.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    console.log('Google Auth Clicked for role:', selectedRole);
    setLoading(true);
    setError('');
    
    try {
      // Normalize role string for OAuth
      let userRole: AppRole = 'client';
      if (selectedRole === 'vet') userRole = 'vet';
      if (selectedRole === 'merchant') userRole = 'merchant';

      const redirectUrl = `http://localhost:8081/auth/callback?role=${encodeURIComponent(userRole)}`;

      console.log('Initiating Google login with role:', userRole, 'redirect:', redirectUrl);

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
      setError(err.message || 'Google login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandMark}><MaterialCommunityIcons name="hospital-box-outline" size={25} color="#08111F" /></View>
          <Text style={styles.eyebrow}>MOBILE VETERINARY SERVICES</Text>
          <Text style={styles.title}>Good to see you again.</Text>
          <Text style={styles.subtitle}>Sign in to continue caring for the pets that matter most.</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.form}>
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
            <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>
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

          <TouchableOpacity 
            style={[styles.loginButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Sign in to MVS</Text>
            )}
          </TouchableOpacity>
          {resetMessage ? <Text style={styles.resetMessage}>{resetMessage}</Text> : null}
          <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>OR</Text><View style={styles.divider} /></View>
          
          {Platform.OS === 'web' ? (
            <Pressable
              ref={googleButtonRef}
              style={({ pressed }) => ({
                ...styles.googleButton,
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={handleGoogleLogin}
              disabled={loading}
            >
              <MaterialCommunityIcons name="google" size={19} color="#F8FAFC" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </Pressable>
          ) : (
            <TouchableOpacity
              style={[styles.googleButton, loading && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={loading}
            >
              <MaterialCommunityIcons name="google" size={19} color="#F8FAFC" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(auth)/signup', params: { role: selectedRole } })}>
            <Text style={styles.signupLink}>Sign Up</Text>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 42,
    justifyContent: 'space-between',
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
  forgotLink: {
    alignSelf: 'flex-end',
    color: '#5EEAD4',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
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
  resetMessage: {
    color: '#5EEAD4',
    backgroundColor: '#102E2A',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    lineHeight: 19,
  },
  loginButton: {
    backgroundColor: '#FB7185',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#180A12',
    fontSize: 16,
    fontWeight: '800',
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
  footer: {
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
    color: '#8EA3B8',
  },
  signupLink: {
    fontSize: 14,
    color: '#5EEAD4',
    fontWeight: '800',
  },
});
