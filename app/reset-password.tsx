import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { isValidPassword, PASSWORD_REQUIREMENTS } from '../lib/password';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleUpdatePassword = async () => {
    if (!isValidPassword(newPassword)) {
      Alert.alert('Invalid password', PASSWORD_REQUIREMENTS);
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure both password fields match.');
      return;
    }

    setLoading(true);
    setSuccessMessage('');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setSuccessMessage('Password updated successfully. Redirecting to sign in...');
      Alert.alert('Password updated', 'Your password was updated successfully.');
      setTimeout(() => {
        router.replace('/login');
      }, 900);
    } catch (error) {
      Alert.alert('Could not update password', error instanceof Error ? error.message : 'Please try again.');
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
