import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import EditPetModal, { type EditablePet } from '../../components/EditPetModal';
import PetMedicalHistory from '../../components/PetMedicalHistory';
import { NIGERIAN_LOCATIONS, requestDeviceLocation } from '../../lib/location';
import { calculatePetAgeInWeeks } from '../../lib/petAge';
import { getCurrentUser, sendPasswordResetLink, signOutUser, supabase, updatePassword } from '../../lib/supabase';

type Pet = EditablePet & { owner_id: string };
type SettingsModal = 'profile' | 'password' | 'notifications' | null;
const emptyPet: EditablePet = { id: '', name: '', type: '', breed: '', dob: '', vaccination_status: 'Not Vaccinated', medical_notes: '', photos: [] };
const petAge = calculatePetAgeInWeeks;

export default function ProfileScreen() {
  const router = useRouter();
  const [modal, setModal] = useState<SettingsModal>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationStatePicker, setLocationStatePicker] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [petEditorVisible, setPetEditorVisible] = useState(false);
  const [profileState, setProfile] = useState<{ name?: string; phone?: string; email?: string; avatar_url?: string; latitude?: number | null; longitude?: number | null; city?: string; state?: string } | null>(null);
  const [storedAvatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const profile = { name: profileState?.name || '', phone: profileState?.phone || '', email: profileState?.email || '', avatar_url: profileState?.avatar_url, latitude: profileState?.latitude ?? null, longitude: profileState?.longitude ?? null, city: profileState?.city || '', state: profileState?.state || '' };
  const [currentUserId, setCurrentUserId] = useState('');
  const [pets, setPets] = useState<Pet[]>([]);
  const [editingPet, setEditingPet] = useState<EditablePet>(emptyPet);
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [notifications, setNotifications] = useState({
    consultation_updates: true,
    chat_messages: true,
    vaccine_health_reminders: true,
    order_updates: true,
  });

  const loadPets = async (ownerId: string) => {
    const { data } = await supabase.from('pets').select('*').eq('owner_id', ownerId).order('created_at', { ascending: true });
    setPets((data || []) as Pet[]);
  };

  const loadNotificationPreferences = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('avatar_url, notification_preferences, phone_number').eq('id', userId).maybeSingle();
    if (data?.notification_preferences && typeof data.notification_preferences === 'object') {
      setNotifications(data.notification_preferences);
    }
    if (data?.avatar_url && typeof data.avatar_url === 'string' && data.avatar_url.trim() !== '') {
      setProfile((current) => ({ ...(current || {}), avatar_url: current?.avatar_url || data.avatar_url }));
    }
    if (data?.phone_number) setProfile((current) => ({ ...(current || {}), phone: data.phone_number }));
  };

  const saveNotificationPreferences = async (prefs: typeof notifications) => {
    const user = await getCurrentUser();
    if (!user) return;
    await supabase.from('profiles').update({ notification_preferences: prefs }).eq('id', user.id);
  };

  useEffect(() => {
    void (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const currentUser = authUser || await getCurrentUser();
      if (!currentUser) return;

      setUser(currentUser);
      setCurrentUserId(currentUser.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url, phone_number')
        .eq('id', currentUser.id)
        .single();
      const activeAvatar = profileData?.avatar_url || currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;
      setAvatarUrl(activeAvatar);

      setProfile((current) => ({
        ...(current || {}),
        name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || 'Pet Owner',
        phone: profileData?.phone_number || currentUser.user_metadata?.phone || '',
        email: currentUser.email || '',
        avatar_url: profileData?.avatar_url || currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || '',
      }));

      await loadPets(currentUser.id);
      await loadNotificationPreferences(currentUser.id);
    })().catch(() => undefined);
  }, []);

  const openPet = (pet?: Pet) => {
    setEditingPet(pet ? { id: pet.id, name: pet.name, type: pet.type, breed: pet.breed || '', dob: pet.dob, vaccination_status: pet.vaccination_status || 'Not Vaccinated', medical_notes: pet.medical_notes || '', photos: pet.photos || [] } : { ...emptyPet });
    setPetEditorVisible(true);
  };

  const savePet = async (petDraft: EditablePet) => {
    if (!currentUserId || !petDraft.name.trim() || !petDraft.type.trim()) return;
    const { data, error } = await supabase.from('pets').upsert({ id: petDraft.id || undefined, owner_id: currentUserId, name: petDraft.name.trim(), type: petDraft.type.trim(), breed: petDraft.breed?.trim() || null, dob: petDraft.dob || null, vaccination_status: petDraft.vaccination_status, medical_notes: petDraft.medical_notes?.trim() || null, photos: petDraft.photos, updated_at: new Date().toISOString() }).select().single();
    if (error) { Alert.alert('Could not save pet', error.message); return; }
    setPets((current) => current.some((pet) => pet.id === data.id) ? current.map((pet) => pet.id === data.id ? data as Pet : pet) : [...current, data as Pet]);
  };

  const saveProfile = async () => { const user = await getCurrentUser(); if (!user || !profile) return; const formattedPhoneNumber = profile.phone.trim().replace(/[\s()-]/g, ''); if (!/^\+[1-9]\d{7,14}$/.test(formattedPhoneNumber)) { Alert.alert('Invalid phone number', 'Enter a valid international number, for example +2348000000000.'); return; } const { error } = await supabase.from('profiles').update({ full_name: profile.name, phone_number: formattedPhoneNumber, latitude: profile.latitude, longitude: profile.longitude, city: profile.city, state: profile.state }).eq('id', user.id); if (error) { Alert.alert(error.code === '23505' ? 'Phone number unavailable' : 'Could not save profile', error.code === '23505' ? 'This phone number is already associated with another MVS account.' : error.message); return; } await supabase.auth.updateUser({ data: { ...user.user_metadata, full_name: profile.name, phone: formattedPhoneNumber } }); setProfile((current) => ({ ...current, phone: formattedPhoneNumber })); setModal(null); setSuccessMessage('Phone number updated successfully.'); setTimeout(() => setSuccessMessage(null), 3000); };
  const detectAndSaveLocation = async () => { console.log('[Client Profile] Detecting location...'); setLocationLoading(true); try { const location = await requestDeviceLocation(); if (!location) throw new Error('Location permission was not granted.'); const user = await getCurrentUser(); setProfile((current) => ({ ...current, ...location })); if (user) { const { error } = await supabase.from('profiles').update(location).eq('id', user.id); if (error) throw error; } console.log('[Client Profile] Location saved:', location); setLocationPickerVisible(false); setLocationStatePicker(null); Alert.alert('Location updated', `${location.city || 'Nearby area'}, ${location.state || 'Nigeria'}`); } catch (error) { console.log('[Client Profile] Location error:', error); Alert.alert('Location unavailable', error instanceof Error ? error.message : 'Enable location access or choose manually.'); } finally { setLocationLoading(false); } };
  const selectManualLocation = async (city: string, state: string) => { console.log('[Client Profile] Saving manual location:', city, state); setProfile((current) => ({ ...current, city, state, latitude: null, longitude: null })); const user = await getCurrentUser(); if (user) { const { error } = await supabase.from('profiles').update({ city, state, latitude: null, longitude: null }).eq('id', user.id); if (error) { Alert.alert('Could not save location', error.message); return; } } setLocationPickerVisible(false); setLocationStatePicker(null); };
  const changePassword = async () => { if (password.next.length < 6 || password.next !== password.confirm) return; await updatePassword(password.next); setPassword({ next: '', confirm: '' }); setModal(null); Alert.alert('Password updated', 'Your password has been changed.'); };
  const sendResetLink = async () => { if (!profile?.email) return; await sendPasswordResetLink(profile.email); Alert.alert('Reset link sent', 'Check your email to choose a new password.'); };
  const handleLogout = async () => { await signOutUser(); router.replace('/'); };
  const handleDeleteAccount = () => {
    const confirmDelete = async () => { try { const { error } = await supabase.rpc('delete_user_account'); if (error) throw error; await supabase.auth.signOut(); router.replace('/(auth)/login'); } catch (error) { Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete account.'); } };
    if (Platform.OS === 'web' && window.confirm('Are you sure you want to delete your account?')) { void confirmDelete(); return; }
    Alert.alert('Delete Account', 'This action cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void confirmDelete(); } }]);
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

      const currentUser = await getCurrentUser();
      if (!currentUser) return;

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const file = await response.blob();
      const fileName = asset.fileName || asset.uri.split('/').pop() || `avatar-${Date.now()}.jpg`;
      const fileExt = fileName.split('.').pop() || 'jpg';
      const filePath = `${currentUser.id}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: asset.mimeType || file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const newAvatarUrl = publicUrlData.publicUrl;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', currentUser.id);
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: newAvatarUrl } });
      if (authError) throw authError;

      setProfile((current) => ({ ...(current || {}), avatar_url: newAvatarUrl }));
      setAvatarUrl(newAvatarUrl);
      setSuccessMessage('Profile photo updated successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      Alert.alert('Could not update profile photo', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const profileData = { ...(profileState || {}), avatar_url: storedAvatarUrl || profileState?.avatar_url };
  const avatarUrl = profileData?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  return (
    <SafeAreaView style={styles.container}>
      {successMessage ? <View style={{ position: 'absolute', top: 14, left: 16, right: 16, zIndex: 10, backgroundColor: '#065F46', borderRadius: 9, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialCommunityIcons name="check-circle" size={18} color="#D1FAE5" /><Text style={{ color: '#D1FAE5', fontWeight: '600' }}>{successMessage}</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.profileHeader, { flexDirection: 'row', gap: 16, marginBottom: 25 }]}>
          <TouchableOpacity style={[styles.avatarFallback, { alignSelf: 'auto', marginBottom: 0 }]} onPress={() => { void pickAvatar(); }} accessibilityLabel="Change profile photo">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={[styles.avatar, { alignSelf: 'auto', marginBottom: 0 }]} resizeMode="cover" />
            ) : (
              <MaterialCommunityIcons name="account" size={54} color="#94A3B8" />
            )}
          </TouchableOpacity>
          <View style={styles.flex}>
            <Text style={styles.title}>{profile?.name || 'Pet Owner'}</Text>
            <Text style={styles.muted}>{profile?.email || ''}</Text>
            <Text style={{ color: profile.phone ? '#34D399' : '#94A3B8', fontSize: 12, marginTop: 4 }}>{profile.phone ? 'Phone number saved' : 'No phone number saved'}</Text>
            <TouchableOpacity onPress={() => { void pickAvatar(); }} accessibilityLabel="Tap to change photo">
              <Text style={{ color: '#64748B', fontSize: 11, marginTop: 5 }}>Tap to change photo</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.section}><View style={styles.rowHeader}><Text style={styles.sectionTitle}>My Pets</Text><TouchableOpacity onPress={() => openPet()}><Text style={styles.add}>+</Text></TouchableOpacity></View>{pets.length === 0 ? <Text style={styles.muted}>Add your first pet to keep their details close.</Text> : pets.map((pet) => <View key={pet.id}><TouchableOpacity style={styles.pet} onPress={() => openPet(pet)}>{pet.photos?.[0] ? <Image source={{ uri: pet.photos[0] }} style={styles.petThumb} /> : <View style={styles.paw}><Text style={styles.pawText}>+</Text></View>}<View style={styles.flex}><Text style={styles.primary}>{pet.name}</Text><Text style={styles.muted}>{pet.type} · {pet.breed || 'Breed unknown'} · {petAge(pet.dob)}</Text><Text style={styles.status}>{pet.vaccination_status} · {(pet.photos || []).length}/3 photos</Text></View></TouchableOpacity><PetMedicalHistory petId={pet.id} /></View>)}</View>
        <View style={styles.section}><Text style={styles.sectionTitle}>Account Settings</Text><Setting label="Edit Profile" onPress={() => setModal('profile')} /><Setting label="Change Password" onPress={() => setModal('password')} /><Setting label="Notifications" onPress={() => setModal('notifications')} /></View>
        <TouchableOpacity style={styles.logout} onPress={() => { void handleLogout(); }}><Text style={styles.logoutText}>Log out</Text></TouchableOpacity><TouchableOpacity style={styles.deleteAccount} onPress={handleDeleteAccount}><Text style={styles.deleteText}>Delete account</Text></TouchableOpacity>
      </ScrollView>
      <EditPetModal isVisible={petEditorVisible} onClose={() => setPetEditorVisible(false)} pet={editingPet} userId={currentUserId} onSave={savePet} />
      <Modal visible={modal === 'profile' || modal === 'notifications'} animationType="slide" transparent onRequestClose={() => setModal(null)}><View style={styles.overlay}><View style={styles.modal}><TouchableOpacity style={styles.close} onPress={() => setModal(null)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>{modal === 'profile' ? <Form title="Edit Profile" onSave={() => { void saveProfile(); }}><Field label="Full Name" value={profile.name} onChangeText={(name) => setProfile({ ...profile, name })} /><Field label="Phone Number" value={profile.phone} onChangeText={(phone) => setProfile({ ...profile, phone })} /><Text style={styles.label}>Location</Text><TouchableOpacity style={styles.input} onPress={() => setLocationPickerVisible(true)}><Text style={profile.city && profile.state ? styles.primary : styles.muted}>{profile.city && profile.state ? `${profile.city}, ${profile.state}` : 'Select city and state'}</Text></TouchableOpacity></Form> : modal === 'notifications' ? <View style={{ flex: 1, maxHeight: '85%' }}><View style={styles.notificationHeader}><Text style={styles.modalTitle}>Notifications</Text></View><ScrollView style={{ flex: 1 }}><View style={styles.notificationContent}><Toggle label="Consultation Updates" value={notifications.consultation_updates} onChange={(consultation_updates) => { const updated = { ...notifications, consultation_updates }; setNotifications(updated); void saveNotificationPreferences(updated); }} /><Toggle label="Chat Messages" value={notifications.chat_messages} onChange={(chat_messages) => { const updated = { ...notifications, chat_messages }; setNotifications(updated); void saveNotificationPreferences(updated); }} /><Toggle label="Vaccine & Health Reminders" value={notifications.vaccine_health_reminders} onChange={(vaccine_health_reminders) => { const updated = { ...notifications, vaccine_health_reminders }; setNotifications(updated); void saveNotificationPreferences(updated); }} /><Toggle label="Order Updates" value={notifications.order_updates} onChange={(order_updates) => { const updated = { ...notifications, order_updates }; setNotifications(updated); void saveNotificationPreferences(updated); }} /></View></ScrollView><TouchableOpacity style={styles.save} onPress={() => setModal(null)}><Text style={styles.saveText}>Save Preferences</Text></TouchableOpacity></View> : null}</View></View></Modal>
      <Modal visible={locationPickerVisible} transparent animationType="slide" onRequestClose={() => { setLocationPickerVisible(false); setLocationStatePicker(null); }}><View style={styles.overlay}><View style={styles.locationModal}><View style={locationStyles.locationHeader}><Text style={styles.modalTitle}>Choose location</Text><TouchableOpacity onPress={() => { setLocationPickerVisible(false); setLocationStatePicker(null); }}><Text style={styles.closeText}>✕</Text></TouchableOpacity></View><TouchableOpacity style={styles.save} onPress={() => { void detectAndSaveLocation(); }} disabled={locationLoading}><Text style={styles.saveText}>{locationLoading ? 'Detecting location...' : 'Use My Location'}</Text></TouchableOpacity>{locationStatePicker ? <TouchableOpacity style={locationStyles.locationBack} onPress={() => setLocationStatePicker(null)}><Text style={styles.resetText}>‹ Choose another state</Text></TouchableOpacity> : null}<ScrollView style={locationStyles.locationList} contentContainerStyle={locationStyles.locationListContent} showsVerticalScrollIndicator>{locationStatePicker ? NIGERIAN_LOCATIONS.find((location) => location.state === locationStatePicker)?.areas.map((area) => <TouchableOpacity key={area} style={styles.locationOption} onPress={() => { void selectManualLocation(area, locationStatePicker); }}><Text style={styles.primary}>{area}</Text><Text style={styles.muted}>{locationStatePicker}</Text></TouchableOpacity>) : NIGERIAN_LOCATIONS.map((location) => <TouchableOpacity key={location.state} style={styles.locationOption} onPress={() => setLocationStatePicker(location.state)}><Text style={styles.primary}>{location.state}</Text><Text style={styles.muted}>{location.city}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={locationStyles.locationCancel} onPress={() => { setLocationPickerVisible(false); setLocationStatePicker(null); }}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity></View></View></Modal>
      <Modal visible={modal === 'password'} animationType="fade" transparent onRequestClose={() => setModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 480, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 16, padding: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <TouchableOpacity style={{ position: 'absolute', left: 0, padding: 4 }} onPress={() => setModal(null)} accessibilityLabel="Close change password">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>Change Password</Text>
            </View>
            <Text style={{ color: '#94A3B8', fontSize: 13, lineHeight: 19, marginBottom: 16 }}>Or use the button below to send yourself a password reset link.</Text>
            <Field label="New Password" value={password.next} onChangeText={(next) => setPassword({ ...password, next })} placeholder="Minimum 6 characters" secureTextEntry />
            <Field label="Confirm Password" value={password.confirm} onChangeText={(confirm) => setPassword({ ...password, confirm })} placeholder="Re-enter your password" secureTextEntry />
            <TouchableOpacity style={styles.save} onPress={() => { void changePassword(); }}>
              <Text style={styles.saveText}>Update Password</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ borderColor: '#10B981', borderWidth: 1, borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 10 }} onPress={() => { void sendResetLink(); }}>
              <Text style={{ color: '#6EE7B7', fontWeight: '700' }}>Send Reset Link via Email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Setting({ label, onPress }: { label: string; onPress: () => void }) { return <TouchableOpacity style={styles.setting} onPress={onPress}><Text style={styles.primary}>{label}</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>; }
function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'phone-pad' }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" secureTextEntry={secureTextEntry} keyboardType={keyboardType} style={styles.input} /></View>; }
function Form({ title, onSave, children }: { title: string; onSave: () => void; children: React.ReactNode }) { return <ScrollView><Text style={styles.modalTitle}>{title}</Text>{children}<TouchableOpacity style={styles.save} onPress={onSave}><Text style={styles.saveText}>Save Changes</Text></TouchableOpacity></ScrollView>; }
const locationStyles = StyleSheet.create({ locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, locationList: { flex: 1, minHeight: 0 }, locationListContent: { paddingBottom: 8 }, locationBack: { paddingVertical: 8 }, locationCancel: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12, alignItems: 'center' } });
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.toggle}><Text style={styles.primary}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: '#334155', true: '#10B981' }} /></View>; }

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0F172A' }, content: { padding: 16, paddingBottom: 35 }, profileHeader: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#334155', marginBottom: 22, flexDirection: 'column' }, avatar: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center', marginBottom: 12 }, avatarFallback: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 }, initial: { color: '#FFFFFF', fontSize: 30, fontWeight: '700' }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 4 }, muted: { color: '#94A3B8', fontSize: 12 }, section: { marginBottom: 25 }, rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 17 }, add: { color: '#3B82F6', fontSize: 30 }, pet: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 }, petThumb: { width: 48, height: 48, borderRadius: 12 }, paw: { width: 48, height: 48, backgroundColor: '#102E2A', alignItems: 'center', justifyContent: 'center' }, pawText: { color: '#10B981', fontSize: 24 }, flex: { flex: 1 }, primary: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, status: { color: '#10B981', fontSize: 11, marginTop: 5 }, setting: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, chevron: { color: '#64748B', fontSize: 22 }, logout: { backgroundColor: '#EF4444', borderRadius: 9, padding: 13, alignItems: 'center' }, logoutText: { color: '#FFFFFF', fontWeight: '700' }, deleteAccount: { borderColor: '#EF4444', borderWidth: 1, borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 10 }, deleteText: { color: '#FCA5A5', fontWeight: '700' }, overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-end' }, modal: { backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: 20 }, close: { alignSelf: 'flex-end', paddingRight: 16, paddingTop: 12 }, closeText: { color: '#64748B', fontSize: 16, fontWeight: '600' }, modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 12 }, notificationHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' }, notificationContent: { paddingHorizontal: 16, paddingVertical: 12 }, toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, field: { marginBottom: 12 }, label: { color: '#94A3B8', fontSize: 12, marginBottom: 6 }, input: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#FFFFFF' }, resetLink: { marginTop: 12, paddingVertical: 12, alignItems: 'center' }, resetText: { color: '#60A5FA', fontSize: 12 }, save: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginHorizontal: 16, marginBottom: 16 }, saveText: { color: '#FFFFFF', fontWeight: '700' }, locationModal: { backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingHorizontal: 16 }, locationOption: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8 } });
