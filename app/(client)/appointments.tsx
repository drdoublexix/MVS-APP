  import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatAppointmentDateTime, sendAppointmentNotification, type AppointmentStatus, type VeterinaryAppointment } from '../../lib/appointments';
import { getCurrentUser, supabase } from '../../lib/supabase';

type AppointmentFilter = 'requests' | 'upcoming' | 'history';

const statusLabels: Record<AppointmentStatus, string> = {
  pending: 'Awaiting provider',
  proposed: 'Your response needed',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const statusColors: Record<AppointmentStatus, string> = {
  pending: '#F59E0B',
  proposed: '#38BDF8',
  confirmed: '#34D399',
  declined: '#F87171',
  cancelled: '#94A3B8',
  completed: '#A78BFA',
};

export default function ClientAppointmentsScreen() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<VeterinaryAppointment[]>([]);
  const [filter, setFilter] = useState<AppointmentFilter>('requests');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [referenceTime, setReferenceTime] = useState(0);

  const loadAppointments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to view your appointments.');
      const { data, error } = await supabase
        .from('veterinary_appointments')
        .select('id, client_id, vet_id, client_name, vet_name, pet_name, appointment_type, reason, scheduled_at, status, vet_response, created_at, updated_at')
        .eq('client_id', user.id)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      setAppointments((data || []) as VeterinaryAppointment[]);
      setReferenceTime(Date.now());
    } catch (error) {
      console.error('[Appointments] Could not load client appointments:', error);
      Alert.alert('Appointments unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;
      const initialize = async () => {
        await loadAppointments();
        if (!active) return;
        try {
          const user = await getCurrentUser();
          if (!active || !user) return;
          channel = supabase
            .channel(`client-appointments:${user.id}`)
            .on('postgres_changes', {
              event: '*',
              schema: 'public',
              table: 'veterinary_appointments',
              filter: `client_id=eq.${user.id}`,
            }, () => {
              void loadAppointments(true);
            })
            .subscribe((status, error) => {
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('[Appointments] Realtime updates unavailable:', error || status);
              }
            });
        } catch (error) {
          console.warn('[Appointments] Could not subscribe to live appointment updates:', error);
        }
      };
      void initialize();
      return () => {
        active = false;
        if (channel) void supabase.removeChannel(channel);
      };
    }, [loadAppointments]),
  );

  const visibleAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (filter === 'requests') return appointment.status === 'pending' || appointment.status === 'proposed';
      if (filter === 'upcoming') return appointment.status === 'confirmed' && new Date(appointment.scheduled_at).getTime() >= referenceTime;
      return appointment.status === 'declined'
        || appointment.status === 'cancelled'
        || appointment.status === 'completed'
        || (appointment.status === 'confirmed' && new Date(appointment.scheduled_at).getTime() < referenceTime);
    });
  }, [appointments, filter, referenceTime]);

  const manageAppointment = async (appointment: VeterinaryAppointment, action: 'accept' | 'cancel') => {
    if (actionId) return;
    setActionId(appointment.id);
    try {
      const { error } = await supabase.rpc('manage_veterinary_appointment', {
        p_appointment_id: appointment.id,
        p_action: action,
      });
      if (error) throw error;
      const notificationTitle = action === 'accept' ? 'Appointment confirmed' : 'Appointment cancelled';
      const notificationBody = action === 'accept'
        ? `${appointment.client_name} accepted the proposed time for ${appointment.pet_name}.`
        : `${appointment.client_name} cancelled the appointment for ${appointment.pet_name}.`;
      void sendAppointmentNotification(appointment.vet_id, 'vet', appointment.id, notificationTitle, notificationBody);
      await loadAppointments(true);
      if (action === 'accept') Alert.alert('Appointment confirmed', 'Your appointment is now confirmed with the veterinary professional.');
    } catch (error) {
      console.error(`[Appointments] Could not ${action} client appointment:`, error);
      Alert.alert('Update unsuccessful', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setActionId(null);
    }
  };

  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending' || appointment.status === 'proposed').length;
  const upcomingCount = appointments.filter(
    (appointment) => appointment.status === 'confirmed' && new Date(appointment.scheduled_at).getTime() >= referenceTime,
  ).length;
  const filters: { key: AppointmentFilter; label: string; count?: number }[] = [
    { key: 'requests', label: 'Requests', count: pendingCount },
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'history', label: 'History' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><MaterialCommunityIcons name="calendar-check-outline" size={23} color="#93C5FD" /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>My appointments</Text>
          <Text style={styles.subtitle}>Track requests and confirm proposed times</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshButton} onPress={() => void loadAppointments(true)} accessibilityLabel="Refresh appointments">
            <MaterialCommunityIcons name="refresh" size={21} color="#CBD5E1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(client)/vets');
            }}
            accessibilityLabel="Close appointments and return to the previous page"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="close" size={21} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterRow}>
        {filters.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.filterButton, filter === item.key && styles.filterButtonActive]}
            onPress={() => setFilter(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item.key }}
          >
            <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            {item.count ? <View style={styles.filterCount}><Text style={styles.filterCountText}>{item.count}</Text></View> : null}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color="#3B82F6" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAppointments(true)} tintColor="#3B82F6" />}
          showsVerticalScrollIndicator={false}
        >
          {visibleAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="calendar-blank-outline" size={34} color="#64748B" /></View>
              <Text style={styles.emptyTitle}>
                {filter === 'requests' ? 'No appointment requests' : filter === 'upcoming' ? 'No confirmed appointments' : 'No appointment history'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'requests' ? 'When you request a veterinarian appointment, its status will appear here.' : 'Your appointments will appear here.'}
              </Text>
            </View>
          ) : visibleAppointments.map((appointment) => {
            const isBusy = actionId === appointment.id;
            const canCancel = appointment.status === 'pending'
              || appointment.status === 'proposed'
              || (appointment.status === 'confirmed' && new Date(appointment.scheduled_at).getTime() > referenceTime);
            return (
              <View key={appointment.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.vetAvatar}><MaterialCommunityIcons name="doctor" size={21} color="#93C5FD" /></View>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.vetName}>{appointment.vet_name}</Text>
                    <Text style={styles.petName}>For {appointment.pet_name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: `${statusColors[appointment.status]}66`, backgroundColor: `${statusColors[appointment.status]}1A` }]}>
                    <Text style={[styles.statusText, { color: statusColors[appointment.status] }]}>{statusLabels[appointment.status]}</Text>
                  </View>
                </View>
                <View style={styles.appointmentInfo}>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="calendar-clock" size={17} color="#38BDF8" />
                    <Text style={styles.infoText}>{formatAppointmentDateTime(appointment.scheduled_at)}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name={appointment.appointment_type === 'online' ? 'video-outline' : 'hospital-marker'} size={17} color="#A78BFA" />
                    <Text style={styles.infoText}>{appointment.appointment_type === 'online' ? 'Online consultation' : 'In-person visit'} · 30 minutes</Text>
                  </View>
                </View>
                <Text style={styles.sectionLabel}>Reason for visit</Text>
                <Text style={styles.reason}>{appointment.reason}</Text>
                {appointment.vet_response ? <Text style={styles.response}>Veterinarian’s note: {appointment.vet_response}</Text> : null}
                {appointment.status === 'pending' ? (
                  <Text style={styles.pendingNote}>Your preferred time is a request and is not confirmed yet.</Text>
                ) : null}
                {appointment.status === 'proposed' ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.acceptButton]}
                    disabled={isBusy}
                    onPress={() => void manageAppointment(appointment, 'accept')}
                  >
                    {isBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name="check-circle" size={19} color="#FFFFFF" />}
                    <Text style={styles.actionText}>Accept proposed time</Text>
                  </TouchableOpacity>
                ) : null}
                {canCancel ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelButton]}
                    disabled={isBusy}
                    onPress={() => void manageAppointment(appointment, 'cancel')}
                  >
                    <MaterialCommunityIcons name="calendar-remove" size={17} color="#FCA5A5" />
                    <Text style={styles.cancelText}>{appointment.status === 'confirmed' ? 'Cancel appointment' : 'Cancel request'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: '#263449' },
  headerIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#172554', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerCopy: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '800' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  refreshButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  filterButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flex: 1, borderWidth: 1, borderColor: '#334155', borderRadius: 10, backgroundColor: '#1E293B', paddingHorizontal: 8 },
  filterButtonActive: { backgroundColor: '#172554', borderColor: '#3B82F6' },
  filterText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#DBEAFE' },
  filterCount: { minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#F59E0B' },
  filterCountText: { color: '#0F172A', fontSize: 10, fontWeight: '900' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 14, paddingBottom: 28 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 80 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: '#E2E8F0', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  card: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 15, padding: 15, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vetAvatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#172554', alignItems: 'center', justifyContent: 'center' },
  cardTitleWrap: { flex: 1 },
  vetName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  petName: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  statusBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: '800' },
  appointmentInfo: { gap: 10, marginTop: 16, padding: 12, borderRadius: 11, backgroundColor: '#0F172A' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  infoText: { color: '#E2E8F0', fontSize: 13, flex: 1 },
  sectionLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 15 },
  reason: { color: '#E2E8F0', fontSize: 13, lineHeight: 20, marginTop: 5 },
  response: { color: '#7DD3FC', fontSize: 12, lineHeight: 18, marginTop: 10 },
  pendingNote: { color: '#FCD34D', fontSize: 12, lineHeight: 18, marginTop: 12 },
  actionButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 9, marginTop: 13 },
  acceptButton: { backgroundColor: '#059669' },
  cancelButton: { backgroundColor: '#3F1D2A', borderWidth: 1, borderColor: '#7F1D1D' },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  cancelText: { color: '#FCA5A5', fontSize: 12, fontWeight: '800' },
});
