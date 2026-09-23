import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MapVet = {
  id: string;
  full_name: string;
  specialty?: string;
  city?: string | null;
  state?: string | null;
  distanceKm: number | null;
  latitude: number;
  longitude: number;
};

type VetLocationMapProps = {
  visible: boolean;
  vets: MapVet[];
  onClose: () => void;
  onSelectVet: (vetId: string) => void;
};

export default function VetLocationMap({ visible, vets, onClose, onSelectVet }: VetLocationMapProps) {
  const [previewVetId, setPreviewVetId] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const configuredGoogleMapsApiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasGoogleMapsApiKey = Boolean(configuredGoogleMapsApiKey?.trim());
  const safeVets = vets.filter((vet) => Number.isFinite(vet.latitude) && Number.isFinite(vet.longitude));
  const latitudeValues = safeVets.map((vet) => vet.latitude);
  const longitudeValues = safeVets.map((vet) => vet.longitude);
  const latitudeSpan = Math.max(...latitudeValues, 0) - Math.min(...latitudeValues, 0);
  const longitudeSpan = Math.max(...longitudeValues, 0) - Math.min(...longitudeValues, 0);
  const mapCenter = {
    latitude: safeVets.length ? latitudeValues.reduce((sum, value) => sum + value, 0) / safeVets.length : 0,
    longitude: safeVets.length ? longitudeValues.reduce((sum, value) => sum + value, 0) / safeVets.length : 0,
  };
  const mapZoom = Math.max(3, Math.min(14, 12 - Math.log2(Math.max(latitudeSpan, longitudeSpan, 0.02) / 0.02)));
  const appleMarkers = safeVets.map((vet) => ({
    id: vet.id,
    coordinates: { latitude: vet.latitude, longitude: vet.longitude },
    title: `${vet.full_name} - ${vet.specialty || 'Veterinarian'}`,
    tintColor: '#DC2626',
  }));
  const googleMarkers = safeVets.map((vet) => ({
    id: vet.id,
    coordinates: { latitude: vet.latitude, longitude: vet.longitude },
    title: vet.full_name,
    snippet: vet.specialty || 'Veterinarian',
    showCallout: false,
  }));
  const previewVet = safeVets.find((vet) => vet.id === previewVetId) || null;
  const previewCardPosition = previewVet && mapSize.width > 0 && mapSize.height > 0
    ? (() => {
        const visibleLongitudeSpan = Math.max(longitudeSpan * 1.8, 0.04);
        const visibleLatitudeSpan = Math.max(latitudeSpan * 1.8, 0.04);
        const x = ((previewVet.longitude - (mapCenter.longitude - visibleLongitudeSpan / 2)) / visibleLongitudeSpan) * mapSize.width;
        const y = ((mapCenter.latitude + visibleLatitudeSpan / 2 - previewVet.latitude) / visibleLatitudeSpan) * mapSize.height;
        const cardWidth = Math.min(300, mapSize.width * 0.82);
        const cardHeight = 124;
        return {
          left: Math.max(8, Math.min(mapSize.width - cardWidth - 8, x - cardWidth / 2)),
          top: Math.max(8, Math.min(mapSize.height - cardHeight - 8, y - cardHeight - 18)),
          width: cardWidth,
        };
      })()
    : null;
  const handleMarkerPress = (vetId?: string) => {
    if (!vetId) return;
    if (previewVetId === vetId) {
      setPreviewVetId(null);
      onSelectVet(vetId);
      return;
    }
    setPreviewVetId(vetId);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Veterinarian locations</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close veterinarian locations map">
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.mapContainer} onLayout={(event) => setMapSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          {safeVets.length === 0 ? (
            <MapUnavailable />
          ) : Platform.OS === 'ios' ? (
            <MapErrorBoundary fallback={<MapUnavailable />}>
              <AppleMaps.View
                style={styles.map}
                cameraPosition={{ coordinates: mapCenter, zoom: mapZoom }}
                markers={appleMarkers}
                uiSettings={{ compassEnabled: true, scaleBarEnabled: true }}
                onMarkerClick={(marker) => handleMarkerPress(marker.id)}
                onMapClick={() => setPreviewVetId(null)}
              />
            </MapErrorBoundary>
          ) : hasGoogleMapsApiKey ? (
            <MapErrorBoundary fallback={<MapUnavailable />}>
              <GoogleMaps.View
                style={styles.map}
                cameraPosition={{ coordinates: mapCenter, zoom: mapZoom }}
                markers={googleMarkers}
                uiSettings={{
                  compassEnabled: true,
                  rotationGesturesEnabled: true,
                  scrollGesturesEnabled: true,
                  tiltGesturesEnabled: true,
                  zoomControlsEnabled: true,
                  zoomGesturesEnabled: true,
                }}
                onMarkerClick={(marker) => handleMarkerPress(marker.id)}
                onMapClick={() => setPreviewVetId(null)}
              />
            </MapErrorBoundary>
            ) : (
              <MapUnavailable />
          )}
          {previewVet ? (
            <View style={[styles.previewCard, previewCardPosition || styles.previewCardFallback]}>
              <Text style={styles.previewName}>{previewVet.full_name}</Text>
              <Text style={styles.previewSpecialty}>{previewVet.specialty || 'Veterinarian'}</Text>
              <TouchableOpacity style={styles.previewButton} onPress={() => { setPreviewVetId(null); onSelectVet(previewVet.id); }}>
                <Text style={styles.previewButtonText}>View profile</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <ScrollView style={styles.locationList} contentContainerStyle={styles.locationListContent} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.listTitle}>Explore Veterinarians</Text>
          {safeVets.map((vet) => (
            <TouchableOpacity key={vet.id} style={styles.locationRow} onPress={() => onSelectVet(vet.id)}>
              <MaterialCommunityIcons name="map-marker" size={20} color="#10B981" />
              <View style={styles.locationCopy}>
                <Text style={styles.vetName}>{vet.full_name}</Text>
                <Text style={styles.specialty}>{vet.specialty || 'Veterinarian'}</Text>
                <Text style={styles.coordinates}>{formatVetLocation(vet)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function formatVetLocation(vet: MapVet) {
  const location = [vet.city, vet.state].filter(Boolean).join(', ') || 'Location Pending';
  const distance = vet.distanceKm !== null
    ? `${vet.distanceKm < 10 ? vet.distanceKm.toFixed(1) : Math.round(vet.distanceKm)} km away`
    : null;
  return distance ? `${location} • ${distance}` : location;
}

function MapUnavailable() {
  return (
    <View style={styles.mapUnavailable}>
      <MaterialCommunityIcons name="map-marker-off-outline" size={42} color="#94A3B8" />
      <Text style={styles.mapUnavailableTitle}>Map unavailable</Text>
      <Text style={styles.mapUnavailableText}>Veterinarian locations are still available in the list below.</Text>
    </View>
  );
}

class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[VetLocationMap] Native map failed; showing list fallback:', error, errorInfo);
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
  previewCard: { position: 'absolute', padding: 12, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', elevation: 8, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
  previewCardFallback: { top: 18, left: '9%', right: '9%', width: '82%' },
  previewName: { color: '#0F172A', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  previewSpecialty: { color: '#334155', fontSize: 12, marginTop: 4, flexShrink: 1 },
  previewButton: { backgroundColor: '#10B981', borderRadius: 6, paddingVertical: 9, marginTop: 10, alignItems: 'center', width: '100%' },
  previewButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  locationCopy: { flex: 1 },
  vetName: { color: '#FFFFFF', fontWeight: '700' },
  specialty: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  coordinates: { color: '#6EE7B7', fontSize: 11, marginTop: 3 },
});
