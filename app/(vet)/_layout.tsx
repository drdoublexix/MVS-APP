import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnreadMessages } from '../../lib/unreadMessages';
import { useLanguage } from '../../lib/language';

export default function VetLayout() {
  const { totalUnreadCount } = useUnreadMessages();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: false,
        tabBarPosition: 'bottom',
        sceneStyle: { backgroundColor: '#0F172A' },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          minHeight: 56 + insets.bottom,
          maxHeight: 56 + insets.bottom,
          paddingTop: 1,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 13, marginBottom: 1 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.dashboard'), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" color={color} size={size} /> }} />
      <Tabs.Screen name="community" options={{ title: t('nav.community'), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" color={color} size={size} /> }} />
      <Tabs.Screen name="chat" listeners={{ tabPress: () => router.navigate('/chat') }} options={{ title: t('nav.chat'), tabBarBadge: totalUnreadCount > 0 ? (totalUnreadCount > 99 ? '99+' : totalUnreadCount) : undefined, tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' }, tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="message-text" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('nav.profile'), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}
