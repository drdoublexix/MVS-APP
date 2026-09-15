import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useUnreadMessages } from '../../lib/unreadMessages';

export default function ClientLayout() {
  const { totalUnreadCount } = useUnreadMessages();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0a7ea4',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#eee',
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="vets"
        options={{
          title: 'Vets',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="hospital-box" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        listeners={{ tabPress: () => router.navigate('/chat') }}
        options={{
          title: 'Chat',
          tabBarBadge: totalUnreadCount > 0 ? (totalUnreadCount > 99 ? '99+' : totalUnreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="message" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
