import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createProductConversation, fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { getCurrentUser } from '../../lib/supabase';

interface InvoiceItem { id: string; service: string; amount: number; }

const queue = [
  { id: '1', client: 'Sarah Johnson', pet: 'Max', issue: 'Emergency request' },
  { id: '2', client: 'John Doe', pet: 'Whiskers', issue: 'Pending vaccination renewal' },
];

const formatNaira = (amount: number) => `₦${Math.round(amount).toLocaleString('en-NG')}`;

export default function VetDashboardScreen() {
  const router = useRouter();
  const { products } = useMarketplace();
  const [items, setItems] = useState<InvoiceItem[]>([{ id: '1', service: 'Anti-Rabies Vaccine (ARV)', amount: 15000 }]);

  useEffect(() => {
    void fetchMarketplaceProducts().catch(() => undefined);
  }, []);
  const [service, setService] = useState('');
  const [amount, setAmount] = useState('');
  const subtotal = items.reduce((total, item) => total + item.amount, 0);
  const fee = subtotal * 0.1;

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user) return;
    const conversation = createProductConversation(product.id, user.id, user.user_metadata?.full_name || user.email?.split('@')[0] || 'Veterinary Practice');
    if (conversation) router.push({ pathname: '/(vet)/chat', params: { conversationId: conversation.id, merchantId: product.merchantId, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} listed for ₦${product.price}.` } });
  };

  const addItem = () => {
    const numericAmount = Number(amount);
    if (!service.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    setItems([...items, { id: Date.now().toString(), service: service.trim(), amount: numericAmount }]);
    setService('');
    setAmount('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Practice Dashboard</Text>
        <Text style={styles.subtitle}>Manage consultations and earnings</Text>

        <View style={styles.metrics}>
          <Metric icon="paw" label="Total Patients" value="12" color="#3B82F6" />
          <Metric icon="star" label="Overall Rating" value="4.9 ★" color="#F59E0B" />
          <Metric icon="cash" label="Total Earnings" value="₦145,000" color="#10B981" />
        </View>

        <Text style={styles.sectionTitle}>Active Consultation Queue</Text>
        <View style={styles.panel}>
          {queue.map((item) => (
            <View key={item.id} style={styles.queueRow}>
              <View style={styles.avatar}><MaterialCommunityIcons name="paw" size={22} color="#FFFFFF" /></View>
              <View style={styles.queueText}><Text style={styles.primary}>{item.client} · {item.pet}</Text><Text style={styles.muted}>{item.issue}</Text></View>
              <TouchableOpacity style={styles.accept}><Text style={styles.acceptText}>Accept</Text></TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>In-Chat Custom Billing</Text>
        <View style={styles.panel}>
          {items.map((item) => (
            <View key={item.id} style={styles.invoiceRow}>
              <Text style={styles.primary}>{item.service}</Text>
              <View style={styles.invoiceRight}><Text style={styles.price}>{formatNaira(item.amount)}</Text><TouchableOpacity onPress={() => setItems(items.filter((current) => current.id !== item.id))}><MaterialCommunityIcons name="close" size={18} color="#F87171" /></TouchableOpacity></View>
            </View>
          ))}
          <View style={styles.formRow}>
            <TextInput value={service} onChangeText={setService} placeholder="Service name" placeholderTextColor="#64748B" style={[styles.input, styles.serviceInput]} />
            <TextInput value={amount} onChangeText={setAmount} placeholder="₦ Price" placeholderTextColor="#64748B" keyboardType="decimal-pad" style={[styles.input, styles.amountInput]} />
            <TouchableOpacity onPress={addItem} style={styles.addButton}><MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <View style={styles.summary}>
            <SummaryRow label="Client Pays" value={formatNaira(subtotal)} />
            <SummaryRow label="Platform Fee (10%)" value={formatNaira(fee)} />
            <View style={styles.divider} />
            <SummaryRow label="Your Payout (90%)" value={formatNaira(subtotal - fee)} strong />
          </View>
          <TouchableOpacity style={styles.sendButton}><MaterialCommunityIcons name="send" size={18} color="#FFFFFF" /><Text style={styles.sendText}>Send Invoice to Client Chat</Text></TouchableOpacity>
        </View>
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

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.summaryRow}><Text style={strong ? styles.strongLabel : styles.muted}>{label}</Text><Text style={strong ? styles.strongValue : styles.primary}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' }, content: { padding: 16, paddingBottom: 36 }, title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' }, subtitle: { color: '#94A3B8', marginTop: 4, marginBottom: 24 }, metrics: { flexDirection: 'row', gap: 10, marginBottom: 28 }, metric: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' }, metricIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, muted: { color: '#94A3B8', fontSize: 12 }, metricValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 5, textAlign: 'center' }, sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 12 }, panel: { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155', marginBottom: 26 }, queueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }, queueText: { flex: 1 }, primary: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }, accept: { backgroundColor: '#3B82F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }, acceptText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#334155' }, invoiceRight: { flexDirection: 'row', alignItems: 'center', gap: 10 }, price: { color: '#3B82F6', fontWeight: '700' }, formRow: { flexDirection: 'row', gap: 8, marginVertical: 16 }, input: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 10, fontSize: 12 }, serviceInput: { flex: 2 }, amountInput: { flex: 1 }, addButton: { width: 40, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }, summary: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 14 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, divider: { height: 1, backgroundColor: '#334155', marginVertical: 3 }, strongLabel: { color: '#10B981', fontWeight: '700', fontSize: 13 }, strongValue: { color: '#10B981', fontWeight: '700', fontSize: 15 }, sendButton: { backgroundColor: '#10B981', borderRadius: 9, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, sendText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  marketplace: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, marketProduct: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, padding: 12 }, marketName: { color: '#FFFFFF', fontWeight: '600', fontSize: 12, marginTop: 8 }, marketPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14, marginTop: 4 },
});
