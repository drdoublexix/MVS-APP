import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatDateInput, parseDateInput } from '../lib/dateFormat';
import { verifyDigitalPassportDetails } from '../lib/digitalPassports';
import { sanitizeInput } from '../lib/sanitize';
import { getCurrentUser, supabase } from '../lib/supabase';

type Props = { petId: string; onSaved: () => void };
type Preset = 'dhlpp' | 'deworming' | 'rabies' | 'custom';

const toDateValue = (date: Date) => date.toISOString();
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

export default function VetMedicalLogForm({ petId, onSaved }: Props) {
  const [preset, setPreset] = useState<Preset>('dhlpp');
  const [dewormingInterval, setDewormingInterval] = useState<'14' | '30'>('14');
  const [treatmentType, setTreatmentType] = useState('vaccination');
  const [title, setTitle] = useState('DHLPP / Parvovirus Booster');
  const [doseSeriesNumber, setDoseSeriesNumber] = useState('1');
  const [totalSeriesDoses, setTotalSeriesDoses] = useState('3');
  const [administeredDate, setAdministeredDate] = useState(new Date());
  const [nextDueDate, setNextDueDate] = useState(addDays(new Date(), 21));
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyingPassport, setVerifyingPassport] = useState(false);

  const selectPreset = (nextPreset: Preset) => {
    const today = administeredDate;
    setPreset(nextPreset);
    if (nextPreset === 'dhlpp') {
      setTreatmentType('vaccination');
      setTitle('DHLPP / Parvovirus Booster');
      setTotalSeriesDoses('3');
      setDoseSeriesNumber((current) => String(Math.max(1, Number(current) || 0) + 1));
      setNextDueDate(addDays(today, 21));
    } else if (nextPreset === 'deworming') {
      setTreatmentType('deworming');
      setTitle('Puppy Deworming');
      setTotalSeriesDoses('1');
      setDoseSeriesNumber('1');
      setNextDueDate(addDays(today, Number(dewormingInterval)));
    } else if (nextPreset === 'rabies') {
      setTreatmentType('vaccination');
      setTitle('Annual Rabies / Core Booster');
      setTotalSeriesDoses('1');
      setDoseSeriesNumber('1');
      setNextDueDate(addDays(today, 365));
    }
  };

  const updateAdministeredDate = (date: Date) => {
    setAdministeredDate(date);
    if (preset !== 'custom') {
      const interval = preset === 'dhlpp' ? 21 : preset === 'rabies' ? 365 : Number(dewormingInterval);
      setNextDueDate(addDays(date, interval));
    }
  };

  const save = async () => {
    const cleanTitle = sanitizeInput(title);
    const cleanTreatmentType = sanitizeInput(treatmentType);
    const cleanNotes = sanitizeInput(notes);
    if (!cleanTitle || !petId || saving) return;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('You must be signed in to log a treatment.');
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!['vet', 'veterinarian'].includes(profile?.role || '')) throw new Error('Only veterinarians can log medical records.');
      const { error } = await supabase.from('pet_medical_records').insert({
        pet_id: petId,
        vet_id: user.id,
        treatment_type: cleanTreatmentType,
        title: cleanTitle,
        dose_series_number: Number(doseSeriesNumber) || 1,
        total_series_doses: Number(totalSeriesDoses) || 1,
        administered_date: toDateValue(administeredDate),
        next_due_date: nextDueDate ? toDateValue(nextDueDate) : null,
        notes: cleanNotes || null,
      });
      if (error) throw error;
      setNotes('');
      Alert.alert('Treatment logged', 'The medical record and next due date were saved.');
      onSaved();
    } catch (error) {
      Alert.alert('Could not save treatment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const verifyPassportDetails = async () => {
    if (verifyingPassport) return;
    setVerifyingPassport(true);
    try {
      await verifyDigitalPassportDetails('pet', petId);
      Alert.alert('Animal details verified', 'Species and breed have been verified on the MVS Digital Health Passport.');
    } catch (error) {
      console.error('[Pet Passport] Could not verify animal details:', error);
      Alert.alert('Could not verify details', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setVerifyingPassport(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Log Treatment & Schedule Next Due Date</Text>
      <TouchableOpacity style={styles.verifyPassport} onPress={() => void verifyPassportDetails()} disabled={verifyingPassport}>
        <Text style={styles.verifyPassportText}>{verifyingPassport ? 'Verifying...' : 'Verify species & breed on Digital Passport'}</Text>
      </TouchableOpacity>
      <View style={styles.presetRow}>
        {([['dhlpp', 'DHLPP / Parvo'], ['deworming', 'Puppy Deworming'], ['rabies', 'Annual Rabies'], ['custom', 'Custom Date']] as [Preset, string][]).map(([value, label]) => (
          <TouchableOpacity key={value} style={[styles.preset, preset === value && styles.presetActive]} onPress={() => selectPreset(value)}>
            <Text style={[styles.presetText, preset === value && styles.presetTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {preset === 'deworming' ? <View style={styles.intervalRow}><Text style={styles.label}>Deworming interval</Text><TouchableOpacity onPress={() => { setDewormingInterval('14'); setNextDueDate(addDays(administeredDate, 14)); }}><Text style={dewormingInterval === '14' ? styles.selectedOption : styles.option}>+2 weeks</Text></TouchableOpacity><TouchableOpacity onPress={() => { setDewormingInterval('30'); setNextDueDate(addDays(administeredDate, 30)); }}><Text style={dewormingInterval === '30' ? styles.selectedOption : styles.option}>+1 month</Text></TouchableOpacity></View> : null}
      <Field label="Treatment type" value={treatmentType} onChangeText={setTreatmentType} />
      <Field label="Title" value={title} onChangeText={setTitle} />
      <View style={styles.inline}><View style={styles.half}><Field label="Dose number" value={doseSeriesNumber} onChangeText={setDoseSeriesNumber} keyboardType="number-pad" /></View><View style={styles.half}><Field label="Total doses" value={totalSeriesDoses} onChangeText={setTotalSeriesDoses} keyboardType="number-pad" /></View></View>
      <Text style={styles.label}>Administered date</Text>
      {Platform.OS === 'web' ? <input type="text" value={formatDateInput(administeredDate)} placeholder="DD-MM-YYYY" onChange={(event) => { const isoDate = parseDateInput(event.target.value); if (isoDate) updateAdministeredDate(new Date(`${isoDate}T00:00:00`)); }} style={styles.webDate as any} /> : <><TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}><Text style={styles.dateText}>{formatDateInput(administeredDate)}</Text></TouchableOpacity><DateTimePickerModal visible={showDatePicker} value={administeredDate} onChange={(date) => { setShowDatePicker(false); if (date) updateAdministeredDate(date); }} /></>}
      <Text style={styles.label}>Next due date</Text>
      {preset === 'custom' && Platform.OS !== 'web' ? <><TouchableOpacity style={styles.dateButton} onPress={() => setShowDuePicker(true)}><Text style={styles.dateText}>{formatDateInput(nextDueDate)}</Text></TouchableOpacity><DateTimePickerModal visible={showDuePicker} value={nextDueDate} onChange={(date) => { setShowDuePicker(false); if (date) setNextDueDate(date); }} /></> : Platform.OS === 'web' ? <input type="text" value={formatDateInput(nextDueDate)} placeholder="DD-MM-YYYY" onChange={(event) => { const isoDate = parseDateInput(event.target.value); if (isoDate) setNextDueDate(new Date(`${isoDate}T00:00:00`)); }} style={styles.webDate as any} /> : <Text style={styles.calculatedDate}>{formatDateInput(nextDueDate)}</Text>}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <TouchableOpacity style={styles.save} onPress={() => { void save(); }} disabled={saving}><Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Medical Record'}</Text></TouchableOpacity>
    </View>
  );
}

function DateTimePickerModal({ visible, value, onChange }: { visible: boolean; value: Date; onChange: (date?: Date) => void }) {
  if (!visible || Platform.OS === 'web') return null;
  return <View style={styles.picker}><DateTimePicker value={value} mode="date" onChange={(_, date) => onChange(date)} /></View>;
}

function Field({ label, value, onChangeText, keyboardType, multiline }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'number-pad'; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} placeholderTextColor="#64748B" style={[styles.input, multiline && styles.notesInput]} /></View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 14, padding: 12, backgroundColor: '#1E293B', borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  heading: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  preset: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7 },
  presetActive: { backgroundColor: '#065F46', borderColor: '#10B981' },
  presetText: { color: '#CBD5E1', fontSize: 10 },
  presetTextActive: { color: '#FFFFFF', fontWeight: '700' },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  label: { color: '#94A3B8', fontSize: 11, marginBottom: 4 },
  option: { color: '#60A5FA', fontSize: 11 },
  selectedOption: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  field: { flex: 1, marginBottom: 8 },
  input: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 7, color: '#FFFFFF', padding: 9, fontSize: 16 },
  notesInput: { minHeight: 55, textAlignVertical: 'top' },
  inline: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  dateButton: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 7, padding: 9, marginBottom: 8 },
  dateText: { color: '#FFFFFF', fontSize: 12 },
  calculatedDate: { color: '#6EE7B7', backgroundColor: '#064E3B', borderRadius: 7, padding: 9, marginBottom: 8, fontSize: 12 },
  webDate: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 7, color: '#FFFFFF', padding: 9, width: '100%', marginBottom: 8 },
  picker: { alignItems: 'flex-start', marginBottom: 8 },
  save: { backgroundColor: '#10B981', borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 4 },
  verifyPassport: { backgroundColor: '#064E3B', borderColor: '#10B981', borderWidth: 1, borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 12 },
  verifyPassportText: { color: '#A7F3D0', fontSize: 12, fontWeight: '700' },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});
