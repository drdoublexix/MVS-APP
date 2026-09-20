import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { MarketplaceProduct } from '../lib/marketplace';
import { PRODUCT_CATEGORIES } from '../lib/productCategories';
import ProductImageCarousel from './ProductImageCarousel';

type Props = {
  visible: boolean;
  products: MarketplaceProduct[];
  onClose: () => void;
  onSelectProduct: (product: MarketplaceProduct) => void;
};

const categories = ['All', ...PRODUCT_CATEGORIES];

export default function MarketplaceBrowseModal({ visible, products, onClose, onSelectProduct }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filteredProducts = products.filter((product) => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesCategory = category === 'All' || product.category === category;
    const matchesSearch = !normalizedSearch || product.name.toLowerCase().includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });

  const closeModal = () => {
    setSearch('');
    setCategory('All');
    onClose();
  };

  const selectProduct = (product: MarketplaceProduct) => {
    closeModal();
    onSelectProduct(product);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Marketplace</Text>
            <TouchableOpacity onPress={closeModal} accessibilityLabel="Close Marketplace">
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search products..."
            placeholderTextColor="#64748B"
            style={styles.search}
            accessibilityLabel="Search marketplace products"
            autoCapitalize="none"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categories}>
            {categories.map((item) => (
              <TouchableOpacity key={item} style={[styles.categoryPill, category === item && styles.categoryPillActive]} onPress={() => setCategory(item)}>
                <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {filteredProducts.length === 0 ? (
              <Text style={styles.empty}>No products match your search.</Text>
            ) : filteredProducts.map((product) => (
              <TouchableOpacity key={product.id} style={styles.card} onPress={() => selectProduct(product)} activeOpacity={0.85}>
                <ProductImageCarousel images={product.images} fallbackImage={product.imageUrl} height={112} />
                <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.price}>₦{product.price.toLocaleString('en-NG')}</Text>
                <Text style={styles.categoryLabel} numberOfLines={1}>{product.category}</Text>
                <Text style={styles.merchant} numberOfLines={1}>{product.merchant}</Text>
                <View style={styles.detailsButton}><Text style={styles.detailsText}>View Details</Text></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  modal: { flex: 1, marginTop: 42, backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  search: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, color: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, marginTop: 16 },
  categoryScroll: { marginTop: 16, marginBottom: 4 },
  categories: { gap: 8, paddingVertical: 10, paddingRight: 8, alignItems: 'center' },
  categoryPill: { minHeight: 36, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, justifyContent: 'center' },
  categoryPillActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  categoryText: { color: '#CBD5E1', fontSize: 12, lineHeight: 16, fontWeight: '500' },
  categoryTextActive: { color: '#FFFFFF', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 12, paddingBottom: 24 },
  card: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 10 },
  name: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '700', marginTop: 10 },
  price: { color: '#34D399', fontSize: 14, fontWeight: '700', marginTop: 6 },
  categoryLabel: { color: '#60A5FA', fontSize: 11, fontWeight: '700', marginTop: 6 },
  merchant: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  detailsButton: { backgroundColor: '#334155', borderRadius: 8, alignItems: 'center', paddingVertical: 8, marginTop: 10 },
  detailsText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  empty: { color: '#94A3B8', textAlign: 'center', width: '100%', paddingVertical: 30 },
});
