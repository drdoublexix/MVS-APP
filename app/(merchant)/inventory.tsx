import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, supabase } from '../../lib/supabase';

type InventoryItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

export default function MerchantInventoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, stock')
        .eq('merchant_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data || []).map((product) => ({
        id: String(product.id),
        name: product.name || 'Product',
        price: Number(product.price || 0),
        stock: Number(product.stock || 0),
      })));
    } catch (error) {
      console.error('[Merchant Inventory] Failed to load products:', error);
      Alert.alert('Inventory error', 'Unable to fetch your listings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

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
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 40 },
});
