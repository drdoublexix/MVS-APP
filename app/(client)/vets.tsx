import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AvatarPreviewModal from '../../components/AvatarPreviewModal';
import AppointmentDateTimePicker from '../../components/AppointmentDateTimePicker';
import VetLocationMap from '../../components/VetLocationMap';
import { appointmentDateTimeToIso, formatAppointmentDateTime, getAppointmentDates, getAppointmentTimeOptions, sendAppointmentNotification } from '../../lib/appointments';
import { requestDeviceLocation } from '../../lib/location';
import { ensureConsultationRecord, getCurrentUser, normalizeUuid, supabase } from '../../lib/supabase';
import { formatVetDisplayName } from '../../lib/vetDisplayName';

type VetProfile = {
  id: string;
  full_name: string;
  role: string;
  avatar_url?: string | null;
  specialty?: string;
  clinic?: string;
  bio?: string;
  phone_number?: string | null;
  email?: string;
  created_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  distanceKm: number | null;
};

type Category = 'Online Consultation' | 'Emergency Request' | 'Vaccination' | 'Routine Checks' | 'General Inquiry' | 'Others';
type VetModalProfile = Pick<VetProfile, 'bio' | 'clinic' | 'specialty' | 'phone_number' | 'city' | 'state'>;
type AppointmentAnimal = {
  id: string;
  type: 'pet' | 'farm';
  name: string;
  details: string;
};

const getAppointmentAnimalIcon = (animal?: AppointmentAnimal) => {
  if (!animal) return 'paw';
  const species = `${animal.name} ${animal.details}`.toLowerCase();
  if (/\b(cat|feline)\b/.test(species)) return 'cat';
  if (/\b(dog|canine)\b/.test(species)) return 'dog';
  if (/\b(duck|waterfowl)\b/.test(species)) return 'duck';
  if (/\b(turkey|turkeys)\b/.test(species)) return 'turkey';
  if (/\b(avian|poultry|chicken|chickens|bird|birds)\b/.test(species)) return 'bird';
  if (/\b(caprine|goat|goats|sheep|ovine)\b/.test(species)) return 'sheep';
  if (/\b(cattle|cow|cows|bovine|calf|calves)\b/.test(species)) return 'cow';
  if (/\b(pig|pigs|swine|porcine)\b/.test(species)) return 'pig';
  if (/\b(horse|horses|equine)\b/.test(species)) return 'horse';
  return animal.type === 'farm' ? 'cow' : 'paw';
};

const categories: Category[] = ['Online Consultation', 'Emergency Request', 'Vaccination', 'Routine Checks', 'General Inquiry', 'Others'];
const getPublicAvatarUrl = (avatarPath?: string | null): string | null => {
  if (!avatarPath) return null;
  if (/^https?:\/\//i.test(avatarPath)) return avatarPath;
  return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl || null;
};

const isValidCoordinate = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const formatLocation = (city?: string | null, state?: string | null) => [city, state].filter(Boolean).join(', ') || 'Not provided';

const haversineDistanceKm = (latitudeOne: number, longitudeOne: number, latitudeTwo: number, longitudeTwo: number) => {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const deltaLatitude = toRadians(latitudeTwo - latitudeOne);
  const deltaLongitude = toRadians(longitudeTwo - longitudeOne);
  const latitudeOneRadians = toRadians(latitudeOne);
  const latitudeTwoRadians = toRadians(latitudeTwo);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOneRadians) * Math.cos(latitudeTwoRadians) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
};

export default function VetsScreen() {
  const router = useRouter();
  const { openMap, returnTo } = useLocalSearchParams<{ openMap?: string; returnTo?: string }>();
  const [vets, setVets] = useState<VetProfile[]>([]);
  const [selectedVet, setSelectedVet] = useState<VetProfile | null>(null);
  const [selectedVetProfile, setSelectedVetProfile] = useState<VetModalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [intakeVet, setIntakeVet] = useState<VetProfile | null>(null);
  const [intakeMode, setIntakeMode] = useState('Online Consultation');
  const [loading, setLoading] = useState(true);
  const navigationKey = useRef(0);
  const openMapOnLoad = useRef(openMap === 'true');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Record<string, boolean>>({});
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [bookingVisible, setBookingVisible] = useState(false);
  const [bookingVet, setBookingVet] = useState<VetProfile | null>(null);
  const [bookingDate, setBookingDate] = useState(() => getAppointmentDates(1)[0]);
  const [bookingTime, setBookingTime] = useState('');
  const [bookingAnimals, setBookingAnimals] = useState<AppointmentAnimal[]>([]);
  const [selectedBookingAnimalKey, setSelectedBookingAnimalKey] = useState<string | null>(null);
  const [bookingAnimalsLoading, setBookingAnimalsLoading] = useState(false);
  const [animalPickerExpanded, setAnimalPickerExpanded] = useState(false);
  const [bookingReason, setBookingReason] = useState('');
  const [bookingType, setBookingType] = useState<'in_person' | 'online'>('in_person');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadVets = async () => {
      try {
        const user = await getCurrentUser();
        let clientLatitude: number | null = null;
        let clientLongitude: number | null = null;
        if (user) {
          const { data: clientProfile, error: clientLocationError } = await supabase.from('profiles').select('latitude, longitude').eq('id', user.id).maybeSingle();
          if (!clientLocationError) {
            clientLatitude = isValidCoordinate(clientProfile?.latitude, -90, 90) ? clientProfile.latitude : null;
            clientLongitude = isValidCoordinate(clientProfile?.longitude, -180, 180) ? clientProfile.longitude : null;
          }
        }
        if (clientLatitude === null || clientLongitude === null) {
          try {
            const detectedLocation = await requestDeviceLocation();
            clientLatitude = detectedLocation?.latitude ?? clientLatitude;
            clientLongitude = detectedLocation?.longitude ?? clientLongitude;
          } catch (locationError) {
            console.warn('Client location unavailable for vet sorting', locationError);
          }
        }
        const vetDirectoryFields = 'id, full_name, role, avatar_url, specialty, clinic, bio, email, created_at, latitude, longitude, city, state, phone_number';
        const detailedQuery = await supabase
          .from('profiles')
          .select(vetDirectoryFields)
          .in('role', ['vet', 'paravet'])
          .eq('is_vet_approved', true)
          .is('deleted_at', null)
          .order('full_name', { ascending: true });

        let data = detailedQuery.data as VetProfile[] | null;
        let error = detailedQuery.error;

        if (error) {
          console.warn('Retrying vet directory query without optional profile columns:', error.message);
          const fallbackQuery = await supabase
            .from('profiles')
            .select('id, full_name, role, avatar_url, specialty, clinic, bio, latitude, longitude, city, state, phone_number, deleted_at')
            .in('role', ['vet', 'paravet'])
            .eq('is_vet_approved', true)
            .is('deleted_at', null)
            .order('full_name', { ascending: true });
          data = fallbackQuery.data as VetProfile[] | null;
          error = fallbackQuery.error;
        }

        if (error) {
          console.warn('Query error fetching vet profiles:', error.message);
        }

        console.log('Vet directory raw profile rows:', data);

        if (!isMounted) return;
        if (error) throw error;
        const sortedVets = ((data || []) as VetProfile[]).map((vet) => ({
          ...vet,
          full_name: formatVetDisplayName(vet.full_name || 'Veterinarian', vet.role),
          specialty: vet.specialty || '',
          city: vet.city || null,
          state: vet.state || null,
          distanceKm: clientLatitude !== null && clientLongitude !== null && isValidCoordinate(vet.latitude, -90, 90) && isValidCoordinate(vet.longitude, -180, 180)
            ? haversineDistanceKm(clientLatitude, clientLongitude, vet.latitude, vet.longitude)
            : null,
        })).sort((firstVet, secondVet) => {
          const firstHasGps = isValidCoordinate(firstVet.latitude, -90, 90) && isValidCoordinate(firstVet.longitude, -180, 180);
          const secondHasGps = isValidCoordinate(secondVet.latitude, -90, 90) && isValidCoordinate(secondVet.longitude, -180, 180);
          const firstHasManualLocation = Boolean(firstVet.city || firstVet.state);
          const secondHasManualLocation = Boolean(secondVet.city || secondVet.state);
          const firstRank = firstHasGps ? 0 : firstHasManualLocation ? 1 : 2;
          const secondRank = secondHasGps ? 0 : secondHasManualLocation ? 1 : 2;
          if (firstRank !== secondRank) return firstRank - secondRank;
          if (firstRank === 0 && firstVet.distanceKm !== null && secondVet.distanceKm !== null) return firstVet.distanceKm - secondVet.distanceKm;
          return 0;
        });
        setVets(sortedVets);
        if (openMapOnLoad.current) {
          openMapOnLoad.current = false;
          if (sortedVets.some((vet) => isValidCoordinate(vet.latitude, -90, 90) && isValidCoordinate(vet.longitude, -180, 180))) {
            setMapVisible(true);
          } else {
            Alert.alert('Locations unavailable', 'No veterinary professional locations are available yet.');
          }
          router.setParams({ openMap: undefined });
        }
      } catch (error) {
        console.warn('Failed to fetch vet directory', error);
        if (isMounted) setVets([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadVets();
    return () => { isMounted = false; };
  }, [router]);

  const openIntake = (vet: VetProfile, mode: string) => {
    setSelectedVet(null);
    setIntakeMode(mode);
    setIntakeVet(vet);
  };

  const openVetProfile = async (vet: VetProfile) => {
    setSelectedVet(vet);
    setSelectedVetProfile(null);
    setProfileLoading(true);

    let profileQuery = await supabase
      .from('profiles')
      .select('bio, clinic, specialty, city, state, phone_number')
      .eq('id', vet.id)
      .maybeSingle();

    if (profileQuery.error) {
      console.warn('Retrying live vet profile details:', profileQuery.error.message);
      profileQuery = await supabase
        .from('profiles')
        .select('bio, clinic, specialty, city, state, phone_number')
        .eq('id', vet.id)
        .maybeSingle();
    }

    if (profileQuery.error) {
      console.warn('Failed to fetch live vet profile details:', profileQuery.error.message);
    }

    setSelectedVetProfile(profileQuery.data as VetModalProfile | null);
    setProfileLoading(false);
  };

  const fetchVetRating = async (vet: VetProfile) => {
    const user = await getCurrentUser();
    const clientId = normalizeUuid(user?.id);
    if (!clientId) return;
    setCurrentUserId(clientId);
    const [{ data: existingRating }, { data: summary }] = await Promise.all([
      supabase.from('vet_ratings').select('rating').eq('vet_id', vet.id).eq('client_id', clientId).maybeSingle(),
      supabase.rpc('get_vet_rating_summary', { target_vet_id: vet.id }),
    ]);
    setUserRating(existingRating?.rating || 0);
    const ratingSummary = Array.isArray(summary) ? summary[0] : summary;
    setAverageRating(Number(ratingSummary?.average_rating || 0));
    setTotalReviews(Number(ratingSummary?.total_reviews || 0));
  };

  const handleRateVet = async (selectedStars: number) => {
    if (!selectedVet || !currentUserId || ratingLoading) return;
    setUserRating(selectedStars);
    setRatingLoading(true);
    const { error } = await supabase.from('vet_ratings').upsert({
      vet_id: selectedVet.id,
      client_id: currentUserId,
      rating: selectedStars,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vet_id,client_id' });
    if (error) {
      setUserRating(0);
      Alert.alert('Rating failed', error.message);
    } else {
      await fetchVetRating(selectedVet);
    }
    setRatingLoading(false);
  };

  const startChat = async (category: Category) => {
    if (!intakeVet) return;
    const doctorId = normalizeUuid(intakeVet.id);
    const user = await getCurrentUser();
    const userId = normalizeUuid(user?.id);
    if (!doctorId || !userId) return;

    const conversationId = `conv_${[userId, doctorId].sort().join('_')}`;

    try {
      await ensureConsultationRecord(conversationId, userId, doctorId, 'client', intakeVet.role, category);
    } catch (error) {
      console.warn('[Consultation] Failed to initialise active consultation from vet modal:', error);
      Alert.alert('Unable to start consultation', error instanceof Error ? error.message : 'Please try again.');
      return;
    }

    try {
      const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
        body: {
          recipientId: doctorId,
          title: 'New Consultation Request',
          body: category,
        },
      });

      if (pushError) {
        console.warn('[Consultation] Failed to send consultation request push notification:', pushError);
      }
    } catch (pushError) {
      console.warn('[Consultation] Push notification invocation failed:', pushError);
    }

    setIntakeVet(null);
    router.push({
      pathname: '/chat',
      params: {
        conversationId,
        category,
        vet: formatVetDisplayName(intakeVet.full_name, intakeVet.role),
        vetRole: intakeVet.role,
        clinic: intakeVet.clinic || 'Veterinary Clinic',
        receiver_id: doctorId,
        vet_id: doctorId,
        t: String(++navigationKey.current),
      },
    });
  };

  const directChat = (vet: VetProfile) => {
    openIntake(vet, 'Online Consultation');
  };

  const openAppointmentBooking = async (vet: VetProfile) => {
    const firstChoice = getAppointmentDates().find((date) => getAppointmentTimeOptions(date).length > 0);
    if (!firstChoice) {
      Alert.alert('No times available', 'There are no appointment request times available in the next 30 days.');
      return;
    }
    setBookingAnimalsLoading(true);
    setBookingVisible(true);
    setBookingVet(vet);
    setBookingDate(firstChoice);
    setBookingTime(getAppointmentTimeOptions(firstChoice)[0].value);
    setBookingAnimals([]);
    setSelectedBookingAnimalKey(null);
    setAnimalPickerExpanded(false);
    setBookingReason('');
    setBookingType('in_person');
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to request an appointment.');
      const [petsResult, farmRecordsResult] = await Promise.all([
        supabase
          .from('pets')
          .select('id, name, type, breed')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('farm_records')
          .select('id, species, breed, flock_size')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false }),
      ]);
      if (petsResult.error) throw petsResult.error;
      if (farmRecordsResult.error) throw farmRecordsResult.error;

      const pets: AppointmentAnimal[] = (petsResult.data || []).map((pet) => ({
        id: pet.id,
        type: 'pet',
        name: pet.name,
        details: [pet.type, pet.breed].filter(Boolean).join(' · ') || 'Pet',
      }));
      const farmRecords: AppointmentAnimal[] = (farmRecordsResult.data || []).map((farm) => ({
        id: farm.id,
        type: 'farm',
        name: `${farm.species}${farm.flock_size !== null ? ` herd/flock (${farm.flock_size})` : ' herd/flock'}`,
        details: [farm.breed, farm.flock_size !== null ? `${farm.flock_size} animals` : null].filter(Boolean).join(' · ') || 'Farm herd',
      }));
      const animals = [...pets, ...farmRecords];
      setBookingAnimals(animals);
      if (animals.length > 0) setSelectedBookingAnimalKey(`${animals[0].type}:${animals[0].id}`);
      if (animals.length === 0) {
        Alert.alert('Add a pet or farm herd first', 'Save a pet or farm record to your client profile before requesting an appointment.');
      }
    } catch (error) {
      console.error('[Appointments] Could not load the client’s saved animals:', error);
      setBookingVisible(false);
      Alert.alert('Animals unavailable', error instanceof Error ? error.message : 'Could not load pets and farm records from your account.');
    } finally {
      setBookingAnimalsLoading(false);
    }
  };

  const submitAppointmentRequest = async () => {
    if (!bookingVet || !bookingTime || bookingSubmitting) return;
    const selectedAnimal = bookingAnimals.find((animal) => `${animal.type}:${animal.id}` === selectedBookingAnimalKey);
    if (!selectedAnimal || bookingReason.trim().length < 3) {
      Alert.alert('Complete appointment details', 'Select a saved pet or farm herd and describe what needs help.');
      return;
    }

    setBookingSubmitting(true);
    try {
      const { data: appointmentId, error } = await supabase.rpc('book_veterinary_appointment', {
        p_vet_id: bookingVet.id,
        p_animal_type: selectedAnimal.type,
        p_pet_id: selectedAnimal.type === 'pet' ? selectedAnimal.id : null,
        p_farm_record_id: selectedAnimal.type === 'farm' ? selectedAnimal.id : null,
        p_appointment_type: bookingType,
        p_reason: bookingReason.trim(),
        p_scheduled_at: appointmentDateTimeToIso(bookingDate, bookingTime),
      });
      if (error) throw error;

      void sendAppointmentNotification(
        bookingVet.id,
        'vet',
        String(appointmentId),
        'New appointment request',
        `A client requested an appointment for ${selectedAnimal.name} on ${formatAppointmentDateTime(appointmentDateTimeToIso(bookingDate, bookingTime))}.`,
      );
      setBookingVisible(false);
      setSelectedVet(null);
      Alert.alert(
        'Request sent',
        `Your appointment request was sent to ${formatVetDisplayName(bookingVet.full_name, bookingVet.role)}. It is not confirmed until they respond.`,
      );
    } catch (error) {
      console.error('[Appointments] Could not submit appointment request:', error);
      Alert.alert('Request not sent', error instanceof Error ? error.message : 'Unable to request this appointment. Please try again.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const vetsWithCoordinates = vets.filter((vet) =>
    isValidCoordinate(vet.latitude, -90, 90) && isValidCoordinate(vet.longitude, -180, 180),
  );

  const openVetMap = async () => {
    if (vetsWithCoordinates.length === 0) {
      Alert.alert('Locations unavailable', 'No veterinary professional locations are available yet.');
      return;
    }
    setMapVisible(true);
  };

  const openVetFromMap = (vetId?: string) => {
    const vet = vetsWithCoordinates.find((item) => item.id === vetId);
    if (!vet) return;
    setMapVisible(false);
    void openVetProfile(vet);
  };

  const closeVetMap = () => {
    setMapVisible(false);
    if (returnTo === 'dashboard' && router.canGoBack()) {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Nearby Veterinary Professionals</Text>
          <View style={styles.mapActions}>
            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => { void openVetMap(); }}
              accessibilityLabel="Explore veterinarians on the map"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="map-marker-radius" size={25} color="#10B981" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => router.push({
                pathname: '/(client)/explore-clinics',
                params: { returnTo: 'vets' },
              })}
              accessibilityLabel="Explore veterinary and pet-care businesses"
              accessibilityRole="button"
            >
              <Image source={require('../../assets/images/clinic-marker.png')} style={styles.clinicMapIcon} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.myAppointmentsLink} onPress={() => router.push('/(client)/appointments')} accessibilityRole="button">
          <MaterialCommunityIcons name="calendar-check-outline" size={17} color="#93C5FD" />
          <Text style={styles.myAppointmentsText}>My appointments</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color="#93C5FD" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {vets.length === 0 ? (
            <Text style={styles.emptyState}>No veterinary professionals are available yet.</Text>
          ) : (
            vets.map((vet) => {
              const specialty = vet.specialty || (vet.role === 'paravet' ? 'Veterinary paraprofessional' : 'Veterinarian');
              const location = [vet.city, vet.state].filter(Boolean).join(', ');
              const distance = vet.distanceKm !== null
                ? `${vet.distanceKm < 10 ? vet.distanceKm.toFixed(1) : Math.round(vet.distanceKm)} km away`
                : null;
              const resolvedAvatarUrl = getPublicAvatarUrl(vet.avatar_url);
              return (
                <View key={vet.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      {resolvedAvatarUrl && !failedAvatarIds[vet.id] ? (
                        <Image
                          source={{ uri: resolvedAvatarUrl }}
                          style={styles.avatarImage}
                          onError={() => setFailedAvatarIds((current) => ({ ...current, [vet.id]: true }))}
                        />
                      ) : (
                        <MaterialCommunityIcons name="doctor" size={28} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.doctor}>{formatVetDisplayName(vet.full_name, vet.role)}</Text>
                      <Text style={styles.clinic}>{specialty}</Text>
                      <Text style={styles.distanceBadge}>
                        {location || 'Location Pending'}
                        {location && distance ? <Text style={styles.locationSeparator}> • </Text> : null}
                        {distance || (!location ? '' : null)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.bioText} numberOfLines={2}>
                    {vet.bio || 'Dedicated to compassionate pet care and preventive treatment plans.'}
                  </Text>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => { void openVetProfile(vet); }}>
                      <Text style={styles.secondaryText}>View profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => directChat(vet)}>
                      <Text style={styles.primaryText}>Chat with Vet</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <VetLocationMap
        visible={mapVisible}
        vets={vetsWithCoordinates.map((vet) => ({
          id: vet.id,
          full_name: vet.full_name,
          specialty: vet.specialty || (vet.role === 'paravet' ? 'Veterinary paraprofessional' : 'Veterinarian'),
          city: vet.city,
          state: vet.state,
          distanceKm: vet.distanceKm,
          latitude: vet.latitude!,
          longitude: vet.longitude!,
        }))}
        onClose={closeVetMap}
        onSelectVet={openVetFromMap}
      />

      <Modal visible={Boolean(selectedVet)} animationType="fade" transparent onRequestClose={() => { setSelectedVet(null); setSelectedVetProfile(null); }} onShow={() => { if (selectedVet) void fetchVetRating(selectedVet); }}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {selectedVet && (
              <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
                <TouchableOpacity style={styles.close} onPress={() => setSelectedVet(null)}>
                  <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileAvatar}
                  onPress={() => {
                    const resolvedAvatarUrl = getPublicAvatarUrl(selectedVet.avatar_url);
                    if (resolvedAvatarUrl) setSelectedAvatarUrl(resolvedAvatarUrl);
                  }}
                  disabled={!getPublicAvatarUrl(selectedVet.avatar_url)}
                  accessibilityLabel="View veterinarian profile photo"
                >
                  {(() => {
                    const resolvedAvatarUrl = getPublicAvatarUrl(selectedVet.avatar_url);
                    return resolvedAvatarUrl && !failedAvatarIds[selectedVet.id] ? (
                      <Image
                        source={{ uri: resolvedAvatarUrl }}
                        style={styles.profileAvatarImage}
                        onError={() => setFailedAvatarIds((current) => ({ ...current, [selectedVet.id]: true }))}
                      />
                    ) : (
                      <MaterialCommunityIcons name="doctor" size={52} color="#FFFFFF" />
                    );
                  })()}
                </TouchableOpacity>
                <Text style={styles.modalDoctor}>{formatVetDisplayName(selectedVet.full_name, selectedVet.role)}</Text>
                <View style={styles.ratingSection}>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={() => void handleRateVet(star)} disabled={ratingLoading} accessibilityLabel={`Rate ${star} stars`}>
                        <Ionicons name={star <= userRating ? 'star' : 'star-outline'} size={28} color="#F59E0B" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.ratingSummary}>{averageRating.toFixed(1)} ★ ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})</Text>
                </View>
                {profileLoading ? <ActivityIndicator style={styles.profileDetailsLoading} color="#10B981" /> : (
                  <View style={styles.profileDetails}>
                    <Text style={styles.detailLabel}>About {selectedVet.role === 'paravet' ? 'Veterinary Paraprofessional' : 'Veterinarian'}</Text>
                    <Text style={styles.detailValue}>{selectedVetProfile?.bio || 'Not provided'}</Text>
                    <Text style={styles.detailLabel}>Clinic</Text>
                    <Text style={styles.detailValue}>{selectedVetProfile?.clinic || 'Not provided'}</Text>
                    <Text style={styles.detailLabel}>Specialty</Text>
                    <Text style={styles.detailValue}>{selectedVetProfile?.specialty || 'Not provided'}</Text>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{formatLocation(selectedVetProfile?.city, selectedVetProfile?.state)}</Text>
                    <Text style={styles.detailLabel}>Phone Number</Text>
                    <Text style={styles.detailValue}>{selectedVetProfile?.phone_number || 'Not provided'}</Text>
                  </View>
                )}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.online} onPress={() => openIntake(selectedVet, 'Online Consultation')}>
                    <Text style={styles.actionText}>Online Consultation</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bookAppointment} onPress={() => openAppointmentBooking(selectedVet)}>
                    <MaterialCommunityIcons name="calendar-plus" size={18} color="#FFFFFF" />
                    <Text style={styles.actionText}>Book an appointment</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={bookingVisible} animationType="slide" transparent onRequestClose={() => setBookingVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.bookingModal}>
            <View style={styles.bookingHeader}>
              <View style={styles.bookingHeadingCopy}>
                <Text style={styles.bookingTitle}>Request an appointment</Text>
                <Text style={styles.bookingSubtitle}>
                  {bookingVet ? formatVetDisplayName(bookingVet.full_name, bookingVet.role) : 'Veterinarian'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBookingVisible(false)} accessibilityLabel="Close appointment form">
                <MaterialCommunityIcons name="close" size={24} color="#CBD5E1" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.bookingContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              <Text style={styles.bookingLabel}>Appointment type</Text>
              <View style={styles.bookingTypeRow}>
                {([
                  { value: 'in_person', label: 'In person', icon: 'hospital-marker' },
                  { value: 'online', label: 'Online', icon: 'video-outline' },
                ] as const).map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.bookingTypeButton, bookingType === option.value && styles.bookingTypeSelected]}
                    onPress={() => setBookingType(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: bookingType === option.value }}
                  >
                    <MaterialCommunityIcons name={option.icon} size={19} color={bookingType === option.value ? '#FFFFFF' : '#94A3B8'} />
                    <Text style={[styles.bookingTypeText, bookingType === option.value && styles.bookingSelectedText]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.bookingLabel}>Select a pet or farm herd</Text>
              <TouchableOpacity
              style={styles.animalPicker}
              onPress={() => setAnimalPickerExpanded((expanded) => !expanded)}
              disabled={bookingAnimalsLoading || bookingAnimals.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Choose a saved pet or farm herd"
              accessibilityState={{ expanded: animalPickerExpanded }}
              >
              {bookingAnimalsLoading
                ? <ActivityIndicator size="small" color="#93C5FD" />
                : <MaterialCommunityIcons name={getAppointmentAnimalIcon(bookingAnimals.find((animal) => `${animal.type}:${animal.id}` === selectedBookingAnimalKey))} size={19} color="#93C5FD" />}
              <View style={styles.animalPickerCopy}>
                <Text style={styles.animalPickerName}>
                  {bookingAnimalsLoading
                    ? 'Loading your saved animals…'
                    : bookingAnimals.find((animal) => `${animal.type}:${animal.id}` === selectedBookingAnimalKey)?.name || 'Choose a saved pet or farm herd'}
                </Text>
                {bookingAnimals.find((animal) => `${animal.type}:${animal.id}` === selectedBookingAnimalKey) ? (
                  <Text style={styles.animalPickerDetails}>{bookingAnimals.find((animal) => `${animal.type}:${animal.id}` === selectedBookingAnimalKey)?.details}</Text>
                ) : null}
              </View>
              <MaterialCommunityIcons name={animalPickerExpanded ? 'chevron-up' : 'chevron-down'} size={22} color="#CBD5E1" />
              </TouchableOpacity>
              {animalPickerExpanded ? (
              <ScrollView
                style={styles.animalPickerList}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {bookingAnimals.map((animal) => {
                  const selected = `${animal.type}:${animal.id}` === selectedBookingAnimalKey;
                  return (
                    <TouchableOpacity
                      key={`${animal.type}:${animal.id}`}
                      style={[styles.animalOption, selected && styles.animalOptionSelected]}
                      onPress={() => {
                        setSelectedBookingAnimalKey(`${animal.type}:${animal.id}`);
                        setAnimalPickerExpanded(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <MaterialCommunityIcons name={getAppointmentAnimalIcon(animal)} size={19} color={selected ? '#93C5FD' : '#94A3B8'} />
                      <View style={styles.animalPickerCopy}>
                        <Text style={styles.animalPickerName}>{animal.name}</Text>
                        <Text style={styles.animalPickerDetails}>{animal.type === 'farm' ? 'Farm record' : animal.details}</Text>
                      </View>
                      {selected ? <MaterialCommunityIcons name="check-circle" size={18} color="#60A5FA" /> : null}
                    </TouchableOpacity>
                  );
                })}
                {!bookingAnimalsLoading && bookingAnimals.length === 0 ? (
                  <Text style={styles.noAnimalsText}>Add a pet or farm herd in your client profile first.</Text>
                ) : null}
              </ScrollView>
              ) : null}
              {!bookingAnimalsLoading && bookingAnimals.length === 0 ? (
              <Text style={styles.animalHelper}>Your saved pets and farm records will appear here.</Text>
              ) : null}

              <AppointmentDateTimePicker
                selectedDate={bookingDate}
                selectedTime={bookingTime}
                onSelectDate={setBookingDate}
                onSelectTime={setBookingTime}
              />

              <Text style={styles.bookingLabel}>What does this pet or farm herd need help with?</Text>
              <TextInput
                value={bookingReason}
                onChangeText={setBookingReason}
                placeholder="Describe what this pet or herd needs help with"
                placeholderTextColor="#64748B"
                multiline
                maxLength={2000}
                textAlignVertical="top"
                style={[styles.bookingInput, styles.bookingReasonInput]}
                accessibilityLabel="Appointment reason"
              />
              <TouchableOpacity
                style={[styles.submitBookingButton, (bookingSubmitting || bookingAnimalsLoading || !selectedBookingAnimalKey || !bookingTime) && styles.disabledBookingButton]}
                onPress={() => void submitAppointmentRequest()}
                disabled={bookingSubmitting || bookingAnimalsLoading || !selectedBookingAnimalKey || !bookingTime}
                accessibilityRole="button"
              >
                {bookingSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <MaterialCommunityIcons name="calendar-check" size={19} color="#FFFFFF" />}
                <Text style={styles.submitBookingText}>{bookingSubmitting ? 'Sending request…' : 'Send appointment request'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AvatarPreviewModal
        imageUrl={selectedAvatarUrl}
        visible={selectedAvatarUrl !== null}
        onClose={() => setSelectedAvatarUrl(null)}
      />

      <Modal visible={Boolean(intakeVet)} animationType="fade" transparent onRequestClose={() => setIntakeVet(null)}>
        <View style={styles.overlay}>
          <View style={styles.intake}>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
              <TouchableOpacity style={styles.close} onPress={() => setIntakeVet(null)}>
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalDoctor}>{intakeMode}</Text>
              <Text style={styles.bio}>What would you like help with today?</Text>
              {categories.map((category) => (
                <TouchableOpacity key={category} style={styles.category} onPress={() => startChat(category)}>
                  <Text style={styles.categoryText}>{category}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#3B82F6" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', gap: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  mapActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  clinicMapIcon: { width: 26, height: 26 },
  myAppointmentsLink: { minHeight: 34, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, backgroundColor: '#172554', paddingHorizontal: 10 },
  myAppointmentsText: { color: '#BFDBFE', fontSize: 12, fontWeight: '700' },
  list: { padding: 16 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { color: '#94A3B8', marginTop: 20, textAlign: 'center' },
  card: { backgroundColor: '#1E293B', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 14 },
  flex: { flex: 1 },
  doctor: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  clinic: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  distanceBadge: { color: '#10B981', fontSize: 11, fontWeight: '700', marginTop: 5 },
  locationSeparator: { color: '#e8f0f0' },
  bioText: { color: '#CBD5E1', marginTop: 12, lineHeight: 20 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 16 },
  secondaryButton: { flex: 1, backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  secondaryText: { color: '#E2E8F0', fontWeight: '700' },
  primaryButton: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: '#000000B3', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 1000 },
  modal: { width: '100%', maxWidth: 500, maxHeight: '88%', backgroundColor: '#1E293B', borderRadius: 14, padding: 22 },
  modalBody: { flexGrow: 0 },
  modalContent: { paddingBottom: 4 },
  close: { alignSelf: 'flex-end' },
  profileAvatar: { width: 92, height: 92, borderRadius: 28, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginTop: 6 },
  profileAvatarImage: { width: '100%', height: '100%', borderRadius: 28 },
  modalDoctor: { color: '#FFFFFF', fontWeight: '700', fontSize: 23, textAlign: 'center', marginTop: 14 },
  modalClinic: { color: '#94A3B8', textAlign: 'center', marginTop: 4 },
  aboutTitle: { color: '#FFFFFF', fontWeight: '700', marginTop: 22 },
  bio: { color: '#E2E8F0', lineHeight: 22, marginTop: 8 },
  actions: { gap: 10, marginTop: 24 },
  online: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  bookAppointment: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12 },
  bookingModal: { width: '100%', maxWidth: 540, maxHeight: '92%', backgroundColor: '#1E293B', borderRadius: 18, borderWidth: 1, borderColor: '#334155', padding: 18 },
  bookingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  bookingHeadingCopy: { flex: 1 },
  bookingTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  bookingSubtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  bookingContent: { paddingBottom: 6 },
  bookingLabel: { color: '#E2E8F0', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  bookingTypeRow: { flexDirection: 'row', gap: 10 },
  bookingTypeButton: { flex: 1, minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  bookingTypeSelected: { backgroundColor: '#0E7490', borderColor: '#22D3EE' },
  bookingTypeText: { color: '#CBD5E1', fontSize: 13, fontWeight: '700' },
  bookingSelectedText: { color: '#FFFFFF' },
  animalPicker: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, borderColor: '#475569', backgroundColor: '#0F172A', paddingHorizontal: 12, paddingVertical: 8 },
  animalPickerCopy: { flex: 1 },
  animalPickerName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  animalPickerDetails: { color: '#94A3B8', fontSize: 11, marginTop: 3 },
  animalPickerList: { maxHeight: 190, borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0B132B', marginTop: 7, overflow: 'hidden' },
  animalOption: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  animalOptionSelected: { backgroundColor: '#172554' },
  noAnimalsText: { color: '#FBBF24', fontSize: 12, lineHeight: 18, padding: 12 },
  animalHelper: { color: '#94A3B8', fontSize: 11, lineHeight: 17, marginTop: 6 },
  bookingInput: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: '#475569', backgroundColor: '#0F172A', color: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  bookingReasonInput: { minHeight: 96, paddingTop: 12 },
  submitBookingButton: { minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, backgroundColor: '#2563EB', borderRadius: 11, marginTop: 20 },
  disabledBookingButton: { opacity: 0.6 },
  submitBookingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  actionText: { color: '#FFFFFF', fontWeight: '700' },
  intake: { width: '100%', maxWidth: 500, maxHeight: '85%', backgroundColor: '#1E293B', borderRadius: 14, padding: 20 },
  category: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 10, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#334155' },
  categoryText: { color: '#FFFFFF', fontWeight: '600' },
  ratingSection: { alignItems: 'center', marginTop: 14 },
  stars: { flexDirection: 'row', gap: 6 },
  ratingSummary: { color: '#FCD34D', fontSize: 13, marginTop: 6 },
  profileDetailsLoading: { marginTop: 22 },
  profileDetails: { marginTop: 22 },
  detailLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginTop: 10 },
  detailValue: { color: '#E2E8F0', lineHeight: 22, marginTop: 4 },
});
