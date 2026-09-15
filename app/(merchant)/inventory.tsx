import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fetchMarketplaceProducts } from '../../lib/marketplace';
import { getCurrentUser, supabase } from '../../lib/supabase';

type InventoryItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
  category: string;
};

type EditDraft = {
  title: string;
  description: string;
  price: string;
  category: string;
};

export default function MerchantInventoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ title: '', description: '', price: '', category: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('products')
        .select('id, name, title, description, price, stock, category')
        .eq('merchant_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data || []).map((product) => ({
        id: String(product.id),
        name: product.title || product.name || 'Product',
        price: Number(product.price || 0),
        stock: Number(product.stock || 0),
        description: product.description || '',
        category: product.category || '',
      })));
    } catch (error) {
      console.error('[Merchant Inventory] Failed to load products:', error);
      Alert.alert('Inventory error', 'Unable to fetch your listings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openEdit = (item: InventoryItem) => {
    setSuccessMessage('');
    setEditingItem(item);
    setEditDraft({
      title: item.name,
      description: item.description,
      price: String(item.price),
      category: item.category,
    });
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    const title = editDraft.title.trim();
    const price = Number(editDraft.price);
    const category = editDraft.category.trim();
    if (!title || !category || !Number.isFinite(price) || price <= 0) {
      Alert.alert('Invalid product details', 'Enter a product name, category, and valid price.');
      return;
    }

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: title,
          title,
          description: editDraft.description.trim(),
          price,
          category,
        })
        .eq('id', editingItem.id);
      if (error) throw error;

      setItems((current) => current.map((item) => item.id === editingItem.id ? {
        ...item,
        name: title,
        description: editDraft.description.trim(),
        price,
        category,
      } : item));
      await fetchMarketplaceProducts();
      setEditingItem(null);
      setSuccessMessage('Product updated successfully.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('[Merchant Inventory] Failed to update product:', error);
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to update this listing.');
    } finally {
      setSavingEdit(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadInventory();
    }, [loadInventory])
  );

  const updateStock = async (id: string, nextStock: number) => {
    try {
      const { error } = await supabase.from('products').update({ stock: Math.max(0, nextStock) }).eq('id', id);
      if (error) throw error;
      setItems((current) => current.map((item) => item.id === id ? { ...item, stock: Math.max(0, nextStock) } : item));
    } catch (error) {
      console.error('[Merchant Inventory] Failed to update stock:', error);
      Alert.alert('Stock update failed', 'Unable to update this listing.');
    }
  };

  const deleteListing = async (id: string) => {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      console.error('[Merchant Inventory] Failed to delete listing:', error);
      Alert.alert('Delete failed', 'Unable to remove this listing right now.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Active Listings</Text>
      </View>

      {successMessage ? <View style={styles.successBanner}><Text style={styles.successText}>{successMessage}</Text></View> : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.empty}>Loading listings...</Text>
        ) : items.length === 0 ? (
          <Text style={styles.empty}>No active listings yet.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.price}>₦{item.price.toLocaleString('en-NG')}</Text>
                <Text style={styles.stock}>{item.stock} in stock</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => updateStock(item.id, item.stock + 1)}>
                  <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]} onPress={() => updateStock(item.id, Math.max(0, item.stock - 1))}>
                  <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => deleteListing(item.id)}>
                  <MaterialCommunityIcons name="delete" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEdit(item)} accessibilityLabel={`Edit ${item.name}`}>
                  <MaterialCommunityIcons name="pencil" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Modal visible={editingItem !== null} animationType="slide" onRequestClose={() => { if (!savingEdit) setEditingItem(null); }}>
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditingItem(null)} disabled={savingEdit} accessibilityLabel="Close edit product modal">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Product</Text>
              <View style={styles.headerSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Product Name</Text>
              <TextInput value={editDraft.title} onChangeText={(title) => setEditDraft((current) => ({ ...current, title }))} style={styles.input} placeholder="Product name" placeholderTextColor="#64748B" />
              <Text style={styles.label}>Description</Text>
              <TextInput value={editDraft.description} onChangeText={(description) => setEditDraft((current) => ({ ...current, description }))} style={[styles.input, styles.descriptionInput]} placeholder="Product description" placeholderTextColor="#64748B" multiline />
              <Text style={styles.label}>Price in NGN</Text>
              <TextInput value={editDraft.price} onChangeText={(price) => setEditDraft((current) => ({ ...current, price }))} style={styles.input} placeholder="e.g. 5500" placeholderTextColor="#64748B" keyboardType="decimal-pad" />
              <Text style={styles.label}>Category</Text>
              <View style={styles.categories}>{['Food', 'Accessories', 'Animals', 'Agro-allied'].map((category) => <TouchableOpacity key={category} onPress={() => setEditDraft((current) => ({ ...current, category }))} style={[styles.category, editDraft.category === category && styles.selected]}><Text style={[styles.categoryText, editDraft.category === category && styles.selectedText]}>{category}</Text></TouchableOpacity>)}</View>
              <TextInput value={editDraft.category} onChangeText={(category) => setEditDraft((current) => ({ ...current, category }))} style={styles.input} placeholder="Or enter a category" placeholderTextColor="#64748B" />
              <TouchableOpacity style={styles.saveButton} onPress={() => void saveEdit()} disabled={savingEdit}><Text style={styles.saveText}>{savingEdit ? 'Saving...' : 'Save Changes'}</Text></TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  itemCard: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  info: { flex: 1 },
  name: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  price: { color: '#10B981', fontWeight: '700', marginTop: 4 },
  stock: { color: '#94A3B8', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { backgroundColor: '#F59E0B' },
  deleteButton: { backgroundColor: '#EF4444' },
  editButton: { backgroundColor: '#0E7490' },
  successBanner: { marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#065F46' },
  successText: { color: '#D1FAE5', textAlign: 'center', fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#0F172A' },
  modalContent: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 24 },
  form: { padding: 16, paddingBottom: 40 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 9, color: '#FFFFFF', padding: 13, fontSize: 14 },
  descriptionInput: { minHeight: 100, textAlignVertical: 'top' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B' },
  selected: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  categoryText: { color: '#94A3B8', fontSize: 13 },
  selectedText: { color: '#FFFFFF', fontWeight: '700' },
  saveButton: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 28 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 40 },
});
