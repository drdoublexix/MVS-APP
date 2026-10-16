import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useImage } from 'expo-image';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBusinessTypeLabel, type VeterinaryClinic } from '../lib/clinics';

type Props = {
  visible: boolean;
  clinics: VeterinaryClinic[];
  onClose: () => void;
  onSelectClinic: (clinicId: string) => void;
};

type ExpoMapsModule = typeof import('expo-maps');

let AppleMaps: ExpoMapsModule['AppleMaps'] | null = null;
let GoogleMaps: ExpoMapsModule['GoogleMaps'] | null = null;

const isExpoGo = Constants.appOwnership === 'expo'
  || (Constants.executionEnvironment as string) === 'storeClient'
  || (Constants.executionEnvironment as string) === 'expo';

if (!isExpoGo) {
  try {
    const expoMaps = require('expo-maps') as ExpoMapsModule;
    AppleMaps = expoMaps.AppleMaps;
    GoogleMaps = expoMaps.GoogleMaps;
  } catch (error) {
    console.warn('[ClinicLocationMap] expo-maps is unavailable in this runtime:', error);
  }
}

const NIGERIA_CENTER = { latitude: 9.08, longitude: 8.67 };

export default function ClinicLocationMap({ visible, clinics, onClose, onSelectClinic }: Props) {
  const [previewClinicId, setPreviewClinicId] = useState<string | null>(null);
  const markerIcon = useImage(require('../assets/images/clinic-marker.png'));
  const googleMapsApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey
    || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const safeClinics = clinics.filter((clinic) => Number.isFinite(clinic.latitude) && Number.isFinite(clinic.longitude));
  const mapCenter = safeClinics.length
    ? {
        latitude: safeClinics.reduce((sum, clinic) => sum + clinic.latitude, 0) / safeClinics.length,
        longitude: safeClinics.reduce((sum, clinic) => sum + clinic.longitude, 0) / safeClinics.length,
      }
    : NIGERIA_CENTER;
  const latitudeSpan = safeClinics.length
    ? Math.max(...safeClinics.map((clinic) => clinic.latitude)) - Math.min(...safeClinics.map((clinic) => clinic.latitude))
    : 0;
  const longitudeSpan = safeClinics.length
    ? Math.max(...safeClinics.map((clinic) => clinic.longitude)) - Math.min(...safeClinics.map((clinic) => clinic.longitude))
    : 0;
  const mapZoom = safeClinics.length
    ? Math.max(5, Math.min(13, 12 - Math.log2(Math.max(latitudeSpan, longitudeSpan, 0.02) / 0.02)))
    : 5;
  const canRenderNativeMap = Boolean(AppleMaps?.View || GoogleMaps?.View);
  const previewClinic = safeClinics.find((clinic) => clinic.id === previewClinicId) || null;

  const handleMarkerPress = (clinicId?: string) => {
    if (!clinicId) return;
    if (previewClinicId === clinicId) {
      setPreviewClinicId(null);
      onSelectClinic(clinicId);
      return;
    }
    setPreviewClinicId(clinicId);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Vet Institutions &amp; Pet Businesses</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close clinic locations map">
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.mapContainer}>
          {!canRenderNativeMap ? (
            <MapUnavailable hasClinics={safeClinics.length > 0} />
          ) : Platform.OS === 'ios' ? (
            <MapErrorBoundary fallback={<MapUnavailable hasClinics />}>
              {AppleMaps?.View ? (
                <AppleMaps.View
                  style={styles.map}
                  cameraPosition={{ coordinates: mapCenter, zoom: mapZoom }}
                  markers={safeClinics.map((clinic) => ({
                    id: clinic.id,
                    coordinates: { latitude: clinic.latitude, longitude: clinic.longitude },
                    title: `${clinic.clinic_name} - ${getBusinessTypeLabel(clinic.business_type, clinic.business_type_other)}`,
                    systemImage: 'cross.case.fill',
                    tintColor: '#2563EB',
                  }))}
                  uiSettings={{ compassEnabled: true, scaleBarEnabled: true }}
                  onMarkerClick={(marker: { id?: string }) => handleMarkerPress(marker.id)}
                  onMapClick={() => setPreviewClinicId(null)}
                />
              ) : null}
            </MapErrorBoundary>
          ) : googleMapsApiKey?.trim() ? (
            <MapErrorBoundary fallback={<MapUnavailable hasClinics />}>
              {GoogleMaps?.View ? (
                <GoogleMaps.View
                  style={styles.map}
                  cameraPosition={{ coordinates: mapCenter, zoom: mapZoom }}
                  markers={markerIcon ? safeClinics.map((clinic) => ({
                    id: clinic.id,
                    coordinates: { latitude: clinic.latitude, longitude: clinic.longitude },
                    title: clinic.clinic_name,
                    snippet: `${getBusinessTypeLabel(clinic.business_type, clinic.business_type_other)} • ${clinic.practice_specialties.join(', ')}`,
                    showCallout: false,
                    icon: markerIcon,
                    anchor: { x: 0.5, y: 1 },
                  })) : []}
                  uiSettings={{
                    compassEnabled: true,
                    rotationGesturesEnabled: true,
                    scrollGesturesEnabled: true,
                    zoomControlsEnabled: true,
                    zoomGesturesEnabled: true,
                  }}
                  onMarkerClick={(marker: { id?: string }) => handleMarkerPress(marker.id)}
                  onMapClick={() => setPreviewClinicId(null)}
                />
              ) : null}
            </MapErrorBoundary>
          ) : (
            <MapUnavailable hasClinics />
          )}
          {previewClinic ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewName}>{previewClinic.clinic_name}</Text>
              <Text style={styles.previewSpecialty}>{getBusinessTypeLabel(previewClinic.business_type, previewClinic.business_type_other)}</Text>
              <Text style={styles.previewSpecialty}>{previewClinic.practice_specialties.join(', ')}</Text>
              <TouchableOpacity style={styles.previewButton} onPress={() => { setPreviewClinicId(null); onSelectClinic(previewClinic.id); }}>
              <Text style={styles.previewButtonText}>View listing</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <ScrollView style={styles.locationList} contentContainerStyle={styles.locationListContent} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.listTitle}>Nearby Vet &amp; Pet-Care Businesses</Text>
          {clinics.length === 0 ? <Text style={styles.empty}>No veterinary or pet-care businesses have been listed yet.</Text> : null}
          {clinics.map((clinic) => (
            <TouchableOpacity key={clinic.id} style={styles.locationRow} onPress={() => onSelectClinic(clinic.id)}>
              <MaterialCommunityIcons name="map-marker" size={20} color="#60A5FA" />
              <View style={styles.locationCopy}>
                <Text style={styles.clinicName}>{clinic.clinic_name}</Text>
                <Text style={styles.specialty}>{getBusinessTypeLabel(clinic.business_type, clinic.business_type_other)}</Text>
                <Text style={styles.specialty}>{clinic.practice_specialties.join(', ')}</Text>
                <Text style={styles.location}>{formatClinicLocation(clinic)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function formatClinicLocation(clinic: VeterinaryClinic) {
  const place = [clinic.city, clinic.state].filter(Boolean).join(', ');
  const distance = clinic.distanceKm !== null
    ? `${clinic.distanceKm < 10 ? clinic.distanceKm.toFixed(1) : Math.round(clinic.distanceKm)} km away`
    : null;
  return [place || clinic.address, distance].filter(Boolean).join(' • ');
}

function MapUnavailable({ hasClinics }: { hasClinics: boolean }) {
  return (
    <View style={styles.mapUnavailable}>
      <MaterialCommunityIcons name="map-marker-off-outline" size={42} color="#94A3B8" />
      <Text style={styles.mapUnavailableTitle}>Map unavailable</Text>
      <Text style={styles.mapUnavailableText}>
        {hasClinics ? 'Clinic locations are still available in the list below.' : 'Clinic locations will appear here when merchants add them.'}
      </Text>
    </View>
  );
}

class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[ClinicLocationMap] Native map failed; showing list fallback:', error, errorInfo);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  mapContainer: { height: '48%' },
  map: { flex: 1 },
  mapUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#1E293B' },
  mapUnavailableTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 10 },
  mapUnavailableText: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 280, textAlign: 'center' },
  locationList: { flex: 1 },
  locationListContent: { padding: 16, paddingBottom: 28 },
  listTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  locationCopy: { flex: 1 },
  clinicName: { color: '#FFFFFF', fontWeight: '700' },
  specialty: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  location: { color: '#93C5FD', fontSize: 11, marginTop: 3 },
  empty: { color: '#CBD5E1', fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  previewCard: { position: 'absolute', top: 18, left: '9%', right: '9%', padding: 12, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', elevation: 8, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
  previewName: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  previewSpecialty: { color: '#334155', fontSize: 12, marginTop: 4 },
  previewButton: { backgroundColor: '#2563EB', borderRadius: 6, paddingVertical: 9, marginTop: 10, alignItems: 'center' },
  previewButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
