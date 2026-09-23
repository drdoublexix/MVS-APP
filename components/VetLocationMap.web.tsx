import { MaterialCommunityIcons } from '@expo/vector-icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import './VetLocationMap.web.css';

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
  const center = vets[0] || { latitude: 0, longitude: 0 };
  const markerIcon = L.divIcon({
    className: 'mvs-vet-marker',
    html: '<span>+</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Veterinarian locations</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close veterinarian locations map">
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.mapFrame}>
          <MapContainer center={[center.latitude, center.longitude]} zoom={6} style={styles.map} scrollWheelZoom>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitVetBounds vets={vets} />
            {vets.map((vet) => (
              <Marker key={vet.id} position={[vet.latitude, vet.longitude]} icon={markerIcon}>
                <Popup>
                  <View style={styles.popup}>
                    <Text style={styles.popupName}>{vet.full_name}</Text>
                    <Text style={styles.popupSpecialty}>{vet.specialty || 'Veterinarian'}</Text>
                    <TouchableOpacity style={styles.popupButton} onPress={() => onSelectVet(vet.id)}>
                      <Text style={styles.popupButtonText}>View profile</Text>
                    </TouchableOpacity>
                  </View>
                </Popup>
              </Marker>
            ))}
            {vets.map((vet) => <CircleMarker key={`circle-${vet.id}`} center={[vet.latitude, vet.longitude]} radius={5} pathOptions={{ color: '#FFFFFF', fillColor: '#DC2626', fillOpacity: 1, weight: 2 }} />)}
          </MapContainer>
        </View>
        <ScrollView style={styles.locationList} contentContainerStyle={styles.locationListContent} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.listTitle}>Explore Veterinarians</Text>
          {vets.map((vet) => (
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

function FitVetBounds({ vets }: { vets: MapVet[] }) {
  const map = useMap();

  useEffect(() => {
    if (vets.length > 1) {
      map.fitBounds(vets.map((vet) => [vet.latitude, vet.longitude] as [number, number]), { padding: [24, 24] });
    }
  }, [map, vets]);

  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  mapFrame: { height: '48%', backgroundColor: '#CBD5E1' },
  map: { width: '100%', height: '100%' },
  locationList: { flex: 1 },
  locationListContent: { padding: 16, paddingBottom: 28 },
  listTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  locationCopy: { flex: 1 },
  vetName: { color: '#FFFFFF', fontWeight: '700' },
  specialty: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  coordinates: { color: '#6EE7B7', fontSize: 11, marginTop: 3 },
  popup: { minWidth: 150, padding: 2 },
  popupName: { color: '#0F172A', fontWeight: '700' },
  popupSpecialty: { color: '#475569', fontSize: 12, marginTop: 2 },
  popupButton: { backgroundColor: '#DC2626', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 6, marginTop: 8, alignItems: 'center' },
  popupButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
