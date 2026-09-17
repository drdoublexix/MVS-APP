import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { router, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { registerForPushNotifications } from '../../lib/notifications';
import { isValidPassword, PASSWORD_REQUIREMENTS } from '../../lib/password';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, readCachedAuthState, sendPasswordResetLink, signOutUser, supabase, updatePassword } from '../../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type SettingsModal = 'profile' | 'password' | 'notifications' | 'bank' | null;

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

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    setLoading(true);
    try {
      await signOutUser();
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.localStorage.clear();
          window.sessionStorage.clear();
          window.location.replace('/login');
        }
      } else {
        router.replace('/(auth)/login');
      }
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.replace('/login');
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
  const [bankPickerVisible, setBankPickerVisible] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    name: 'Merchant',
    email: '',
    phone: '',
    business: '',
    location: '',
    cacRegNumber: '',
    avatar: '',
    bankName: '',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    flutterwaveSubaccountId: '',
  });
  const [password, setPassword] = useState({ next: '', confirm: '' });
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

  const notificationOptions: Array<{ key: keyof NotificationPreferences; label: string }> = [
    { key: 'orders', label: 'New Orders / Order Updates' },
    { key: 'chat', label: 'Customer Inquiries / Chat Messages' },
    { key: 'payouts', label: 'Payout Notifications / Payout & Earnings' },
  ];

  const [notifications, setNotifications] = useState<NotificationPreferences>(buildDefaultNotificationPreferences());

  const requestNotificationPermission = async (userId: string) => {
    await registerForPushNotifications(userId);
  };

  const loadNotificationPreferences = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle();

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
      await requestNotificationPermission(user.id);
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
        setProfile({
          name: cachedProfile?.full_name || cachedUser.user_metadata?.full_name || cachedUser.user_metadata?.name || 'Merchant',
          email: cachedUser.email || cachedProfile?.email || '',
          phone: cachedProfile?.phone_number || cachedUser.user_metadata?.phone || '',
          business: cachedProfile?.business_name || cachedUser.user_metadata?.business || '',
          location: cachedProfile?.location || cachedUser.user_metadata?.location || '',
          cacRegNumber: cachedProfile?.cac_reg_number || cachedUser.user_metadata?.cac_reg_number || '',
          avatar: cachedAvatar || '',
          bankName: '',
          bankCode: '',
          accountNumber: '',
          accountName: '',
          flutterwaveSubaccountId: '',
        });
      }

      const user = await getCurrentUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url, business_name, location, cac_reg_number, phone_number')
        .eq('id', user.id)
        .single();

      const activeAvatar =
        profileData?.avatar_url ||
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null;

      setAvatarUrl(activeAvatar);
      setProfile({
        name: user.user_metadata?.full_name || user.user_metadata?.name || 'Merchant',
        email: user.email || '',
        phone: profileData?.phone_number || user.user_metadata?.phone || '',
        business: profileData?.business_name || user.user_metadata?.business || '',
        location: profileData?.location || user.user_metadata?.location || '',
        cacRegNumber: profileData?.cac_reg_number || user.user_metadata?.cac_reg_number || '',
        avatar: activeAvatar || '',
        bankName: '',
        bankCode: '',
        accountNumber: '',
        accountName: '',
        flutterwaveSubaccountId: '',
      });

      void supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.phone_number) setProfile((prev) => ({ ...prev, phone: data.phone_number }));
        });

      void supabase
        .from('profiles')
        .select('bank_name, bank_code, account_number, account_name, flutterwave_subaccount_id')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setProfile((prev) => ({
              ...prev,
              bankName: data.bank_name || '',
              bankCode: data.bank_code || '',
              accountNumber: data.account_number || '',
              accountName: data.account_name || '',
              flutterwaveSubaccountId: data.flutterwave_subaccount_id || '',
            }));
          }
        });

      void loadNotificationPreferences(user.id);
    })().catch(() => undefined);
  }, []);

  const saveProfile = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const cleanName = sanitizeInput(profile.name);
    const cleanBusiness = sanitizeInput(profile.business);
    const cleanLocation = sanitizeInput(profile.location);
    const cleanCacRegNumber = sanitizeInput(profile.cacRegNumber);
    const formattedPhoneNumber = sanitizeInput(profile.phone).replace(/[\s()-]/g, '');

    if (!/^\+[1-9]\d{7,14}$/.test(formattedPhoneNumber)) {
      Alert.alert('Invalid phone number', 'Enter a valid international number, for example +2348000000000.');
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        business_name: cleanBusiness,
        location: cleanLocation,
        cac_reg_number: cleanCacRegNumber,
        phone_number: formattedPhoneNumber,
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('[Merchant Profile] Failed to update profile:', profileError.message);
      Alert.alert(
        profileError.code === '23505' ? 'Phone number unavailable' : 'Could not save profile',
        profileError.code === '23505'
          ? 'This phone number is already associated with another MVS account.'
          : profileError.message
      );
      return;
    }

    await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        full_name: cleanName,
        phone: formattedPhoneNumber,
        business: cleanBusiness,
        location: cleanLocation,
        cac_reg_number: cleanCacRegNumber,
      },
    });

    setProfile((current) => ({ ...current, phone: formattedPhoneNumber }));
    setModal(null);
    setSuccessMessage('Profile updated successfully.');
    setTimeout(() => setSuccessMessage(null), 3000);
    Alert.alert('Profile Updated', 'Your business information has been saved.');
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

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({
          bank_name: sanitizeInput(selectedBank.label),
          bank_code: sanitizeInput(bankCode),
          account_number: sanitizeInput(accountNumber),
          account_name: sanitizeInput(profile.accountName),
        })
        .eq('id', user.id);

      if (dbErr) {
        Alert.alert('Database Error', dbErr.message);
        return;
      }

      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('create-subaccount', {
        body: {
          userId: user.id,
          bankCode,
          accountNumber,
          businessName: profile.business || user.user_metadata?.full_name || 'Merchant',
          email: user.email,
          phone: profile.phone,
        },
      });

      if (edgeErr || !edgeData?.success) {
        Alert.alert('Warning', `Bank saved, but subaccount setup failed: ${edgeErr?.message || edgeData?.error || 'Unknown error'}`);
        return;
      }

      if (edgeData.subaccount_id) {
        await supabase
          .from('profiles')
          .update({ flutterwave_subaccount_id: edgeData.subaccount_id })
          .eq('id', user.id);
      }

      setSuccessMessage('Bank account & subaccount saved successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setModal(null);
    } finally {
      setBankSaving(false);
    }
  };

  const changePassword = async () => {
    if (!isValidPassword(password.next)) {
      Alert.alert('Invalid password', PASSWORD_REQUIREMENTS);
      return;
    }
    if (password.next !== password.confirm) {
      Alert.alert('Passwords do not match', 'Please make sure both password fields match.');
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

  const handleDeleteAccount = () => {
    const confirmDelete = async () => {
      try {
        const { error } = await supabase.rpc('delete_user_account');
        if (error) throw error;
        await signOutUser();
        setProfile((current) => ({ ...current, name: '', email: '', phone: '', business: '', location: '', cacRegNumber: '', avatar: '', bankName: '', bankCode: '', accountNumber: '', accountName: '', flutterwaveSubaccountId: '' }));
        setAvatarUrl(null);
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;
      const user = await getCurrentUser();
      if (!user) return;

      const asset = result.assets[0];
      const file = await (await fetch(asset.uri)).blob();
      const fileName = asset.fileName || asset.uri.split('/').pop() || `avatar-${Date.now()}.jpg`;
      const fileExt = fileName.split('.').pop() || 'jpg';
      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
        upsert: true,
        contentType: asset.mimeType || file.type,
      });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });

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
        <View style={styles.successBanner}>
          <MaterialCommunityIcons name="check-circle" size={18} color="#D1FAE5" />
          <Text style={styles.successBannerText}>{successMessage}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>My Profile</Text>

        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={pickAvatar} accessibilityLabel="Change profile photo">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <MaterialCommunityIcons name="storefront" size={36} color="#FFFFFF" />
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Information</Text>
          <InfoRow icon="storefront" label="Business Name" value={profile.business || 'Not set'} />
          <InfoRow icon="map-marker" label="Location" value={profile.location || 'Not set'} />
          <InfoRow icon="file-document" label="CAC Reg Number" value={profile.cacRegNumber || 'Not set'} />
          <InfoRow icon="phone" label="Phone" value={profile.phone || 'Not set'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <Setting label="Edit Profile" icon="pencil" onPress={() => setModal('profile')} />
          <Setting label="My Inventory" icon="archive" onPress={() => router.push('/inventory')} />
          <Setting label="Change Password" icon="lock" onPress={() => setModal('password')} />
          <Setting label="Notifications" icon="bell" onPress={() => setModal('notifications')} />
          <Setting label="Bank Account" icon="bank" onPress={() => setModal('bank')} />
        </View>

        <View style={styles.section}>
          <LogoutButton />
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
              <Field label="Full Name" value={profile.name} onChangeText={(text) => setProfile((prev) => ({ ...prev, name: text }))} placeholder="Your Name" />
              <Field label="Email" value={profile.email} onChangeText={(text) => setProfile((prev) => ({ ...prev, email: text }))} editable={false} />
              <Field label="Phone" value={profile.phone} onChangeText={(text) => setProfile((prev) => ({ ...prev, phone: text }))} placeholder="+234 XXX XXX XXXX" />
              <Field label="Business Name" value={profile.business} onChangeText={(text) => setProfile((prev) => ({ ...prev, business: text }))} placeholder="Your business name" />
              <Field label="Location" value={profile.location} onChangeText={(text) => setProfile((prev) => ({ ...prev, location: text }))} placeholder="Business location" />
              <Field label="CAC Reg Number" value={profile.cacRegNumber} onChangeText={(text) => setProfile((prev) => ({ ...prev, cacRegNumber: text }))} placeholder="Your CAC registration number" />

              <TouchableOpacity style={styles.save} onPress={saveProfile}>
                <Text style={styles.saveText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bank Details Modal */}
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
                  <Text style={profile.bankCode ? styles.inputText : styles.placeholder}>
                    {profile.bankName || 'Select your bank'}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              </View>

              <Field
                label="Account Number"
                value={profile.accountNumber}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, accountNumber: text.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="10-digit account number"
                keyboardType="number-pad"
              />
              <Field
                label="Account Name"
                value={profile.accountName}
                onChangeText={(text) => setProfile((prev) => ({ ...prev, accountName: text }))}
                placeholder="Name on account"
              />

              <TouchableOpacity style={styles.save} onPress={() => { void handleSaveBankDetails(); }} disabled={bankSaving}>
                <Text style={styles.saveText}>{bankSaving ? 'Saving...' : 'Save Bank Details'}</Text>
                {bankSaving && <ActivityIndicator color="#FFFFFF" style={styles.saveSpinner} />}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bank Selection Modal */}
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
                <TouchableOpacity
                  key={bank.code}
                  style={styles.bankOption}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, bankCode: bank.code, bankName: bank.label }));
                    setBankPickerVisible(false);
                  }}
                >
                  <Text style={styles.primary}>{bank.label}</Text>
                  <Text style={styles.bankCode}>{bank.code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Password Modal */}
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
              <Text style={styles.info}>Password must contain at least 8 characters including a capital letter, a small letter, a number, and a symbol.</Text>
              <Field label="New Password" value={password.next} onChangeText={(text) => setPassword((prev) => ({ ...prev, next: text }))} placeholder={PASSWORD_REQUIREMENTS} secureTextEntry />
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

      {/* Notification Preferences Modal */}
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
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {secureTextEntry ? <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', padding: 0 }]}><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" secureTextEntry={!visible} editable={editable} keyboardType={keyboardType} style={{ flex: 1, padding: 13, paddingRight: 8, color: '#FFFFFF', fontSize: 15 }} /><TouchableOpacity onPress={() => setVisible((current) => !current)} accessibilityLabel={visible ? 'Hide password' : 'Show password'} style={{ padding: 10 }}><MaterialCommunityIcons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" /></TouchableOpacity></View> : <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" editable={editable} keyboardType={keyboardType} style={[styles.input, !editable && styles.inputDisabled]} />}
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
  deleteButton: { borderColor: '#EF4444', borderWidth: 1.5, borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  deleteText: { color: '#FCA5A5', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'flex-end' },
  bankModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  bankModalContent: { backgroundColor: '#0F172A', borderRadius: 20, maxHeight: '85%', width: '90%', maxWidth: 450, overflow: 'hidden' },
  modalContent: { backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 16 },
  info: { color: '#94A3B8', fontSize: 13, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', padding: 12, fontSize: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputText: { color: '#FFFFFF', fontSize: 14 },
  placeholder: { color: '#64748B', fontSize: 14 },
  pickerContent: { backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%' },
  bankOption: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bankCode: { color: '#94A3B8', fontSize: 13 },
  inputDisabled: { backgroundColor: '#0F172A', color: '#64748B' },
  save: { backgroundColor: '#45B7D1', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20, marginBottom: 10, flexDirection: 'row', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  saveSpinner: { marginLeft: 8 },
  secondary: { borderColor: '#45B7D1', borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  secondaryText: { color: '#45B7D1', fontWeight: '600', fontSize: 14 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 12 },
  successBanner: { position: 'absolute', top: 14, left: 16, right: 16, zIndex: 10, backgroundColor: '#065F46', borderRadius: 9, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  successBannerText: { color: '#D1FAE5', fontWeight: '600' },
});
