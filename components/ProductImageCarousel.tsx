import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  images?: string[];
  fallbackImage?: string;
  height?: number;
};

export default function ProductImageCarousel({ images = [], fallbackImage, height = 180 }: Props) {
  const sources = [...new Set([...images, ...(fallbackImage ? [fallbackImage] : [])].filter(Boolean))];
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(0, sources.length - 1));

  if (!sources.length) return <View style={[styles.empty, { height }]}><MaterialCommunityIcons name="image-off-outline" size={38} color="#CBD5E1" /><Text style={styles.emptyText}>No product image</Text></View>;

  const move = (direction: number) => setActiveIndex((current) => (current + direction + sources.length) % sources.length);
  return (
    <View style={[styles.container, { height }]}>
      <Image source={{ uri: sources[safeIndex] }} style={styles.image} resizeMode="cover" />
      {sources.length > 1 ? <>
        <TouchableOpacity style={[styles.arrow, styles.left]} onPress={() => move(-1)} accessibilityLabel="Previous product image">
          <MaterialCommunityIcons name="chevron-left" size={25} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.arrow, styles.right]} onPress={() => move(1)} accessibilityLabel="Next product image">
          <MaterialCommunityIcons name="chevron-right" size={25} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.dots}>{sources.map((source, index) => <View key={source} style={[styles.dot, index === safeIndex && styles.activeDot]} />)}</View>
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: '#0F172A' },
  image: { width: '100%', height: '100%' },
  empty: { width: '100%', borderRadius: 10, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { color: '#94A3B8', fontSize: 12 },
  arrow: { position: 'absolute', top: '50%', marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center' },
  left: { left: 8 },
  right: { right: 8 },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF99' },
  activeDot: { backgroundColor: '#FFFFFF' },
});
