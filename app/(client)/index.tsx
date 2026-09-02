import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchMarketplaceProducts, useMarketplace } from '../../lib/marketplace';
import { getCurrentUser, normalizeUuid, supabase } from '../../lib/supabase';

interface Tip {
  id: string;
  title: string;
  icon: any;
  body: string;
  tips: string[];
}

const naira = (price: number) => `₦${price.toLocaleString()}`;

export default function ClientHome() {
  const router = useRouter();
  const { products } = useMarketplace();
  const [selectedTip, setSelectedTip] = useState<Tip | null>(null);
  const [productOrderStatuses, setProductOrderStatuses] = useState<Record<string, string>>({});

  const inquireAboutProduct = async (product: (typeof products)[number]) => {
    const user = await getCurrentUser();
    if (!user || !normalizeUuid(product.merchantId)) return;
    const conversationId = `conv_${[user.id, product.merchantId].sort().join('_')}`;
    router.push({ pathname: '/chat', params: { conversationId, productId: product.id, merchantId: product.merchantId, merchantName: product.merchant, productName: product.name, productPrice: String(product.price), starterMessage: `Hi! I would like to inquire about purchasing ${product.name} listed for ₦${product.price}.` } });
  };

  useFocusEffect(
    useCallback(() => {
      void fetchMarketplaceProducts().catch(() => undefined);
    }, [])
  );

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
          .eq('buyer_id', user.id);

        if (error) throw error;

        const statusMap: Record<string, string> = {};
        for (const item of data || []) {
          if (item?.product_id) statusMap[String(item.product_id)] = item.status;
        }
        setProductOrderStatuses(statusMap);
      } catch (error) {
        console.warn('[Client Home] Failed to load order statuses:', error);
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

  const tips: Tip[] = [
    {
      id: '1',
      title: 'Vaccination',
      icon: 'needle',
      body: 'Regular vaccinations protect your pet from serious diseases. Puppies and kittens need a series of shots starting at 6-8 weeks of age.',
      tips: ['Start vaccination at 6-8 weeks', 'Follow a regular schedule', 'Keep vaccination records safe', 'Booster shots every 1-3 years'],
    },
    {
      id: '2',
      title: 'Cat Age',
      icon: 'cat',
      body: 'Understanding your cat\'s age in human years helps you provide age-appropriate care. A 1-year-old cat is like a 15-year-old human.',
      tips: ['First year = 15 human years', 'Second year = 10 human years', 'Each year after = 4 human years', 'Adjust care based on age'],
    },
    {
      id: '3',
      title: 'Rabies',
      icon: 'virus-alert',
      body: 'Rabies is a deadly virus spread through saliva. Vaccination and avoiding contact with wild animals are key prevention methods.',
      tips: ['Vaccinate against rabies', 'Avoid wildlife contact', 'Seek help if bitten immediately', 'Report stray animals'],
    },
    {
      id: '4',
      title: 'Nutrition',
      icon: 'apple',
      body: 'Proper nutrition is essential for your pet\'s health. Different life stages require different nutrients and calorie amounts.',
      tips: ['Choose quality food', 'Age-appropriate diet', 'Monitor portion sizes', 'Fresh water always available'],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title="MVS Knowledge Hub" action="View All" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowGap}>
          {tips.map((tip) => (
            <TouchableOpacity key={tip.id} style={styles.tipCard} onPress={() => setSelectedTip(tip)}>
              <View style={styles.tipIcon}>
                <MaterialCommunityIcons name={tip.icon} size={30} color="#3B82F6" />
              </View>
              <Text style={styles.cardTitle}>{tip.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.banner}>
          <View style={styles.flex}>
            <Text style={styles.bannerTitle}>Consult a Vet Now</Text>
            <Text style={styles.bannerText}>Get professional advice instantly</Text>
          </View>
          <TouchableOpacity style={styles.bannerButton} onPress={() => router.push('/(client)/vets')}>
            <Text style={styles.bannerButtonText}>Consult</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="Marketplace" action="Browse All" />
        <View style={styles.grid}>
          {products.map((product) => {
            const badge = getOrderBadge(productOrderStatuses[String(product.id)]);
            return (
              <View key={product.id} style={styles.product}>
                <TouchableOpacity onPress={() => inquireAboutProduct(product)}>
                  <View style={styles.productImage}>
                    {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productPhoto} /> : <MaterialCommunityIcons name={product.icon as any} size={38} color="#CBD5E1" />}
                  </View>
                </TouchableOpacity>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productPrice}>{naira(product.price)}</Text>
                <Text style={styles.muted}>{product.merchant}</Text>
                {badge && (
                  <View style={[styles.orderBadge, { backgroundColor: badge.color }]}>
                    <Text style={styles.orderBadgeText}>{badge.label}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.inquireButton} onPress={() => inquireAboutProduct(product)}><Text style={styles.inquireText}>Inquire / Buy</Text></TouchableOpacity>
              </View>
            );
          })}
        </View>

      </ScrollView>

      <Modal visible={Boolean(selectedTip)} animationType="slide" transparent onRequestClose={() => setSelectedTip(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <TouchableOpacity style={styles.close} onPress={() => setSelectedTip(null)}>
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {selectedTip && (
              <ScrollView>
                <View style={styles.modalIcon}>
                  <MaterialCommunityIcons name={selectedTip.icon} size={34} color="#3B82F6" />
                </View>
                <Text style={styles.modalTitle}>{selectedTip.title}</Text>
                <Text style={styles.modalBody}>{selectedTip.body}</Text>
                <Text style={styles.modalSection}>Actionable prevention tips</Text>
                {selectedTip.tips.map((tip) => (
                  <View key={tip} style={styles.tipLine}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#10B981" />
                    <Text style={styles.modalBody}>{tip}</Text>
                  </View>
                ))}
                <TouchableOpacity style={styles.primaryButton} onPress={() => setSelectedTip(null)}>
                  <Text style={styles.primaryText}>Done</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity>
        <Text style={styles.action}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 16, paddingBottom: 35 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  action: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  rowGap: { gap: 12, paddingBottom: 4 },
  tipCard: { width: 160, padding: 15, borderRadius: 12, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, alignItems: 'center' },
  tipIcon: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#3B82F620', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  banner: { backgroundColor: '#10B981', borderRadius: 15, padding: 18, flexDirection: 'row', alignItems: 'center', marginVertical: 26 },
  flex: { flex: 1 },
  bannerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  bannerText: { color: '#D1FAE5', marginTop: 4, fontSize: 13 },
  bannerButton: { backgroundColor: '#FFFFFF', borderRadius: 9, padding: 11, alignItems: 'center' },
  bannerButtonText: { color: '#10B981', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  product: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12 },
  productImage: { height: 96, backgroundColor: '#0F172A', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  productPhoto: { width: '100%', height: '100%', borderRadius: 8 },
  productName: { color: '#FFFFFF', fontWeight: '600', fontSize: 13, marginBottom: 7 },
  productPrice: { color: '#3B82F6', fontWeight: '700', fontSize: 14 },
  muted: { color: '#94A3B8', fontSize: 11 },
  orderBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8, marginBottom: 4 },
  orderBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  inquireButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  inquireText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  backButton: { borderColor: '#3B82F6', borderWidth: 1, borderRadius: 9, padding: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 30 },
  backText: { color: '#3B82F6', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  modal: { maxHeight: '88%', backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22 },
  close: { alignSelf: 'flex-end' },
  modalIcon: { width: 82, height: 82, borderRadius: 20, backgroundColor: '#3B82F620', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 22, textAlign: 'center', marginBottom: 12 },
  modalBody: { color: '#E2E8F0', lineHeight: 22, marginBottom: 10 },
  modalSection: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  tipLine: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  primaryButton: { backgroundColor: '#3B82F6', padding: 14, borderRadius: 9, alignItems: 'center', marginTop: 22 },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
});
