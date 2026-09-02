import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const CONSULTATIONS = [
  {
    id: '1',
    clientName: 'Sarah Johnson',
    petName: 'Max',
    petType: 'Golden Retriever',
    status: 'pending',
    requestTime: '30 mins ago',
    issue: 'Vaccination check-up',
  },
  {
    id: '2',
    clientName: 'John Doe',
    petName: 'Whiskers',
    petType: 'Cat',
    status: 'pending',
    requestTime: '1 hour ago',
    issue: 'Skin irritation',
  },
];

export default function ConsultationRequestsScreen() {
  const renderConsultationItem = ({ item }: any) => (
    <View style={styles.consultCard}>
      <View style={styles.consultHeader}>
        <View>
          <Text style={styles.clientName}>{item.clientName}</Text>
          <Text style={styles.petInfo}>{item.petName} • {item.petType}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.consultDetails}>
        <MaterialCommunityIcons name="information" size={16} color="#999" />
        <Text style={styles.issueText}>{item.issue}</Text>
      </View>

      <Text style={styles.requestTime}>{item.requestTime}</Text>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.acceptBtn}>
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn}>
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Consultation Requests</Text>
      </View>
      <FlatList
        data={CONSULTATIONS}
        renderItem={renderConsultationItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  consultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  consultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  petInfo: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    backgroundColor: '#FFF5E5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFB800',
  },
  consultDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  issueText: {
    fontSize: 12,
    color: '#666',
  },
  requestTime: {
    fontSize: 11,
    color: '#999',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#22C55E',
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  declineBtnText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
