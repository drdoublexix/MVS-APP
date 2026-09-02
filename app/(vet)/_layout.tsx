import { Tabs } from 'expo-router';

export default function VetLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4ECDC4',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
