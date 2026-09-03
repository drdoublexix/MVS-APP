import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { getCurrentUser, normalizeUuid } from '../../lib/supabase';

export default function VetDashboardScreen() {
  const router = useRouter();
  const { products } = useMarketplace();

  useEffect(() => {
    void fetchMarketplaceProducts().catch(() => undefined);
  }, []);

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user || !normalizeUuid(product.merchantId)) return;
    const conversationId = `conv_${[user.id, product.merchantId].sort().join('_')}`;
    router.push({ pathname: '/chat', params: { conversationId, merchantId: product.merchantId, merchantName: product.merchant, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} listed for ₦${product.price}.` } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Practice Dashboard</Text>
        <Text style={styles.subtitle}>Manage consultations and earnings</Text>

        <View style={styles.metrics}>
          <Metric icon="paw" label="Total Patients" value="0" color="#3B82F6" />
          <Metric icon="star" label="Overall Rating" value="0.0 ★" color="#F59E0B" />
          <Metric icon="cash" label="Total Earnings" value="₦0" color="#10B981" />
        </View>

        <Text style={styles.sectionTitle}>Active Consultation Queue</Text>
        <View style={styles.emptyContainer}><Text style={styles.emptyText}>No active consultation requests</Text></View>
        <Text style={styles.sectionTitle}>Global Marketplace</Text>
        <View style={styles.marketplace}>
          {products.map((product) => <View key={product.id} style={styles.marketProduct}><MaterialCommunityIcons name={product.icon as any} size={24} color="#CBD5E1" /><Text style={styles.marketName} numberOfLines={1}>{product.name}</Text><Text style={styles.marketPrice}>₦{product.price.toLocaleString('en-NG')}</Text><Text style={styles.muted}>{product.merchant}</Text><TouchableOpacity style={{ backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 10 }} onPress={() => inquireAboutProduct(product)}><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Inquire / Buy</Text></TouchableOpacity></View>)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}><MaterialCommunityIcons name={icon as any} size={24} color={color} /></View><Text style={styles.muted}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' }, content: { padding: 16, paddingBottom: 36 }, title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' }, subtitle: { color: '#94A3B8', marginTop: 4, marginBottom: 24 }, metrics: { flexDirection: 'row', gap: 10, marginBottom: 28 }, metric: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' }, metricIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, muted: { color: '#94A3B8', fontSize: 12 }, metricValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 5, textAlign: 'center' }, sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 12 }, panel: { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155', marginBottom: 26 }, queueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }, queueText: { flex: 1 }, primary: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }, accept: { backgroundColor: '#3B82F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }, acceptText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#334155' }, invoiceRight: { flexDirection: 'row', alignItems: 'center', gap: 10 }, price: { color: '#3B82F6', fontWeight: '700' }, formRow: { flexDirection: 'row', gap: 8, marginVertical: 16 }, input: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 10, fontSize: 12 }, serviceInput: { flex: 2 }, amountInput: { flex: 1 }, addButton: { width: 40, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, summary: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 14 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, divider: { height: 1, backgroundColor: '#334155', marginVertical: 3 }, strongLabel: { color: '#10B981', fontWeight: '700', fontSize: 13 }, strongValue: { color: '#10B981', fontWeight: '700', fontSize: 15 }, sendButton: { backgroundColor: '#10B981', borderRadius: 9, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, sendText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  emptyContainer: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 14, padding: 24, marginBottom: 26, alignItems: 'center' }, emptyText: { color: '#94A3B8', fontSize: 14 }, marketplace: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, marketProduct: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 12 }, marketName: { color: '#FFFFFF', fontWeight: '600', fontSize: 12, marginTop: 8 }, marketPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14, marginTop: 4 },
});
