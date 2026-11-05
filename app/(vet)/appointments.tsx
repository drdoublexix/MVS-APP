import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppointmentDateTimePicker from '../../components/AppointmentDateTimePicker';
import {
  appointmentDateTimeToIso,
  formatAppointmentDateTime,
  getAppointmentDates,
  getAppointmentTimeOptions,
  sendAppointmentNotification,
  type AppointmentStatus,
  type VeterinaryAppointment,
} from '../../lib/appointments';
import { getCurrentUser, supabase } from '../../lib/supabase';

type AppointmentFilter = 'requests' | 'upcoming' | 'history';

const statusLabels: Record<AppointmentStatus, string> = {
  pending: 'Awaiting your response',
  proposed: 'New time proposed',
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

const nextAvailableChoice = () => {
  const date = getAppointmentDates().find((candidate) => getAppointmentTimeOptions(candidate).length > 0) || new Date();
  return { date, time: getAppointmentTimeOptions(date)[0]?.value || '09:00' };
};

export default function VetAppointmentsScreen() {
  const [appointments, setAppointments] = useState<VeterinaryAppointment[]>([]);
  const [filter, setFilter] = useState<AppointmentFilter>('requests');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [proposingAppointment, setProposingAppointment] = useState<VeterinaryAppointment | null>(null);
  const [proposalDate, setProposalDate] = useState(() => nextAvailableChoice().date);
  const [proposalTime, setProposalTime] = useState(() => nextAvailableChoice().time);
  const [proposalSending, setProposalSending] = useState(false);

  const loadAppointments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to view your appointments.');
      const { data, error } = await supabase
        .from('veterinary_appointments')
        .select('id, client_id, vet_id, client_name, vet_name, pet_name, appointment_type, reason, scheduled_at, status, vet_response, created_at, updated_at')
        .eq('vet_id', user.id)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      setAppointments((data || []) as VeterinaryAppointment[]);
      setReferenceTime(Date.now());
    } catch (error) {
      console.error('[Appointments] Could not load veterinarian appointments:', error);
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
            .channel(`vet-appointments:${user.id}`)
            .on('postgres_changes', {
              event: '*',
              schema: 'public',
              table: 'veterinary_appointments',
              filter: `vet_id=eq.${user.id}`,
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

  const runAction = async (
    appointment: VeterinaryAppointment,
    action: 'confirm' | 'decline' | 'cancel' | 'complete',
  ) => {
    setActionId(appointment.id);
    try {
      const { error } = await supabase.rpc('manage_veterinary_appointment', {
        p_appointment_id: appointment.id,
        p_action: action,
      });
      if (error) throw error;
      const notificationTitle: Record<typeof action, string> = {
        confirm: 'Appointment confirmed',
        decline: 'Appointment request declined',
        cancel: 'Appointment cancelled',
        complete: 'Appointment completed',
      };
      const notificationBody: Record<typeof action, string> = {
        confirm: `${appointment.vet_name} confirmed the appointment for ${appointment.pet_name} on ${formatAppointmentDateTime(appointment.scheduled_at)}.`,
        decline: `${appointment.vet_name} declined the appointment request for ${appointment.pet_name}.`,
        cancel: `${appointment.vet_name} cancelled the appointment for ${appointment.pet_name}.`,
        complete: `${appointment.vet_name} marked the appointment for ${appointment.pet_name} as complete.`,
      };
      void sendAppointmentNotification(
        appointment.client_id,
        'client',
        appointment.id,
        notificationTitle[action],
        notificationBody[action],
      );
      await loadAppointments(true);
      if (action === 'confirm') {
        Alert.alert('Appointment accepted', 'The appointment is confirmed and the client has been notified.');
      }
    } catch (error) {
      console.error(`[Appointments] Could not ${action} appointment:`, error);
      if (action === 'confirm' && error instanceof Error && error.message.includes('past cannot be confirmed')) {
        Alert.alert(
          'Requested time has passed',
          'This appointment cannot be confirmed for a time that has already passed. Suggest a new time instead.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Suggest time', onPress: () => openProposal(appointment) },
          ],
        );
      } else {
        Alert.alert('Update unsuccessful', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setActionId(null);
    }
  };

  const acceptRequest = (appointment: VeterinaryAppointment) => {
    void runAction(appointment, 'confirm');
  };

  const openProposal = (appointment: VeterinaryAppointment) => {
    const choice = nextAvailableChoice();
    setProposalDate(choice.date);
    setProposalTime(choice.time);
    setProposingAppointment(appointment);
  };

  const sendProposal = async () => {
    if (!proposingAppointment || !proposalTime || proposalSending) return;
    setProposalSending(true);
    try {
      const { error } = await supabase.rpc('manage_veterinary_appointment', {
        p_appointment_id: proposingAppointment.id,
        p_action: 'propose',
        p_scheduled_at: appointmentDateTimeToIso(proposalDate, proposalTime),
      });
      if (error) throw error;
      setProposingAppointment(null);
      void sendAppointmentNotification(
        proposingAppointment.client_id,
        'client',
        proposingAppointment.id,
        'New appointment time proposed',
        `${proposingAppointment.vet_name} proposed ${formatAppointmentDateTime(appointmentDateTimeToIso(proposalDate, proposalTime))} for ${proposingAppointment.pet_name}. Review it in your appointments.`,
      );
      await loadAppointments(true);
      Alert.alert('New time sent', 'The client will be notified and must accept the proposed time to confirm.');
    } catch (error) {
      console.error('[Appointments] Could not propose a new appointment time:', error);
      Alert.alert('Could not send proposal', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setProposalSending(false);
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
        <View style={styles.headerIcon}><MaterialCommunityIcons name="calendar-check-outline" size={23} color="#6EE7B7" /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Appointments</Text>
          <Text style={styles.subtitle}>Review requests and manage your schedule</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void loadAppointments(true)} accessibilityLabel="Refresh appointments">
          <MaterialCommunityIcons name="refresh" size={21} color="#CBD5E1" />
        </TouchableOpacity>
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
        <View style={styles.loading}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAppointments(true)} tintColor="#10B981" />}
          showsVerticalScrollIndicator={false}
        >
          {visibleAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="calendar-blank-outline" size={34} color="#64748B" /></View>
              <Text style={styles.emptyTitle}>
                {filter === 'requests' ? 'You’re all caught up' : filter === 'upcoming' ? 'No confirmed appointments' : 'No appointment history'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'requests' ? 'New client requests will appear here.' : 'Appointments will show here when they’re available.'}
              </Text>
            </View>
          ) : visibleAppointments.map((appointment) => {
            const isBusy = actionId === appointment.id;
            const scheduledAt = new Date(appointment.scheduled_at).getTime();
            const isFuture = scheduledAt > referenceTime;
            const isCompleteable = scheduledAt + 30 * 60 * 1000 <= referenceTime;
            const canReview = appointment.status === 'pending' || appointment.status === 'proposed';
            const canPropose = appointment.status === 'pending' || appointment.status === 'proposed' || (appointment.status === 'confirmed' && isFuture);
            const canCancel = appointment.status === 'proposed' || (appointment.status === 'confirmed' && isFuture);
            const canComplete = appointment.status === 'confirmed' && isCompleteable;
            return (
              <View key={appointment.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.petAvatar}><MaterialCommunityIcons name="paw" size={21} color="#6EE7B7" /></View>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.petName}>{appointment.pet_name}</Text>
                    <Text style={styles.clientName}>Requested by {appointment.client_name}</Text>
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
                {appointment.vet_response ? <Text style={styles.response}>Your note: {appointment.vet_response}</Text> : null}

                {canReview || canPropose || canCancel || canComplete ? (
                  <View style={styles.actions}>
                    {canReview ? (
                      <>
                        {appointment.status === 'pending' ? (
                          <View style={styles.actionPair}>
                            <TouchableOpacity
                              style={[styles.actionButton, styles.actionHalf, styles.confirmButton, isBusy && styles.disabledActionButton]}
                              disabled={isBusy}
                              onPress={() => acceptRequest(appointment)}
                              accessibilityLabel="Accept requested appointment time"
                            >
                              {isBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />}
                              <Text style={styles.actionText}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionButton, styles.actionHalf, styles.proposeButton]}
                              disabled={isBusy}
                              onPress={() => openProposal(appointment)}
                            >
                              <MaterialCommunityIcons name="calendar-edit" size={17} color="#FFFFFF" />
                              <Text style={styles.actionText}>Suggest time</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity style={[styles.actionButton, styles.proposeButton]} disabled={isBusy} onPress={() => openProposal(appointment)}>
                            <MaterialCommunityIcons name="calendar-edit" size={17} color="#FFFFFF" />
                            <Text style={styles.actionText}>Suggest time</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.actionButton, styles.declineButton]} disabled={isBusy} onPress={() => void runAction(appointment, 'decline')}>
                          <MaterialCommunityIcons name="close" size={17} color="#FCA5A5" />
                          <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {canComplete ? (
                      <TouchableOpacity style={[styles.actionButton, styles.confirmButton]} disabled={isBusy} onPress={() => void runAction(appointment, 'complete')}>
                        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.actionText}>Mark complete</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canPropose && appointment.status === 'confirmed' ? (
                      <TouchableOpacity style={[styles.actionButton, styles.proposeButton]} disabled={isBusy} onPress={() => openProposal(appointment)}>
                        <MaterialCommunityIcons name="calendar-edit" size={17} color="#FFFFFF" />
                        <Text style={styles.actionText}>Suggest another time</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canPropose && appointment.status === 'proposed' ? (
                      <TouchableOpacity style={[styles.actionButton, styles.proposeButton]} disabled={isBusy} onPress={() => openProposal(appointment)}>
                        <MaterialCommunityIcons name="calendar-edit" size={17} color="#FFFFFF" />
                        <Text style={styles.actionText}>Suggest a different time</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canCancel ? (
                      <TouchableOpacity style={[styles.actionButton, styles.declineButton]} disabled={isBusy} onPress={() => void runAction(appointment, 'cancel')}>
                        <MaterialCommunityIcons name="calendar-remove" size={17} color="#FCA5A5" />
                        <Text style={styles.declineText}>Cancel appointment</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={Boolean(proposingAppointment)} transparent animationType="slide" onRequestClose={() => setProposingAppointment(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.proposalModal}>
            <View style={styles.proposalHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.proposalTitle}>Suggest another time</Text>
                <Text style={styles.subtitle}>The client must accept before it is confirmed.</Text>
              </View>
              <TouchableOpacity onPress={() => setProposingAppointment(null)} accessibilityLabel="Close time proposal">
                <MaterialCommunityIcons name="close" size={23} color="#CBD5E1" />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <AppointmentDateTimePicker
                selectedDate={proposalDate}
                selectedTime={proposalTime}
                onSelectDate={setProposalDate}
                onSelectTime={setProposalTime}
              />
            </ScrollView>
            <TouchableOpacity style={styles.sendProposalButton} onPress={() => void sendProposal()} disabled={proposalSending || !proposalTime}>
              {proposalSending ? <ActivityIndicator color="#FFFFFF" /> : <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />}
              <Text style={styles.actionText}>{proposalSending ? 'Sending…' : 'Send proposed time'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: '#263449' },
  headerIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#064E3B', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerCopy: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  refreshButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  filterButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flex: 1, borderWidth: 1, borderColor: '#334155', borderRadius: 10, backgroundColor: '#1E293B', paddingHorizontal: 8 },
  filterButtonActive: { backgroundColor: '#064E3B', borderColor: '#10B981' },
  filterText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#D1FAE5' },
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
  petAvatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#064E3B', alignItems: 'center', justifyContent: 'center' },
  cardTitleWrap: { flex: 1 },
  petName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  clientName: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  statusBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: '800' },
  appointmentInfo: { gap: 10, marginTop: 16, padding: 12, borderRadius: 11, backgroundColor: '#0F172A' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  infoText: { color: '#E2E8F0', fontSize: 13, flex: 1 },
  sectionLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 15 },
  reason: { color: '#E2E8F0', fontSize: 13, lineHeight: 20, marginTop: 5 },
  response: { color: '#7DD3FC', fontSize: 12, lineHeight: 18, marginTop: 10 },
  actions: { gap: 8, marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#334155' },
  actionButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 9, paddingHorizontal: 12 },
  actionPair: { flexDirection: 'row', gap: 8 },
  actionHalf: { flex: 1 },
  confirmButton: { backgroundColor: '#059669' },
  proposeButton: { backgroundColor: '#2563EB' },
  disabledActionButton: { opacity: 0.45 },
  declineButton: { backgroundColor: '#3F1D2A', borderWidth: 1, borderColor: '#7F1D1D' },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  declineText: { color: '#FCA5A5', fontSize: 12, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000A6', padding: 14 },
  proposalModal: { width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 17, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B', padding: 17 },
  proposalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  proposalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  sendProposalButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', borderRadius: 10, marginTop: 17 },
});
