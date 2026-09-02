import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, sendPasswordResetLink, supabase, updatePassword } from '../../lib/supabase';

type SettingsModal = 'profile' | 'password' | 'notifications' | null;

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    console.log('[LogoutButton] Press event fired!');
    setLoading(true);

    try {
      await supabase.auth.signOut();

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.localStorage.clear();
          window.sessionStorage.clear();
        }
        window.location.replace('/login');
      } else {
        router.replace('/(auth)/login');
      }
    } catch (err: any) {
      console.error('[LogoutButton] Error during logout:', err);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      } else {
        router.replace('/(auth)/login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={onLogout}
      style={({ pressed }) => ({
        backgroundColor: '#EF4444',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed || loading ? 0.7 : 1,
        marginTop: 16,
        zIndex: 999,
      })}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
          Log out
        </Text>
      )}
    </Pressable>
  );
}

export default function MerchantProfileScreen() {
  const router = useRouter();
  const [modal, setModal] = useState<SettingsModal>(null);
  const [profile, setProfile] = useState({
    name: 'Merchant',
    email: '',
    phone: '',
    business: '',
    location: '',
    businessNumber: '',
    avatar: '',
  });
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [notifications, setNotifications] = useState({ orders: true, inquiries: true, payments: true, marketing: false });

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        if (user) {
          setProfile({
            name: user.user_metadata?.full_name || user.user_metadata?.name || 'Merchant',
            email: user.email || '',
            phone: user.user_metadata?.phone || '',
            business: user.user_metadata?.business || '',
            location: user.user_metadata?.location || '',
            businessNumber: user.user_metadata?.business_number || '',
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
        business: profile.business,
        location: profile.location,
        business_number: profile.businessNumber,
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
              <MaterialCommunityIcons name="storefront" size={36} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.title}>{profile.name}</Text>
            <Text style={styles.muted}>{profile.email}</Text>
            <Text style={styles.editHint}>Tap to change photo</Text>
          </View>
        </TouchableOpacity>

        {/* Business Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Information</Text>
          <InfoRow icon="storefront" label="Business Name" value={profile.business || 'Not set'} />
          <InfoRow icon="map-marker" label="Location" value={profile.location || 'Not set'} />
          <InfoRow icon="file-document" label="Business Number" value={profile.businessNumber || 'Not set'} />
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
          <LogoutButton />

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
                placeholder="Your Name"
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
                label="Business Name"
                value={profile.business}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, business: text }))}
                placeholder="Your business name"
              />
              <Field
                label="Location"
                value={profile.location}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, location: text }))}
                placeholder="Business location"
              />
              <Field
                label="Business Registration Number"
                value={profile.businessNumber}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, businessNumber: text }))}
                placeholder="Your business registration number"
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
                label="New Orders"
                value={notifications.orders}
                onChange={(value) => setNotifications((prev) => ({ ...prev, orders: value }))}
              />
              <Toggle
                label="Customer Inquiries"
                value={notifications.inquiries}
                onChange={(value) => setNotifications((prev) => ({ ...prev, inquiries: value }))}
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
      <MaterialCommunityIcons name={icon as any} size={20} color="#45B7D1" />
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
        <MaterialCommunityIcons name={icon as any} size={20} color="#45B7D1" />
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
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#334155', true: '#45B7D1' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16, paddingBottom: 35 },
  pageTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginBottom: 20 },
  profileHeader: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#334155', marginBottom: 25, flexDirection: 'row', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#45B7D1', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  muted: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  editHint: { color: '#45B7D1', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
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
  save: { backgroundColor: '#45B7D1', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondary: { borderColor: '#45B7D1', borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  secondaryText: { color: '#45B7D1', fontWeight: '600', fontSize: 14 },
  toggle: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
});
