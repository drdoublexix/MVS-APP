import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, sendPasswordResetLink, signOutUser, supabase, updatePassword } from '../../lib/supabase';

type SettingsModal = 'profile' | 'password' | 'notifications' | null;

export default function VetProfileScreen() {
  const router = useRouter();
  const [modal, setModal] = useState<SettingsModal>(null);
  const [profile, setProfile] = useState({
    name: 'Dr. Veterinarian',
    email: '',
    phone: '',
    specialty: '',
    clinic: '',
    licenseNumber: '',
    avatar: '',
  });
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [notifications, setNotifications] = useState({ consultations: true, appointments: true, payments: true, marketing: false });

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        if (user) {
          setProfile({
            name: user.user_metadata?.full_name || user.user_metadata?.name || 'Dr. Veterinarian',
            email: user.email || '',
            phone: user.user_metadata?.phone || '',
            specialty: user.user_metadata?.specialty || '',
            clinic: user.user_metadata?.clinic || '',
            licenseNumber: user.user_metadata?.license_number || '',
            avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const saveProfile = async () => {
    setModal(null);
    const user = await getCurrentUser();
    if (!user) return;
    await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        full_name: profile.name,
        phone: profile.phone,
        specialty: profile.specialty,
        clinic: profile.clinic,
        license_number: profile.licenseNumber,
      },
    });
    Alert.alert('Profile Updated', 'Your profile changes have been saved.');
  };

  const changePassword = async () => {
    if (password.next.length < 6 || password.next !== password.confirm) {
      Alert.alert('Invalid', 'Password must be at least 6 characters and match the confirmation.');
      return;
    }
    try {
      await updatePassword(password.next);
      setPassword({ next: '', confirm: '' });
      setModal(null);
      Alert.alert('Password updated', 'Your password has been changed successfully.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not update password');
    }
  };

  const sendResetLink = async () => {
    if (!profile.email) return;
    try {
      await sendPasswordResetLink(profile.email);
      Alert.alert('Reset link sent', 'Check your email to choose a new password.');
    } catch (error) {
      Alert.alert('Error', 'Could not send reset link');
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('[Vet Profile] Logout failed:', error);
      Alert.alert('Logout failed', error instanceof Error ? error.message : 'Could not log out.');
    }
  };

  const confirmLogout = () => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm('Are you sure you want to log out?')) void handleLogout();
      return;
    }

    Alert.alert('Log out?', 'You will be signed out of your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => { void handleLogout(); } },
    ]);
  };

  const handleDeleteAccount = () => {
    const confirmDelete = async () => {
      try {
        const { error } = await supabase.rpc('delete_user_account');
        if (error) throw error;

        await supabase.auth.signOut();
        router.replace('/(auth)/login');
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete account.');
      }
    };

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        void confirmDelete();
      }
      return;
    }

    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void confirmDelete(); } },
      ]
    );
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfile((prev) => ({ ...prev, avatar: result.assets[0].uri }));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>My Profile</Text>

        {/* Profile Header */}
        <TouchableOpacity style={styles.profileHeader} onPress={pickAvatar}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialCommunityIcons name="stethoscope" size={36} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.title}>{profile.name}</Text>
            <Text style={styles.muted}>{profile.email}</Text>
            <Text style={styles.editHint}>Tap to change photo</Text>
          </View>
        </TouchableOpacity>

        {/* Practice Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Practice Information</Text>
          <InfoRow icon="hospital-box" label="Clinic" value={profile.clinic || 'Not set'} />
          <InfoRow icon="briefcase" label="Specialty" value={profile.specialty || 'Not set'} />
          <InfoRow icon="card-account-details" label="License Number" value={profile.licenseNumber || 'Not set'} />
          <InfoRow icon="phone" label="Phone" value={profile.phone || 'Not set'} />
        </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <Setting label="Edit Profile" icon="pencil" onPress={() => setModal('profile')} />
          <Setting label="Change Password" icon="lock" onPress={() => setModal('password')} />
          <Setting label="Notifications" icon="bell" onPress={() => setModal('notifications')} />
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logout} onPress={confirmLogout}>
            <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FCA5A5" />
            <Text style={styles.deleteText}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modals */}
      <Modal visible={modal === 'profile'} animationType="slide" transparent onRequestClose={() => setModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModal(null)}>
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalBody}>
              <Field
                label="Full Name"
                value={profile.name}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, name: text }))}
                placeholder="Dr. Your Name"
              />
              <Field
                label="Email"
                value={profile.email}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, email: text }))}
                editable={false}
              />
              <Field
                label="Phone"
                value={profile.phone}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, phone: text }))}
                placeholder="+234 XXX XXX XXXX"
              />
              <Field
                label="Specialty"
                value={profile.specialty}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, specialty: text }))}
                placeholder="e.g., Small Animal, Surgery, etc."
              />
              <Field
                label="Clinic Name"
                value={profile.clinic}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, clinic: text }))}
                placeholder="Your clinic or hospital name"
              />
              <Field
                label="License Number"
                value={profile.licenseNumber}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, licenseNumber: text }))}
                placeholder="Your veterinary license number"
              />

              <TouchableOpacity style={styles.save} onPress={saveProfile}>
                <Text style={styles.saveText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modal === 'password'} animationType="slide" transparent onRequestClose={() => setModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModal(null)}>
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Change Password</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.info}>Or use the button below to send yourself a password reset link.</Text>

              <Field
                label="New Password"
                value={password.next}
                onChangeText={(text) => setPassword((prev) => ({ ...prev, next: text }))}
                placeholder="Minimum 6 characters"
                secureTextEntry
              />
              <Field
                label="Confirm Password"
                value={password.confirm}
                onChangeText={(text) => setPassword((prev) => ({ ...prev, confirm: text }))}
                placeholder="Re-enter your password"
                secureTextEntry
              />

              <TouchableOpacity style={styles.save} onPress={changePassword}>
                <Text style={styles.saveText}>Update Password</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondary} onPress={sendResetLink}>
                <Text style={styles.secondaryText}>Send Reset Link via Email</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modal === 'notifications'} animationType="slide" transparent onRequestClose={() => setModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModal(null)}>
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Notifications</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalBody}>
              <Toggle
                label="Consultation Requests"
                value={notifications.consultations}
                onChange={(value) => setNotifications((prev) => ({ ...prev, consultations: value }))}
              />
              <Toggle
                label="Appointment Reminders"
                value={notifications.appointments}
                onChange={(value) => setNotifications((prev) => ({ ...prev, appointments: value }))}
              />
              <Toggle
                label="Payment Notifications"
                value={notifications.payments}
                onChange={(value) => setNotifications((prev) => ({ ...prev, payments: value }))}
              />
              <Toggle
                label="Marketing & Promotions"
                value={notifications.marketing}
                onChange={(value) => setNotifications((prev) => ({ ...prev, marketing: value }))}
              />

              <TouchableOpacity style={styles.save} onPress={() => setModal(null)}>
                <Text style={styles.saveText}>Save Preferences</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon as any} size={20} color="#10B981" />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function Setting({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.setting} onPress={onPress}>
      <View style={styles.settingLeft}>
        <MaterialCommunityIcons name={icon as any} size={20} color="#3B82F6" />
        <Text style={styles.primary}>{label}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, editable = true }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean; editable?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        secureTextEntry={secureTextEntry}
        editable={editable}
        style={[styles.input, !editable && styles.inputDisabled]}
      />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.primary}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#334155', true: '#10B981' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16, paddingBottom: 35 },
  pageTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginBottom: 20 },
  profileHeader: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#334155', marginBottom: 25, flexDirection: 'row', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  muted: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  editHint: { color: '#10B981', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  section: { marginBottom: 25 },
  sectionTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginBottom: 12 },
  infoRow: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  infoContent: { flex: 1 },
  infoLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  infoValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 2 },
  setting: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  primary: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  chevron: { color: '#64748B', fontSize: 22 },
  logout: { backgroundColor: '#EF4444', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10 },
  logoutText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  deleteButton: { borderColor: '#EF4444', borderWidth: 1.5, borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  deleteText: { color: '#FCA5A5', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 16 },
  info: { color: '#94A3B8', fontSize: 13, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', padding: 12, fontSize: 14 },
  inputDisabled: { backgroundColor: '#0F172A', color: '#64748B' },
  save: { backgroundColor: '#10B981', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondary: { borderColor: '#3B82F6', borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  secondaryText: { color: '#3B82F6', fontWeight: '600', fontSize: 14 },
  toggle: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
});
