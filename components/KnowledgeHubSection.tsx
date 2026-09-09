import knowledgeArticles from '@/assets/data/knowledgeHub.json';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface KnowledgeArticle {
  id: string;
  category: string;
  title: string;
  icon: string;
  summary: string;
  content: string[];
}

const articles = knowledgeArticles as KnowledgeArticle[];
const categories = ['All', 'Vaccination', 'Livestock Care', 'Hydration & Nutrition', 'First Aid & Triage', 'Biosecurity', 'Public Health'];

export default function KnowledgeHubSection() {
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filteredArticles = articles.filter((article) => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesCategory = category === 'All' || article.category === category;
    const matchesSearch = !normalizedSearch || `${article.title} ${article.category} ${article.summary}`.toLowerCase().includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });

  const closeHub = () => {
    setModalOpen(false);
    setSearch('');
    setCategory('All');
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>MVS Knowledge Hub</Text>
        <TouchableOpacity onPress={() => setModalOpen(true)}>
          <Text style={styles.action}>View All</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowGap}>
        {articles.map((article) => (
          <TouchableOpacity key={article.id} style={styles.tipCard} onPress={() => setSelectedArticle(article)}>
            <View style={styles.tipIcon}>
              <MaterialCommunityIcons name={article.icon as any} size={30} color="#3B82F6" />
            </View>
            <Text style={styles.cardTitle}>{article.title}</Text>
            <Text style={styles.cardSummary} numberOfLines={3}>{article.summary}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={closeHub}>
        <View style={styles.knowledgeOverlay}>
          <View style={styles.knowledgeModal}>
            <View style={styles.knowledgeHeader}>
              <Text style={styles.knowledgeModalTitle}>MVS Knowledge Hub</Text>
              <TouchableOpacity onPress={closeHub} accessibilityLabel="Close Knowledge Hub">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search articles..."
              placeholderTextColor="#64748B"
              style={styles.knowledgeSearch}
              accessibilityLabel="Search Knowledge Hub articles"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryFiltersScroll} contentContainerStyle={styles.categoryFilters}>
              {categories.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.categoryPill, category === item && styles.categoryPillActive]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={[styles.categoryPillText, category === item && styles.categoryPillTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView contentContainerStyle={styles.knowledgeGrid} showsVerticalScrollIndicator={false}>
              {filteredArticles.length === 0 ? (
                <Text style={styles.knowledgeEmpty}>No articles match your search.</Text>
              ) : filteredArticles.map((article) => (
                <TouchableOpacity key={article.id} style={styles.knowledgeArticleCard} onPress={() => setSelectedArticle(article)} activeOpacity={0.8}>
                  <View style={styles.knowledgeArticleIcon}>
                    <MaterialCommunityIcons name={article.icon as any} size={25} color="#3B82F6" />
                  </View>
                  <Text style={styles.knowledgeArticleTitle}>{article.title}</Text>
                  <Text style={styles.knowledgeArticleCategory}>{article.category}</Text>
                  <Text style={styles.knowledgeArticleSummary} numberOfLines={4}>{article.summary}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedArticle)} animationType="fade" transparent onRequestClose={() => setSelectedArticle(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <TouchableOpacity style={styles.close} onPress={() => setSelectedArticle(null)} accessibilityLabel="Close article">
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {selectedArticle && (
              <>
                <View style={styles.articleHeader}>
                  <Text style={styles.categoryTag}>{selectedArticle.category}</Text>
                  <Text style={styles.modalTitle}>{selectedArticle.title}</Text>
                </View>
                <ScrollView contentContainerStyle={styles.articleBody} showsVerticalScrollIndicator>
                  {selectedArticle.content.map((paragraph) => (
                    <Text key={paragraph} style={styles.articleParagraph}>{paragraph}</Text>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setSelectedArticle(null)}>
                  <Text style={styles.primaryText}>Got it</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  action: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  knowledgeOverlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  knowledgeModal: { flex: 1, marginTop: 42, backgroundColor: '#0F172A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  knowledgeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  knowledgeModalTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  knowledgeSearch: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 10, color: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, marginTop: 16 },
  categoryFiltersScroll: { marginTop: 16, marginBottom: 16 },
  categoryFilters: { gap: 8, paddingVertical: 14, paddingRight: 8, alignItems: 'center' },
  categoryPill: { minHeight: 36, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, justifyContent: 'center' },
  categoryPillActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  categoryPillText: { color: '#CBD5E1', fontSize: 12, lineHeight: 16, fontWeight: '500' },
  categoryPillTextActive: { color: '#FFFFFF', fontWeight: '700' },
  knowledgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 16, paddingBottom: 24 },
  knowledgeArticleCard: { width: '48%', backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 13 },
  knowledgeArticleIcon: { width: 46, height: 46, borderRadius: 11, backgroundColor: '#3B82F620', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  knowledgeArticleTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  knowledgeArticleCategory: { color: '#60A5FA', fontSize: 11, fontWeight: '700', marginTop: 6 },
  knowledgeArticleSummary: { color: '#94A3B8', fontSize: 11, lineHeight: 16, marginTop: 7 },
  knowledgeEmpty: { color: '#94A3B8', textAlign: 'center', width: '100%', paddingVertical: 30 },
  rowGap: { gap: 12, paddingBottom: 4 },
  tipCard: { width: 190, padding: 15, borderRadius: 12, backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, alignItems: 'center' },
  tipIcon: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#3B82F620', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  cardSummary: { color: '#94A3B8', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 7 },
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { maxHeight: '85%', width: '92%', backgroundColor: '#1E293B', borderRadius: 20, padding: 22 },
  close: { alignSelf: 'flex-end', padding: 2, marginBottom: 2 },
  articleHeader: { paddingRight: 22 },
  categoryTag: { color: '#60A5FA', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  modalTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 22, marginBottom: 16 },
  articleBody: { paddingBottom: 20 },
  articleParagraph: { color: '#E2E8F0', fontSize: 15, lineHeight: 22, marginBottom: 16 },
  primaryButton: { backgroundColor: '#3B82F6', padding: 14, borderRadius: 9, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
});
