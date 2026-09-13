import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, supabase } from '../lib/supabase';

export type CommunityCategory = 'distress_sale' | 'pet_sale' | 'pet_food' | 'accessories' | 'general';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const categories: { value: CommunityCategory; label: string }[] = [
  { value: 'distress_sale', label: 'Distress sale' },
  { value: 'pet_sale', label: 'Pet sale' },
  { value: 'pet_food', label: 'Pet food' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'general', label: 'General' },
];

export default function CreateCommunityPostModal({ visible, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CommunityCategory>('distress_sale');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (!result.canceled) setAssets(result.assets.slice(0, 4));
  };

  const reset = () => {
    setTitle('');
    setCategory('distress_sale');
    setPrice('');
    setDescription('');
    setAssets([]);
  };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Add a title and description before posting.');
      return;
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      Alert.alert('Sign in required', 'Please sign in before creating a community post.');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls = await Promise.all(assets.map(async (asset, index) => {
        const file = await (await fetch(asset.uri)).blob();
        const fileName = asset.fileName || `community-${Date.now()}-${index}.jpg`;
        const extension = fileName.split('.').pop() || 'jpg';
        const filePath = `${currentUser.id}/${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('community-uploads')
          .upload(filePath, file, { contentType: asset.mimeType || file.type || 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        return supabase.storage.from('community-uploads').getPublicUrl(filePath).data.publicUrl;
      }));

      const { error } = await supabase.from('community_posts').insert({
        user_id: currentUser.id,
        title: title.trim(),
        category,
        price: price.trim() ? Number(price.replace(/,/g, '')) : null,
        description: description.trim(),
        image_urls: imageUrls,
      });
      if (error) throw error;

      reset();
      onCreated();
      onClose();
    } catch (error) {
      Alert.alert('Could not publish post', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.heading}>New community post</Text>
            <TouchableOpacity onPress={onClose} disabled={submitting} accessibilityLabel="Close">
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="What would you like to share?" />
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map((item) => (
                <TouchableOpacity key={item.value} style={[styles.category, category === item.value && styles.categorySelected]} onPress={() => setCategory(item.value)}>
                  <Text style={[styles.categoryText, category === item.value && styles.categoryTextSelected]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Field label="Price (optional)" value={price} onChangeText={setPrice} placeholder="0.00" keyboardType="decimal-pad" />
            <Field label="Description" value={description} onChangeText={setDescription} placeholder="Add useful details for the community..." multiline />
            <Text style={styles.label}>Photos ({assets.length}/4)</Text>
            <View style={styles.photoRow}>
              {assets.map((asset) => <Image key={asset.assetId || asset.uri} source={{ uri: asset.uri }} style={styles.preview} />)}
              {assets.length < 4 ? <TouchableOpacity style={styles.addPhoto} onPress={() => { void pickImages(); }}><Text style={styles.addPhotoText}>+ Add photos</Text></TouchableOpacity> : null}
            </View>
            <TouchableOpacity style={styles.submit} onPress={() => { void submit(); }} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Publish post</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'decimal-pad' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A3B8" multiline={multiline} keyboardType={keyboardType} style={[styles.input, multiline && styles.description]} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: { maxHeight: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  heading: { color: '#0F172A', fontSize: 21, fontWeight: '800' },
  close: { color: '#0F766E', fontWeight: '700' },
  content: { padding: 20, paddingBottom: 34 },
  field: { marginBottom: 16 },
  label: { color: '#334155', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, color: '#0F172A', paddingHorizontal: 13, paddingVertical: 11, backgroundColor: '#F8FAFC', fontSize: 16 },
  description: { minHeight: 110, textAlignVertical: 'top' },
  categoryRow: { gap: 8, paddingBottom: 17 },
  category: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  categorySelected: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  categoryText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  categoryTextSelected: { color: '#FFFFFF' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  preview: { width: 72, height: 72, borderRadius: 9 },
  addPhoto: { width: 72, height: 72, borderWidth: 1, borderStyle: 'dashed', borderColor: '#0F766E', borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 5 },
  addPhotoText: { color: '#0F766E', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  submit: { minHeight: 50, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F766E' },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
