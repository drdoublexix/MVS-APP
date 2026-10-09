import { StyleSheet, View } from 'react-native';
import MVSDiseasePredictor from './MVSDiseasePredictor';
import MVSFeedCalculator from './MVSFeedCalculator';

type Props = {
  onContactVendor: () => void;
  onContactVet?: () => void;
};

export default function HomeAnimalTools({ onContactVendor, onContactVet }: Props) {
  return (
    <View style={styles.row}>
      <MVSFeedCalculator compact onContactVendor={onContactVendor} />
      <MVSDiseasePredictor compact onContactVet={onContactVet} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 9, marginBottom: 16 },
});
