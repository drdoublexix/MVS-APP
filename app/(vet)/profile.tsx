import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { NIGERIAN_LOCATIONS, requestDeviceLocation } from '../../lib/location';
import { registerForPushNotifications } from '../../lib/notifications';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, readCachedAuthState, sendPasswordResetLink, signOutUser, supabase, updatePassword } from '../../lib/supabase';

type SettingsModal = 'profile' | 'password' | 'notifications' | 'bank' | null;

type NotificationPreferences = {
  orders: boolean;
  chat: boolean;
  consultations: boolean;
  reminders: boolean;
  payouts: boolean;
};

const buildDefaultNotificationPreferences = (): NotificationPreferences => ({
  orders: true,
  chat: true,
  consultations: true,
  reminders: true,
  payouts: true,
});

const normalizeNotificationPreferences = (prefs?: Record<string, unknown> | null): NotificationPreferences => ({
  orders: typeof prefs?.orders === 'boolean' ? prefs.orders : true,
  chat: typeof prefs?.chat === 'boolean' ? prefs.chat : true,
  consultations: typeof prefs?.consultations === 'boolean' ? prefs.consultations : true,
  reminders: typeof prefs?.reminders === 'boolean' ? prefs.reminders : true,
  payouts: typeof prefs?.payouts === 'boolean' ? prefs.payouts : true,
});

const NIGERIAN_BANKS = [
  { label: 'Access Bank', code: '044' },
  { label: 'Ecobank Nigeria', code: '050' },
  { label: 'FairMoney MFB', code: '51318' },
  { label: 'FCMB (First City Monument Bank)', code: '214' },
  { label: 'Fidelity Bank', code: '070' },
  { label: 'First Bank of Nigeria', code: '011' },
  { label: 'GTBank (Guaranty Trust Bank)', code: '058' },
  { label: 'Keystone Bank', code: '082' },
  { label: 'Kuda Bank', code: '50211' },
  { label: 'Moniepoint Microfinance Bank', code: '50515' },
  { label: 'OPay Digital Services (Paycom)', code: '999992' },
  { label: 'Paga', code: '100002' },
  { label: 'PalmPay', code: '999991' },
  { label: 'Providus Bank', code: '101' },
  { label: 'Stanbic IBTC Bank', code: '221' },
  { label: 'Sterling Bank', code: '232' },
  { label: 'Union Bank of Nigeria', code: '032' },
  { label: 'United Bank for Africa (UBA)', code: '033' },
  { label: 'VFD Microfinance Bank', code: '566' },
  { label: 'Wema Bank (ALAT)', code: '035' },
  { label: 'Zenith Bank', code: '057' },
];

export default function VetProfileScreen() {
  const router = useRouter();
  const role = 'vet';
  const [modal, setModal] = useState<SettingsModal>(null);
  const [bankPickerVisible, setBankPickerVisible] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationStatePicker, setLocationStatePicker] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    name: 'Dr. Veterinarian',
    email: '',
    phone: '',
    specialty: '',
    clinic: '',
    bio: '',
    licenseNumber: '',
    avatar: '',
    bankName: '',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    flutterwaveSubaccountId: '',
    latitude: null as number | null,
    longitude: null as number | null,
    city: '',
    state: '',
  });

  const [password, setPassword] = useState({ next: '', confirm: '' });

  const notificationOptions: Array<{ key: keyof NotificationPreferences; label: string }> = [
    { key: 'consultations', label: 'Consultation Updates / New Consult Requests' },
    { key: 'chat', label: 'Chat Messages / Patient Messages' },
    { key: 'payouts', label: 'Payout Notifications / Payout & Earnings' },
  ];

  const [notifications, setNotifications] = useState<NotificationPreferences>(buildDefaultNotificationPreferences());

  const loadNotificationPreferences = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('notification_preferences').eq('id', userId).maybeSingle();

    if (data?.notification_preferences && typeof data.notification_preferences === 'object') {
      setNotifications(normalizeNotificationPreferences(data.notification_preferences as Record<string, unknown>));
    } else {
      setNotifications(buildDefaultNotificationPreferences());
    }
  };

  const saveNotificationPreferences = async (prefs: NotificationPreferences) => {
    const user = await getCurrentUser();
    if (!user) return;
    try {
      await registerForPushNotifications(user.id);
    } catch (error) {
      console.warn('[Notifications] Permission or token registration failed:', error);
    }
    await supabase.from('profiles').update({ notification_preferences: prefs }).eq('id', user.id);
  };

  useEffect(() => {
    void (async () => {
      const cachedState = await readCachedAuthState();
      const cachedUser = cachedState.user as any;
      const cachedProfile = cachedState.profile as any;

      if (cachedUser) {
        const cachedAvatar = cachedProfile?.avatar_url || cachedUser.user_metadata?.avatar_url || cachedUser.user_metadata?.picture || null;
        setAvatarUrl(cachedAvatar);
        setProfile((current) => ({
          name: cachedProfile?.full_name || cachedUser.user_metadata?.full_name || cachedUser.user_metadata?.name || 'Dr. Veterinarian',
          email: cachedUser.email || cachedProfile?.email || '',
          phone: cachedProfile?.phone_number || cachedUser.user_metadata?.phone || '',
          specialty: cachedProfile?.specialty || cachedUser.user_metadata?.specialty || '',
          clinic: cachedProfile?.clinic || cachedUser.user_metadata?.clinic || '',
          bio: cachedProfile?.bio || '',
          licenseNumber: cachedProfile?.license_number || cachedUser.user_metadata?.license_number || '',
          avatar: cachedAvatar || '',
          bankName: current.bankName,
          bankCode: current.bankCode,
          accountNumber: current.accountNumber,
          accountName: current.accountName,
          flutterwaveSubaccountId: current.flutterwaveSubaccountId,
          latitude: current.latitude,
          longitude: current.longitude,
          city: current.city,
          state: current.state,
        }));
      }

      const user = await getCurrentUser();
      if (!user) return;

      const { data: profileData } = await supabase.from('profiles').select('avatar_url, phone_number, latitude, longitude, city, state, clinic, specialty, license_number, bio').eq('id', user.id).single();
      const activeAvatar = profileData?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
      setAvatarUrl(activeAvatar);

      setProfile((current) => ({
        name: user.user_metadata?.full_name || user.user_metadata?.name || 'Dr. Veterinarian',
        email: user.email || '',
        phone: profileData?.phone_number || user.user_metadata?.phone || '',
        specialty: profileData?.specialty || user.user_metadata?.specialty || '',
        clinic: profileData?.clinic || user.user_metadata?.clinic || '',
        bio: profileData?.bio || user.user_metadata?.bio || '',
        licenseNumber: profileData?.license_number || user.user_metadata?.license_number || '',
        avatar: activeAvatar || '',
        bankName: current.bankName,
        bankCode: current.bankCode,
        accountNumber: current.accountNumber,
        accountName: current.accountName,
        flutterwaveSubaccountId: current.flutterwaveSubaccountId,
        latitude: profileData?.latitude ?? current.latitude,
        longitude: profileData?.longitude ?? current.longitude,
        city: profileData?.city || current.city,
        state: profileData?.state || current.state,
      }));

      void requestDeviceLocation().then((location) => {
        if (location) setProfile((prev) => ({ ...prev, ...location }));
      }).catch((error) => console.warn('[Vet Profile] Location unavailable:', error));

      void supabase.from('profiles').select('bank_name, bank_code, account_number, account_name, flutterwave_subaccount_id').eq('id', user.id).maybeSingle().then(({ data }) => {
        if (data) setProfile((prev) => ({ ...prev, bankName: data.bank_name || '', bankCode: data.bank_code || '', accountNumber: data.account_number || '', accountName: data.account_name || '', flutterwaveSubaccountId: data.flutterwave_subaccount_id || '' }));
      });

      void loadNotificationPreferences(user.id);
    })().catch(() => undefined);
  }, []);

  const saveProfile = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const cleanName = sanitizeInput(profile.name);
    const cleanSpecialty = sanitizeInput(profile.specialty);
    const cleanClinic = sanitizeInput(profile.clinic);
    const cleanBio = sanitizeInput(profile.bio).slice(0, 238);
    const cleanLicenseNumber = sanitizeInput(profile.licenseNumber);
    const cleanCity = sanitizeInput(profile.city);
    const cleanState = sanitizeInput(profile.state);
    const formattedPhoneNumber = sanitizeInput(profile.phone).replace(/[\s()-]/g, '');

    if (!/^\+[1-9]\d{7,14}$/.test(formattedPhoneNumber)) {
      Alert.alert('Invalid phone number', 'Enter a valid international number, for example +2348000000000.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').update({
      full_name: cleanName,
      phone_number: formattedPhoneNumber,
      clinic: cleanClinic,
      specialty: cleanSpecialty,
      license_number: cleanLicenseNumber,
      bio: cleanBio,
      latitude: profile.latitude,
      longitude: profile.longitude,
      city: cleanCity,
      state: cleanState,
    }).eq('id', user.id);

    if (profileError) {
      console.error('[Vet Profile] Profile save failed:', profileError);
      Alert.alert(profileError.code === '23505' ? 'Phone number unavailable' : 'Could not save profile', profileError.code === '23505' ? 'This phone number is already associated with another MVS account.' : `${profileError.message}${profileError.code ? ` (${profileError.code})` : ''}`);
      return;
    }

    await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        full_name: cleanName,
        phone: formattedPhoneNumber,
        specialty: cleanSpecialty,
        clinic: cleanClinic,
        license_number: cleanLicenseNumber,
        bio: cleanBio,
      },
    });

    setProfile((current) => ({ ...current, phone: formattedPhoneNumber, clinic: cleanClinic, specialty: cleanSpecialty, licenseNumber: cleanLicenseNumber, bio: cleanBio }));
    setModal(null);
    setSuccessMessage('Profile updated successfully.');
    setTimeout(() => setSuccessMessage(null), 3000);
    Alert.alert('Profile Updated', 'Your profile changes have been saved.');
  };

  const detectAndSaveLocation = async () => {
    setLocationLoading(true);
    try {
      const location = await requestDeviceLocation();
      if (!location) throw new Error('Location permission was not granted.');
      const user = await getCurrentUser();
      setProfile((current) => ({ ...current, ...location }));
      if (user) {
        const { error } = await supabase.from('profiles').update(location).eq('id', user.id);
        if (error) throw error;
      }
      setLocationPickerVisible(false);
      setLocationStatePicker(null);
      Alert.alert('Location updated', `${location.city || 'Nearby area'}, ${location.state || 'Nigeria'}`);
    } catch (error) {
      Alert.alert('Location unavailable', error instanceof Error ? error.message : 'Enable location access or choose manually.');
    } finally {
      setLocationLoading(false);
    }
  };

  const selectManualLocation = async (city: string, state: string) => {
    setProfile((current) => ({ ...current, city, state, latitude: null, longitude: null }));
    const user = await getCurrentUser();
    if (user) {
      const { error } = await supabase.from('profiles').update({ city, state, latitude: null, longitude: null }).eq('id', user.id);
      if (error) {
        Alert.alert('Could not save location', error.message);
        return;
      }
    }
    setLocationPickerVisible(false);
    setLocationStatePicker(null);
  };

  const handleSaveBankDetails = async () => {
    if (bankSaving) return;
    setBankSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const bankCode = profile.bankCode || '221';
      const accountNumber = profile.accountNumber || '';
      const selectedBank = NIGERIAN_BANKS.find((bank) => bank.code === bankCode);

      if (!selectedBank) {
        Alert.alert('Select a bank', 'Choose your Nigerian bank before saving.');
        return;
      }
      if (!/^\d{10}$/.test(accountNumber)) {
        Alert.alert('Invalid account number', 'Account number must contain exactly 10 digits.');
        return;
      }

      const { error: dbErr } = await supabase.from('profiles').update({
        bank_name: sanitizeInput(selectedBank.label),
        bank_code: sanitizeInput(bankCode),
        account_number: sanitizeInput(accountNumber),
        account_name: sanitizeInput(profile.accountName),
      }).eq('id', user.id);

      if (dbErr) {
        Alert.alert('Database Error', dbErr.message);
        return;
      }

      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('create-subaccount', {
        body: {
          userId: user.id,
          bankCode,
          accountNumber,
          businessName: user.user_metadata?.full_name || profile.name,
          email: user.email || profile.email,
          phone: user.user_metadata?.phone || profile.phone,
        },
      });

      if (edgeErr || !edgeData?.success) {
        Alert.alert('Warning', `Bank saved, but subaccount creation failed: ${edgeErr?.message || edgeData?.error || 'Unknown error'}`);
        return;
      }

      if (edgeData.subaccount_id) {
        const { error: subaccountProfileError } = await supabase.from('profiles').update({ flutterwave_subaccount_id: edgeData.subaccount_id }).eq('id', user.id);
        if (subaccountProfileError) {
          Alert.alert('Warning', `Bank saved, but subaccount ID could not be saved: ${subaccountProfileError.message}`);
          return;
        }
      }

      const { data: refreshedProfile, error: refreshError } = await supabase.from('profiles').select('bank_name, bank_code, account_number, account_name, flutterwave_subaccount_id').eq('id', user.id).maybeSingle();
      if (refreshError) {
        Alert.alert('Database Error', refreshError.message);
        return;
      }

      if (refreshedProfile) {
        setProfile((prev) => ({
          ...prev,
          bankName: refreshedProfile.bank_name || '',
          bankCode: refreshedProfile.bank_code || '',
          accountNumber: refreshedProfile.account_number || '',
          accountName: refreshedProfile.account_name || '',
          flutterwaveSubaccountId: refreshedProfile.flutterwave_subaccount_id || '',
        }));
      }

      Alert.alert('Success', 'Bank account & Flutterwave subaccount setup complete!');
      setModal(null);
    } finally {
      setBankSaving(false);
    }
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
    } catch {
      Alert.alert('Error', 'Could not send reset link');
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      setProfile((current) => ({ ...current, name: '', email: '', phone: '', specialty: '', clinic: '', licenseNumber: '', avatar: '', bankName: '', bankCode: '', accountNumber: '', accountName: '', flutterwaveSubaccountId: '', latitude: null, longitude: null, city: '', state: '' }));
      setAvatarUrl(null);
      router.replace('/(auth)/login');
    } catch (error) {
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

        await signOutUser();
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

    Alert.alert('Delete Account', 'Are you sure you want to delete your account? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void confirmDelete(); } },
    ]);
  };

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const user = await getCurrentUser();
      if (!user) return;
      const asset = result.assets[0];
      const file = await (await fetch(asset.uri)).blob();
      const fileName = asset.fileName || asset.uri.split('/').pop() || `avatar-${Date.now()}.jpg`;
      const fileExt = fileName.split('.').pop() || 'jpg';
      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true, contentType: asset.mimeType || file.type });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (profileError) throw profileError;
      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      if (authError) throw authError;
      setAvatarUrl(publicUrl);
      setProfile((prev) => ({ ...prev, avatar: publicUrl }));
      setSuccessMessage('Profile photo updated successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      Alert.alert('Could not update profile photo', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {successMessage ? (
        <View style={styles.toast}>
          <MaterialCommunityIcons name="check-circle" size={18} color="#D1FAE5" />
          <Text style={styles.toastText}>{successMessage}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>My Profile</Text>

        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={pickAvatar} accessibilityLabel="Change profile photo">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <MaterialCommunityIcons name="stethoscope" size={36} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.flex}>
            <Text style={styles.title}>{profile.name}</Text>
            <Text style={styles.muted}>{profile.email}</Text>
            <Text style={{ color: profile.phone ? '#34D399' : '#94A3B8', fontSize: 12, marginTop: 4 }}>
              {profile.phone ? 'Phone number saved' : 'No phone number saved'}
            </Text>
            <TouchableOpacity onPress={pickAvatar} accessibilityLabel="Tap to change photo">
              <Text style={styles.editHint}>Tap to change photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Practice Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Practice Information</Text>
          <InfoRow icon="hospital-box" label="Clinic" value={profile.clinic || 'Not set'} />
          <InfoRow icon="briefcase" label="Specialty" value={profile.specialty || 'Not set'} />
          {role === 'vet' ? <InfoRow icon="text-box-outline" label="Bio" value={profile.bio || 'Add a short bio'} /> : null}
          <InfoRow icon="card-account-details" label="License Number" value={profile.licenseNumber || 'Not set'} />
          <InfoRow icon="phone" label="Phone" value={profile.phone || 'Not set'} />
        </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <Setting label="Edit Profile" icon="pencil" onPress={() => setModal('profile')} />
          <Setting label="Change Password" icon="lock" onPress={() => setModal('password')} />
          <Setting label="Notifications" icon="bell" onPress={() => setModal('notifications')} />
          <Setting label="Bank Account" icon="bank" onPress={() => setModal('bank')} />
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

      {/* Edit Profile Modal */}
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
              <Field label="Full Name" value={profile.name} onChangeText={(text) => setProfile((prev) => ({ ...prev, name: text }))} placeholder="Dr. Your Name" />
              <Field label="Email" value={profile.email} onChangeText={(text) => setProfile((prev) => ({ ...prev, email: text }))} editable={false} />
              <Field label="Phone" value={profile.phone} onChangeText={(text) => setProfile((prev) => ({ ...prev, phone: text }))} placeholder="+234 XXX XXX XXXX" />
              {role === 'vet' ? (
                <>
                  <Field label="Specialty" value={profile.specialty} onChangeText={(text) => setProfile((prev) => ({ ...prev, specialty: text }))} placeholder="e.g., Small Animal, Surgery" />
                  <Field label="Clinic Name" value={profile.clinic} onChangeText={(text) => setProfile((prev) => ({ ...prev, clinic: text }))} placeholder="Your clinic or hospital name" />
                  <View style={styles.field}>
                    <Text style={styles.label}>Bio</Text>
                    <TextInput
                      value={profile.bio}
                      onChangeText={(text) => setProfile((prev) => ({ ...prev, bio: text.slice(0, 238) }))}
                      placeholder="Tell clients a little about your practice"
                      placeholderTextColor="#64748B"
                      maxLength={238}
                      multiline
                      style={[styles.input, styles.bioInput]}
                    />
                    <Text style={styles.characterCount}>{profile.bio.length}/238</Text>
                  </View>
                  <Field label="License Number" value={profile.licenseNumber} onChangeText={(text) => setProfile((prev) => ({ ...prev, licenseNumber: text }))} placeholder="Veterinary license number" />
                </>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Location</Text>
                <TouchableOpacity style={styles.input} onPress={() => setLocationPickerVisible(true)}>
                  <Text style={profile.city && profile.state ? styles.inputText : styles.placeholder}>
                    {profile.city && profile.state ? `${profile.city}, ${profile.state}` : 'Select city and state'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.save} onPress={saveProfile}>
                <Text style={styles.saveText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bank Account Modal */}
      <Modal visible={modal === 'bank'} animationType="fade" transparent onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={styles.bankModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.bankModalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModal(null)} disabled={bankSaving}>
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Bank Account</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={true} style={styles.modalBody}>
              <View style={styles.field}>
                <Text style={styles.label}>Bank</Text>
                <TouchableOpacity style={styles.input} onPress={() => setBankPickerVisible(true)} disabled={bankSaving}>
                  <Text style={profile.bankCode ? styles.inputText : styles.placeholder}>{profile.bankName || 'Select your bank'}</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              </View>
              <Field label="Account Number" value={profile.accountNumber} onChangeText={(text) => setProfile((prev) => ({ ...prev, accountNumber: text.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit account number" keyboardType="number-pad" />
              <Field label="Account Name" value={profile.accountName} onChangeText={(text) => setProfile((prev) => ({ ...prev, accountName: text }))} placeholder="Name on account" />

              <TouchableOpacity style={styles.save} onPress={() => { void handleSaveBankDetails(); }} disabled={bankSaving}>
                <Text style={styles.saveText}>{bankSaving ? 'Saving...' : 'Save Bank Details'}</Text>
                {bankSaving && <ActivityIndicator color="#FFFFFF" style={styles.saveSpinner} />}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Location Picker Modal */}
      <Modal visible={locationPickerVisible} transparent animationType="slide" onRequestClose={() => { setLocationPickerVisible(false); setLocationStatePicker(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.locationPickerContent}>
            <View style={styles.locationHeader}>
              <Text style={styles.modalTitle}>Choose location</Text>
              <TouchableOpacity onPress={() => { setLocationPickerVisible(false); setLocationStatePicker(null); }}>
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.save} onPress={() => { void detectAndSaveLocation(); }} disabled={locationLoading}>
              <Text style={styles.saveText}>{locationLoading ? 'Detecting location...' : 'Use My Location'}</Text>
            </TouchableOpacity>

            {locationStatePicker ? (
              <TouchableOpacity style={styles.locationBack} onPress={() => setLocationStatePicker(null)}>
                <Text style={styles.secondaryText}>‹ Choose another state</Text>
              </TouchableOpacity>
            ) : null}

            <ScrollView style={styles.locationList} contentContainerStyle={styles.locationListContent} showsVerticalScrollIndicator>
              {locationStatePicker
                ? NIGERIAN_LOCATIONS.find((location) => location.state === locationStatePicker)?.areas.map((area) => (
                    <TouchableOpacity key={area} style={styles.locationOption} onPress={() => { void selectManualLocation(area, locationStatePicker); }}>
                      <Text style={styles.primary}>{area}</Text>
                      <Text style={styles.muted}>{locationStatePicker}</Text>
                    </TouchableOpacity>
                  ))
                : NIGERIAN_LOCATIONS.map((location) => (
                    <TouchableOpacity key={location.state} style={styles.locationOption} onPress={() => setLocationStatePicker(location.state)}>
                      <Text style={styles.primary}>{location.state}</Text>
                      <Text style={styles.muted}>{location.city}</Text>
                    </TouchableOpacity>
                  ))}
            </ScrollView>

            <TouchableOpacity style={styles.locationCancel} onPress={() => { setLocationPickerVisible(false); setLocationStatePicker(null); }}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bank Picker Modal */}
      <Modal visible={bankPickerVisible} animationType="slide" transparent onRequestClose={() => setBankPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.modalTitle}>Select Bank</Text>
              <TouchableOpacity onPress={() => setBankPickerVisible(false)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={true}>
              {NIGERIAN_BANKS.map((bank) => (
                <TouchableOpacity key={bank.code} style={styles.bankOption} onPress={() => { setProfile((prev) => ({ ...prev, bankCode: bank.code, bankName: bank.label })); setBankPickerVisible(false); }}>
                  <Text style={styles.primary}>{bank.label}</Text>
                  <Text style={styles.bankCode}>{bank.code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.secondary} onPress={() => setBankPickerVisible(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
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

              <Field label="New Password" value={password.next} onChangeText={(text) => setPassword((prev) => ({ ...prev, next: text }))} placeholder="Minimum 6 characters" secureTextEntry />
              <Field label="Confirm Password" value={password.confirm} onChangeText={(text) => setPassword((prev) => ({ ...prev, confirm: text }))} placeholder="Re-enter your password" secureTextEntry />

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

      {/* Notifications Modal */}
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
              {notificationOptions.map((option) => (
                <Toggle
                  key={option.key}
                  label={option.label}
                  value={notifications[option.key]}
                  onChange={(value) => {
                    const updated = { ...notifications, [option.key]: value } as NotificationPreferences;
                    setNotifications(updated);
                    void saveNotificationPreferences(updated);
                  }}
                />
              ))}

              <TouchableOpacity style={styles.save} onPress={() => { void saveNotificationPreferences(notifications); setModal(null); }}>
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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  editable = true,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  editable?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
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
        keyboardType={keyboardType}
        style={[styles.input, !editable && styles.inputDisabled]}
      />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.primary}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#334155', true: '#10B981' }} thumbColor="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  muted: {
    fontSize: 14,
    color: '#94A3B8',
  },
  primary: {
    fontSize: 16,
    color: '#F8FAFC',
  },
  editHint: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 15,
    color: '#F8FAFC',
    fontWeight: '500',
  },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chevron: {
    fontSize: 20,
    color: '#64748B',
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    padding: 14,
    borderRadius: 12,
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  deleteText: {
    color: '#FCA5A5',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  modalBody: {
    padding: 20,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 15,
  },
  bioInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  characterCount: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  inputText: {
    color: '#F8FAFC',
    fontSize: 15,
  },
  placeholder: {
    color: '#64748B',
    fontSize: 15,
  },
  save: {
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  saveSpinner: {
    marginLeft: 8,
  },
  secondary: {
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryText: {
    color: '#94A3B8',
    fontSize: 15,
  },
  info: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  bankModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  bankModalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  pickerContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
    gap: 16,
  },
  bankOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  bankCode: {
    color: '#64748B',
    fontSize: 14,
  },
  locationPickerContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
    gap: 12,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationBack: {
    paddingVertical: 8,
  },
  locationList: {
    maxHeight: 300,
  },
  locationListContent: {
    paddingBottom: 16,
  },
  locationOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  locationCancel: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  toast: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: '#065F46',
    borderRadius: 9,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastText: {
    color: '#D1FAE5',
    fontWeight: '600',
  },
});
