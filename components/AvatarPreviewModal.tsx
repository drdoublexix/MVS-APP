import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

type AvatarPreviewModalProps = {
  imageUrl: string | null;
  visible: boolean;
  onClose: () => void;
};

export default function AvatarPreviewModal({ imageUrl, visible, onClose }: AvatarPreviewModalProps) {
  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close image preview">
        <View style={styles.previewArea} pointerEvents="box-none">
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
          <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Close image preview">
            <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  image: {
    width: '100%',
    height: '82%',
  },
  closeButton: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});