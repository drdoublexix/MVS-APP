import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markNotificationRead, type StoredNotification } from '../lib/notifications';

type DashboardNotificationsContextValue = {
  notifications: StoredNotification[];
  setNotifications: Dispatch<SetStateAction<StoredNotification[]>>;
  onRead: (notificationId: string) => Promise<void>;
};

const DashboardNotificationsContext = createContext<DashboardNotificationsContextValue | null>(null);

export function DashboardNotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const onRead = useCallback(async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    } catch (error) {
      console.warn('[Notifications] Failed to mark notification as read:', error);
    }
  }, []);

  return (
    <DashboardNotificationsContext.Provider value={{ notifications, setNotifications, onRead }}>
      {children}
    </DashboardNotificationsContext.Provider>
  );
}

export function useDashboardNotifications() {
  const context = useContext(DashboardNotificationsContext);
  if (!context) {
    throw new Error('useDashboardNotifications must be used inside DashboardNotificationsProvider.');
  }
  return context;
}

export default function DashboardQuickActions({
  showInstitutionMap = false,
  showVeterinarianMap = false,
}: {
  showInstitutionMap?: boolean;
  showVeterinarianMap?: boolean;
}) {
  const { notifications, onRead } = useDashboardNotifications();
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (notifications.length === 0 && !showInstitutionMap && !showVeterinarianMap) return null;

  return (
    <>
      <View style={styles.actions}>
        {notifications.length > 0 ? (
          <TouchableOpacity style={styles.notificationBell} onPress={() => setVisible(true)} accessibilityLabel={`${notifications.length} unread notifications`} accessibilityRole="button">
            <MaterialCommunityIcons name="bell-outline" size={22} color="#FFFFFF" />
            <View style={styles.notificationCount}><Text style={styles.notificationCountText}>{notifications.length > 99 ? '99+' : notifications.length}</Text></View>
          </TouchableOpacity>
        ) : null}
        {showVeterinarianMap ? (
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => router.push({ pathname: '/(client)/vets', params: { openMap: 'true', returnTo: 'dashboard' } })}
            accessibilityLabel="Explore veterinarians on the map"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="map-marker-radius" size={23} color="#10B981" />
          </TouchableOpacity>
        ) : null}
        {showInstitutionMap ? (
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => router.push('/(client)/explore-clinics')}
            accessibilityLabel="Explore veterinary institutions and pet businesses on the map"
            accessibilityRole="button"
          >
            <Image source={require('../assets/images/clinic-marker.png')} style={styles.clinicMapIcon} resizeMode="contain" />
          </TouchableOpacity>
        ) : null}
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={[styles.notificationBackdrop, { paddingTop: insets.top + 58 }]} onPress={() => setVisible(false)}>
          <Pressable style={styles.notificationPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setVisible(false)} accessibilityLabel="Close notifications">
                <MaterialCommunityIcons name="close" size={22} color="#CBD5E1" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.notificationList}
              contentContainerStyle={styles.notificationListContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {notifications.map((notification) => (
                <TouchableOpacity key={notification.id} style={styles.notificationItem} onPress={() => void onRead(notification.id)}>
                  <Text style={styles.notificationItemTitle}>{notification.title}</Text>
                  <Text style={styles.notificationItemBody}>{notification.body}</Text>
                  <Text style={styles.notificationItemTime}>{new Date(notification.created_at).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  notificationBell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E7490', borderWidth: 1, borderColor: '#67E8F9' },
  mapButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  clinicMapIcon: { width: 25, height: 25 },
  notificationCount: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444' },
  notificationCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  notificationBackdrop: { flex: 1, alignItems: 'flex-end', paddingHorizontal: 16, backgroundColor: '#00000066' },
  notificationPanel: { width: '100%', maxWidth: 380, height: '75%', minHeight: 180, maxHeight: 560, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#475569', padding: 14, overflow: 'hidden' },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  notificationList: { flex: 1, minHeight: 0 },
  notificationListContent: { paddingBottom: 4 },
  notificationTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  notificationItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  notificationItemTitle: { color: '#6EE7B7', fontSize: 13, fontWeight: '800' },
  notificationItemBody: { color: '#E2E8F0', fontSize: 13, lineHeight: 19, marginTop: 4 },
  notificationItemTime: { color: '#94A3B8', fontSize: 10, marginTop: 6 },
});
