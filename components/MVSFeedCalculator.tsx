import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Category = 'Poultry' | 'Fish' | 'Pig';
type BirdType = 'Broilers' | 'Layers';
type FeedType = 'Starter' | 'Finisher' | 'Chick Mash' | 'Growers Mash' | 'Layers Mash/Pellet';
type FormField = 'weeks' | 'birdCount' | 'fishSize' | 'fishCount' | 'pigCount';

type CalculationResult = {
  category: Category;
  details: { label: string; value: string }[];
  dailyKg: number;
  weeklyKg: number;
  rateDescription: string;
};

type Props = {
  onContactVendor: () => void;
  compact?: boolean;
};

const categories: { name: Category; icon: 'bird' | 'fish' | 'pig' }[] = [
  { name: 'Poultry', icon: 'bird' },
  { name: 'Fish', icon: 'fish' },
  { name: 'Pig', icon: 'pig' },
];

const feedOptions: Record<BirdType, { name: FeedType; hint: string }[]> = {
  Broilers: [
    { name: 'Starter', hint: 'Weeks 3–4' },
    { name: 'Finisher', hint: 'Week 5 onward' },
  ],
  Layers: [
    { name: 'Chick Mash', hint: 'Weeks 1–8' },
    { name: 'Growers Mash', hint: 'Weeks 9–18' },
    { name: 'Layers Mash/Pellet', hint: 'Week 19 onward' },
  ],
};

const formatQuantity = (quantity: number) => {
  return new Intl.NumberFormat('en-NG', { maximumSignificantDigits: 3, useGrouping: false }).format(quantity);
};

const wholeNumber = (value: string) => {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const positiveNumber = (value: string) => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export default function MVSFeedCalculator({ onContactVendor, compact = false }: Props) {
  const [visible, setVisible] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [birdType, setBirdType] = useState<BirdType | null>(null);
  const [feedType, setFeedType] = useState<FeedType | null>(null);
  const [weeks, setWeeks] = useState('');
  const [birdCount, setBirdCount] = useState('');
  const [fishSize, setFishSize] = useState('');
  const [fishCount, setFishCount] = useState('');
  const [pigCount, setPigCount] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FormField | 'birdType' | 'feedType', boolean>>>({});
  const [result, setResult] = useState<CalculationResult | null>(null);

  const reset = () => {
    setCategory(null);
    setBirdType(null);
    setFeedType(null);
    setWeeks('');
    setBirdCount('');
    setFishSize('');
    setFishCount('');
    setPigCount('');
    setTouched({});
    setResult(null);
  };

  const close = () => {
    setVisible(false);
    reset();
  };

  const weeksValue = wholeNumber(weeks);
  const birdCountValue = wholeNumber(birdCount);
  const fishSizeValue = positiveNumber(fishSize);
  const fishCountValue = wholeNumber(fishCount);
  const pigCountValue = wholeNumber(pigCount);

  const weeksError = () => {
    if (!weeks.trim()) return 'Enter the number of weeks.';
    if (weeksValue === null || weeksValue < 1) return 'Enter a valid whole number of weeks.';
    if (category === 'Poultry' && birdType === 'Broilers') {
      if (weeksValue < 3) return 'Broilers must be at least 3 weeks old.';
      if (feedType === 'Starter' && weeksValue > 4) return 'Starter feed is for weeks 3–4; choose Finisher for week 5 onward.';
      if (feedType === 'Finisher' && weeksValue < 5) return 'Finisher feed is for week 5 onward; choose Starter for weeks 3–4.';
    }
    if (category === 'Poultry' && birdType === 'Layers') {
      if (feedType === 'Chick Mash' && weeksValue > 8) return 'Chick Mash is for weeks 1–8.';
      if (feedType === 'Growers Mash' && (weeksValue < 9 || weeksValue > 18)) return 'Growers Mash is for weeks 9–18.';
      if (feedType === 'Layers Mash/Pellet' && weeksValue < 19) return 'Layers Mash/Pellet is for week 19 onward.';
    }
    return '';
  };

  const errors: Partial<Record<FormField | 'birdType' | 'feedType', string>> = {
    birdType: !birdType ? 'Choose Broilers or Layers.' : '',
    feedType: birdType && !feedType ? 'Choose a feed type.' : '',
    weeks: weeksError(),
    birdCount: !birdCount.trim()
      ? 'Enter the number of birds.'
      : birdCountValue === null || birdCountValue < 1
        ? 'Enter a whole number of birds (at least 1).'
        : '',
    fishSize: !fishSize.trim()
      ? 'Enter the average fish size.'
      : fishSizeValue === null
        ? 'Enter a fish size greater than 0 grams.'
        : '',
    fishCount: !fishCount.trim()
      ? 'Enter the number of fish.'
      : fishCountValue === null || fishCountValue < 1
        ? 'Enter a whole number of fish (at least 1).'
        : '',
    pigCount: !pigCount.trim()
      ? 'Enter the number of pigs.'
      : pigCountValue === null || pigCountValue < 1
        ? 'Enter a whole number of pigs (at least 1).'
        : '',
  };

  const isValid = (() => {
    if (!category) return false;
    if (category === 'Poultry') {
      return Boolean(birdType && feedType && weeksValue !== null && !errors.weeks && birdCountValue !== null && birdCountValue >= 1);
    }
    if (category === 'Fish') return fishSizeValue !== null && fishCountValue !== null && fishCountValue >= 1;
    return pigCountValue !== null && pigCountValue >= 1;
  })();

  const markTouched = (field: FormField) => setTouched((current) => ({ ...current, [field]: true }));

  const calculate = () => {
    if (!isValid || !category) return;
    let dailyKg = 0;
    let details: CalculationResult['details'] = [];
    let rateDescription = '';

    if (category === 'Poultry' && birdType && feedType && weeksValue && birdCountValue) {
      let gramsPerBird = 0;
      if (birdType === 'Broilers') {
        const weeklyRates = [0, 0, 0, 60, 85, 110, 135, 155, 170, 180];
        gramsPerBird = weeksValue < weeklyRates.length
          ? weeklyRates[weeksValue]
          : Math.min(250, weeklyRates[weeklyRates.length - 1] + (weeksValue - 9) * 10);
      } else if (feedType === 'Chick Mash') {
        gramsPerBird = Math.min(45, 18 + weeksValue * 3.5);
      } else if (feedType === 'Growers Mash') {
        gramsPerBird = 50 + (weeksValue - 9) * 4;
      } else {
        gramsPerBird = 115;
      }
      dailyKg = (gramsPerBird * birdCountValue) / 1000;
      details = [
        { label: 'Bird type', value: birdType },
        { label: 'Feed type', value: feedType },
        { label: 'Age', value: `${weeksValue} weeks` },
        { label: 'Number of birds', value: birdCountValue.toLocaleString() },
        { label: 'Per bird daily rate', value: `${gramsPerBird} g` },
      ];
      rateDescription = 'Age- and stage-based estimated daily intake';
    } else if (category === 'Fish' && fishSizeValue && fishCountValue) {
      const feedRate = fishSizeValue <= 10 ? 0.1 : fishSizeValue <= 50 ? 0.06 : fishSizeValue <= 200 ? 0.04 : 0.025;
      dailyKg = (fishSizeValue * fishCountValue * feedRate) / 1000;
      details = [
        { label: 'Number of fish', value: fishCountValue.toLocaleString() },
        { label: 'Average fish size', value: `${formatQuantity(fishSizeValue)} g` },
        { label: 'Daily biomass rate', value: `${(feedRate * 100).toLocaleString()}%` },
      ];
      rateDescription = 'Estimated ration based on average fish size';
    } else if (category === 'Pig' && pigCountValue) {
      const kilogramsPerPig = 2.5;
      dailyKg = kilogramsPerPig * pigCountValue;
      details = [
        { label: 'Number of pigs', value: pigCountValue.toLocaleString() },
        { label: 'Per pig daily rate', value: `${formatQuantity(kilogramsPerPig)} kg` },
      ];
      rateDescription = 'Typical grower-pig planning estimate';
    }

    setResult({ category, details, dailyKg, weeklyKg: dailyKg * 7, rateDescription });
  };

  const selectCategory = (nextCategory: Category) => {
    reset();
    setCategory(nextCategory);
    if (nextCategory === 'Poultry') setTouched({ birdType: true });
  };

  const renderError = (field: FormField | 'birdType' | 'feedType') => (
    touched[field] && errors[field] ? <Text style={styles.errorText}>{errors[field]}</Text> : null
  );

  const renderNumberField = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    field: FormField,
    placeholder: string,
    suffix?: string,
    helper?: string,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label} <Text style={styles.required}>*</Text></Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={() => markTouched(field)}
          keyboardType={field === 'fishSize' ? 'decimal-pad' : 'number-pad'}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          style={styles.input}
          accessibilityLabel={label}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      {renderError(field)}
    </View>
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.compactTrigger]}
        onPress={() => setVisible(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open MVS Feed Calculator"
      >
        <View style={styles.triggerIcon}>
          <MaterialCommunityIcons name="calculator-variant-outline" size={compact ? 20 : 23} color="#34D399" />
        </View>
        <View style={styles.triggerCopy}>
          <Text style={[styles.triggerTitle, compact && styles.compactTriggerTitle]}>MVS Feed Calculator</Text>
          {!compact ? <Text style={styles.triggerSubtitle}>Plan daily feed for your livestock</Text> : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={compact ? 20 : 25} color="#6EE7B7" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="calculator-variant-outline" size={22} color="#34D399" />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>MVS Feed Calculator</Text>
                <Text style={styles.subtitle}>Calculate feed for your pets and livestock</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeButton} accessibilityLabel="Close feed calculator">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {result ? (
              <>
                <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
                  <View style={styles.resultIcon}>
                    <MaterialCommunityIcons name="check" size={28} color="#FFFFFF" />
                  </View>
                  <Text style={styles.resultEyebrow}>YOUR DAILY FEED ESTIMATE</Text>
                  <Text style={styles.resultQuantity}>{formatQuantity(result.dailyKg)} kg</Text>
                  <Text style={styles.resultPerDay}>per day</Text>
                  <View style={styles.weeklyCard}>
                    <Text style={styles.weeklyLabel}>7-DAY FEED ESTIMATE</Text>
                    <Text style={styles.weeklyQuantity}>{formatQuantity(result.weeklyKg)} kg</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Calculation summary</Text>
                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Category</Text><Text style={styles.summaryValue}>{result.category}</Text></View>
                    {result.details.map((detail) => (
                      <View style={styles.summaryRow} key={detail.label}>
                        <Text style={styles.summaryLabel}>{detail.label}</Text>
                        <Text style={styles.summaryValue}>{detail.value}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.disclaimer}>
                    {result.rateDescription}. Actual requirements vary with breed, health, environment and feed quality. Use this as a guide and check a suitable ration with a local veterinarian or animal nutritionist.
                  </Text>
                </ScrollView>
                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.vendorButton} onPress={() => { setVisible(false); onContactVendor(); }} accessibilityRole="button">
                    <MaterialCommunityIcons name="storefront-outline" size={19} color="#FFFFFF" />
                    <Text style={styles.actionText}>Contact a vendor</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.restartButton} onPress={reset} accessibilityRole="button">
                    <MaterialCommunityIcons name="restart" size={19} color="#FFFFFF" />
                    <Text style={styles.actionText}>Start over</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ScrollView
                  style={styles.formScroll}
                  contentContainerStyle={styles.formContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.sectionLabel}>LIVESTOCK CATEGORY</Text>
                  <View style={styles.categoryRow}>
                    {categories.map((item) => (
                      <TouchableOpacity
                        key={item.name}
                        style={[styles.categoryCard, category === item.name && styles.categoryCardSelected]}
                        onPress={() => selectCategory(item.name)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: category === item.name }}
                      >
                        <MaterialCommunityIcons name={item.icon} size={23} color={category === item.name ? '#34D399' : '#94A3B8'} />
                        <Text style={[styles.categoryText, category === item.name && styles.selectedText]}>{item.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {category === 'Poultry' ? (
                    <>
                      <Text style={styles.label}>Bird type <Text style={styles.required}>*</Text></Text>
                      <View style={styles.optionRow}>
                        {(['Broilers', 'Layers'] as const).map((item) => (
                          <TouchableOpacity
                            key={item}
                            style={[styles.optionButton, birdType === item && styles.optionButtonSelected]}
                            onPress={() => {
                              setBirdType(item);
                              setFeedType(null);
                              setTouched((current) => ({ ...current, birdType: true, feedType: true }));
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: birdType === item }}
                          >
                            <Text style={[styles.optionText, birdType === item && styles.selectedText]}>{item}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {renderError('birdType')}

                      {birdType ? (
                        <>
                          <Text style={styles.label}>Feed type <Text style={styles.required}>*</Text></Text>
                          <View style={styles.feedOptions}>
                            {feedOptions[birdType].map((item) => (
                              <TouchableOpacity
                                key={item.name}
                                style={[styles.feedOption, feedType === item.name && styles.feedOptionSelected]}
                                onPress={() => {
                                  setFeedType(item.name);
                                  setTouched((current) => ({ ...current, feedType: true, weeks: true }));
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: feedType === item.name }}
                              >
                                <Text style={[styles.optionText, feedType === item.name && styles.selectedText]}>{item.name}</Text>
                                <Text style={styles.helper}>{item.hint}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          {renderError('feedType')}
                          {renderNumberField('Number of weeks', weeks, setWeeks, 'weeks', 'e.g. 4', 'weeks')}
                          {renderNumberField('Number of birds', birdCount, setBirdCount, 'birdCount', 'e.g. 100')}
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {category === 'Fish' ? (
                    <>
                      {renderNumberField('Average size per fish', fishSize, setFishSize, 'fishSize', 'e.g. 50', 'g', 'Enter the average live weight of one fish in grams.')}
                      {renderNumberField('Number of fish', fishCount, setFishCount, 'fishCount', 'e.g. 500')}
                    </>
                  ) : null}

                  {category === 'Pig' ? (
                    <>
                      {renderNumberField('Number of pigs', pigCount, setPigCount, 'pigCount', 'e.g. 10')}
                      <View style={styles.infoNote}>
                        <MaterialCommunityIcons name="information-outline" size={18} color="#6EE7B7" />
                        <Text style={styles.infoText}>Pig estimates use a typical grower-pig daily ration. Piglets, breeding sows and boars have different needs.</Text>
                      </View>
                    </>
                  ) : null}

                  <Text style={styles.disclaimer}>
                    Feed amounts are planning estimates, not a veterinary prescription. Individual requirements vary.
                  </Text>
                </ScrollView>
                <View style={styles.submitFooter}>
                  <TouchableOpacity
                    style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
                    onPress={calculate}
                    disabled={!isValid}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !isValid }}
                  >
                    <Text style={styles.actionText}>Calculate feed</Text>
                    <MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: '#102E2A',
    borderColor: '#176653',
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  compactTrigger: { flex: 1, minHeight: 76, paddingHorizontal: 10, paddingVertical: 11, marginBottom: 0 },
  triggerIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#164E41', alignItems: 'center', justifyContent: 'center' },
  triggerCopy: { flex: 1, marginLeft: 12 },
  triggerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  compactTriggerTitle: { fontSize: 12, lineHeight: 16 },
  triggerSubtitle: { color: '#A7D7CA', fontSize: 11, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 500, height: '88%', maxHeight: '88%', minHeight: 0, backgroundColor: '#0F172A', borderRadius: 20, overflow: 'hidden', paddingBottom: Platform.OS === 'ios' ? 22 : 12 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#243246' },
  headerIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#102E2A', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 12 },
  title: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  subtitle: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  formScroll: { flex: 1 },
  formContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  sectionLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  categoryRow: { flexDirection: 'row', gap: 9, marginBottom: 19 },
  categoryCard: { flex: 1, minHeight: 75, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12 },
  categoryCardSelected: { backgroundColor: '#12382F', borderColor: '#10B981' },
  categoryText: { color: '#CBD5E1', fontSize: 12, fontWeight: '600' },
  selectedText: { color: '#FFFFFF' },
  label: { color: '#E2E8F0', fontWeight: '600', fontSize: 13, marginTop: 8, marginBottom: 8 },
  required: { color: '#F87171' },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  optionButton: { flex: 1, borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#1E293B' },
  optionButtonSelected: { borderColor: '#10B981', backgroundColor: '#12382F' },
  optionText: { color: '#CBD5E1', fontWeight: '600', fontSize: 13 },
  feedOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  feedOption: { minWidth: '31%', flexGrow: 1, padding: 11, alignItems: 'center', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10 },
  feedOptionSelected: { backgroundColor: '#12382F', borderColor: '#10B981' },
  field: { marginTop: 12 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, minHeight: 48 },
  input: { flex: 1, color: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, fontSize: 15 },
  inputSuffix: { color: '#94A3B8', paddingHorizontal: 13, fontSize: 12 },
  helper: { color: '#94A3B8', fontSize: 11, marginTop: 5, textAlign: 'center' },
  errorText: { color: '#F87171', fontSize: 12, marginTop: 5 },
  infoNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, backgroundColor: '#102E2A', borderRadius: 10, marginTop: 15 },
  infoText: { flex: 1, color: '#A7D7CA', fontSize: 11, lineHeight: 17 },
  disclaimer: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 20 },
  submitFooter: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#243246' },
  submitButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#059669', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  submitButtonDisabled: { backgroundColor: '#334155' },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  resultContent: { paddingHorizontal: 18, paddingTop: 25, paddingBottom: 18, alignItems: 'center' },
  resultScroll: { flex: 1, minHeight: 0 },
  resultIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  resultEyebrow: { color: '#6EE7B7', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: 20 },
  resultQuantity: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', marginTop: 5 },
  resultPerDay: { color: '#CBD5E1', fontSize: 14, marginTop: -2 },
  weeklyCard: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#102E2A', borderColor: '#176653', borderWidth: 1, borderRadius: 13, padding: 15, marginTop: 22 },
  weeklyLabel: { color: '#A7D7CA', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  weeklyQuantity: { color: '#FFFFFF', fontWeight: '700', fontSize: 22, marginTop: 6 },
  summaryCard: { alignSelf: 'stretch', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 14 },
  summaryTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopColor: '#334155', borderTopWidth: 1 },
  summaryLabel: { color: '#94A3B8', flex: 1, fontSize: 12 },
  summaryValue: { color: '#E2E8F0', flex: 1, fontSize: 12, textAlign: 'right', fontWeight: '600' },
  resultActions: { paddingHorizontal: 18, paddingTop: 12, gap: 9, borderTopWidth: 1, borderTopColor: '#243246' },
  vendorButton: { minHeight: 49, borderRadius: 12, backgroundColor: '#D97706', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  restartButton: { minHeight: 47, borderRadius: 12, backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
});
