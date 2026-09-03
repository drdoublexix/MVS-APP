import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, normalizeUuid, supabase } from '../../lib/supabase';

type VetProfile = {
  id: string;
  full_name: string;
  role: string;
  specialty?: string;
  title?: string;
  clinic_name?: string;
  bio?: string;
  email?: string;
  created_at?: string;
};

type Category = 'Emergency Request' | 'Vaccination' | 'Pet Checks' | 'General Inquiry' | 'Others';

const categories: Category[] = ['Emergency Request', 'Vaccination', 'Pet Checks', 'General Inquiry', 'Others'];

export default function VetsScreen() {
  const router = useRouter();
  const [vets, setVets] = useState<VetProfile[]>([]);
  const [selectedVet, setSelectedVet] = useState<VetProfile | null>(null);
  const [intakeVet, setIntakeVet] = useState<VetProfile | null>(null);
  const [intakeMode, setIntakeMode] = useState('Online Consultation');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadVets = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'vet')
          .order('created_at', { ascending: false });

        console.log('Vet directory raw profile rows:', data);

        if (!isMounted) return;
        if (error) throw error;
        setVets((data || []) as VetProfile[]);
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

  const startChat = async (category: Category) => {
    if (!intakeVet) return;
    const doctorId = normalizeUuid(intakeVet.id);
    const user = await getCurrentUser();
    const userId = normalizeUuid(user?.id);
    if (!doctorId || !userId) return;
    setIntakeVet(null);
    const conversationId = `conv_${[userId, doctorId].sort().join('_')}`;
    const initialMessage = `Hello Dr. ${intakeVet.full_name}, I would like to inquire about: ${category}.`;
    router.push({
      pathname: '/chat',
      params: {
        conversationId,
        category,
        vet: intakeVet.full_name,
        clinic: intakeVet.clinic_name || 'Veterinary Clinic',
        receiver_id: doctorId,
        vet_id: doctorId,
        starterMessage: initialMessage,
      },
    });
  };

  const directChat = (vet: VetProfile) => {
    openIntake(vet, 'Online Consultation');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Veterinarians</Text>
        <MaterialCommunityIcons name="map-marker-radius" size={24} color="#3B82F6" />
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
              const specialty = vet.specialty || vet.title || 'Veterinarian';
              return (
                <View key={vet.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <MaterialCommunityIcons name="doctor" size={28} color="#FFFFFF" />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.doctor}>{vet.full_name}</Text>
                      <Text style={styles.clinic}>{specialty}</Text>
                    </View>
                  </View>

                  <Text style={styles.bioText} numberOfLines={2}>
                    {vet.bio || 'Dedicated to compassionate pet care and preventive treatment plans.'}
                  </Text>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => setSelectedVet(vet)}>
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

      <Modal visible={Boolean(selectedVet)} animationType="slide" transparent onRequestClose={() => setSelectedVet(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {selectedVet && (
              <ScrollView>
                <TouchableOpacity style={styles.close} onPress={() => setSelectedVet(null)}>
                  <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.profileAvatar}>
                  <MaterialCommunityIcons name="doctor" size={52} color="#FFFFFF" />
                </View>
                <Text style={styles.modalDoctor}>{selectedVet.full_name}</Text>
                <Text style={styles.modalClinic}>{selectedVet.specialty || selectedVet.title || 'Veterinarian'}</Text>
                <Text style={styles.modalClinic}>{selectedVet.clinic_name || 'Trusted Care Clinic'}</Text>
                <Text style={styles.aboutTitle}>About Doctor</Text>
                <Text style={styles.bio}>{selectedVet.bio || 'Compassionate veterinary care for healthy pets and peace of mind for families.'}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.online} onPress={() => openIntake(selectedVet, 'Online Consultation')}>
                    <Text style={styles.actionText}>Online Consultation</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.chat} onPress={() => openIntake(selectedVet, 'Online Consultation')}>
                    <Text style={styles.chatText}>Proceed to Chat</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(intakeVet)} animationType="slide" transparent onRequestClose={() => setIntakeVet(null)}>
        <View style={styles.overlay}>
          <View style={styles.intake}>
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
  list: { padding: 16 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { color: '#94A3B8', marginTop: 20, textAlign: 'center' },
  card: { backgroundColor: '#1E293B', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  flex: { flex: 1 },
  doctor: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  clinic: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  bioText: { color: '#CBD5E1', marginTop: 12, lineHeight: 20 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 16 },
  secondaryButton: { flex: 1, backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  secondaryText: { color: '#E2E8F0', fontWeight: '700' },
  primaryButton: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  modal: { maxHeight: '88%', backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22 },
  close: { alignSelf: 'flex-end' },
  profileAvatar: { width: 92, height: 92, borderRadius: 28, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginTop: 6 },
  modalDoctor: { color: '#FFFFFF', fontWeight: '700', fontSize: 23, textAlign: 'center', marginTop: 14 },
  modalClinic: { color: '#94A3B8', textAlign: 'center', marginTop: 4 },
  aboutTitle: { color: '#FFFFFF', fontWeight: '700', marginTop: 22 },
  bio: { color: '#E2E8F0', lineHeight: 22, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  online: { flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  actionText: { color: '#FFFFFF', fontWeight: '700' },
  chat: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  chatText: { color: '#FFFFFF', fontWeight: '700' },
  intake: { maxHeight: '70%', backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  category: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 10, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#334155' },
  categoryText: { color: '#FFFFFF', fontWeight: '600' },
});
