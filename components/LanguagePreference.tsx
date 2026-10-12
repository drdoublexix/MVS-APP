import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { languageOptions, useLanguage, type AppLanguage } from '../lib/language';

export default function LanguagePreference() {
  const { language, ready, selectLanguage, t } = useLanguage();
  const [saving, setSaving] = useState(false);

  const chooseLanguage = async (nextLanguage: AppLanguage) => {
    if (nextLanguage === language || saving || !ready) return;
    setSaving(true);
    try {
      await selectLanguage(nextLanguage);
    } catch {
      const message = t('settings.languageSaveFailed');
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert(t('settings.language'), message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={styles.title}>{t('settings.language')}</Text>
          <Text style={styles.description}>{t('settings.languageDescription')}</Text>
        </View>
        {saving ? <ActivityIndicator color="#10B981" size="small" /> : null}
      </View>
      <View style={styles.options}>
        {languageOptions.map((option) => {
          const selected = language === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: saving }}
              onPress={() => { void chooseLanguage(option.value); }}
              disabled={saving || !ready}
              style={[styles.option, selected && styles.selectedOption]}
            >
              <Text style={[styles.optionText, selected && styles.selectedText]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 10, padding: 14, borderRadius: 12, backgroundColor: '#102033', borderWidth: 1, borderColor: '#27394F' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  description: { color: '#A6B4C5', fontSize: 11, lineHeight: 16, marginTop: 3 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  option: { minWidth: 74, paddingHorizontal: 11, paddingVertical: 9, alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#3A4B60', backgroundColor: '#0B1726' },
  selectedOption: { borderColor: '#10B981', backgroundColor: '#0C3B31' },
  optionText: { color: '#D5DFEA', fontSize: 12, fontWeight: '600' },
  selectedText: { color: '#6EE7B7' },
});
