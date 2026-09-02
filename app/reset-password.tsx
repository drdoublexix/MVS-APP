import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Invalid password', 'Password must be at least 6 characters long.');
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
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter a new password"
              placeholderTextColor="#6F8297"
              secureTextEntry
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your new password"
              placeholderTextColor="#6F8297"
              secureTextEntry
              editable={!loading}
            />
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
