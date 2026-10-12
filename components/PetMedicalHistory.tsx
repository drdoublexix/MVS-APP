import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import DigitalPassportCard from './DigitalPassportCard';
import { supabase } from '../lib/supabase';

type MedicalRecord = {
  id: string;
  treatment_type: string;
  title: string;
  dose_series_number: number | null;
  total_series_doses: number | null;
  administered_date: string;
  next_due_date: string | null;
  notes: string | null;
};

export default function PetMedicalHistory({ petId }: { petId: string }) {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayTimestamp] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    const loadRecords = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pet_medical_records')
        .select('id, treatment_type, title, dose_series_number, total_series_doses, administered_date, next_due_date, notes')
        .eq('pet_id', petId)
        .gte('next_due_date', new Date().toISOString())
        .order('administered_date', { ascending: false });
      if (error) console.error('[Pet Medical History] Failed to load records:', error);
      if (mounted) {
        setRecords(error ? [] : (data || []) as MedicalRecord[]);
        setLoading(false);
      }
    };
    void loadRecords();
    return () => { mounted = false; };
  }, [petId]);

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled';
  const getStatus = (nextDueDate: string | null) => {
    if (!nextDueDate) return { label: 'Up to date', color: '#10B981', backgroundColor: '#064E3B' };
    const daysUntilDue = Math.ceil((new Date(nextDueDate).getTime() - todayTimestamp) / 86400000);
    if (daysUntilDue < 0) return { label: 'Overdue', color: '#FCA5A5', backgroundColor: '#7F1D1D' };
    if (daysUntilDue <= 14) return { label: 'Due soon', color: '#FCD34D', backgroundColor: '#78350F' };
    return { label: 'Up to date', color: '#6EE7B7', backgroundColor: '#064E3B' };
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Medical Timeline</Text>
      {loading ? <ActivityIndicator color="#10B981" /> : records.length === 0 ? <Text style={styles.empty}>No medical records yet.</Text> : records.map((record) => {
        const status = getStatus(record.next_due_date);
        const doseInfo = record.total_series_doses && record.total_series_doses > 1 ? `Dose ${record.dose_series_number || 1} of ${record.total_series_doses}` : null;
        return (
          <View key={record.id} style={styles.record}>
            <View style={styles.dot} />
            <View style={styles.recordBody}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{record.title}</Text>
                <View style={[styles.badge, { backgroundColor: status.backgroundColor }]}><Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text></View>
              </View>
              {doseInfo ? <Text style={styles.dose}>{doseInfo}</Text> : null}
              <Text style={styles.date}>Administered: {formatDate(record.administered_date)}</Text>
              {record.next_due_date ? <Text style={styles.due}>Next Dose Due: {formatDate(record.next_due_date)}</Text> : null}
              {record.notes ? <Text style={styles.notes}>{record.notes}</Text> : null}
            </View>
          </View>
        );
      })}
      <DigitalPassportCard recordId={petId} recordType="pet" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 14, padding: 12, backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  heading: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  empty: { color: '#94A3B8', fontSize: 12 },
  record: { flexDirection: 'row', borderLeftWidth: 2, borderLeftColor: '#334155', paddingLeft: 10, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginLeft: -15, marginTop: 5, marginRight: 7 },
  recordBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  dose: { color: '#60A5FA', fontSize: 12, fontWeight: '600', marginTop: 4 },
  date: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  due: { color: '#FCD34D', fontSize: 11, fontWeight: '600', marginTop: 3 },
  notes: { color: '#CBD5E1', fontSize: 11, lineHeight: 16, marginTop: 5 },
});
