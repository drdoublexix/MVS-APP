import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { addMarketplaceProduct } from '../../lib/marketplace';
import { getCurrentUser, supabase, uploadProductImage } from '../../lib/supabase';

export default function AddProductScreen() {
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const categories = ['Dog Accessories', 'Cat Accessories', 'Animals', 'Pet Food', 'Grooming', 'Toys', 'Health & Care'];

  const handleAddProduct = async () => {
    setFormError('');
    setSuccessMessage('');
    if (!productName.trim() || !price.trim() || !quantity.trim() || !category) {
      setFormError('Please complete the product name, price, quantity, and category.');
      return;
    }

    setLoading(true);
    try {
      const priceValue = parseFloat(price);
      const stockInput = quantity.trim();
      const stockValue = stockInput ? parseInt(stockInput, 10) : 1;

      if (!Number.isFinite(priceValue) || priceValue <= 0 || !Number.isInteger(stockValue) || stockValue < 0) {
        setFormError('Enter a valid price and quantity.');
        return;
      }

      const user = await getCurrentUser();
      if (!user) throw new Error('You must be signed in as a merchant.');

      const imageUrl = image ? await uploadProductImage(image) : undefined;
      const productNameValue = productName.trim();
      const productDescription = description.trim();
      const merchantName = user.user_metadata?.full_name || user.user_metadata?.name || 'MVS Merchant Store';

      const { data, error } = await supabase
        .from('products')
        .insert([
          {
            merchant_id: user.id,
            name: productNameValue,
            title: productNameValue,
            description: productDescription,
            price: priceValue,
            image_url: imageUrl,
            category: category || 'General',
            stock: Number.isNaN(stockValue) ? 1 : stockValue,
          },
        ]);

      if (error) throw error;

      addMarketplaceProduct({
        name: productNameValue,
        description: productDescription,
        category: category || 'General',
        price: priceValue,
        stock: Number.isNaN(stockValue) ? 1 : stockValue,
        merchant: merchantName,
        merchantId: user.id,
        imageUrl,
        icon: category.includes('Food') ? 'food' : 'package',
      });
      setSuccessMessage('Product added successfully.');
      setProductName('');
      setDescription('');
      setPrice('');
      setQuantity('');
      setCategory('');
      setImage(null);
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
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Add New Product</Text>
          <Text style={styles.subtitle}>List your pet product to the marketplace</Text>
        </View>

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

        <View style={styles.form}>
          <TouchableOpacity style={styles.imageUpload} onPress={async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], selectionLimit: 1 }); if (!result.canceled) setImage(result.assets[0]); }} disabled={loading}>
            {image ? <Image source={{ uri: image.uri }} style={styles.preview} /> : <MaterialCommunityIcons name="image-plus" size={48} color="#ddd" />}
            <Text style={styles.uploadText}>{image ? 'Tap to change product image' : 'Tap to add product image'}</Text>
          </TouchableOpacity>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Product Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Premium Dog Collar"
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
              value={description}
              onChangeText={setDescription}
              editable={!loading}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex]}>
              <Text style={styles.label}>Price (₦) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                value={price}
                onChangeText={setPrice}
                editable={!loading}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.flex]}>
              <Text style={styles.label}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
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
              {categories.map((cat) => (
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
    backgroundColor: '#f8f8f8',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
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
    backgroundColor: '#fff',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    color: '#999',
  },
  preview: { width: '100%', height: 140, borderRadius: 10 },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  categoryBadgeActive: {
    backgroundColor: '#45B7D1',
    borderColor: '#45B7D1',
  },
  categoryText: {
    fontSize: 12,
    color: '#666',
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
