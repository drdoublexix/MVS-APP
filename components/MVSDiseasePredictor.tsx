import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Species = 'Dog' | 'Cat' | 'Poultry' | 'Swine' | 'Goat' | 'Cattle';
type Symptom =
  | 'Loss of appetite'
  | 'Weight loss'
  | 'Diarrhea'
  | 'Vomiting'
  | 'Fever'
  | 'Lethargy'
  | 'Somnolence (unusually sleepy)'
  | 'Inactive or less responsive than usual'
  | 'Reduced agility or reluctance to move'
  | 'Coughing'
  | 'Difficulty breathing'
  | 'Greenish diarrhea or droppings'
  | 'White or creamy droppings'
  | 'Brownish diarrhea or droppings'
  | 'Bloody diarrhea'
  | 'Dark, unclotted blood from body openings'
  | 'Sudden unexplained death'
  | 'Neurologic signs (tremors, twisted neck, or paralysis)'
  | 'Excessive thirst'
  | 'Frequent urination'
  | 'Rashes'
  | 'Skin irritation'
  | 'Hair loss'
  | 'Limping'
  | 'Swelling'
  | 'Discharge from eyes/nose'
  | 'Abnormal posture'
  | 'Limb inflammation'
  | 'Behavioral changes';

type Differential = {
  name: string;
  symptoms: Symptom[];
  note: string;
};

type Match = {
  name: string;
  percentage: number;
  matchedSymptoms: Symptom[];
  note: string;
};

type Props = {
  onContactVet?: () => void;
  compact?: boolean;
};

const species: Species[] = ['Dog', 'Cat', 'Poultry', 'Swine', 'Goat', 'Cattle'];

const symptoms: Symptom[] = [
  'Loss of appetite',
  'Weight loss',
  'Diarrhea',
  'Vomiting',
  'Fever',
  'Lethargy',
  'Somnolence (unusually sleepy)',
  'Inactive or less responsive than usual',
  'Reduced agility or reluctance to move',
  'Coughing',
  'Difficulty breathing',
  'Greenish diarrhea or droppings',
  'White or creamy droppings',
  'Brownish diarrhea or droppings',
  'Bloody diarrhea',
  'Dark, unclotted blood from body openings',
  'Sudden unexplained death',
  'Neurologic signs (tremors, twisted neck, or paralysis)',
  'Excessive thirst',
  'Frequent urination',
  'Rashes',
  'Skin irritation',
  'Hair loss',
  'Limping',
  'Swelling',
  'Discharge from eyes/nose',
  'Abnormal posture',
  'Limb inflammation',
  'Behavioral changes',
];

const diseaseMatrix: Record<Species, Differential[]> = {
  Dog: [
    { name: 'Canine parvovirus', symptoms: ['Vomiting', 'Diarrhea', 'Bloody diarrhea', 'Fever', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Loss of appetite'], note: 'A contagious, potentially severe intestinal infection. Bloody diarrhea is an emergency warning sign, especially in puppies; seek veterinary care promptly.' },
    { name: 'Acute gastroenteritis', symptoms: ['Vomiting', 'Diarrhea', 'Loss of appetite', 'Lethargy'], note: 'Stomach or intestinal irritation has many possible causes and can lead to dehydration.' },
    { name: 'Canine distemper', symptoms: ['Coughing', 'Discharge from eyes/nose', 'Fever', 'Lethargy', 'Loss of appetite'], note: 'A serious contagious viral disease, particularly in unvaccinated dogs.' },
    { name: 'Infectious respiratory disease (including kennel cough)', symptoms: ['Coughing', 'Discharge from eyes/nose', 'Fever'], note: 'Respiratory infections have overlapping signs and may need examination and testing.' },
    { name: 'Musculoskeletal injury or joint disease', symptoms: ['Limping', 'Swelling', 'Limb inflammation', 'Abnormal posture'], note: 'Injury and joint conditions can look similar; sudden or severe lameness needs assessment.' },
    { name: 'Allergic or parasitic skin disease', symptoms: ['Rashes', 'Skin irritation', 'Hair loss', 'Behavioral changes'], note: 'Skin signs can have allergic, infectious or parasite-related causes.' },
    { name: 'Diabetes mellitus or kidney disease', symptoms: ['Excessive thirst', 'Frequent urination', 'Weight loss', 'Loss of appetite', 'Lethargy'], note: 'Increased thirst and urination warrant veterinary testing.' },
  ],
  Cat: [
    { name: 'Feline panleukopenia', symptoms: ['Vomiting', 'Diarrhea', 'Fever', 'Lethargy', 'Loss of appetite'], note: 'A severe contagious disease, especially in kittens and unvaccinated cats.' },
    { name: 'Feline upper respiratory infection', symptoms: ['Coughing', 'Discharge from eyes/nose', 'Fever', 'Loss of appetite', 'Lethargy'], note: 'Several viruses and bacteria can cause similar respiratory signs.' },
    { name: 'Feline lower urinary tract disease', symptoms: ['Frequent urination', 'Abnormal posture', 'Behavioral changes', 'Loss of appetite', 'Lethargy'], note: 'Straining or inability to pass urine is an emergency, particularly in male cats.' },
    { name: 'Kidney disease or diabetes mellitus', symptoms: ['Excessive thirst', 'Frequent urination', 'Weight loss', 'Vomiting', 'Loss of appetite'], note: 'These conditions require examination and diagnostic testing to distinguish.' },
    { name: 'Gastrointestinal disease', symptoms: ['Vomiting', 'Diarrhea', 'Loss of appetite', 'Weight loss', 'Lethargy'], note: 'Persistent digestive signs can have many causes and risk dehydration.' },
    { name: 'Allergic or parasitic skin disease', symptoms: ['Rashes', 'Skin irritation', 'Hair loss', 'Behavioral changes'], note: 'Itching and hair loss can result from parasites, allergy or infection.' },
  ],
  Poultry: [
    { name: 'Newcastle disease', symptoms: ['Difficulty breathing', 'Coughing', 'Diarrhea', 'Greenish diarrhea or droppings', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Reduced agility or reluctance to move', 'Neurologic signs (tremors, twisted neck, or paralysis)', 'Loss of appetite'], note: 'A highly contagious poultry disease. Greenish diarrhea and respiratory or neurologic signs can occur but are not specific to Newcastle disease. Isolate affected birds and contact a veterinarian promptly.' },
    { name: 'Avian influenza', symptoms: ['Difficulty breathing', 'Coughing', 'Diarrhea', 'Greenish diarrhea or droppings', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Fever', 'Loss of appetite', 'Swelling', 'Sudden unexplained death'], note: 'A serious reportable disease in many regions. Avoid handling sick or dead birds and seek veterinary or animal-health authority advice promptly.' },
    { name: 'Infectious bronchitis', symptoms: ['Difficulty breathing', 'Coughing', 'Discharge from eyes/nose', 'Loss of appetite', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual'], note: 'A contagious respiratory infection; other poultry diseases may appear similar.' },
    { name: 'Coccidiosis or other intestinal disease', symptoms: ['Diarrhea', 'Brownish diarrhea or droppings', 'Bloody diarrhea', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Reduced agility or reluctance to move', 'Loss of appetite', 'Weight loss', 'Abnormal posture'], note: 'Coccidiosis can cause blood-stained or brownish droppings, but intestinal disease has other causes too. A veterinarian should assess affected birds and the flock.' },
    { name: 'Fowl typhoid', symptoms: ['Fever', 'Diarrhea', 'Greenish diarrhea or droppings', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Reduced agility or reluctance to move', 'Loss of appetite'], note: 'Fowl typhoid may cause depression and greenish-yellow diarrhea. These signs overlap with other infections and need veterinary assessment.' },
    { name: 'Fowl cholera', symptoms: ['Fever', 'Diarrhea', 'Greenish diarrhea or droppings', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Reduced agility or reluctance to move', 'Loss of appetite', 'Sudden unexplained death'], note: 'Fowl cholera can cause sudden illness or death and diarrhea. Droppings color alone cannot identify the cause; contact a veterinarian promptly.' },
    { name: 'Pullorum disease (white diarrhea)', symptoms: ['White or creamy droppings', 'Diarrhea', 'Lethargy', 'Somnolence (unusually sleepy)', 'Inactive or less responsive than usual', 'Loss of appetite'], note: 'White pasty droppings are especially concerning in young chicks but have several possible causes. Seek veterinary assessment and flock-level advice.' },
    { name: 'External parasites or dermatitis', symptoms: ['Rashes', 'Skin irritation', 'Hair loss', 'Loss of appetite', 'Lethargy'], note: 'Check flock condition and housing; a professional can help confirm the cause.' },
  ],
  Swine: [
    { name: 'African swine fever (suspected)', symptoms: ['Fever', 'Loss of appetite', 'Lethargy', 'Diarrhea', 'Vomiting', 'Swelling'], note: 'A serious contagious disease. Do not move pigs; contact a veterinarian or animal-health authority immediately if suspected.' },
    { name: 'Porcine respiratory disease complex', symptoms: ['Coughing', 'Difficulty breathing', 'Fever', 'Lethargy', 'Loss of appetite'], note: 'Multiple infections and management factors can cause similar respiratory signs.' },
    { name: 'Intestinal parasitism or enteric disease', symptoms: ['Diarrhea', 'Weight loss', 'Loss of appetite', 'Lethargy'], note: 'Persistent diarrhea or poor growth needs veterinary assessment and appropriate testing.' },
    { name: 'Lameness or joint/soft-tissue disease', symptoms: ['Limping', 'Swelling', 'Limb inflammation', 'Abnormal posture'], note: 'Injury, infection and joint conditions can overlap in appearance.' },
    { name: 'Mange or other skin disease', symptoms: ['Rashes', 'Skin irritation', 'Hair loss', 'Behavioral changes'], note: 'Skin signs may be caused by mites, infection or other irritation.' },
  ],
  Goat: [
    { name: 'Anthrax (suspected)', symptoms: ['Dark, unclotted blood from body openings', 'Sudden unexplained death'], note: 'Possible anthrax is a life-threatening zoonotic emergency. Do not touch, move, butcher, or open the carcass. Keep people and animals away and immediately contact a veterinarian or animal-health authority.' },
    { name: 'Peste des petits ruminants (PPR)', symptoms: ['Fever', 'Diarrhea', 'Discharge from eyes/nose', 'Difficulty breathing', 'Loss of appetite', 'Lethargy'], note: 'A serious contagious disease. Isolate affected animals and contact a veterinarian or animal-health authority promptly.' },
    { name: 'Pneumonia or other respiratory infection', symptoms: ['Coughing', 'Difficulty breathing', 'Fever', 'Discharge from eyes/nose', 'Lethargy'], note: 'Respiratory illness can worsen quickly and requires veterinary assessment.' },
    { name: 'Internal parasites or gastrointestinal disease', symptoms: ['Weight loss', 'Diarrhea', 'Loss of appetite', 'Lethargy'], note: 'A fecal examination and herd history help identify the cause.' },
    { name: 'Foot rot or limb/joint disease', symptoms: ['Limping', 'Limb inflammation', 'Swelling', 'Abnormal posture'], note: 'Prompt assessment can limit pain and spread within a herd.' },
    { name: 'Mastitis or other local infection', symptoms: ['Swelling', 'Fever', 'Loss of appetite', 'Lethargy'], note: 'The location and character of swelling matter; arrange an examination.' },
    { name: 'External parasites or skin disease', symptoms: ['Rashes', 'Skin irritation', 'Hair loss', 'Behavioral changes'], note: 'Skin conditions may spread between animals and need targeted treatment.' },
  ],
  Cattle: [
    { name: 'Bovine respiratory disease complex', symptoms: ['Coughing', 'Difficulty breathing', 'Fever', 'Discharge from eyes/nose', 'Lethargy', 'Loss of appetite'], note: 'A common but potentially serious group of respiratory conditions.' },
    { name: 'Anthrax (suspected)', symptoms: ['Dark, unclotted blood from body openings', 'Sudden unexplained death'], note: 'Possible anthrax is a life-threatening zoonotic emergency. Do not touch, move, butcher, or open the carcass. Keep people and animals away and immediately contact a veterinarian or animal-health authority.' },
    { name: 'Foot-and-mouth disease (suspected)', symptoms: ['Fever', 'Limping', 'Loss of appetite', 'Lethargy', 'Swelling'], note: 'If suspected, restrict animal movement and promptly contact a veterinarian or animal-health authority.' },
    { name: 'Bovine viral diarrhoea or enteric disease', symptoms: ['Diarrhea', 'Fever', 'Loss of appetite', 'Lethargy', 'Weight loss'], note: 'Several infectious and non-infectious conditions cause these signs; testing is needed.' },
    { name: 'Internal parasites or poor-condition syndrome', symptoms: ['Weight loss', 'Diarrhea', 'Loss of appetite', 'Lethargy'], note: 'Nutrition, parasites and chronic disease can produce overlapping signs.' },
    { name: 'Mastitis or other local infection', symptoms: ['Swelling', 'Fever', 'Loss of appetite', 'Lethargy'], note: 'The affected area and severity should be assessed by a veterinarian.' },
    { name: 'Lameness or joint/soft-tissue disease', symptoms: ['Limping', 'Limb inflammation', 'Swelling', 'Abnormal posture'], note: 'Lameness can have infectious, traumatic and management-related causes.' },
    { name: 'External parasites or skin disease', symptoms: ['Rashes', 'Skin irritation', 'Hair loss', 'Behavioral changes'], note: 'Parasites and skin infections may require herd-level control.' },
  ],
};

const makeMatches = (animal: Species, selected: Symptom[]): Match[] =>
  diseaseMatrix[animal]
    .map((condition) => {
      const matchedSymptoms = condition.symptoms.filter((symptom) => selected.includes(symptom));
      return {
        name: condition.name,
        percentage: Math.round((matchedSymptoms.length / condition.symptoms.length) * 100),
        matchedSymptoms,
        note: condition.note,
      };
    })
    .filter((condition) => condition.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage || b.matchedSymptoms.length - a.matchedSymptoms.length)
    .slice(0, 5);

export default function MVSDiseasePredictor({ onContactVet, compact = false }: Props) {
  const [visible, setVisible] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Symptom[]>([]);
  const [speciesMenuOpen, setSpeciesMenuOpen] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const hasAnthraxWarning = (selectedSpecies === 'Goat' || selectedSpecies === 'Cattle')
    && (selectedSymptoms.includes('Dark, unclotted blood from body openings')
      || selectedSymptoms.includes('Sudden unexplained death'));

  const reset = () => {
    setSelectedSpecies(null);
    setSelectedSymptoms([]);
    setSpeciesMenuOpen(false);
    setMatches(null);
  };

  const close = () => {
    setVisible(false);
    reset();
  };

  const selectSpecies = (animal: Species) => {
    setSelectedSpecies(animal);
    setSelectedSymptoms([]);
    setSpeciesMenuOpen(false);
  };

  const toggleSymptom = (symptom: Symptom) => {
    setSelectedSymptoms((current) =>
      current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom],
    );
  };

  const predict = () => {
    if (!selectedSpecies || selectedSymptoms.length === 0) return;
    setMatches(makeMatches(selectedSpecies, selectedSymptoms));
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.compactTrigger]}
        onPress={() => setVisible(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open MVS Disease Predictor"
      >
        <View style={styles.triggerIcon}>
          <MaterialCommunityIcons name="stethoscope" size={compact ? 20 : 22} color="#60A5FA" />
        </View>
        <View style={styles.triggerCopy}>
          <Text style={[styles.triggerTitle, compact && styles.compactTriggerTitle]}>MVS Disease Predictor</Text>
          {!compact ? <Text style={styles.triggerSubtitle}>Explore possible causes of observed signs</Text> : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={compact ? 20 : 25} color="#93C5FD" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="stethoscope" size={22} color="#60A5FA" />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>MVS Disease Predictor</Text>
                <Text style={styles.subtitle}>Preliminary symptom-based triage</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeButton} accessibilityLabel="Close disease predictor">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {matches ? (
              <>
                <ScrollView style={styles.contentScroll} contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>
                  <View style={styles.resultIntro}>
                    <View style={styles.resultIcon}>
                      <MaterialCommunityIcons name="clipboard-pulse-outline" size={25} color="#93C5FD" />
                    </View>
                    <Text style={styles.resultTitle}>Possible differentials</Text>
                    <Text style={styles.resultSubtitle}>{selectedSpecies} · {selectedSymptoms.length} selected {selectedSymptoms.length === 1 ? 'sign' : 'signs'}</Text>
                  </View>

                  {matches.length > 0 ? matches.map((match, index) => (
                    <View style={styles.conditionCard} key={match.name}>
                      <View style={styles.conditionHeader}>
                        <View style={styles.rankBadge}><Text style={styles.rankText}>{index + 1}</Text></View>
                        <Text style={styles.conditionName}>{match.name}</Text>
                        <Text style={styles.matchPercentage}>{match.percentage}%</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${match.percentage}%` }]} />
                      </View>
                      <Text style={styles.matchCaption}>Symptom-pattern match · not a probability of disease</Text>
                      <Text style={styles.conditionNote}>{match.note}</Text>
                      <Text style={styles.matchedLabel}>Matching selected signs</Text>
                      <View style={styles.matchedTags}>
                        {match.matchedSymptoms.map((symptom) => (
                          <Text key={symptom} style={styles.matchedTag}>{symptom}</Text>
                        ))}
                      </View>
                    </View>
                  )) : (
                    <View style={styles.noMatchCard}>
                      <MaterialCommunityIcons name="information-outline" size={21} color="#FBBF24" />
                      <Text style={styles.noMatchText}>No close pattern in the local guide matches these signs. This does not rule out illness; a veterinarian can assess other possible causes.</Text>
                    </View>
                  )}

                  <View style={styles.disclaimerCard}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#FBBF24" />
                    <Text style={styles.disclaimerText}>This tool provides preliminary educational triage and suspected differential diagnoses. It does not replace professional veterinary examination. Match percentages show overlap with a simple symptom pattern; they are not diagnostic probabilities, and droppings color alone cannot identify a disease.</Text>
                  </View>
                  <Text style={styles.urgentNote}>Seek urgent veterinary help for difficulty breathing, collapse, severe weakness, repeated vomiting, inability to urinate, or rapidly worsening signs. For suspected contagious livestock disease, isolate the animal and contact a veterinarian or animal-health authority.</Text>
                  {hasAnthraxWarning ? (
                    <Text style={styles.urgentNote}>Possible anthrax: do not touch, move, butcher, or open the carcass. Keep people and animals away and immediately contact a veterinarian or animal-health authority.</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.actions}>
                  {onContactVet ? (
                    <TouchableOpacity style={styles.contactButton} onPress={() => { setVisible(false); reset(); onContactVet(); }} accessibilityRole="button">
                      <MaterialCommunityIcons name="doctor" size={19} color="#FFFFFF" />
                      <Text style={styles.actionText}>Contact a vet</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.restartButton} onPress={reset} accessibilityRole="button">
                    <MaterialCommunityIcons name="restart" size={19} color="#FFFFFF" />
                    <Text style={styles.actionText}>Restart</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ScrollView style={styles.contentScroll} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.introTitle}>What signs have you noticed?</Text>
                  <Text style={styles.introCopy}>Choose an animal, then select every sign you have observed. Behavior changes and droppings appearance are included; droppings color alone cannot identify a disease.</Text>

                  <Text style={styles.label}>Animal species <Text style={styles.required}>*</Text></Text>
                  <TouchableOpacity
                    style={[styles.speciesPicker, speciesMenuOpen && styles.speciesPickerOpen]}
                    onPress={() => setSpeciesMenuOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel="Select animal species"
                    accessibilityState={{ expanded: speciesMenuOpen }}
                  >
                    <MaterialCommunityIcons name="paw" size={18} color={selectedSpecies ? '#93C5FD' : '#94A3B8'} />
                    <Text style={[styles.speciesValue, !selectedSpecies && styles.placeholder]}>{selectedSpecies ?? 'Choose a species'}</Text>
                    <MaterialCommunityIcons name={speciesMenuOpen ? 'chevron-up' : 'chevron-down'} size={22} color="#CBD5E1" />
                  </TouchableOpacity>
                  {speciesMenuOpen ? (
                    <View style={styles.speciesMenu}>
                      {species.map((animal) => (
                        <TouchableOpacity
                          key={animal}
                          style={[styles.speciesOption, selectedSpecies === animal && styles.speciesOptionSelected]}
                          onPress={() => selectSpecies(animal)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selectedSpecies === animal }}
                        >
                          <MaterialCommunityIcons name={animal === 'Poultry' ? 'bird' : animal === 'Cattle' ? 'cow' : animal === 'Goat' ? 'sheep' : animal === 'Swine' ? 'pig' : animal === 'Cat' ? 'cat' : 'dog'} size={18} color={selectedSpecies === animal ? '#93C5FD' : '#94A3B8'} />
                          <Text style={[styles.speciesOptionText, selectedSpecies === animal && styles.speciesOptionTextSelected]}>{animal}</Text>
                          {selectedSpecies === animal ? <MaterialCommunityIcons name="check" size={18} color="#60A5FA" /> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {selectedSpecies ? (
                    <>
                      <View style={styles.symptomHeading}>
                        <View>
                          <Text style={styles.label}>Observed symptoms <Text style={styles.required}>*</Text></Text>
                          <Text style={styles.selectionHint}>Select all that apply</Text>
                        </View>
                        <Text style={styles.selectionCount}>{selectedSymptoms.length} selected</Text>
                      </View>
                      <View style={styles.symptomGrid}>
                        {symptoms.map((symptom) => {
                          const selected = selectedSymptoms.includes(symptom);
                          return (
                            <TouchableOpacity
                              key={symptom}
                              style={[styles.symptomChip, selected && styles.symptomChipSelected]}
                              onPress={() => toggleSymptom(symptom)}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: selected }}
                            >
                              <MaterialCommunityIcons name={selected ? 'checkbox-marked-circle' : 'circle-outline'} size={17} color={selected ? '#93C5FD' : '#64748B'} />
                              <Text style={[styles.symptomText, selected && styles.symptomTextSelected]}>{symptom}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {hasAnthraxWarning ? (
                        <Text style={styles.urgentNote}>Possible anthrax is an emergency. Do not touch, move, butcher, or open the carcass. Keep people and animals away and immediately contact a veterinarian or animal-health authority.</Text>
                      ) : null}
                    </>
                  ) : null}

                  <View style={styles.disclaimerCard}>
                    <MaterialCommunityIcons name="information-outline" size={19} color="#93C5FD" />
                    <Text style={styles.disclaimerText}>This educational guide suggests possible differentials from a small local reference set. It cannot diagnose an animal or recommend treatment.</Text>
                  </View>
                </ScrollView>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.predictButton, (!selectedSpecies || selectedSymptoms.length === 0) && styles.predictButtonDisabled]}
                    onPress={predict}
                    disabled={!selectedSpecies || selectedSymptoms.length === 0}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !selectedSpecies || selectedSymptoms.length === 0 }}
                  >
                    <MaterialCommunityIcons name="magnify" size={19} color="#FFFFFF" />
                    <Text style={styles.actionText}>Predict differential diagnoses</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { backgroundColor: '#14253B', borderColor: '#27456A', borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  compactTrigger: { flex: 1, minHeight: 76, paddingHorizontal: 10, paddingVertical: 11, marginBottom: 0 },
  triggerIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center' },
  triggerCopy: { flex: 1, marginLeft: 12 },
  triggerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  compactTriggerTitle: { fontSize: 12, lineHeight: 16 },
  triggerSubtitle: { color: '#B8CBE2', fontSize: 11, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 500, height: '88%', maxHeight: '88%', minHeight: 0, backgroundColor: '#0F172A', borderRadius: 20, overflow: 'hidden', paddingBottom: Platform.OS === 'ios' ? 22 : 12 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#243246' },
  headerIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#14253B', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 12 },
  title: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  subtitle: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  contentScroll: { flex: 1, minHeight: 0 },
  formContent: { padding: 18, paddingBottom: 22 },
  introTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  introCopy: { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 18 },
  label: { color: '#E2E8F0', fontWeight: '600', fontSize: 13 },
  required: { color: '#F87171' },
  speciesPicker: { minHeight: 48, marginTop: 8, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10 },
  speciesPickerOpen: { borderColor: '#60A5FA' },
  speciesValue: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  placeholder: { color: '#94A3B8' },
  speciesMenu: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  speciesOption: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomColor: '#334155', borderBottomWidth: StyleSheet.hairlineWidth },
  speciesOptionSelected: { backgroundColor: '#172D47' },
  speciesOptionText: { flex: 1, color: '#CBD5E1', fontSize: 13 },
  speciesOptionTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  symptomHeading: { marginTop: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionHint: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  selectionCount: { color: '#93C5FD', backgroundColor: '#172D47', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '600' },
  symptomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  symptomChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 9 },
  symptomChipSelected: { backgroundColor: '#172D47', borderColor: '#3B82F6' },
  symptomText: { color: '#CBD5E1', fontSize: 11 },
  symptomTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#172235', borderColor: '#334155', borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 18 },
  disclaimerText: { flex: 1, color: '#CBD5E1', fontSize: 11, lineHeight: 17 },
  actions: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#243246', gap: 9 },
  predictButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#2563EB', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  predictButtonDisabled: { backgroundColor: '#334155' },
  contactButton: { minHeight: 49, borderRadius: 12, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  restartButton: { minHeight: 47, borderRadius: 12, backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  resultsContent: { padding: 18, paddingBottom: 22 },
  resultIntro: { alignItems: 'center', marginBottom: 17 },
  resultIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#172D47', alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', marginTop: 10 },
  resultSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  conditionCard: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 13, padding: 13, marginBottom: 10 },
  conditionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rankBadge: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#172D47', alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#93C5FD', fontSize: 12, fontWeight: '700' },
  conditionName: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  matchPercentage: { color: '#6EE7B7', fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#334155', marginTop: 12 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  matchCaption: { color: '#94A3B8', fontSize: 10, marginTop: 5 },
  conditionNote: { color: '#CBD5E1', fontSize: 11, lineHeight: 16, marginTop: 9 },
  matchedLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '600', marginTop: 11, marginBottom: 6 },
  matchedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  matchedTag: { color: '#BFDBFE', backgroundColor: '#172D47', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 10 },
  noMatchCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#302819', borderWidth: 1, borderColor: '#715C2F', borderRadius: 12, padding: 13 },
  noMatchText: { flex: 1, color: '#FDE68A', fontSize: 12, lineHeight: 18 },
  urgentNote: { color: '#FCA5A5', fontSize: 11, lineHeight: 17, marginTop: 13 },
});
