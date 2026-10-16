import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AvatarPreviewModal from '../../components/AvatarPreviewModal';
import VetLocationMap from '../../components/VetLocationMap';
import { requestDeviceLocation } from '../../lib/location';
import { ensureConsultationRecord, getCurrentUser, normalizeUuid, supabase } from '../../lib/supabase';

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
  const [vets, setVets] = useState<VetProfile[]>([]);
  const [selectedVet, setSelectedVet] = useState<VetProfile | null>(null);
  const [selectedVetProfile, setSelectedVetProfile] = useState<VetModalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [intakeVet, setIntakeVet] = useState<VetProfile | null>(null);
  const [intakeMode, setIntakeMode] = useState('Online Consultation');
  const [loading, setLoading] = useState(true);
  const navigationKey = useRef(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Record<string, boolean>>({});
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);

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
          .eq('role', 'vet')
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
            .eq('role', 'vet')
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
          full_name: vet.full_name || 'Veterinarian',
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
      } catch (error) {
        console.warn('Failed to fetch vet directory', error);
        if (isMounted) setVets([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadVets();
    return () => { isMounted = false; };
  }, []);

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
      await ensureConsultationRecord(conversationId, userId, doctorId, 'client', 'vet', category);
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
        vet: intakeVet.full_name,
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

  const vetsWithCoordinates = vets.filter((vet) =>
    isValidCoordinate(vet.latitude, -90, 90) && isValidCoordinate(vet.longitude, -180, 180),
  );

  const openVetMap = async () => {
    if (vetsWithCoordinates.length === 0) {
      Alert.alert('Locations unavailable', 'No veterinarian locations are available yet.');
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Veterinarians</Text>
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

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {vets.length === 0 ? (
            <Text style={styles.emptyState}>No veterinarians are available yet.</Text>
          ) : (
            vets.map((vet) => {
              const specialty = vet.specialty || 'Veterinarian';
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
                      <Text style={styles.doctor}>{vet.full_name}</Text>
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
          specialty: vet.specialty || 'Veterinarian',
          city: vet.city,
          state: vet.state,
          distanceKm: vet.distanceKm,
          latitude: vet.latitude!,
          longitude: vet.longitude!,
        }))}
        onClose={() => setMapVisible(false)}
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
                <Text style={styles.modalDoctor}>{selectedVet.full_name}</Text>
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
                    <Text style={styles.detailLabel}>About Doctor</Text>
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
                </View>
              </ScrollView>
            )}
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
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  mapActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  clinicMapIcon: { width: 26, height: 26 },
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
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  online: { flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
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
