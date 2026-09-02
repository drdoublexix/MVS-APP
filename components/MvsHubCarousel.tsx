import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ARTICLES = [
  {
    id: '1',
    title: 'Dog Vaccination Guide',
    category: 'Health',
    icon: 'needle',
    description: 'Complete guide to dog vaccinations and schedules',
  },
  {
    id: '2',
    title: 'Cat Nutrition Tips',
    category: 'Nutrition',
    icon: 'food',
    description: 'Best practices for feeding your feline companion',
  },
  {
    id: '3',
    title: 'Pet Emergency Care',
    category: 'Emergency',
    icon: 'alert-circle',
    description: 'What to do in pet emergencies',
  },
  {
    id: '4',
    title: 'Grooming Basics',
    category: 'Care',
    icon: 'water',
    description: 'Essential grooming tips for healthy pets',
  },
];

export const MvsHubCarousel = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>MVS Knowledge Hub</Text>
        <TouchableOpacity>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.carousel}
        scrollEventThrottle={16}
      >
        {ARTICLES.map((article) => (
          <TouchableOpacity 
            key={article.id} 
            style={styles.card}
            activeOpacity={0.7}
          >
            <View style={styles.cardIcon}>
              <MaterialCommunityIcons 
                name={article.icon as any} 
                size={32} 
                color="#0a7ea4" 
              />
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {article.title}
            </Text>
            <Text style={styles.cardCategory}>{article.category}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  viewAll: {
    fontSize: 14,
    color: '#0a7ea4',
    fontWeight: '600',
  },
  carousel: {
    paddingHorizontal: 8,
  },
  card: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#e8f4f8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  cardCategory: {
    fontSize: 12,
    color: '#0a7ea4',
    fontWeight: '500',
  },
});
