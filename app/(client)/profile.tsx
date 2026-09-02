import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, sendPasswordResetLink, signOutUser, supabase, updatePassword } from '../../lib/supabase';

type Pet = { id: string; name: string; type: string; breed: string; age: string; vaccination: string; notes: string; photos: string[] };
type SettingsModal = 'pet' | 'profile' | 'password' | 'notifications' | null;
const emptyPet: Pet = { id: '', name: '', type: '', breed: '', age: '', vaccination: 'Up to date', notes: '', photos: [] };

export default function ProfileScreen() {
  const router = useRouter();
  const [modal, setModal] = useState<SettingsModal>(null);
  const [profile, setProfile] = useState({ name: 'Pet Owner', phone: '', email: '', avatar: '' });
  const [pets, setPets] = useState<Pet[]>([]);
  const [editingPet, setEditingPet] = useState<Pet>(emptyPet);
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [notifications, setNotifications] = useState({ consults: true, orders: true, marketing: false });

  useEffect(() => { void getCurrentUser().then((user) => { if (user) setProfile({ name: user.user_metadata?.full_name || user.user_metadata?.name || 'Pet Owner', phone: user.user_metadata?.phone || '', email: user.email || '', avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || '' }); }).catch(() => undefined); }, []);
  useEffect(() => { void AsyncStorage.getItem('mvs-pets').then((value) => { if (value) setPets(JSON.parse(value)); }).catch(() => undefined); }, []);
  useEffect(() => { void AsyncStorage.setItem('mvs-pets', JSON.stringify(pets)); }, [pets]);

  const openPet = (pet?: Pet) => { setEditingPet(pet ? { ...pet, photos: pet.photos || [] } : { ...emptyPet, id: Date.now().toString() }); setModal('pet'); };
  const savePet = () => { if (!editingPet.name.trim() || !editingPet.type.trim() || !editingPet.breed.trim()) return; setPets((current) => current.some((pet) => pet.id === editingPet.id) ? current.map((pet) => pet.id === editingPet.id ? editingPet : pet) : [...current, editingPet]); setModal(null); };
  const addPhotos = async () => { const remaining = 3 - editingPet.photos.length; if (remaining < 1) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 }); if (!result.canceled) setEditingPet((pet) => ({ ...pet, photos: [...pet.photos, ...result.assets.map((asset) => asset.uri)].slice(0, 3) })); };
  const saveProfile = async () => { setModal(null); const user = await getCurrentUser(); if (!user) return; await supabase.auth.updateUser({ data: { ...user.user_metadata, full_name: profile.name, phone: profile.phone } }); };
  const changePassword = async () => { if (password.next.length < 6 || password.next !== password.confirm) return; await updatePassword(password.next); setPassword({ next: '', confirm: '' }); setModal(null); Alert.alert('Password updated', 'Your password has been changed.'); };
  const sendResetLink = async () => { if (!profile.email) return; await sendPasswordResetLink(profile.email); Alert.alert('Reset link sent', 'Check your email to choose a new password.'); };
  const handleLogout = async () => {
    await signOutUser();
    router.replace('/');
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

  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content}><View style={styles.profileHeader}>{profile.avatar ? <Image source={{ uri: profile.avatar }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.initial}>{profile.name.charAt(0).toUpperCase()}</Text></View>}<Text style={styles.title}>{profile.name}</Text><Text style={styles.muted}>{profile.email}</Text></View><View style={styles.section}><View style={styles.rowHeader}><Text style={styles.sectionTitle}>My Pets</Text><TouchableOpacity onPress={() => openPet()}><Text style={styles.add}>+</Text></TouchableOpacity></View>{pets.length === 0 && <Text style={styles.muted}>Add your first pet to keep their details close.</Text>}{pets.map((pet) => <TouchableOpacity key={pet.id} style={styles.pet} onPress={() => openPet(pet)}>{pet.photos[0] ? <Image source={{ uri: pet.photos[0] }} style={styles.petThumb} /> : <Text style={styles.paw}>+</Text>}<View style={styles.flex}><Text style={styles.primary}>{pet.name}</Text><Text style={styles.muted}>{pet.type} · {pet.breed} · {pet.age}</Text><Text style={styles.status}>{pet.vaccination} · {pet.photos.length}/3 photos</Text></View></TouchableOpacity>)}</View><View style={styles.section}><Text style={styles.sectionTitle}>Account Settings</Text><Setting label="Edit Profile" onPress={() => setModal('profile')} /><Setting label="Change Password" onPress={() => setModal('password')} /><Setting label="Notifications" onPress={() => setModal('notifications')} /></View><TouchableOpacity style={styles.logout} onPress={() => { void handleLogout(); }}><Text style={styles.logoutText}>Log out</Text></TouchableOpacity><TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}><Text style={styles.deleteText}>Delete account</Text></TouchableOpacity></ScrollView><Modal visible={modal !== null} animationType="slide" transparent onRequestClose={() => setModal(null)}><View style={styles.overlay}><View style={styles.modal}><TouchableOpacity style={styles.close} onPress={() => setModal(null)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>{modal === 'pet' && <Form title={editingPet.name ? 'Edit Pet' : 'Add Pet'} onSave={savePet}><Field label="Pet Name" value={editingPet.name} onChangeText={(name) => setEditingPet({ ...editingPet, name })} /><Field label="Pet Type (Animal)" placeholder="Dog, cat, bird..." value={editingPet.type} onChangeText={(type) => setEditingPet({ ...editingPet, type })} /><Field label="Breed" value={editingPet.breed} onChangeText={(breed) => setEditingPet({ ...editingPet, breed })} /><Field label="Age" value={editingPet.age} onChangeText={(age) => setEditingPet({ ...editingPet, age })} /><Field label="Vaccination Status" value={editingPet.vaccination} onChangeText={(vaccination) => setEditingPet({ ...editingPet, vaccination })} /><Field label="Medical Notes" value={editingPet.notes} onChangeText={(notes) => setEditingPet({ ...editingPet, notes })} /><Text style={styles.photoLabel}>Pet photos ({editingPet.photos.length}/3)</Text><View style={styles.photoRow}>{editingPet.photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.photoPreview} />)}{editingPet.photos.length < 3 && <TouchableOpacity style={styles.addPhoto} onPress={addPhotos}><Text style={styles.addPhotoText}>Add photo</Text></TouchableOpacity>}</View></Form>}{modal === 'profile' && <Form title="Edit Profile" onSave={saveProfile}><Field label="Full Name" value={profile.name} onChangeText={(name) => setProfile({ ...profile, name })} /><Field label="Phone Number" value={profile.phone} onChangeText={(phone) => setProfile({ ...profile, phone })} /></Form>}{modal === 'password' && <Form title="Change Password" onSave={changePassword}><Field label="New Password" value={password.next} onChangeText={(next) => setPassword({ ...password, next })} secureTextEntry /><Field label="Confirm New Password" value={password.confirm} onChangeText={(confirm) => setPassword({ ...password, confirm })} secureTextEntry /><TouchableOpacity style={styles.resetLink} onPress={sendResetLink}><Text style={styles.resetText}>Email me a Supabase password reset link</Text></TouchableOpacity></Form>}{modal === 'notifications' && <View><Text style={styles.modalTitle}>Notifications</Text><Toggle label="Consult Alerts" value={notifications.consults} onChange={(consults) => setNotifications({ ...notifications, consults })} /><Toggle label="Order Updates" value={notifications.orders} onChange={(orders) => setNotifications({ ...notifications, orders })} /><Toggle label="Marketing Tips" value={notifications.marketing} onChange={(marketing) => setNotifications({ ...notifications, marketing })} /></View>}</View></View></Modal></SafeAreaView>;
}
function Setting({ label, onPress }: { label: string; onPress: () => void }) { return <TouchableOpacity style={styles.setting} onPress={onPress}><Text style={styles.primary}>{label}</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>; }
function Field({ label, value, onChangeText, placeholder, secureTextEntry }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" secureTextEntry={secureTextEntry} style={styles.input} /></View>; }
function Form({ title, onSave, children }: { title: string; onSave: () => void; children: React.ReactNode }) { return <ScrollView><Text style={styles.modalTitle}>{title}</Text>{children}<TouchableOpacity style={styles.save} onPress={onSave}><Text style={styles.saveText}>Save Changes</Text></TouchableOpacity></ScrollView>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.toggle}><Text style={styles.primary}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: '#334155', true: '#10B981' }} /></View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0F172A' }, content: { padding: 16, paddingBottom: 35 }, profileHeader: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#334155', marginBottom: 22 }, avatar: { width: 72, height: 72, borderRadius: 36 }, avatarFallback: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, initial: { color: '#FFFFFF', fontSize: 30, fontWeight: '700' }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: 10 }, muted: { color: '#94A3B8', fontSize: 12 }, section: { marginBottom: 25 }, rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 17 }, add: { color: '#3B82F6', fontSize: 30 }, pet: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 }, petThumb: { width: 48, height: 48, borderRadius: 12 }, paw: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#102E2A', color: '#10B981', textAlign: 'center', textAlignVertical: 'center', fontSize: 24 }, flex: { flex: 1 }, primary: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, status: { color: '#10B981', fontSize: 11, marginTop: 5 }, setting: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, chevron: { color: '#64748B', fontSize: 22 }, logout: { backgroundColor: '#EF4444', borderRadius: 9, padding: 13, alignItems: 'center' }, logoutText: { color: '#FFFFFF', fontWeight: '700' }, deleteButton: { borderColor: '#EF4444', borderWidth: 1, borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 10 }, deleteText: { color: '#FCA5A5', fontWeight: '700' }, overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' }, modal: { maxHeight: '90%', backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22 }, close: { alignSelf: 'flex-end', paddingBottom: 12 }, closeText: { color: '#94A3B8' }, modalTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 18 }, field: { marginBottom: 14 }, label: { color: '#CBD5E1', fontSize: 13, fontWeight: '600', marginBottom: 7 }, input: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', padding: 12 }, photoLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '600', marginBottom: 8 }, photoRow: { flexDirection: 'row', gap: 8, marginBottom: 14 }, photoPreview: { width: 72, height: 72, borderRadius: 10 }, addPhoto: { width: 72, height: 72, borderWidth: 1, borderColor: '#3B82F6', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, addPhotoText: { color: '#3B82F6', fontSize: 11, fontWeight: '700' }, save: { backgroundColor: '#10B981', borderRadius: 9, padding: 14, alignItems: 'center', marginTop: 12 }, saveText: { color: '#FFFFFF', fontWeight: '700' }, resetLink: { marginTop: 10, paddingVertical: 10 }, resetText: { color: '#5EEAD4', fontSize: 13, fontWeight: '700' }, toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#334155' } });
