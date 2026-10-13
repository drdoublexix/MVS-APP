import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createPulletRearingPlanMhtml } from '../lib/pulletRearingPlan';

type Props = {
  audience: 'vet' | 'client';
  compact?: boolean;
  tight?: boolean;
};

const MAX_BIRDS = 1_000_000;

export default function PulletRearingPlanGenerator({ audience, compact = false, tight = false }: Props) {
  const [visible, setVisible] = useState(false);
  const [clientName, setClientName] = useState('');
  const [birdCount, setBirdCount] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const close = () => setVisible(false);

  const generatePlan = async () => {
    const birds = Number(birdCount);
    if (!Number.isInteger(birds) || birds < 1 || birds > MAX_BIRDS) {
      const message = `Enter a whole number of birds from 1 to ${MAX_BIRDS.toLocaleString()}.`;
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Check bird count', message);
      return;
    }

    const name = clientName.trim();
    if (audience === 'vet' && !name) {
      const message = 'Enter the client’s full name to prepare the plan.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Client name required', message);
      return;
    }

    setIsGenerating(true);
    try {
      const documentContent = createPulletRearingPlanMhtml({
        birds,
        clientName: audience === 'vet' ? name : undefined,
        includeEstimatedPrices: false,
      });
      const filename = `mvs-pullet-rearing-plan-${birds}-birds-${Date.now()}.mht`;

      if (Platform.OS === 'web') {
        const file = new Blob([documentContent], { type: 'application/x-mimearchive' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }

      if (!FileSystem.cacheDirectory) throw new Error('Temporary document storage is unavailable.');
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, documentContent, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/x-mimearchive',
        dialogTitle: 'Save or share your MVS Pullet Rearing Plan',
      });
    } catch (error) {
      console.error('[Pullet Rearing Plan] Could not generate the document:', error);
      const message = error instanceof Error ? error.message : 'Could not generate the plan. Please try again.';
      if (Platform.OS === 'web') window.alert(`Plan export failed\n\n${message}`);
      else Alert.alert('Plan export failed', message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.compactTrigger, tight && styles.tightTrigger]}
        onPress={() => setVisible(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open MVS Pullet Rearing Plan Generator"
      >
        <View style={styles.icon}>
          <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#34D399" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Pullet Rearing Plan</Text>
          <Text style={styles.subtitle}>Create a layer flock plan through point of lay</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={23} color="#6EE7B7" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#34D399" />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Pullet Rearing Plan</Text>
                <Text style={styles.subtitle}>Layer flock plan through point of lay</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeButton} accessibilityLabel="Close pullet rearing plan">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.introTitle}>Build your flock plan</Text>
              <Text style={styles.note}>
                {audience === 'vet'
                  ? 'Your Word document includes quantities and blank price fields for local quotes.'
                  : 'Your plan includes quantities and blank price fields because local prices can change quickly.'}
              </Text>
              {audience === 'vet' ? (
                <>
                  <Text style={styles.label}>Client’s full name</Text>
                  <TextInput
                    value={clientName}
                    onChangeText={setClientName}
                    placeholder="Enter the client’s full name"
                    placeholderTextColor="#94A3B8"
                    style={styles.input}
                    autoCapitalize="words"
                    maxLength={120}
                    accessibilityLabel="Client’s full name"
                  />
                </>
              ) : null}
              <Text style={styles.label}>Number of birds</Text>
              <TextInput
                value={birdCount}
                onChangeText={(value) => setBirdCount(value.replace(/\D/g, ''))}
                placeholder="e.g. 100"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={7}
                accessibilityLabel="Number of birds"
              />
              <TouchableOpacity
                style={[styles.generateButton, isGenerating && styles.disabledButton]}
                onPress={() => void generatePlan()}
                disabled={isGenerating}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <MaterialCommunityIcons name="download" size={19} color="#FFFFFF" />
                )}
                <Text style={styles.generateButtonText}>{isGenerating ? 'Preparing plan…' : 'Generate Word document'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    backgroundColor: '#14253B',
    borderColor: '#27456A',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    minHeight: 76,
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  compactTrigger: {
    flex: 1,
    marginTop: 0,
    minHeight: 76,
    paddingHorizontal: 10,
  },
  tightTrigger: {
    marginTop: 0,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: '#164E41',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  copy: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: '#A7D7CA',
    fontSize: 11,
    marginTop: 4,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    maxHeight: '88%',
    maxWidth: 500,
    minHeight: 330,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 22 : 12,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#243246',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#102E2A',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  closeButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 18,
    paddingBottom: 24,
  },
  introTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 5,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderRadius: 10,
    borderWidth: 1,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  note: {
    color: '#A7D7CA',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  generateButton: {
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  disabledButton: {
    backgroundColor: '#334155',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
