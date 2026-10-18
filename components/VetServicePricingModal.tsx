import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  formatVetServicePrice,
  normalizeVetServicePricing,
  pricePeriods,
  veterinaryBundles,
  veterinaryCarePlans,
  veterinaryServices,
} from '../lib/vetServicePricing';
import { supabase } from '../lib/supabase';

type Props = {
  vetId: string;
  vetName: string;
  canBuildBundle: boolean;
  onBuildBundle: () => void;
};

type VisibleService = {
  id: string;
  name: string;
  description: string;
  price: string;
};

type VisibleCarePlan = {
  id: string;
  name: string;
  description: string;
  prices: { id: string; label: string; price: string }[];
};

export default function VetServicePricingModal({ vetId, vetName, canBuildBundle, onBuildBundle }: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pricing, setPricing] = useState(() => normalizeVetServicePricing(null));

  const openPricing = async () => {
    setVisible(true);
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('vet_service_pricing')
        .select('service_prices, bundle_prices, care_plan_prices')
        .eq('vet_id', vetId)
        .maybeSingle();
      if (queryError) throw queryError;
      setPricing(normalizeVetServicePricing(data));
    } catch (loadError) {
      console.error('[Vet Pricing] Could not load veterinarian pricing:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load this veterinarian’s pricing.');
    } finally {
      setLoading(false);
    }
  };

  const visibleServices: VisibleService[] = [];
  for (const service of veterinaryServices) {
    if ('variants' in service) {
      for (const variant of service.variants) {
        const key = `${service.id}_${variant.id}` as const;
        const price = formatVetServicePrice(pricing.services[key]);
        if (price) {
          visibleServices.push({
            id: key,
            name: `${service.name} - ${variant.label}`,
            description: String(service.description),
            price,
          });
        }
      }
      continue;
    }

    const price = formatVetServicePrice(pricing.services[service.id]);
    if (price) {
      visibleServices.push({
        id: service.id,
        name: service.name,
        description: String(service.description),
        price,
      });
    }
  }

  const visibleBundles = veterinaryBundles.flatMap((bundle) => {
    const price = formatVetServicePrice(pricing.bundles[bundle.id]);
    return price ? [{ ...bundle, price }] : [];
  });

  const visibleCarePlans: VisibleCarePlan[] = [];
  for (const plan of veterinaryCarePlans) {
    const prices: VisibleCarePlan['prices'] = [];
    for (const period of pricePeriods) {
      const price = formatVetServicePrice(pricing.carePlans[plan.id]?.[period.id]);
      if (price) {
        prices.push({ id: period.id, label: period.label, price });
      }
    }
    if (prices.length) {
      visibleCarePlans.push({
        id: plan.id,
        name: plan.name,
        description: String(plan.description),
        prices,
      });
    }
  }
  const hasPricing = visibleServices.length > 0 || visibleBundles.length > 0 || visibleCarePlans.length > 0;

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => void openPricing()} accessibilityRole="button">
        <MaterialCommunityIcons name="currency-usd" size={17} color="#FFFFFF" />
        <Text style={styles.triggerText}>View pricing</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Services & pricing</Text>
                <Text style={styles.subtitle}>{vetName}</Text>
              </View>
              <TouchableOpacity onPress={() => setVisible(false)} accessibilityLabel="Close service pricing">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={styles.status}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.statusText}>Loading service pricing…</Text>
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                {!hasPricing ? (
                  <Text style={styles.empty}>This veterinarian has not added service pricing yet. Please ask them directly in chat.</Text>
                ) : (
                  <>
                    {visibleServices.length ? (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Services</Text>
                        {visibleServices.map((service) => (
                          <View key={service.id} style={styles.priceRow}>
                            <View style={styles.priceCopy}>
                              <Text style={styles.name}>{service.name}</Text>
                              <Text style={styles.description}>{service.description}</Text>
                            </View>
                            <Text style={styles.price}>{service.price}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {visibleBundles.length ? (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Prepaid bundles</Text>
                        <Text style={styles.description}>One-time package prices for the services listed in each bundle.</Text>
                        {visibleBundles.map((bundle) => (
                          <View key={bundle.id} style={styles.card}>
                            <View style={styles.cardHeading}>
                              <Text style={styles.name}>{bundle.name}</Text>
                              <Text style={styles.price}>{bundle.price}</Text>
                            </View>
                            <Text style={styles.description}>{bundle.description}</Text>
                            <Text style={styles.period}>One-time price</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {visibleCarePlans.length ? (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Ongoing care plans</Text>
                        <Text style={styles.description}>Prices are shown by the billing period offered by this veterinarian. Ask them to confirm inclusions or exclusions.</Text>
                        {visibleCarePlans.map((plan) => (
                          <View key={plan.id} style={styles.card}>
                            <Text style={styles.name}>{plan.name}</Text>
                            <Text style={styles.description}>{plan.description}</Text>
                            <View style={styles.periodPrices}>
                              {plan.prices.map((period) => (
                                <View key={period.id} style={styles.periodPrice}>
                                  <Text style={styles.period}>{period.label}</Text>
                                  <Text style={styles.price}>{period.price}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
                {canBuildBundle ? (
                  <View style={styles.buildBundlePrompt}>
                    <Text style={styles.buildBundlePromptText}>None of these bundles quite fit?</Text>
                    <TouchableOpacity
                      style={styles.buildButton}
                      onPress={() => {
                        setVisible(false);
                        onBuildBundle();
                      }}
                    >
                      <MaterialCommunityIcons name="playlist-plus" size={18} color="#FFFFFF" />
                      <Text style={styles.buildButtonText}>Build my bundle</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '88%',
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerCopy: { flex: 1, gap: 4 },
  title: { color: '#F8FAFC', fontSize: 19, fontWeight: '700' },
  subtitle: { color: '#94A3B8', fontSize: 13 },
  content: { padding: 16, gap: 16, paddingBottom: 24 },
  section: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
  },
  sectionTitle: {
    color: '#6EE7B7',
    fontSize: 15,
    fontWeight: '700',
    paddingTop: 14,
    paddingBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  priceCopy: { flex: 1, gap: 3 },
  name: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  description: { color: '#94A3B8', fontSize: 12, lineHeight: 17 },
  price: { color: '#6EE7B7', fontSize: 14, fontWeight: '700' },
  card: {
    gap: 8,
    padding: 13,
    marginBottom: 10,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  period: { color: '#94A3B8', fontSize: 11 },
  periodPrices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  periodPrice: { gap: 3, minWidth: 88 },
  status: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  statusText: { color: '#CBD5E1', fontSize: 14 },
  error: { color: '#FCA5A5', padding: 20 },
  empty: { color: '#CBD5E1', fontSize: 14, lineHeight: 21 },
  buildBundlePrompt: { gap: 8 },
  buildBundlePromptText: { color: '#CBD5E1', fontSize: 13, textAlign: 'center' },
  buildButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 14,
  },
  buildButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
