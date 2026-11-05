import { sendPushNotification } from './notifications';

export type AppointmentStatus =
  | 'pending'
  | 'proposed'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed';

export type VeterinaryAppointment = {
  id: string;
  client_id: string;
  vet_id: string;
  client_name: string;
  vet_name: string;
  pet_name: string;
  appointment_type: 'in_person' | 'online';
  reason: string;
  scheduled_at: string;
  status: AppointmentStatus;
  vet_response: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentTimeOption = {
  value: string;
  label: string;
};

export const getAppointmentDates = (days = 30): Date[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return date;
  });
};

export const getAppointmentTimeOptions = (date: Date): AppointmentTimeOption[] => {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const firstSlot = isToday
    ? Math.max(9 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30)
    : 9 * 60;

  const options: AppointmentTimeOption[] = [];
  for (let minutes = firstSlot; minutes <= 16 * 60 + 30; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const slot = new Date(date);
    slot.setHours(hour, minute, 0, 0);
    options.push({
      value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      label: slot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    });
  }
  return options;
};

export const appointmentDateTimeToIso = (date: Date, time: string): string => {
  const [hour, minute] = time.split(':').map(Number);
  const localDateTime = new Date(date);
  localDateTime.setHours(hour, minute, 0, 0);
  return localDateTime.toISOString();
};

export const formatAppointmentDateTime = (dateTime: string): string =>
  new Date(dateTime).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const sendAppointmentNotification = (
  recipientUserId: string,
  recipientRole: 'client' | 'vet',
  appointmentId: string,
  title: string,
  body: string,
): Promise<void> =>
  sendPushNotification(
    recipientUserId,
    title,
    body,
    {
      preferenceKey: 'appointments',
      type: 'appointment_update',
      appointmentId,
      url: recipientRole === 'vet' ? '/(vet)/appointments' : '/(client)/appointments',
    },
    { persistNotification: false },
  );
