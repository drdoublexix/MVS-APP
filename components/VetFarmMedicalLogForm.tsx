import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sanitizeInput } from '../lib/sanitize';
import { getCurrentUser, supabase } from '../lib/supabase';

type Props = { farmId: string; clientId: string; onSaved: () => void };
type Preset = 'vaccination' | 'deworming' | 'custom';

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

export default function VetFarmMedicalLogForm({ farmId, clientId, onSaved }: Props) {
  const [preset, setPreset] = useState<Preset>('vaccination');
  const [treatmentType, setTreatmentType] = useState('vaccination');
  const [title, setTitle] = useState('Flock Vaccination');
  const [dosage, setDosage] = useState('');
  const [administeredDate, setAdministeredDate] = useState(new Date());
  const [nextDueDate, setNextDueDate] = useState(addDays(new Date(), 180));
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectPreset = (nextPreset: Preset) => {
    setPreset(nextPreset);
    if (nextPreset === 'vaccination') {
      setTreatmentType('vaccination');
      setTitle('Flock Vaccination');
      setNextDueDate(addDays(administeredDate, 180));
    } else if (nextPreset === 'deworming') {
      setTreatmentType('deworming');
      setTitle('Livestock Deworming');
      setNextDueDate(addDays(administeredDate, 30));
    }
  };

  const updateAdministeredDate = (date: Date) => {
    setAdministeredDate(date);
    if (preset !== 'custom') setNextDueDate(addDays(date, preset === 'vaccination' ? 180 : 30));
  };

  const save = async () => {
    const cleanTitle = sanitizeInput(title).trim();
    const cleanTreatmentType = sanitizeInput(treatmentType).trim();
    const cleanDosage = sanitizeInput(dosage).trim();
    const cleanNotes = sanitizeInput(notes).trim();
    if (!farmId || !clientId || !cleanTitle || saving) return;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('You must be signed in to log a treatment.');
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!['vet', 'veterinarian'].includes(profile?.role || '')) throw new Error('Only veterinarians can log farm medical records.');
      const { error } = await supabase.from('farm_medical_records').insert({
        farm_id: farmId,
        client_id: clientId,
        vet_id: user.id,
        treatment_type: cleanTreatmentType,
        title: cleanTitle,
        dosage: cleanDosage || null,
        administered_date: administeredDate.toISOString(),
        next_due_date: nextDueDate.toISOString(),
        status: 'active',
        notes: cleanNotes || null,
      });
      if (error) throw error;
      setDosage('');
      setNotes('');
      Alert.alert('Treatment logged', 'The farm medical record and next due date were saved.');
      onSaved();
    } catch (error) {
      Alert.alert('Could not save treatment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const displayDate = (date: Date) => date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Log Treatment & Schedule Next Due Date</Text>
      <View style={styles.presetRow}>
        {([['vaccination', 'Flock Vaccination'], ['deworming', 'Deworming'], ['custom', 'Custom Date']] as [Preset, string][]).map(([value, label]) => (
          <TouchableOpacity key={value} style={[styles.preset, preset === value && styles.presetActive]} onPress={() => selectPreset(value)}>
            <Text style={[styles.presetText, preset === value && styles.presetTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field label="Treatment type" value={treatmentType} onChangeText={setTreatmentType} />
      <Field label="Treatment title" value={title} onChangeText={setTitle} />
      <Field label="Dosage" value={dosage} onChangeText={setDosage} placeholder="e.g. 2 ml per animal" />
      <Text style={styles.label}>Administered date</Text>
      {Platform.OS === 'web' ? <input type="date" value={administeredDate.toISOString().slice(0, 10)} onChange={(event) => updateAdministeredDate(new Date(`${event.target.value}T00:00:00`))} style={styles.webDate as any} /> : <><TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}><Text style={styles.dateText}>{displayDate(administeredDate)}</Text></TouchableOpacity><DateTimePickerModal visible={showDatePicker} value={administeredDate} onChange={(date) => { setShowDatePicker(false); if (date) updateAdministeredDate(date); }} /></>}
      <Text style={styles.label}>Next due date</Text>
      {preset === 'custom' && Platform.OS !== 'web' ? <><TouchableOpacity style={styles.dateButton} onPress={() => setShowDuePicker(true)}><Text style={styles.dateText}>{displayDate(nextDueDate)}</Text></TouchableOpacity><DateTimePickerModal visible={showDuePicker} value={nextDueDate} onChange={(date) => { setShowDuePicker(false); if (date) setNextDueDate(date); }} /></> : Platform.OS === 'web' ? <input type="date" value={nextDueDate.toISOString().slice(0, 10)} onChange={(event) => setNextDueDate(new Date(`${event.target.value}T00:00:00`))} style={styles.webDate as any} /> : <Text style={styles.calculatedDate}>{displayDate(nextDueDate)}</Text>}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Treatment notes" />
      <TouchableOpacity style={styles.save} onPress={() => { void save(); }} disabled={saving}><Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Medical Record'}</Text></TouchableOpacity>
    </View>
  );
}

function DateTimePickerModal({ visible, value, onChange }: { visible: boolean; value: Date; onChange: (date?: Date) => void }) {
  if (!visible || Platform.OS === 'web') return null;
  return <View style={styles.picker}><DateTimePicker value={value} mode="date" onChange={(_, date) => onChange(date)} /></View>;
}

function Field({ label, value, onChangeText, multiline, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} multiline={multiline} placeholder={placeholder} placeholderTextColor="#64748B" style={[styles.input, multiline && styles.notesInput]} /></View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 14, padding: 12, backgroundColor: '#1E293B', borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  heading: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  preset: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 7 },
  presetActive: { backgroundColor: '#065F46', borderColor: '#10B981' },
  presetText: { color: '#CBD5E1', fontSize: 11 },
  presetTextActive: { color: '#FFFFFF', fontWeight: '700' },
  field: { marginBottom: 9 },
  label: { color: '#94A3B8', fontSize: 11, marginBottom: 5 },
  input: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 7, color: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  notesInput: { minHeight: 62, textAlignVertical: 'top' },
  dateButton: { backgroundColor: '#0F172A', borderColor: '#334155', borderWidth: 1, borderRadius: 7, padding: 10, marginBottom: 9 },
  dateText: { color: '#FFFFFF', fontSize: 12 },
  calculatedDate: { color: '#FCD34D', fontSize: 12, marginBottom: 9 },
  webDate: { width: '100%', backgroundColor: '#0F172A', color: '#FFFFFF', borderColor: '#334155', borderWidth: 1, borderRadius: 7, padding: 9, marginBottom: 9 } as any,
  picker: { marginBottom: 9 },
  save: { backgroundColor: '#10B981', borderRadius: 7, padding: 11, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
