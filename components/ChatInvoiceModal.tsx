import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { getCurrentUser, sendRealtimeMessage } from '../lib/supabase';

interface ChatInvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  patientName: string;
  petName: string;
}

export const ChatInvoiceModal: React.FC<ChatInvoiceModalProps> = ({
  visible,
  onClose,
  patientName,
  petName,
}) => {
  const [items, setItems] = useState([
    { description: 'Consultation', amount: 2000 },
    { description: 'Examination', amount: 1000 },
  ]);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const platformFee = subtotal * 0.1;
  const vetEarnings = subtotal * 0.9;
  const total = subtotal + platformFee;

  const handleAddItem = () => {
    if (newItemDesc && newItemAmount) {
      setItems([
        ...items,
        { description: newItemDesc, amount: parseFloat(newItemAmount) },
      ]);
      setNewItemDesc('');
      setNewItemAmount('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSendInvoice = async () => {
    const user = await getCurrentUser();
    if (user) {
      await sendRealtimeMessage({ conversation_id: patientName, sender_id: user.id, receiver_id: petName, content: `Invoice: ${items.map((item) => item.description).join(', ')}`, message_type: 'invoice', metadata: { items, subtotal, platformFee, total, vetEarnings } });
    }
    alert('Invoice sent to patient!');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invoice Generator</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          {/* Patient Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Patient Information</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Client Name</Text>
              <Text style={styles.infoValue}>{patientName}</Text>
              <Text style={styles.infoLabel}>Pet Name</Text>
              <Text style={styles.infoValue}>{petName}</Text>
            </View>
          </View>

          {/* Invoice Items */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invoice Items</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                </View>
                <Text style={styles.itemAmount}>₦{item.amount.toLocaleString()}</Text>
                <TouchableOpacity onPress={() => handleRemoveItem(index)}>
                  <MaterialCommunityIcons name="delete" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Add New Item */}
            <View style={styles.addItemForm}>
              <TextInput
                style={styles.input}
                placeholder="Service description"
                value={newItemDesc}
                onChangeText={setNewItemDesc}
              />
              <TextInput
                style={styles.input}
                placeholder="Amount (₦)"
                value={newItemAmount}
                onChangeText={setNewItemAmount}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddItem}
              >
                <MaterialCommunityIcons name="plus" size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>₦{subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Platform Fee (10%)</Text>
              <Text style={styles.summaryValue}>₦{Math.round(platformFee).toLocaleString()}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelBold}>Total (Incl. Fee)</Text>
              <Text style={styles.summaryValueBold}>₦{Math.round(total).toLocaleString()}</Text>
            </View>
            <View style={styles.earningsBox}>
              <Text style={styles.earningsLabel}>Your Earnings (90%)</Text>
              <Text style={styles.earningsAmount}>₦{Math.round(vetEarnings).toLocaleString()}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.sendButton} onPress={handleSendInvoice}>
              <MaterialCommunityIcons name="send" size={20} color="white" />
              <Text style={styles.sendButtonText}>Send Invoice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  itemDetails: {
    flex: 1,
  },
  itemDesc: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a7ea4',
    marginRight: 12,
  },
  addItemForm: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#0a7ea4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryLabelBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  summaryValueBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a7ea4',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  earningsBox: {
    backgroundColor: '#e8f4f8',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: 12,
    color: '#0a7ea4',
    marginBottom: 4,
  },
  earningsAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0a7ea4',
  },
  buttonGroup: {
    gap: 12,
  },
  sendButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    borderRadius: 8,
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});
