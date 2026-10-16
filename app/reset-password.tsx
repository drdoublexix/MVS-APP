import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { isValidPassword, PASSWORD_REQUIREMENTS } from '../lib/password';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { recoveryError } = useLocalSearchParams<{ recoveryError?: string }>();
  const recoveryErrorMessage = Array.isArray(recoveryError) ? recoveryError[0] : recoveryError;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (recoveryErrorMessage) return;

    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setErrorMessage(error.message);
      } else if (!data.session) {
        setErrorMessage('This password reset link is invalid or expired. Request a new reset link and try again.');
      }
    }).catch((error: unknown) => {
      if (!mounted) return;
      setErrorMessage(error instanceof Error ? error.message : 'Could not verify the password reset link.');
    });

    return () => {
      mounted = false;
    };
  }, [recoveryErrorMessage]);

  const handleUpdatePassword = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!isValidPassword(newPassword)) {
      setErrorMessage(`Invalid password. ${PASSWORD_REQUIREMENTS}`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please make sure both password fields match.');
      return;
    }

    setLoading(true);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        throw new Error('Your password reset session is missing or expired. Request a new reset link and try again.');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setSuccessMessage('Password updated successfully. Redirecting to sign in...');
      setTimeout(() => {
        router.replace('/auth?mode=signin');
      }, 900);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>Create a new password for your account.</Text>

        {successMessage ? <Text style={styles.successBanner}>{successMessage}</Text> : null}
        {recoveryErrorMessage || errorMessage
          ? <Text style={styles.errorBanner}>{recoveryErrorMessage || errorMessage}</Text>
          : null}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
              style={styles.passwordInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={PASSWORD_REQUIREMENTS}
              placeholderTextColor="#6F8297"
              secureTextEntry={!showNewPassword}
              editable={!loading}
              />
              <TouchableOpacity onPress={() => setShowNewPassword((visible) => !visible)} accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}>
                <MaterialCommunityIcons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#6F8297" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your new password"
              placeholderTextColor="#6F8297"
              secureTextEntry={!showConfirmPassword}
              editable={!loading}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword((visible) => !visible)} accessibilityLabel={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}>
                <MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#6F8297" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleUpdatePassword} disabled={loading}>
            <Text style={styles.submitButtonText}>{loading ? 'Updating...' : 'Update Password'}</Text>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9BAEC2',
    fontSize: 15,
    marginBottom: 28,
  },
  successBanner: {
    color: '#D1FAE5',
    backgroundColor: '#102E2A',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    marginBottom: 18,
  },
  errorBanner: {
    color: '#FECACA',
    backgroundColor: '#3B161B',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    marginBottom: 18,
  },
  form: {
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: '#DCE6F1',
    fontSize: 14,
    fontWeight: '600',
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
  passwordInputContainer: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#5EEAD4',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  submitButtonText: {
    color: '#08111F',
    fontSize: 15,
    fontWeight: '700',
  },
});
