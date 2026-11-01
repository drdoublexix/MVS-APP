import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMarketplaceProduct } from '../../lib/marketplace';
import { addPlatformFee, parsePriceInput, PLATFORM_FEE_PERCENT } from '../../lib/price';
import { isProductCategory, PRODUCT_CATEGORIES } from '../../lib/productCategories';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, supabase, uploadProductImage } from '../../lib/supabase';

export default function AddProductScreen() {
  const insets = useSafeAreaInsets();
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleAddProduct = async () => {
    setFormError('');
    setSuccessMessage('');
    if (!productName.trim() || !price.trim() || !quantity.trim() || !category) {
      setFormError('Please complete the product name, price, quantity, and category.');
      return;
    }

    setLoading(true);
    try {
      const priceValue = parsePriceInput(price);
      const stockInput = quantity.trim();
      const stockValue = stockInput ? parseInt(stockInput, 10) : 1;

      if (!Number.isFinite(priceValue) || priceValue <= 0 || !Number.isInteger(stockValue) || stockValue < 0) {
        setFormError('Enter a valid price and quantity.');
        return;
      }

      const user = await getCurrentUser();
      if (!user) throw new Error('You must be signed in as a merchant.');

      const uploadedImages = await Promise.all(images.map((image) => uploadProductImage(image)));
      const imageUrl = uploadedImages[0];
      const productNameValue = sanitizeInput(productName);
      const productDescription = sanitizeInput(description);
      const cleanCategory = sanitizeInput(category);
      if (!isProductCategory(cleanCategory)) {
        setFormError('Select a valid product category.');
        return;
      }
      const merchantName = user.user_metadata?.full_name || user.user_metadata?.name || 'MVS Merchant Store';

      const { error } = await supabase
        .from('products')
        .insert([
          {
            merchant_id: user.id,
            name: productNameValue,
            title: productNameValue,
            description: productDescription,
            price: priceValue,
            image_url: imageUrl,
            images: uploadedImages,
            category: cleanCategory,
            stock: Number.isNaN(stockValue) ? 1 : stockValue,
          },
        ]);

      if (error) throw error;

      addMarketplaceProduct({
        name: productNameValue,
        description: productDescription,
        category: cleanCategory,
        price: priceValue,
        stock: Number.isNaN(stockValue) ? 1 : stockValue,
        merchant: merchantName,
        merchantId: user.id,
        imageUrl,
        images: uploadedImages,
        icon: cleanCategory === 'Animal Feeds' || cleanCategory === 'Pet Food' ? 'food' : 'package',
      });
      setSuccessMessage('Product added successfully.');
      setProductName('');
      setDescription('');
      setPrice('');
      setQuantity('');
      setCategory('');
      setImages([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      console.error('[Merchant Add Product] Failed to add product:', error);
      setFormError(`Could not add product: ${message}`);
      Alert.alert('Failed to add product', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={[styles.scrollView, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.header}>
          <Text style={styles.title}>Add New Product</Text>
          <Text style={styles.subtitle}>List your pet product to the marketplace</Text>
        </View>

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

        <View style={styles.form}>
          <View style={styles.imageSection}>
            <View style={styles.thumbnailRow}>{images.map((image, index) => <View key={`${image.uri}-${index}`} style={styles.thumbnailWrap}><Image source={{ uri: image.uri }} style={styles.thumbnail} /><TouchableOpacity style={styles.removeImage} onPress={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} accessibilityLabel={`Remove image ${index + 1}`}><MaterialCommunityIcons name="close-circle" size={20} color="#F87171" /></TouchableOpacity></View>)}{images.length < 3 ? <TouchableOpacity style={styles.addImage} onPress={async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3 - images.length }); if (!result.canceled) setImages((current) => [...current, ...result.assets].slice(0, 3)); }} disabled={loading}><MaterialCommunityIcons name="image-plus" size={32} color="#CBD5E1" /><Text style={styles.uploadText}>Add image</Text></TouchableOpacity> : null}</View>
            <Text style={styles.uploadText}>{images.length}/3 product images</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Product Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Premium Dog Collar"
              placeholderTextColor="#64748B"
              value={productName}
              onChangeText={setProductName}
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe your product..."
              placeholderTextColor="#64748B"
              value={description}
              onChangeText={setDescription}
              editable={!loading}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex]}>
              <Text style={styles.label}>Your price (₦) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 50,000"
                placeholderTextColor="#64748B"
                value={price}
                onChangeText={setPrice}
                editable={!loading}
                keyboardType="decimal-pad"
              />
              {price.trim() && Number.isFinite(parsePriceInput(price)) ? <Text style={styles.uploadText}>Marketplace price (includes {PLATFORM_FEE_PERCENT}% platform fee): ₦ {addPlatformFee(parsePriceInput(price)).toLocaleString('en-NG')}</Text> : null}
            </View>
            <View style={[styles.inputGroup, styles.flex]}>
              <Text style={styles.label}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#64748B"
                value={quantity}
                onChangeText={setQuantity}
                editable={!loading}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category *</Text>
            <View style={styles.categoryGrid}>
              {PRODUCT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryBadge,
                    category === cat && styles.categoryBadgeActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      category === cat && styles.categoryTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.addButton, loading && styles.buttonDisabled]}
            onPress={handleAddProduct}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <MaterialCommunityIcons name="plus" size={20} color="white" />
                <Text style={styles.addButtonText}>Add Product</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollView: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0F172A',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
  },
  errorText: {
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  successText: {
    color: '#047857',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  form: {
    gap: 20,
  },
  imageUpload: {
    backgroundColor: '#1E293B',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 12,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  imageSection: { backgroundColor: '#1E293B', borderRadius: 12, padding: 12, gap: 10 },
  thumbnailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbnailWrap: { position: 'relative' },
  thumbnail: { width: 92, height: 92, borderRadius: 8 },
  removeImage: { position: 'absolute', top: -7, right: -7, backgroundColor: '#1E293B', borderRadius: 10 },
  addImage: { width: 92, height: 92, borderRadius: 8, borderWidth: 1, borderColor: '#475569', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  uploadText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  preview: { width: '100%', height: 140, borderRadius: 10 },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#FFFFFF',
  },
  textArea: {
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  flex: {
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryBadgeActive: {
    backgroundColor: '#45B7D1',
    borderColor: '#45B7D1',
  },
  categoryText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  categoryTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#45B7D1',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
