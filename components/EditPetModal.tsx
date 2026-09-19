// @ts-nocheck
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export type EditablePet = {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  dob: string | null;
  vaccination_status: string;
  medical_notes: string | null;
  photos: string[];
};

type Props = {
  isVisible: boolean;
  onClose: () => void;
  pet: EditablePet;
  userId: string;
  onSave: (pet: EditablePet) => Promise<void> | void;
};

export default function EditPetModal({ isVisible, onClose, pet, userId, onSave }: Props) {
  const [draft, setDraft] = useState<EditablePet>(pet);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isVisible) queueMicrotask(() => setDraft({ ...pet, photos: pet.photos || [] }));
  }, [isVisible, pet]);

  const update = (key: keyof EditablePet, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const addPhotos = async () => {
    const remaining = 3 - draft.photos.length;
    if (remaining < 1) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 });
    if (result.canceled) return;
    try {
      const urls = await Promise.all(result.assets.map(async (asset) => {
        const file = await (await fetch(asset.uri)).blob();
        const filePath = `${userId}/${Date.now()}-${asset.fileName || 'pet-photo.jpg'}`;
        const upload = await supabase.storage.from('pet-images').upload(filePath, file, { contentType: asset.mimeType || 'image/jpeg', upsert: false });
        if (upload.error) throw upload.error;
        return supabase.storage.from('pet-images').getPublicUrl(filePath).data.publicUrl;
      }));
      setDraft((current) => ({ ...current, photos: [...current.photos, ...urls].slice(0, 3) }));
    } catch (error) {
      Alert.alert('Photo upload failed', error instanceof Error ? error.message : 'Could not upload pet photo.');
    }
  };

  const save = async () => {
    setSaving(true);
    try { await onSave(draft); onClose(); } finally { setSaving(false); }
  };

  const pickerDate = draft.dob ? new Date(`${draft.dob}T00:00:00`) : new Date();

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close pet editor"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity>
          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
            <Text style={styles.modalTitle}>{draft.name ? 'Edit Pet' : 'Add Pet'}</Text>
            <Field label="Pet Name" value={draft.name} onChangeText={(value) => update('name', value)} />
            <Field label="Pet Type (Animal)" value={draft.type} onChangeText={(value) => update('type', value)} placeholder="Dog, cat, bird..." />
            <Field label="Breed" value={draft.breed || ''} onChangeText={(value) => update('breed', value)} />
            <Text style={styles.label}>Date of Birth</Text>
              {Platform.OS === 'web' ? <input type="date" value={draft.dob || ''} onChange={(event) => update('dob', event.target.value)} style={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: 8, color: '#FFFFFF', padding: 11, width: '100%' } as any} /> : <>
              <TouchableOpacity onPress={() => setShowDatePicker(true)}><TextInput value={draft.dob || 'Select date'} editable={false} pointerEvents="none" style={styles.input} /></TouchableOpacity>
              <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}><View style={styles.overlay}><View style={styles.pickerModal}><DateTimePicker value={pickerDate} mode="date" maximumDate={new Date()} onChange={(_, date) => { if (date) { update('dob', date.toISOString().slice(0, 10)); setShowDatePicker(false); } }} /><TouchableOpacity style={styles.close} onPress={() => setShowDatePicker(false)} accessibilityLabel="Close date picker"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View></View></Modal>
            </>}
            <Field label="Vaccination Status" value={draft.vaccination_status} onChangeText={(value) => update('vaccination_status', value)} />
            <Field label="Medical Notes" value={draft.medical_notes || ''} onChangeText={(value) => update('medical_notes', value)} />
            <Text style={styles.photoLabel}>Pet photos ({draft.photos.length}/3)</Text>
            <View style={styles.photoRow}>{draft.photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.photoPreview} />)}{draft.photos.length < 3 ? <TouchableOpacity style={styles.addPhoto} onPress={() => { void addPhotos(); }}><Text style={styles.addPhotoText}>Add photo</Text></TouchableOpacity> : null}</View>
            <TouchableOpacity style={styles.save} onPress={() => { void save(); }} disabled={saving}><Text style={styles.saveText}>Save Changes</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000B3', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 1000 },
  modal: { width: '100%', maxWidth: 500, maxHeight: '88%', backgroundColor: '#1E293B', borderRadius: 14, padding: 22 },
  modalBody: { flexGrow: 0 },
  modalContent: { paddingBottom: 4 },
  pickerModal: { backgroundColor: '#1E293B', borderRadius: 14, padding: 22, alignItems: 'center' },
  close: { alignSelf: 'flex-end' }, closeText: { color: '#94A3B8' }, modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 18 }, field: { marginBottom: 12 }, label: { color: '#94A3B8', fontSize: 12, marginBottom: 6 }, input: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#FFFFFF', padding: 11 }, webDate: { backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: 8, color: '#FFFFFF', padding: 11, width: '100%' }, photoLabel: { color: '#CBD5E1', marginTop: 6, marginBottom: 8 }, photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, photoPreview: { width: 64, height: 64, borderRadius: 8 }, addPhoto: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, addPhotoText: { color: '#60A5FA', fontSize: 11, textAlign: 'center' }, save: { backgroundColor: '#10B981', borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 18, marginBottom: 20 }, saveText: { color: '#FFFFFF', fontWeight: '700' }
});
