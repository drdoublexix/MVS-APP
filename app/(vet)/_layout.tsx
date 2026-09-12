import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useUnreadMessages } from '../../lib/unreadMessages';

export default function VetLayout() {
  const { totalUnreadCount } = useUnreadMessages();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: false,
        sceneStyle: { backgroundColor: '#0F172A' },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" color={color} size={size} /> }} />
      <Tabs.Screen name="community" options={{ title: 'Community', headerShown: true, headerTitle: 'MVS Community Hub', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" color={color} size={size} /> }} />
      <Tabs.Screen name="chat" listeners={{ tabPress: () => router.navigate({ pathname: '/chat', params: { resetThread: String(Date.now()) } }) }} options={{ title: 'Chat', tabBarBadge: totalUnreadCount > 0 ? (totalUnreadCount > 99 ? '99+' : totalUnreadCount) : undefined, tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' }, tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="message-text" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}
