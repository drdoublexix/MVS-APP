import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Modal, PanResponder, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import KnowledgeHubSection from '../../components/KnowledgeHubSection';
import { addMarketplaceProduct, fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, supabase } from '../../lib/supabase';

const categories = ['Food', 'Accessories', 'Animals', 'Agro-allied'];
const naira = (value: number) => `₦${value.toLocaleString('en-NG')}`;

export default function MerchantDashboardScreen() {
  const router = useRouter();
  const { products } = useMarketplace();
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ title: '', category: '', price: '', stock: '' });
  const [metrics, setMetrics] = useState({ totalSales: 0, activeListings: 0, pendingOrders: 0 });
  const [productOrderStatuses, setProductOrderStatuses] = useState<Record<string, string>>({});
  const [supportOffsetY, setSupportOffsetY] = useState(0);
  const openWhatsAppSupport = async () => {
    const message = 'Hello MVS Support, I need assistance with my account. Role: merchant';
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `whatsapp://send?phone=2349074874395&text=${encodedMessage}`;
    const webUrl = `https://wa.me/2349074874395?text=${encodedMessage}`;
    try {
      if (await Linking.canOpenURL(whatsappUrl)) await Linking.openURL(whatsappUrl);
      else await Linking.openURL(webUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  };
  const [supportPanResponder] = useState(() => {
    let currentOffset = 0;
    let startOffset = 0;
    let moved = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startOffset = currentOffset; moved = false; },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dy) > 6) moved = true;
        currentOffset = Math.max(-300, Math.min(300, startOffset + gesture.dy));
        setSupportOffsetY(currentOffset);
      },
      onPanResponderRelease: () => { if (!moved) void openWhatsAppSupport(); },
      onPanResponderTerminate: () => { moved = true; },
    });
  });

  useFocusEffect(useCallback(() => {
    void fetchMarketplaceProducts().catch(() => undefined);
  }, []));

  useEffect(() => {
    void fetchMarketplaceProducts().catch(() => undefined);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('orders')
          .select('product_id, status')
          .eq('merchant_id', user.id);

        if (error) throw error;

        const statusMap: Record<string, string> = {};
        for (const item of data || []) {
          if (item?.product_id) statusMap[String(item.product_id)] = item.status;
        }
        setProductOrderStatuses(statusMap);
      } catch (error) {
        console.warn('[Merchant Dashboard] Failed to load order statuses:', error);
      }
    })();
  }, []);

  const getOrderBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'paid':
        return { label: 'Payment sent', color: '#F59E0B' };
      case 'completed':
      case 'confirmed':
        return { label: 'Completed', color: '#10B981' };
      case 'pending':
      case 'pending_payment':
      case 'awaiting_payment':
        return { label: 'Awaiting payment', color: '#F59E0B' };
      default:
        return { label: 'In progress', color: '#3B82F6' };
    }
  };

  useFocusEffect(useCallback(() => {
    let mounted = true;
    const loadMetrics = async () => {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, error } = await supabase.rpc('get_merchant_metrics', { merchant_uuid: user.id });
      if (error) {
        console.error('[Merchant Dashboard] Failed to load metrics:', error);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (mounted) setMetrics({ totalSales: Number(row?.total_sales || 0), activeListings: Number(row?.active_listings || 0), pendingOrders: Number(row?.pending_orders || 0) });
    };
    void loadMetrics();
    return () => { mounted = false; };
  }, []));

  const publish = async () => {
    const cleanTitle = sanitizeInput(form.title);
    const cleanCategory = sanitizeInput(form.category);
    const price = Number(form.price); const stock = Number(form.stock);
    if (!cleanTitle || !cleanCategory || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) return;

    try {
      const user = await getCurrentUser();
      const merchantId = user?.id || 'current-merchant';

      const { error } = await supabase.from('products').insert({
        name: cleanTitle,
        category: cleanCategory,
        price,
        stock,
        merchant_id: merchantId,
      });

      if (error) throw error;

      addMarketplaceProduct({
        name: cleanTitle,
        category: cleanCategory,
        price,
        stock,
        merchant: user?.user_metadata?.full_name || 'MVS Merchant Store',
        merchantId,
        icon: form.category === 'Food' ? 'food' : 'package',
      });

      await fetchMarketplaceProducts();
      setForm({ title: '', category: '', price: '', stock: '' });
      setVisible(false);
    } catch (error) {
      console.warn('Failed to publish product', error);
    }
  };

  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.title}>Store Dashboard</Text><Text style={styles.subtitle}>Manage your inventory and sales</Text>
    <View style={styles.stats}>
      <Stat icon="cash" label="Total Sales" value={`₦${metrics.totalSales.toLocaleString('en-NG')}`} color="#10B981" />
      <Stat icon="package-variant" label="Active Listings" value={String(metrics.activeListings)} color="#3B82F6" onPress={() => router.push('/inventory')} />
      <Stat icon="clock" label="Pending Orders" value={String(metrics.pendingOrders)} color="#F59E0B" />
    </View>
    <KnowledgeHubSection />
    <TouchableOpacity style={styles.addProduct} onPress={() => router.push('/(merchant)/add-product')}><MaterialCommunityIcons name="plus" size={21} color="#FFFFFF" /><Text style={styles.addText}>Add New Product</Text></TouchableOpacity>
    <Text style={styles.sectionTitle}>Global Marketplace Inventory</Text>
    {products.map((product) => {
      const badge = getOrderBadge(productOrderStatuses[String(product.id)]);
      return (
        <View key={product.id} style={styles.product}>
          <View style={styles.productIcon}>{product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productIcon} /> : <MaterialCommunityIcons name={product.icon as any} size={23} color="#FFFFFF" />}</View>
          <View style={styles.productInfo}>
            <Text style={styles.productTitle}>{product.name}</Text>
            <Text style={styles.muted}>{product.category}</Text>
            {badge && (
              <View style={[styles.orderBadge, { backgroundColor: badge.color }]}>
                <Text style={styles.orderBadgeText}>{badge.label}</Text>
              </View>
            )}
          </View>
          <View style={styles.productMeta}><Text style={styles.price}>{naira(product.price)}</Text><Text style={[styles.stock, product.stock < 5 && styles.lowStock]}>{product.stock} in stock</Text></View>
        </View>
      );
    })}
  </ScrollView>
  <View {...supportPanResponder.panHandlers} style={[supportFabStyle, { transform: [{ translateY: supportOffsetY }] }]}><MaterialCommunityIcons name="whatsapp" size={29} color="#FFFFFF" /></View>
  <Modal visible={visible} animationType="slide"><SafeAreaView style={styles.modal}><View style={styles.modalHeader}><TouchableOpacity onPress={() => setVisible(false)}><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity><Text style={styles.modalTitle}>Add New Product</Text><View style={{ width: 24 }} /></View><ScrollView contentContainerStyle={styles.form}>
    <Text style={styles.label}>Product Title</Text><TextInput value={form.title} onChangeText={(title) => setForm({ ...form, title })} style={styles.input} placeholder="e.g. Premium Dog Collar" placeholderTextColor="#64748B" />
    <Text style={styles.label}>Category</Text><View style={styles.categories}>{categories.map((category) => <TouchableOpacity key={category} onPress={() => setForm({ ...form, category })} style={[styles.category, form.category === category && styles.selected]}><Text style={[styles.categoryText, form.category === category && styles.selectedText]}>{category}</Text></TouchableOpacity>)}</View>
    <Text style={styles.label}>Price in NGN</Text><TextInput value={form.price} onChangeText={(price) => setForm({ ...form, price })} style={styles.input} placeholder="e.g. 5500" placeholderTextColor="#64748B" keyboardType="decimal-pad" />
    <Text style={styles.label}>Stock Quantity</Text><TextInput value={form.stock} onChangeText={(stock) => setForm({ ...form, stock })} style={styles.input} placeholder="e.g. 50" placeholderTextColor="#64748B" keyboardType="number-pad" />
    <TouchableOpacity style={styles.publish} onPress={publish}><MaterialCommunityIcons name="upload" size={19} color="#FFFFFF" /><Text style={styles.publishText}>Publish to Global Marketplace</Text></TouchableOpacity>
  </ScrollView></SafeAreaView></Modal></SafeAreaView>;
}

const supportFabStyle = { position: 'absolute' as const, bottom: 24, right: 20, zIndex: 9999, width: 56, height: 56, borderRadius: 28, backgroundColor: '#005F53', alignItems: 'center' as const, justifyContent: 'center' as const, elevation: 8, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } };

function Stat({ icon, label, value, color, onPress }: { icon: string; label: string; value: string; color: string; onPress?: () => void }) {
  const content = <View style={styles.stat}><MaterialCommunityIcons name={icon as any} size={25} color={color} /><Text style={styles.muted}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
  if (!onPress) return content;
  return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0F172A' }, content: { padding: 16, paddingBottom: 36 }, title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' }, subtitle: { color: '#94A3B8', marginTop: 4, marginBottom: 24 }, stats: { flexDirection: 'row', gap: 10, marginBottom: 24 }, stat: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#334155' }, statValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' }, muted: { color: '#94A3B8', fontSize: 12 }, addProduct: { backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 28 }, addText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 13 }, product: { backgroundColor: '#1E293B', borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#334155', marginBottom: 10 }, productIcon: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, productInfo: { flex: 1 }, productTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 3 }, productMeta: { alignItems: 'flex-end', gap: 5 }, price: { color: '#10B981', fontWeight: '700', fontSize: 13 }, stock: { color: '#10B981', fontSize: 11 }, lowStock: { color: '#F87171' }, orderBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 6 }, orderBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' }, modal: { flex: 1, backgroundColor: '#0F172A' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' }, modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' }, form: { padding: 16 }, label: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 13 }, input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 9, color: '#FFFFFF', padding: 13, fontSize: 14 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, category: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B' }, selected: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }, categoryText: { color: '#94A3B8', fontSize: 13 }, selectedText: { color: '#FFFFFF', fontWeight: '700' }, publish: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 14, marginTop: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, publishText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 } });
