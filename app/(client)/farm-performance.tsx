import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { createOfflineRecordId, enqueueOfflineRecord, readOfflineRecords, readOfflineSnapshot, saveOfflineSnapshot, syncOfflineRecords } from '../../lib/offlineRecords';
import { sanitizeInput } from '../../lib/sanitize';
import { getCurrentUser, supabase } from '../../lib/supabase';

type Species = 'Broilers' | 'Layers' | 'Fish' | 'Pigs' | 'Swine' | 'Goats' | 'Cattle';
type Batch = {
  id: string;
  batch_name: string;
  species: Species;
  initial_head_count: number;
  start_date: string;
  initial_cost: number | string;
  feed_cost_per_kg: number | string;
  initial_avg_weight_g: number | string | null;
  status: 'active' | 'completed';
  sync_pending?: boolean;
};
type DailyLog = {
  id: string;
  log_date: string;
  feed_consumed_kg: number | string;
  mortality_count: number;
  average_weight_g: number | string | null;
  weight_gain_g: number | string;
  symptoms: string;
  expense_amount: number | string;
  revenue_amount: number | string;
  sync_pending?: boolean;
};

const speciesOptions: Species[] = ['Broilers', 'Layers', 'Fish', 'Pigs', 'Swine', 'Goats', 'Cattle'];
const mortalityThresholds: Record<Species, number> = {
  Broilers: 5, Layers: 5, Fish: 10, Pigs: 5, Swine: 5, Goats: 5, Cattle: 3,
};
const colors = {
  background: '#07111F', card: '#101D2D', border: '#213249', text: '#F1F5F9',
  muted: '#94A3B8', green: '#34D399', red: '#F87171', blue: '#60A5FA', amber: '#FBBF24',
};
const amount = (value: number) => `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const numberFrom = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? Number(value || 0) : 0;
const today = () => new Date().toISOString().slice(0, 10);
const batchFromOfflinePayload = (payload: Record<string, unknown>): Batch | null => {
  const id = typeof payload.id === 'string' ? payload.id : null;
  const batchName = typeof payload.batch_name === 'string' ? payload.batch_name : null;
  const batchSpecies = speciesOptions.find((option) => option === payload.species);
  const startDate = typeof payload.start_date === 'string' ? payload.start_date : null;
  if (!id || !batchName || !batchSpecies || !startDate) return null;
  return {
    id,
    batch_name: batchName,
    species: batchSpecies,
    initial_head_count: numberFrom(payload.initial_head_count),
    start_date: startDate,
    initial_cost: numberFrom(payload.initial_cost),
    feed_cost_per_kg: numberFrom(payload.feed_cost_per_kg),
    initial_avg_weight_g: payload.initial_avg_weight_g == null ? null : numberFrom(payload.initial_avg_weight_g),
    status: payload.status === 'completed' ? 'completed' : 'active',
    sync_pending: true,
  };
};
const dailyLogFromOfflinePayload = (payload: Record<string, unknown>): DailyLog | null => {
  if (typeof payload.id !== 'string' || typeof payload.batch_id !== 'string' || typeof payload.log_date !== 'string') return null;
  return {
    id: payload.id,
    log_date: payload.log_date,
    feed_consumed_kg: numberFrom(payload.feed_consumed_kg),
    mortality_count: numberFrom(payload.mortality_count),
    average_weight_g: payload.average_weight_g == null ? null : numberFrom(payload.average_weight_g),
    weight_gain_g: numberFrom(payload.weight_gain_g),
    symptoms: typeof payload.symptoms === 'string' ? payload.symptoms : '',
    expense_amount: numberFrom(payload.expense_amount),
    revenue_amount: numberFrom(payload.revenue_amount),
    sync_pending: true,
  };
};

export default function FarmPerformanceScreen() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchFormVisible, setBatchFormVisible] = useState(false);
  const [logFormVisible, setLogFormVisible] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [species, setSpecies] = useState<Species>('Broilers');
  const [headCount, setHeadCount] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [initialCost, setInitialCost] = useState('');
  const [feedCost, setFeedCost] = useState('');
  const [initialWeight, setInitialWeight] = useState('');
  const [logDate, setLogDate] = useState(today());
  const [feedConsumed, setFeedConsumed] = useState('');
  const [mortality, setMortality] = useState('0');
  const [averageWeight, setAverageWeight] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [expenses, setExpenses] = useState('');
  const [revenue, setRevenue] = useState('');
  const [editingLogId, setEditingLogId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);

  const loadData = useCallback(async (preferredBatchId?: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to access your farm production data.');
      const network = await NetInfo.fetch();
      const isOnline = network.isConnected === true && network.isInternetReachable !== false;
      const pendingOperations = await readOfflineRecords(user.id);
      const pendingBatches = pendingOperations
        .filter((operation) => operation.kind === 'farm_batch' && operation.payload.owner_id === user.id)
        .map((operation) => batchFromOfflinePayload(operation.payload))
        .filter((batch): batch is Batch => Boolean(batch));
      const mergeBatches = (records: Batch[]) => {
        const byId = new Map(records.map((batch) => [batch.id, batch]));
        for (const batch of pendingBatches) byId.set(batch.id, { ...batch, sync_pending: true } as Batch);
        return [...byId.values()].sort((left, right) => right.start_date.localeCompare(left.start_date));
      };
      if (!isOnline) {
        const cachedBatches = await readOfflineSnapshot<Batch[]>(user.id, 'farm-performance-batches');
        const ownedBatches = mergeBatches(cachedBatches?.value || []);
        setBatches(ownedBatches);
        const nextBatchId = preferredBatchId && ownedBatches.some((batch) => batch.id === preferredBatchId)
          ? preferredBatchId
          : ownedBatches.some((batch) => batch.id === selectedBatchId)
            ? selectedBatchId
            : ownedBatches.find((batch) => batch.status === 'active')?.id || ownedBatches[0]?.id || '';
        setSelectedBatchId(nextBatchId);
        const deletedLogIds = new Set(pendingOperations
          .filter((operation) => operation.kind === 'farm_daily_log_delete')
          .map((operation) => operation.payload.id));
        if (!nextBatchId) {
          setLogs([]);
          setErrorMessage(cachedBatches ? '' : 'No saved farm performance data is available offline yet.');
        } else {
          const cachedLogs = await readOfflineSnapshot<DailyLog[]>(user.id, `farm-performance-logs:${nextBatchId}`);
          const pendingLogs = pendingOperations
            .filter((operation) => operation.kind === 'farm_daily_log' && operation.payload.batch_id === nextBatchId)
            .map((operation) => dailyLogFromOfflinePayload(operation.payload))
            .filter((log): log is DailyLog => Boolean(log));
          const mergedLogs = [...(cachedLogs?.value || []).filter((log) => !deletedLogIds.has(log.id))];
          for (const pendingLog of pendingLogs) {
            const index = mergedLogs.findIndex((log) => log.id === pendingLog.id || log.log_date === pendingLog.log_date);
            if (!deletedLogIds.has(pendingLog.id)) {
              if (index >= 0) mergedLogs[index] = pendingLog;
              else mergedLogs.push(pendingLog);
            }
          }
          setLogs(mergedLogs);
          setErrorMessage(cachedLogs || pendingLogs.length ? '' : 'No saved daily logs are available offline for this batch.');
        }
        setOfflineMode(true);
        return;
      }

      const { data: batchData, error: batchError } = await supabase
        .from('farm_batches')
        .select('id, batch_name, species, initial_head_count, start_date, initial_cost, feed_cost_per_kg, initial_avg_weight_g, status')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      if (batchError) throw batchError;

      const ownedBatches = mergeBatches((batchData || []) as Batch[]);
      setBatches(ownedBatches);
      await saveOfflineSnapshot(user.id, 'farm-performance-batches', (batchData || []) as Batch[]);
      const nextBatchId = preferredBatchId && ownedBatches.some((batch) => batch.id === preferredBatchId)
        ? preferredBatchId
        : ownedBatches.some((batch) => batch.id === selectedBatchId)
          ? selectedBatchId
          : ownedBatches.find((batch) => batch.status === 'active')?.id || ownedBatches[0]?.id || '';
      setSelectedBatchId(nextBatchId);

      if (!nextBatchId) {
        setLogs([]);
      } else {
        const { data: logData, error: logError } = await supabase
          .from('farm_daily_logs')
          .select('id, log_date, feed_consumed_kg, mortality_count, average_weight_g, weight_gain_g, symptoms, expense_amount, revenue_amount')
          .eq('batch_id', nextBatchId)
          .order('log_date', { ascending: false });
        if (logError) throw logError;
        const loadedLogs = (logData || []) as DailyLog[];
        const pendingLogs = pendingOperations
          .filter((operation) => operation.kind === 'farm_daily_log' && operation.payload.batch_id === nextBatchId)
          .map((operation) => dailyLogFromOfflinePayload(operation.payload))
          .filter((log): log is DailyLog => Boolean(log));
        const deletedLogIds = new Set(pendingOperations
          .filter((operation) => operation.kind === 'farm_daily_log_delete')
          .map((operation) => operation.payload.id));
        const mergedLogs = [...loadedLogs.filter((log) => !deletedLogIds.has(log.id))];
        for (const pendingLog of pendingLogs) {
          const index = mergedLogs.findIndex((log) => log.id === pendingLog.id || log.log_date === pendingLog.log_date);
          if (!deletedLogIds.has(pendingLog.id)) {
            if (index >= 0) mergedLogs[index] = pendingLog;
            else mergedLogs.push(pendingLog);
          }
        }
        setLogs(mergedLogs);
        await saveOfflineSnapshot(user.id, `farm-performance-logs:${nextBatchId}`, loadedLogs);
      }
      setOfflineMode(false);
    } catch (error) {
      console.error('[Farm Performance] Failed to load production data:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load production data.');
      setOfflineMode(false);
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId]);

  useFocusEffect(useCallback(() => {
    void loadData();
  }, [loadData]));

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
  const initialHeadCount = selectedBatch?.initial_head_count ?? 0;
  const mortalityTotal = logs.reduce((total, log) => total + Number(log.mortality_count), 0);
  const mortalityRate = initialHeadCount ? mortalityTotal / initialHeadCount * 100 : 0;
  const totalFeed = logs.reduce((total, log) => total + numberFrom(log.feed_consumed_kg), 0);
  const totalWeightGainKg = logs.reduce((total, log) => total + numberFrom(log.weight_gain_g), 0) / 1000;
  const fcr = totalWeightGainKg > 0 ? totalFeed / totalWeightGainKg : null;
  const totalRevenue = logs.reduce((total, log) => total + numberFrom(log.revenue_amount), 0);
  const feedCostTotal = totalFeed * numberFrom(selectedBatch?.feed_cost_per_kg);
  const operatingExpenses = logs.reduce((total, log) => total + numberFrom(log.expense_amount), 0);
  const totalCosts = numberFrom(selectedBatch?.initial_cost) + feedCostTotal + operatingExpenses;
  const profit = totalRevenue - totalCosts;
  const margin = totalRevenue > 0 ? profit / totalRevenue * 100 : null;
  const currentHeadCount = Math.max(0, initialHeadCount - mortalityTotal);
  const mortalityThreshold = selectedBatch ? mortalityThresholds[selectedBatch.species] : 5;
  const orderedLogs = [...logs].sort((left, right) => left.log_date.localeCompare(right.log_date));

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const resetLogForm = () => {
    setEditingLogId('');
    setLogDate(today());
    setFeedConsumed('');
    setMortality('0');
    setAverageWeight('');
    setSymptoms('');
    setExpenses('');
    setRevenue('');
  };

  const saveBatch = async () => {
    const headCountNumber = Number(headCount);
    const startWeight = initialWeight.trim() ? Number(initialWeight) : null;
    const batchCost = initialCost.trim() ? Number(initialCost) : 0;
    const pricePerKg = feedCost.trim() ? Number(feedCost) : 0;
    if (!batchName.trim() || !Number.isInteger(headCountNumber) || headCountNumber < 1) {
      showAlert('Check your batch details', 'Enter a batch name and a whole-number head count greater than zero.');
      return;
    }
    if (![batchCost, pricePerKg, ...(startWeight === null ? [] : [startWeight])].every((value) => Number.isFinite(value) && value >= 0)) {
      showAlert('Check your batch details', 'Costs and weight must be valid non-negative numbers.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate > today()) {
      showAlert('Check your start date', 'Use YYYY-MM-DD and choose today or an earlier date.');
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to create a production batch.');
      const payload = {
        id: createOfflineRecordId(),
        owner_id: user.id,
        batch_name: batchName.trim(),
        species,
        initial_head_count: headCountNumber,
        start_date: startDate,
        initial_cost: batchCost,
        feed_cost_per_kg: pricePerKg,
        initial_avg_weight_g: startWeight,
        status: 'active' as const,
      };
      await enqueueOfflineRecord(user.id, 'farm_batch', payload);
      const syncResult = await syncOfflineRecords(user.id);
      setBatchName('');
      setHeadCount('');
      setInitialCost('');
      setFeedCost('');
      setInitialWeight('');
      setStartDate(today());
      setBatchFormVisible(false);
      await loadData(payload.id);
      if (syncResult.remaining) showAlert('Batch saved on this device', 'It will sync when a reliable internet connection is available.');
    } catch (error) {
      console.error('[Farm Performance] Failed to save batch:', error);
      showAlert('Could not save batch', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveLog = async () => {
    const feed = feedConsumed.trim() ? Number(feedConsumed) : 0;
    const deaths = mortality.trim() ? Number(mortality) : 0;
    const weight = averageWeight.trim() ? Number(averageWeight) : null;
    const expense = expenses.trim() ? Number(expenses) : 0;
    const sales = revenue.trim() ? Number(revenue) : 0;
    if (!selectedBatch || !/^\d{4}-\d{2}-\d{2}$/.test(logDate) || logDate > today() || logDate < selectedBatch.start_date) {
      showAlert('Check your log date', 'Choose a date on or after the batch start date and not in the future.');
      return;
    }
    if (![feed, deaths, expense, sales, ...(weight === null ? [] : [weight])].every((value) => Number.isFinite(value) && value >= 0)
      || !Number.isInteger(deaths)) {
      showAlert('Check your daily figures', 'Enter valid non-negative amounts and a whole-number mortality count.');
      return;
    }
    const existingDateLog = logs.find((log) => log.log_date === logDate && log.id !== editingLogId);
    if (existingDateLog) {
      showAlert('A log already exists', 'Edit the existing log for this date instead of adding a duplicate.');
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to save your daily log.');
      const payload = {
        id: editingLogId || createOfflineRecordId(),
        batch_id: selectedBatch.id,
        log_date: logDate,
        feed_consumed_kg: feed,
        mortality_count: deaths,
        average_weight_g: weight,
        symptoms: sanitizeInput(symptoms).trim(),
        expense_amount: expense,
        revenue_amount: sales,
      };
      const previousWeightLog = logs
        .filter((log) => log.log_date < logDate && log.average_weight_g != null)
        .sort((left, right) => right.log_date.localeCompare(left.log_date))[0];
      const previousWeight = previousWeightLog
        ? numberFrom(previousWeightLog.average_weight_g)
        : numberFrom(selectedBatch.initial_avg_weight_g);
      const mortalityThroughDate = logs
        .filter((log) => log.log_date <= logDate && log.id !== editingLogId)
        .reduce((sum, log) => sum + Number(log.mortality_count), 0) + deaths;
      const weightGain = weight === null || previousWeight <= 0
        ? 0
        : Math.max(0, (weight - previousWeight) * Math.max(0, initialHeadCount - mortalityThroughDate));
      await enqueueOfflineRecord(user.id, 'farm_daily_log', { ...payload, weight_gain_g: weightGain });
      const syncResult = await syncOfflineRecords(user.id);
      resetLogForm();
      setLogFormVisible(false);
      await loadData(selectedBatch.id);
      if (syncResult.remaining) showAlert('Daily log saved on this device', 'It will sync when a reliable internet connection is available.');
    } catch (error) {
      console.error('[Farm Performance] Failed to save daily log:', error);
      showAlert('Could not save daily log', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const editLog = (log: DailyLog) => {
    setEditingLogId(log.id);
    setLogDate(log.log_date);
    setFeedConsumed(String(numberFrom(log.feed_consumed_kg)));
    setMortality(String(log.mortality_count));
    setAverageWeight(log.average_weight_g == null ? '' : String(numberFrom(log.average_weight_g)));
    setSymptoms(log.symptoms || '');
    setExpenses(String(numberFrom(log.expense_amount)));
    setRevenue(String(numberFrom(log.revenue_amount)));
    setLogFormVisible(true);
  };

  const deleteLog = (log: DailyLog) => {
    const remove = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Sign in to delete this daily log.');
        await enqueueOfflineRecord(user.id, 'farm_daily_log_delete', { id: log.id });
        const syncResult = await syncOfflineRecords(user.id);
        if (syncResult.remaining) showAlert('Log removal saved on this device', 'It will sync when a reliable internet connection is available.');
        await loadData(selectedBatchId);
      } catch (error) {
        console.error('[Farm Performance] Failed to delete daily log:', error);
        showAlert('Could not delete daily log', error instanceof Error ? error.message : 'Please try again.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete the daily log for ${formatDate(log.log_date)}?`)) void remove();
      return;
    }
    Alert.alert('Delete daily log?', `Remove the log for ${formatDate(log.log_date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void remove(); } },
    ]);
  };

  const selectBatch = async (batchId: string) => {
    setSelectedBatchId(batchId);
    setLoading(true);
    setErrorMessage('');
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to access your farm production data.');
      const network = await NetInfo.fetch();
      if (network.isConnected !== true || network.isInternetReachable === false) {
        const cachedLogs = await readOfflineSnapshot<DailyLog[]>(user.id, `farm-performance-logs:${batchId}`);
        const pendingOperations = await readOfflineRecords(user.id);
        const pendingLogs = pendingOperations
          .filter((operation) => operation.kind === 'farm_daily_log' && operation.payload.batch_id === batchId)
          .map((operation) => dailyLogFromOfflinePayload(operation.payload))
          .filter((log): log is DailyLog => Boolean(log));
        const deletedLogIds = new Set(pendingOperations
          .filter((operation) => operation.kind === 'farm_daily_log_delete')
          .map((operation) => operation.payload.id));
        const mergedLogs = [...(cachedLogs?.value || []).filter((log) => !deletedLogIds.has(log.id))];
        for (const pendingLog of pendingLogs) {
          const index = mergedLogs.findIndex((log) => log.id === pendingLog.id || log.log_date === pendingLog.log_date);
          if (!deletedLogIds.has(pendingLog.id)) {
            if (index >= 0) mergedLogs[index] = pendingLog;
            else mergedLogs.push(pendingLog);
          }
        }
        setLogs(mergedLogs);
        setOfflineMode(true);
        setErrorMessage(cachedLogs || pendingLogs.length ? '' : 'No saved daily logs are available offline for this batch.');
        return;
      }
      const { data, error } = await supabase
        .from('farm_daily_logs')
        .select('id, log_date, feed_consumed_kg, mortality_count, average_weight_g, weight_gain_g, symptoms, expense_amount, revenue_amount')
        .eq('batch_id', batchId)
        .order('log_date', { ascending: false });
      if (error) throw error;
      setLogs((data || []) as DailyLog[]);
      await saveOfflineSnapshot(user.id, `farm-performance-logs:${batchId}`, (data || []) as DailyLog[]);
      setOfflineMode(false);
    } catch (error) {
      console.error('[Farm Performance] Failed to load batch logs:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load daily logs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
          </Pressable>
          <View style={styles.topBarCopy}>
            <Text style={styles.eyebrow}>FARM RECORDS / MVS TOOLS</Text>
            <Text style={styles.pageTitle}>Performance tracker</Text>
          </View>
          <View style={styles.logo}><MaterialCommunityIcons name="chart-box-outline" size={22} color={colors.green} /></View>
        </View>
        <Text style={styles.intro}>Your flock, stock or pond — clear numbers for every growing day.</Text>
        {offlineMode ? (
          <View style={styles.offlineCard}>
            <MaterialCommunityIcons name="cloud-off-outline" size={18} color={colors.amber} />
            <Text style={styles.offlineText}>Offline mode: showing saved records. New changes will sync when you reconnect.</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={21} color={colors.red} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable onPress={() => { void loadData(); }}><Text style={styles.retryText}>Retry</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.batchHeader}>
          <View><Text style={styles.sectionTitle}>Your batches</Text><Text style={styles.sectionCaption}>Switch between active production</Text></View>
          <Pressable style={styles.primaryButton} onPress={() => setBatchFormVisible((visible) => !visible)}>
            <MaterialCommunityIcons name={batchFormVisible ? 'close' : 'plus'} size={18} color="#06251A" />
            <Text style={styles.primaryButtonText}>{batchFormVisible ? 'Close' : 'New batch'}</Text>
          </Pressable>
        </View>

        {batchFormVisible ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Start a production batch</Text>
            <Text style={styles.sectionCaption}>Add a few details to begin tracking.</Text>
            <Field label="Batch name" value={batchName} onChangeText={setBatchName} placeholder="e.g. March broiler flock" />
            <Text style={styles.fieldLabel}>Species</Text>
            <View style={styles.chipWrap}>
              {speciesOptions.map((option) => <Chip key={option} label={option} selected={species === option} onPress={() => setSpecies(option)} />)}
            </View>
            <Field label="Starting head count" value={headCount} onChangeText={setHeadCount} placeholder="e.g. 500" keyboardType="number-pad" />
            <Field label="Start date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} placeholder={today()} />
            <Field label="Initial stock / setup cost (₦)" value={initialCost} onChangeText={setInitialCost} placeholder="0" keyboardType="decimal-pad" />
            <Field label="Feed cost per kg (₦)" value={feedCost} onChangeText={setFeedCost} placeholder="Used for feed-cost totals" keyboardType="decimal-pad" />
            <Field label="Initial average weight (g)" value={initialWeight} onChangeText={setInitialWeight} placeholder="Optional — enter grams" keyboardType="decimal-pad" />
            <Pressable style={[styles.primaryButton, styles.fullButton]} onPress={() => { void saveBatch(); }} disabled={saving}>
              {saving ? <ActivityIndicator color="#06251A" /> : <Text style={styles.primaryButtonText}>Create batch</Text>}
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.green} /><Text style={styles.sectionCaption}>Loading your production data…</Text></View>
        ) : batches.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><MaterialCommunityIcons name="barn" size={28} color={colors.green} /></View>
            <Text style={styles.emptyTitle}>Your next batch starts here</Text>
            <Text style={styles.emptyCopy}>Create your first batch to record daily feed, growth, mortality and sales in one place.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setBatchFormVisible(true)}>
              <MaterialCommunityIcons name="plus" size={18} color="#06251A" /><Text style={styles.primaryButtonText}>Create a batch</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.chipWrap}>
              {batches.map((batch) => (
                <Chip key={batch.id} label={`${batch.sync_pending ? '↻ ' : batch.status === 'active' ? '● ' : ''}${batch.batch_name}`} selected={selectedBatchId === batch.id} onPress={() => { void selectBatch(batch.id); }} />
              ))}
            </View>
            {selectedBatch ? (
              <>
                <View style={styles.speciesLine}>
                  <View><Text style={styles.batchTitle}>{selectedBatch.batch_name}</Text><Text style={styles.sectionCaption}>{selectedBatch.species} · Started {formatDate(selectedBatch.start_date)} · {currentHeadCount.toLocaleString()} remaining</Text></View>
                  <Text style={[styles.statusBadge, selectedBatch.status === 'active' ? styles.activeBadge : styles.completeBadge]}>{selectedBatch.status === 'active' ? 'ACTIVE' : 'COMPLETE'}</Text>
                </View>

                {mortalityRate > mortalityThreshold ? (
                  <View style={styles.warningCard}>
                    <MaterialCommunityIcons name="alert-outline" size={20} color={colors.red} />
                    <View style={styles.warningCopy}><Text style={styles.warningTitle}>Mortality above healthy target</Text><Text style={styles.warningCaption}>{mortalityRate.toFixed(1)}% reported vs. {mortalityThreshold}% reference for {selectedBatch.species.toLowerCase()}. Consult your veterinarian.</Text></View>
                  </View>
                ) : null}

                <View style={styles.metricGrid}>
                  <Metric icon="heart-pulse" label="Mortality" value={`${mortalityRate.toFixed(1)}%`} note={`${mortalityTotal} of ${initialHeadCount} head`} color={mortalityRate > mortalityThreshold ? colors.red : colors.green} />
                  <Metric icon="scale-balance" label="Feed conversion" value={fcr === null ? '—' : fcr.toFixed(2)} note={fcr === null ? 'Log growth to calculate' : `${totalFeed.toFixed(1)} kg feed / ${totalWeightGainKg.toFixed(1)} kg gained`} color={colors.blue} />
                  <Metric icon="cash-multiple" label="Net profit" value={amount(profit)} note={margin === null ? 'Log sales to calculate margin' : `${margin.toFixed(1)}% margin · ${amount(totalCosts)} costs`} color={profit >= 0 ? colors.green : colors.red} />
                  <Metric icon="food-drumstick" label="Total feed" value={`${totalFeed.toFixed(1)} kg`} note={`Feed cost ${amount(feedCostTotal)}`} color={colors.amber} />
                </View>

                <View style={styles.card}>
                  <View style={styles.cardHeadingRow}><View><Text style={styles.cardTitle}>Feed & growth</Text><Text style={styles.sectionCaption}>Daily feed intake vs. weight gain</Text></View><View style={styles.chartLegend}><View style={[styles.legendDot, { backgroundColor: colors.green }]} /><Text style={styles.legendText}>Feed kg</Text><View style={[styles.legendDot, { backgroundColor: colors.blue }]} /><Text style={styles.legendText}>Gain kg</Text></View></View>
                  {orderedLogs.length ? <FeedGrowthChart logs={orderedLogs} /> : <View style={styles.chartEmpty}><MaterialCommunityIcons name="chart-line" size={26} color="#64748B" /><Text style={styles.sectionCaption}>Your daily trend will appear after your first log.</Text></View>}
                </View>

                <View style={styles.sectionHeading}>
                  <View><Text style={styles.sectionTitle}>Daily log</Text><Text style={styles.sectionCaption}>Track today’s feed, health & cash flow</Text></View>
                  <Pressable style={styles.primaryButton} onPress={() => { resetLogForm(); setLogFormVisible((visible) => !visible); }}>
                    <MaterialCommunityIcons name={logFormVisible ? 'close' : 'plus'} size={18} color="#06251A" />
                    <Text style={styles.primaryButtonText}>{logFormVisible ? 'Close' : 'Log today'}</Text>
                  </Pressable>
                </View>

                {logFormVisible ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>{editingLogId ? 'Edit daily log' : 'New daily log'}</Text>
                    <Field label="Date (YYYY-MM-DD)" value={logDate} onChangeText={setLogDate} placeholder={today()} />
                    <View style={styles.formColumns}>
                      <Field label="Feed consumed (kg)" value={feedConsumed} onChangeText={setFeedConsumed} placeholder="0" keyboardType="decimal-pad" />
                      <Field label="Mortality (head)" value={mortality} onChangeText={setMortality} placeholder="0" keyboardType="number-pad" />
                    </View>
                    <Field label="Average live weight (g)" value={averageWeight} onChangeText={setAverageWeight} placeholder="Optional · enter grams" keyboardType="decimal-pad" />
                    <Text style={styles.fieldHint}>Weight gain is estimated from changes in average live weight × surviving head count. Enter weight in grams; e.g. 1.25 kg = 1250 g.</Text>
                    <Field label="Symptoms / health observations" value={symptoms} onChangeText={setSymptoms} placeholder="Optional · describe signs noticed today" multiline />
                    <View style={styles.formColumns}>
                      <Field label="Other expenses (₦)" value={expenses} onChangeText={setExpenses} placeholder="0" keyboardType="decimal-pad" />
                      <Field label="Sales / revenue (₦)" value={revenue} onChangeText={setRevenue} placeholder="0" keyboardType="decimal-pad" />
                    </View>
                    <Pressable style={[styles.primaryButton, styles.fullButton]} onPress={() => { void saveLog(); }} disabled={saving}>
                      {saving ? <ActivityIndicator color="#06251A" /> : <Text style={styles.primaryButtonText}>{editingLogId ? 'Save changes' : 'Save daily log'}</Text>}
                    </Pressable>
                  </View>
                ) : null}

                {logs.length === 0 ? (
                  <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No daily logs yet</Text><Text style={styles.emptyCopy}>Log a day’s figures above to start seeing your flock’s progress.</Text></View>
                ) : logs.slice(0, 12).map((log) => (
                  <View style={styles.logRow} key={log.id}>
                    <View style={styles.logDate}><Text style={styles.logDay}>{new Date(`${log.log_date}T12:00:00`).toLocaleDateString('en', { day: '2-digit' })}</Text><Text style={styles.logMonth}>{new Date(`${log.log_date}T12:00:00`).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</Text></View>
                    <View style={styles.logInfo}>
                      <Text style={styles.logTitle}>{numberFrom(log.feed_consumed_kg).toFixed(1)} kg feed · {log.mortality_count} mortality</Text>
                      <Text style={styles.logCaption}>{log.average_weight_g == null ? 'No weight logged' : `${numberFrom(log.average_weight_g).toLocaleString()} g avg.`} · {log.weight_gain_g && numberFrom(log.weight_gain_g) > 0 ? `+${(numberFrom(log.weight_gain_g) / 1000).toFixed(2)} kg gain · ` : ''}Sales ${amount(numberFrom(log.revenue_amount))}</Text>
                      {log.symptoms ? <Text style={styles.logCaption}>Health: {log.symptoms}</Text> : null}
                    </View>
                    <Pressable onPress={() => editLog(log)} accessibilityLabel={`Edit log for ${formatDate(log.log_date)}`} style={styles.rowAction}><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.blue} /></Pressable>
                    <Pressable onPress={() => deleteLog(log)} accessibilityLabel={`Delete log for ${formatDate(log.log_date)}`} style={styles.rowAction}><MaterialCommunityIcons name="delete-outline" size={18} color={colors.red} /></Pressable>
                  </View>
                ))}
                {logs.length > 12 ? <Text style={styles.sectionCaption}>Showing the latest 12 of {logs.length} daily logs.</Text> : null}
              </>
            ) : null}
          </>
        )}
        <Text style={styles.disclaimer}>Mortality thresholds are general screening references, not diagnostic limits. Results depend on husbandry and species strain. Consult your veterinarian.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'number-pad' | 'decimal-pad'; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#708197" style={[styles.input, props.multiline && styles.multilineInput]} keyboardType={props.keyboardType || 'default'} /></View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function Metric({ icon, label, value, note, color }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string; note: string; color: string }) {
  return <View style={styles.metric}><View style={styles.metricLabel}><MaterialCommunityIcons name={icon} size={15} color={color} /><Text style={styles.metricLabelText}>{label}</Text></View><Text style={[styles.metricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.metricNote}>{note}</Text></View>;
}

function FeedGrowthChart({ logs }: { logs: DailyLog[] }) {
  const width = 332;
  const height = 196;
  const padding = { top: 16, right: 12, bottom: 28, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = logs.slice(-14);
  const maxValue = Math.max(1, ...points.flatMap((log) => [numberFrom(log.feed_consumed_kg), numberFrom(log.weight_gain_g) / 1000]));
  const coordinate = (value: number, index: number) => ({
    x: padding.left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1)),
    y: padding.top + plotHeight - (value / maxValue) * plotHeight,
  });
  const feedPath = points.map((log, index) => {
    const point = coordinate(numberFrom(log.feed_consumed_kg), index);
    return `${index ? 'L' : 'M'} ${point.x} ${point.y}`;
  }).join(' ');
  const gainPath = points.map((log, index) => {
    const point = coordinate(numberFrom(log.weight_gain_g) / 1000, index);
    return `${index ? 'L' : 'M'} ${point.x} ${point.y}`;
  }).join(' ');
  const feedTotal = points.reduce((total, log) => total + numberFrom(log.feed_consumed_kg), 0);
  const gainTotal = points.reduce((total, log) => total + numberFrom(log.weight_gain_g) / 1000, 0);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="Chart of daily feed consumed and weight gained">
      {[0, 0.5, 1].map((fraction) => {
        const y = padding.top + plotHeight * fraction;
        return <Line key={`grid-${fraction}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#26364A" strokeDasharray="4 5" />;
      })}
      {[0, 0.5, 1].map((fraction) => {
        const y = padding.top + plotHeight * fraction;
        return <SvgText key={`axis-${fraction}`} x={padding.left - 7} y={y + 4} fill="#8191A5" fontSize="9" textAnchor="end">{(maxValue * (1 - fraction)).toFixed(1)}</SvgText>;
      })}
      <Path d={feedPath} fill="none" stroke={colors.green} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={gainPath} fill="none" stroke={colors.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((log, index) => {
        const feed = coordinate(numberFrom(log.feed_consumed_kg), index);
        const gain = coordinate(numberFrom(log.weight_gain_g) / 1000, index);
        return [
          <Circle key={`${log.id}-feed`} cx={feed.x} cy={feed.y} r={3.5} fill={colors.green} />,
          <Circle key={`${log.id}-gain`} cx={gain.x} cy={gain.y} r={3.5} fill={colors.blue} />,
        ];
      })}
      {points.filter((_, index) => index === 0 || index === points.length - 1 || index === Math.floor((points.length - 1) / 2)).map((log) => {
        const index = points.indexOf(log);
        return <SvgText key={`label-${log.id}`} x={coordinate(0, index).x} y={height - 6} fill="#8191A5" fontSize="9" textAnchor="middle">{new Date(`${log.log_date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</SvgText>;
      })}
      <SvgText x={width - 15} y={13} fill="#94A3B8" fontSize="9" textAnchor="end">{`${points.length} days · ${feedTotal.toFixed(1)} kg feed · ${gainTotal.toFixed(2)} kg gain`}</SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  page: { padding: 20, paddingBottom: 48, width: '100%', maxWidth: 820, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#142235', alignItems: 'center', justifyContent: 'center' },
  topBarCopy: { flex: 1 },
  eyebrow: { color: colors.green, letterSpacing: 1.2, fontSize: 9, fontWeight: '800' },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  logo: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#34D39918', alignItems: 'center', justifyContent: 'center' },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 12, marginBottom: 24 },
  offlineCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#422006', borderWidth: 1, borderColor: '#92400E', borderRadius: 10, padding: 11, marginBottom: 14 },
  offlineText: { flex: 1, color: '#FDE68A', fontSize: 12, lineHeight: 17 },
  errorCard: { backgroundColor: '#391F2A', borderRadius: 14, padding: 13, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, color: '#FECACA', fontSize: 12, lineHeight: 18 },
  retryText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  batchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 14, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionCaption: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  primaryButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.green, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#06251A', fontSize: 12, fontWeight: '800' },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 17, padding: 16, marginBottom: 15 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { backgroundColor: '#101D2D', borderColor: colors.border, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  chipSelected: { backgroundColor: '#12392F', borderColor: '#247B61' },
  chipText: { color: '#B2C0D1', fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.green },
  field: { flex: 1, minWidth: 0, marginTop: 14 },
  fieldLabel: { color: '#C2CDDA', fontSize: 11, fontWeight: '600', marginBottom: 7 },
  input: { height: 44, paddingHorizontal: 12, borderRadius: 10, borderColor: '#2B3B50', borderWidth: 1, color: colors.text, backgroundColor: '#0C1726', fontSize: 13 },
  multilineInput: { minHeight: 84, height: undefined, paddingVertical: 10, textAlignVertical: 'top' },
  fieldHint: { color: '#8393A8', fontSize: 10, lineHeight: 15, marginTop: 9 },
  fullButton: { marginTop: 17, alignSelf: 'stretch', minHeight: 46 },
  loading: { paddingVertical: 56, alignItems: 'center', gap: 12 },
  emptyCard: { alignItems: 'center', padding: 25, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card, marginVertical: 14 },
  emptyIcon: { width: 55, height: 55, borderRadius: 18, backgroundColor: '#12392F', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 350, marginTop: 7, marginBottom: 16 },
  speciesLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  batchTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  statusBadge: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  activeBadge: { color: colors.green, backgroundColor: '#12392F' },
  completeBadge: { color: colors.muted, backgroundColor: '#273548' },
  warningCard: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#361F29', borderRadius: 13, borderWidth: 1, borderColor: '#6F3441', marginBottom: 14, alignItems: 'flex-start' },
  warningCopy: { flex: 1 },
  warningTitle: { color: '#FCA5A5', fontSize: 12, fontWeight: '700' },
  warningCaption: { color: '#F4BEC2', fontSize: 11, lineHeight: 16, marginTop: 3 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  metric: { width: '48%', flexGrow: 1, minHeight: 107, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 13 },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabelText: { color: '#B5C1CF', fontSize: 10, fontWeight: '600' },
  metricValue: { fontSize: 21, fontWeight: '800', marginTop: 10 },
  metricNote: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: colors.muted, fontSize: 9, marginRight: 5 },
  chartEmpty: { minHeight: 140, justifyContent: 'center', alignItems: 'center', gap: 8 },
  formColumns: { flexDirection: 'row', gap: 12 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1D2A3B' },
  logDate: { width: 39, height: 42, borderRadius: 11, backgroundColor: '#142235', justifyContent: 'center', alignItems: 'center' },
  logDay: { color: colors.text, fontSize: 14, fontWeight: '800' },
  logMonth: { color: colors.green, fontSize: 8, fontWeight: '800', marginTop: 1 },
  logInfo: { flex: 1 },
  logTitle: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  logCaption: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  rowAction: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { color: '#738297', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 18, paddingHorizontal: 10 },
});
