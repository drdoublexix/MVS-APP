import { MaterialCommunityIcons } from '@expo/vector-icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { VeterinaryClinic } from '../lib/clinics';
import './ClinicLocationMap.web.css';

type Props = {
  visible: boolean;
  clinics: VeterinaryClinic[];
  onClose: () => void;
  onSelectClinic: (clinicId: string) => void;
};

const NIGERIA_CENTER: [number, number] = [9.08, 8.67];

export default function ClinicLocationMap({ visible, clinics, onClose, onSelectClinic }: Props) {
  const center = clinics[0] ? [clinics[0].latitude, clinics[0].longitude] as [number, number] : NIGERIA_CENTER;
  const markerIcon = L.divIcon({
    className: 'mvs-clinic-marker',
    html: '<span>+</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Veterinary clinics</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close clinic locations map">
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.mapFrame}>
          <MapContainer center={center} zoom={clinics.length ? 6 : 5} style={styles.map} scrollWheelZoom>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitClinicBounds clinics={clinics} />
            {clinics.map((clinic) => (
              <Marker key={clinic.id} position={[clinic.latitude, clinic.longitude]} icon={markerIcon}>
                <Popup>
                  <View style={styles.popup}>
                    <Text style={styles.popupName}>{clinic.clinic_name}</Text>
                    <Text style={styles.popupSpecialty}>{clinic.practice_specialties.join(', ')}</Text>
                    <TouchableOpacity style={styles.popupButton} onPress={() => onSelectClinic(clinic.id)}>
                      <Text style={styles.popupButtonText}>View clinic</Text>
                    </TouchableOpacity>
                  </View>
                </Popup>
              </Marker>
            ))}
            {clinics.map((clinic) => (
              <CircleMarker
                key={`circle-${clinic.id}`}
                center={[clinic.latitude, clinic.longitude]}
                radius={5}
                pathOptions={{ color: '#FFFFFF', fillColor: '#2563EB', fillOpacity: 1, weight: 2 }}
              />
            ))}
          </MapContainer>
        </View>
        <ScrollView style={styles.locationList} contentContainerStyle={styles.locationListContent} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.listTitle}>Explore Vet Clinics</Text>
          {clinics.length === 0 ? <Text style={styles.empty}>No veterinary clinics have been listed yet.</Text> : null}
          {clinics.map((clinic) => (
            <TouchableOpacity key={clinic.id} style={styles.locationRow} onPress={() => onSelectClinic(clinic.id)}>
              <MaterialCommunityIcons name="map-marker" size={20} color="#60A5FA" />
              <View style={styles.locationCopy}>
                <Text style={styles.clinicName}>{clinic.clinic_name}</Text>
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
  const location = [clinic.city, clinic.state].filter(Boolean).join(', ');
  const distance = clinic.distanceKm !== null
    ? `${clinic.distanceKm < 10 ? clinic.distanceKm.toFixed(1) : Math.round(clinic.distanceKm)} km away`
    : null;
  return [location || clinic.address, distance].filter(Boolean).join(' • ');
}

function FitClinicBounds({ clinics }: { clinics: VeterinaryClinic[] }) {
  const map = useMap();

  useEffect(() => {
    if (clinics.length > 1) {
      map.fitBounds(clinics.map((clinic) => [clinic.latitude, clinic.longitude] as [number, number]), { padding: [24, 24] });
    } else if (clinics.length === 1) {
      map.setView([clinics[0].latitude, clinics[0].longitude], 10);
    } else {
      map.setView(NIGERIA_CENTER, 5);
    }
  }, [clinics, map]);

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
  clinicName: { color: '#FFFFFF', fontWeight: '700' },
  specialty: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  location: { color: '#93C5FD', fontSize: 11, marginTop: 3 },
  popup: { minWidth: 150, padding: 2 },
  popupName: { color: '#0F172A', fontWeight: '700' },
  popupSpecialty: { color: '#475569', fontSize: 12, marginTop: 2 },
  popupButton: { backgroundColor: '#2563EB', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 6, marginTop: 8, alignItems: 'center' },
  popupButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  empty: { color: '#CBD5E1', fontSize: 13, lineHeight: 20, paddingVertical: 10 },
});
