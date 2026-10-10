import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type LogoutConfirmationModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
};

export default function LogoutConfirmationModal({
  visible,
  onCancel,
  onConfirm,
  title = 'Log out of MVS?',
  message = 'You are about to leave MVS. Are you sure you want to log out?',
  confirmLabel = 'Log out',
}: LogoutConfirmationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={styles.dialog}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [styles.button, styles.confirmButton, pressed && styles.pressed]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#111C2E',
    borderColor: '#334155',
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 420,
    padding: 24,
    width: '100%',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 10,
  },
  message: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    alignItems: 'center',
    borderRadius: 9,
    minWidth: 104,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelButton: {
    backgroundColor: '#1E293B',
    borderColor: '#475569',
    borderWidth: 1,
  },
  confirmButton: {
    backgroundColor: '#DC2626',
  },
  cancelText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
