import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getAppointmentDates, getAppointmentTimeOptions } from '../lib/appointments';

type Props = {
  selectedDate: Date;
  selectedTime: string;
  onSelectDate: (date: Date) => void;
  onSelectTime: (time: string) => void;
};

const dates = getAppointmentDates();

export default function AppointmentDateTimePicker({
  selectedDate,
  selectedTime,
  onSelectDate,
  onSelectTime,
}: Props) {
  const timeOptions = getAppointmentTimeOptions(selectedDate);

  return (
    <View>
      <Text style={styles.label}>Choose a date</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
        {dates.map((date, index) => {
          const selected = date.toDateString() === selectedDate.toDateString();
          return (
            <TouchableOpacity
              key={date.toISOString()}
              style={[styles.dateChip, selected && styles.selectedChip]}
              onPress={() => {
                onSelectDate(date);
                const nextTime = getAppointmentTimeOptions(date)[0]?.value;
                onSelectTime(nextTime || '');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.dateWeekday, selected && styles.selectedText]}>
                {index === 0 ? 'Today' : date.toLocaleDateString([], { weekday: 'short' })}
              </Text>
              <Text style={[styles.dateNumber, selected && styles.selectedText]}>{date.getDate()}</Text>
              <Text style={[styles.dateMonth, selected && styles.selectedText]}>{date.toLocaleDateString([], { month: 'short' })}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.label, styles.timeLabel]}>Choose a preferred time</Text>
      {timeOptions.length ? (
        <View style={styles.timeList}>
          {timeOptions.map((option) => {
            const selected = option.value === selectedTime;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.timeChip, selected && styles.selectedChip]}
                onPress={() => onSelectTime(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <MaterialCommunityIcons name="clock-outline" size={15} color={selected ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.timeText, selected && styles.selectedText]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={styles.noTimes}>No times remain today. Choose another date.</Text>
      )}
      <Text style={styles.helper}>This is your preferred time. The appointment is not booked until the veterinarian confirms it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: '#E2E8F0', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  dateList: { gap: 8, paddingRight: 4 },
  dateChip: { width: 58, minHeight: 76, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingVertical: 8 },
  selectedChip: { backgroundColor: '#0E7490', borderColor: '#22D3EE' },
  dateWeekday: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  dateNumber: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 2 },
  dateMonth: { color: '#94A3B8', fontSize: 10, marginTop: 1 },
  selectedText: { color: '#FFFFFF' },
  timeLabel: { marginTop: 20 },
  timeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#334155', borderRadius: 9, backgroundColor: '#0F172A', paddingHorizontal: 10, paddingVertical: 7 },
  timeText: { color: '#CBD5E1', fontSize: 12, fontWeight: '600' },
  noTimes: { color: '#FBBF24', fontSize: 12, paddingVertical: 8 },
  helper: { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginTop: 12 },
});
