import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useImage } from 'expo-image';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { Modal, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MapVet = {
  id: string;
  full_name: string;
  specialty?: string;
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
  const markerIcon = useImage(require('../assets/images/vet-marker.svg'));
  const latitudeValues = vets.map((vet) => vet.latitude);
  const longitudeValues = vets.map((vet) => vet.longitude);
  const latitudeSpan = Math.max(...latitudeValues, 0) - Math.min(...latitudeValues, 0);
  const longitudeSpan = Math.max(...longitudeValues, 0) - Math.min(...longitudeValues, 0);
  const mapCenter = {
    latitude: vets.length ? latitudeValues.reduce((sum, value) => sum + value, 0) / vets.length : 0,
    longitude: vets.length ? longitudeValues.reduce((sum, value) => sum + value, 0) / vets.length : 0,
  };
  const mapZoom = Math.max(3, Math.min(14, 12 - Math.log2(Math.max(latitudeSpan, longitudeSpan, 0.02) / 0.02)));
  const appleMarkers = vets.map((vet) => ({
    id: vet.id,
    coordinates: { latitude: vet.latitude, longitude: vet.longitude },
    title: `${vet.full_name} - ${vet.specialty || 'Veterinarian'}`,
    icon: markerIcon ?? undefined,
    tintColor: '#DC2626',
  }));
  const googleMarkers = vets.map((vet) => ({
    id: vet.id,
    coordinates: { latitude: vet.latitude, longitude: vet.longitude },
    title: vet.full_name,
    snippet: vet.specialty || 'Veterinarian',
    icon: markerIcon ?? undefined,
    showCallout: true,
  }));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Veterinarian locations</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close veterinarian locations map">
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.mapContainer}>
          {Platform.OS === 'ios' ? (
            <AppleMaps.View
              style={styles.map}
              cameraPosition={{ coordinates: mapCenter, zoom: mapZoom }}
              markers={appleMarkers}
              uiSettings={{ compassEnabled: true, scaleBarEnabled: true }}
              onMarkerClick={(marker) => { if (marker.id) onSelectVet(marker.id); }}
            />
          ) : (
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
                onMarkerClick={(marker) => { if (marker.id) onSelectVet(marker.id); }}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
});
