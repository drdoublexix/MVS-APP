import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClinicLocationMap from '../../components/ClinicLocationMap';
import {
  getBusinessTypeLabel,
  haversineDistanceKm,
  isValidCoordinate,
  type VeterinaryClinic,
} from '../../lib/clinics';
import { getCurrentUser, supabase } from '../../lib/supabase';

type ClinicRatingSummary = {
  average_rating: number;
  total_reviews: number;
};

export default function ClientClinicsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [clinics, setClinics] = useState<VeterinaryClinic[]>([]);
  const [selectedClinic, setSelectedClinic] = useState<VeterinaryClinic | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [shareFeedback, setShareFeedback] = useState('');
  const ratingRequestId = useRef(0);

  const loadClinics = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const user = await getCurrentUser();
      const [clinicsResult, locationResult] = await Promise.all([
        supabase
          .from('veterinary_clinics')
          .select('id, merchant_id, clinic_name, business_type, business_type_other, practice_specialty, practice_specialties, description, phone_number, email, address, city, state, latitude, longitude, profile_photo_url, gallery_photo_urls, created_at, updated_at')
          .order('clinic_name', { ascending: true }),
        user
          ? supabase.from('profiles').select('latitude, longitude').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (clinicsResult.error) throw clinicsResult.error;

      let clientLatitude: number | null = null;
      let clientLongitude: number | null = null;
      if (locationResult.error) {
        console.warn('[Clinics] Could not read saved client location:', locationResult.error.message);
      } else {
        clientLatitude = isValidCoordinate(locationResult.data?.latitude, -90, 90) ? locationResult.data.latitude : null;
        clientLongitude = isValidCoordinate(locationResult.data?.longitude, -180, 180) ? locationResult.data.longitude : null;
      }

      const sortedClinics = (clinicsResult.data || []).map((clinic) => ({
        ...clinic,
        distanceKm: clientLatitude !== null && clientLongitude !== null
          ? haversineDistanceKm(clientLatitude, clientLongitude, clinic.latitude, clinic.longitude)
          : null,
        gallery_photo_urls: clinic.gallery_photo_urls || [],
      })).sort((firstClinic, secondClinic) => {
        if (firstClinic.distanceKm === null) return secondClinic.distanceKm === null ? 0 : 1;
        if (secondClinic.distanceKm === null) return -1;
        return firstClinic.distanceKm - secondClinic.distanceKm;
      });
      setClinics(sortedClinics);
      setMapVisible(true);
    } catch (error) {
      console.error('[Clinics] Failed to load veterinary clinics:', error);
      setClinics([]);
      setLoadError('Unable to load veterinary and pet-care listings from Supabase. Please try again.');
      Alert.alert('Business search unavailable', error instanceof Error ? error.message : 'Unable to load nearby listings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadClinics();
    }, [loadClinics]),
  );

  const loadClinicRating = async (clinic: VeterinaryClinic) => {
    const requestId = ++ratingRequestId.current;
    setRatingLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to rate this business.');
      const [ratingResult, summaryResult] = await Promise.all([
        supabase
          .from('veterinary_clinic_ratings')
          .select('rating')
          .eq('clinic_id', clinic.id)
          .eq('client_id', user.id)
          .maybeSingle(),
        supabase.rpc('get_veterinary_clinic_rating_summary', { target_clinic_id: clinic.id }),
      ]);
      if (ratingResult.error) throw ratingResult.error;
      if (summaryResult.error) throw summaryResult.error;
      if (requestId !== ratingRequestId.current) return;
      setCurrentUserId(user.id);
      setUserRating(ratingResult.data?.rating || 0);
      const summaryData = summaryResult.data as ClinicRatingSummary[] | ClinicRatingSummary | null;
      const summary = Array.isArray(summaryData) ? summaryData[0] : summaryData;
      setAverageRating(Number(summary?.average_rating || 0));
      setTotalReviews(Number(summary?.total_reviews || 0));
    } catch (error) {
      if (requestId !== ratingRequestId.current) return;
      console.error('[Clinics] Failed to load clinic rating:', error);
      Alert.alert('Rating unavailable', error instanceof Error ? error.message : 'Unable to load this business rating.');
    } finally {
      if (requestId === ratingRequestId.current) setRatingLoading(false);
    }
  };

  const openClinic = (clinicId: string) => {
    const clinic = clinics.find((item) => item.id === clinicId);
    if (!clinic) return;
    setSelectedClinic(clinic);
    setSelectedPhotoIndex(null);
    setMapVisible(false);
    setCurrentUserId(null);
    setUserRating(0);
    setAverageRating(0);
    setTotalReviews(0);
    setShareFeedback('');
    void loadClinicRating(clinic);
  };

  const closeClinic = () => {
    ratingRequestId.current += 1;
    setSelectedClinic(null);
    setSelectedPhotoIndex(null);
    setRatingLoading(false);
    setMapVisible(true);
  };

  const closeClinicExplorer = () => {
    setMapVisible(false);
    router.replace(returnTo === 'vets' ? '/(client)/vets' : '/(client)');
  };

  const rateClinic = async (stars: number) => {
    if (!selectedClinic || !currentUserId || ratingLoading) return;
    const requestId = ratingRequestId.current;
    const previousRating = userRating;
    setUserRating(stars);
    setRatingLoading(true);
    try {
      const { error } = await supabase
        .from('veterinary_clinic_ratings')
        .upsert({
          clinic_id: selectedClinic.id,
          client_id: currentUserId,
          rating: stars,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'clinic_id,client_id' });
      if (error) throw error;

      const { data, error: summaryError } = await supabase.rpc(
        'get_veterinary_clinic_rating_summary',
        { target_clinic_id: selectedClinic.id },
      );
      if (summaryError) throw summaryError;
      if (requestId !== ratingRequestId.current) return;
      const summaryData = data as ClinicRatingSummary[] | ClinicRatingSummary | null;
      const summary = Array.isArray(summaryData) ? summaryData[0] : summaryData;
      setAverageRating(Number(summary?.average_rating || 0));
      setTotalReviews(Number(summary?.total_reviews || 0));
    } catch (error) {
      if (requestId !== ratingRequestId.current) return;
      setUserRating(previousRating);
      console.error('[Clinics] Failed to save clinic rating:', error);
      Alert.alert('Rating failed', error instanceof Error ? error.message : 'Unable to save your rating.');
    } finally {
      if (requestId === ratingRequestId.current) setRatingLoading(false);
    }
  };

  const getShareText = (clinic: VeterinaryClinic) => [
    clinic.clinic_name,
    getBusinessTypeLabel(clinic.business_type, clinic.business_type_other),
    clinic.practice_specialties.join(', '),
    `${clinic.address}, ${clinic.city}, ${clinic.state}`,
    `Phone: ${clinic.phone_number}`,
    `Email: ${clinic.email}`,
    `Location: https://www.google.com/maps/search/?api=1&query=${clinic.latitude},${clinic.longitude}`,
  ].join('\n');

  const shareClinic = async () => {
    if (!selectedClinic) return;
    const message = getShareText(selectedClinic);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: selectedClinic.clinic_name, text: message });
        setShareFeedback('Listing shared successfully.');
      } else if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        setShareFeedback('Business details copied. You can now paste and share them.');
      } else {
        await Share.share({ message, title: selectedClinic.clinic_name });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('[Clinics] Could not share clinic details:', error);
      setShareFeedback(error instanceof Error ? `Share failed: ${error.message}` : 'Unable to share these business details.');
    }
  };

  const copyClinic = async () => {
    if (!selectedClinic) return;
    try {
      await Clipboard.setStringAsync(getShareText(selectedClinic));
      setShareFeedback('Business details copied to your clipboard.');
    } catch (error) {
      console.error('[Clinics] Could not copy clinic details:', error);
      setShareFeedback(error instanceof Error ? `Copy failed: ${error.message}` : 'Unable to copy these business details.');
    }
  };

  const openContactLink = async (url: string, action: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error(`[Clinics] Could not open ${action} link:`, error);
      Alert.alert(`${action} unavailable`, error instanceof Error ? error.message : `Unable to open ${action.toLowerCase()}.`);
    }
  };

  const messageClinic = async () => {
    if (!selectedClinic) return;
    let user;
    try {
      user = await getCurrentUser();
    } catch (error) {
      console.error('[Clinics] Could not verify the client before opening a message:', error);
      Alert.alert('Message unavailable', error instanceof Error ? error.message : 'Unable to open a message right now.');
      return;
    }
    if (!user) {
      Alert.alert('Sign in required', 'Sign in before messaging this business.');
      return;
    }
    const conversationId = `conv_${[user.id, selectedClinic.merchant_id].sort().join('_')}`;
    setSelectedClinic(null);
    setMapVisible(false);
    router.push({
      pathname: '/(client)/chat',
      params: {
        conversationId,
        merchantId: selectedClinic.merchant_id,
        merchantName: selectedClinic.clinic_name,
        starterMessage: `Hi, I would like to ask about ${selectedClinic.clinic_name}.`,
        inquiryKey: `clinic-${selectedClinic.id}-${Date.now()}`,
      },
    });
  };

  const businessTypeLabel = selectedClinic
    ? getBusinessTypeLabel(selectedClinic.business_type, selectedClinic.business_type_other)
    : 'Business';
  const locationText = selectedClinic
    ? `${selectedClinic.address}, ${selectedClinic.city}, ${selectedClinic.state}`
    : '';
  const photos = selectedClinic?.gallery_photo_urls?.slice(0, 5) || [];
  const selectedPhotoUrl = selectedPhotoIndex === null ? null : photos[selectedPhotoIndex] || null;

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Finding nearby veterinary and pet-care businesses...</Text>
        </View>
      ) : (
        <>
          {loadError ? <Text style={styles.errorBanner}>{loadError}</Text> : null}
          <ClinicLocationMap
            visible={mapVisible}
            clinics={clinics}
            onClose={closeClinicExplorer}
            onSelectClinic={openClinic}
          />
          {!mapVisible && !selectedClinic ? (
            <View style={styles.returnButtonWrap}>
              <TouchableOpacity style={styles.returnButton} onPress={() => setMapVisible(true)}>
                <MaterialCommunityIcons name="map" size={19} color="#FFFFFF" />
                <Text style={styles.returnButtonText}>Return to nearby listings</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}

      <Modal visible={Boolean(selectedClinic)} animationType="fade" transparent onRequestClose={closeClinic}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={styles.headerSpacer} />
              <TouchableOpacity style={styles.closeButton} onPress={closeClinic} accessibilityLabel="Close clinic details">
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {selectedClinic ? (
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                {selectedClinic.profile_photo_url ? (
                  <Image source={{ uri: selectedClinic.profile_photo_url }} style={styles.profilePhoto} />
                ) : (
                  <View style={[styles.profilePhoto, styles.profilePhotoPlaceholder]}>
                    <MaterialCommunityIcons name="store-marker" size={44} color="#93C5FD" />
                  </View>
                )}
                <Text style={styles.clinicName}>{selectedClinic.clinic_name}</Text>
                <Text style={styles.businessType}>{businessTypeLabel}</Text>
                <Text style={styles.specialty}>{selectedClinic.practice_specialties.join(', ')}</Text>
                {selectedClinic.description ? <Text style={styles.description}>{selectedClinic.description}</Text> : null}

                <View style={styles.ratingPanel}>
                  <Text style={styles.ratingTitle}>Rate this {businessTypeLabel.toLowerCase()}</Text>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => { void rateClinic(star); }}
                        disabled={ratingLoading}
                        accessibilityLabel={`Rate business ${star} stars`}
                      >
                        <Ionicons name={star <= userRating ? 'star' : 'star-outline'} size={26} color="#F59E0B" />
                      </TouchableOpacity>
                    ))}
                    {ratingLoading ? <ActivityIndicator size="small" color="#F59E0B" /> : null}
                  </View>
                  <Text style={styles.ratingSummary}>
                    {averageRating.toFixed(1)} ★ · {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>

                {photos.length ? (
                  <>
                    <Text style={styles.sectionTitle}>Photos</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
                      {photos.map((photoUrl, index) => (
                        <TouchableOpacity key={`${photoUrl}-${index}`} onPress={() => setSelectedPhotoIndex(index)} accessibilityLabel={`View clinic photo ${index + 1}`}>
                          <Image source={{ uri: photoUrl }} style={styles.galleryPhoto} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                ) : null}

                <Text style={styles.sectionTitle}>Contact and location</Text>
                <View style={styles.actions}>
                  <Action icon="phone" label="Call" onPress={() => { void openContactLink(`tel:${selectedClinic.phone_number}`, 'Call'); }} />
                  <Action icon="message-text-outline" label="Message" onPress={() => { void messageClinic(); }} />
                  <Action icon="email-outline" label="Email" onPress={() => { void openContactLink(`mailto:${selectedClinic.email}`, 'Email'); }} />
                  <Action
                    icon="map-marker-outline"
                    label="Location"
                    onPress={() => { void openContactLink(`https://www.google.com/maps/search/?api=1&query=${selectedClinic.latitude},${selectedClinic.longitude}`, 'Location'); }}
                  />
                </View>
                <Text style={styles.locationText}>{locationText}</Text>
                <View style={styles.shareActions}>
                  <TouchableOpacity style={styles.shareButton} onPress={() => { void shareClinic(); }}>
                    <MaterialCommunityIcons name="share-variant" size={19} color="#FFFFFF" />
                    <Text style={styles.shareButtonText}>Share listing</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.copyButton} onPress={() => { void copyClinic(); }}>
                    <MaterialCommunityIcons name="content-copy" size={18} color="#93C5FD" />
                    <Text style={styles.copyButtonText}>Copy details</Text>
                  </TouchableOpacity>
                </View>
                {shareFeedback ? <Text style={styles.shareFeedback}>{shareFeedback}</Text> : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedPhotoUrl)} transparent animationType="fade" onRequestClose={() => setSelectedPhotoIndex(null)}>
        <View style={styles.photoOverlay}>
          <TouchableOpacity style={styles.photoClose} onPress={() => setSelectedPhotoIndex(null)} accessibilityLabel="Close clinic photo">
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {selectedPhotoUrl && selectedPhotoIndex !== null ? (
            <>
              <View style={styles.photoViewer}>
                <TouchableOpacity
                  style={[styles.photoNavigationButton, selectedPhotoIndex === 0 && styles.photoNavigationButtonDisabled]}
                  onPress={() => setSelectedPhotoIndex((index) => index === null ? null : Math.max(0, index - 1))}
                  disabled={selectedPhotoIndex === 0}
                  accessibilityLabel="View previous clinic photo"
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="chevron-left" size={34} color="#FFFFFF" />
                </TouchableOpacity>
                <Image key={selectedPhotoUrl} source={{ uri: selectedPhotoUrl }} style={styles.fullPhoto} resizeMode="contain" />
                <TouchableOpacity
                  style={[styles.photoNavigationButton, selectedPhotoIndex >= photos.length - 1 && styles.photoNavigationButtonDisabled]}
                  onPress={() => setSelectedPhotoIndex((index) => index === null ? null : Math.min(photos.length - 1, index + 1))}
                  disabled={selectedPhotoIndex >= photos.length - 1}
                  accessibilityLabel="View next clinic photo"
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="chevron-right" size={34} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <Text style={styles.photoCounter}>{selectedPhotoIndex + 1} / {photos.length}</Text>
            </>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Action({ icon, label, onPress }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} accessibilityRole="button">
      <View style={styles.actionIcon}>
        <MaterialCommunityIcons name={icon} size={21} color="#93C5FD" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#CBD5E1', fontSize: 14 },
  errorBanner: { color: '#FECACA', backgroundColor: '#7F1D1D', padding: 10, fontSize: 12, lineHeight: 18 },
  returnButtonWrap: { position: 'absolute', top: 14, left: 14, zIndex: 2 },
  returnButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#1D4ED8', borderRadius: 9 },
  returnButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 480, maxHeight: '92%', backgroundColor: '#1E293B', borderRadius: 18, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  modalHeader: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  headerSpacer: { width: 36 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  modalContent: { alignItems: 'center', paddingHorizontal: 18, paddingBottom: 22 },
  profilePhoto: { width: 104, height: 104, borderRadius: 52, backgroundColor: '#334155', marginTop: 2, marginBottom: 12 },
  profilePhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  clinicName: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  businessType: { color: '#CBD5E1', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  specialty: { color: '#93C5FD', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  description: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10 },
  ratingPanel: { width: '100%', alignItems: 'center', paddingVertical: 13, marginTop: 12, backgroundColor: '#0F172A', borderRadius: 11 },
  ratingTitle: { color: '#E2E8F0', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingSummary: { color: '#CBD5E1', fontSize: 12, marginTop: 5 },
  sectionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', alignSelf: 'flex-start', marginTop: 18, marginBottom: 9 },
  gallery: { gap: 9, paddingRight: 3 },
  galleryPhoto: { width: 86, height: 86, borderRadius: 10, backgroundColor: '#0F172A' },
  actions: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  action: { flex: 1, alignItems: 'center', gap: 5 },
  actionIcon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' },
  actionLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },
  locationText: { color: '#E2E8F0', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 11 },
  shareActions: { width: '100%', flexDirection: 'row', gap: 9, marginTop: 17 },
  shareButton: { flex: 1, minHeight: 43, backgroundColor: '#2563EB', borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  shareButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  copyButton: { flex: 1, minHeight: 43, backgroundColor: '#0F172A', borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#334155' },
  copyButtonText: { color: '#93C5FD', fontSize: 13, fontWeight: '700' },
  shareFeedback: { color: '#A7F3D0', fontSize: 12, textAlign: 'center', marginTop: 9 },
  photoOverlay: { flex: 1, backgroundColor: '#000000F2', alignItems: 'center', justifyContent: 'center' },
  photoClose: { position: 'absolute', top: 48, right: 20, zIndex: 1, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155' },
  photoViewer: { width: '100%', height: '80%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  photoNavigationButton: { width: 46, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: '#334155' },
  photoNavigationButtonDisabled: { opacity: 0.35 },
  fullPhoto: { flex: 1, height: '100%' },
  photoCounter: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 12 },
});
