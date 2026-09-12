import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function CommunityLayout() {
  return <Tabs screenOptions={{ headerShown: true, headerTitle: 'MVS Community Hub' }}><Tabs.Screen name="community" options={{ title: 'MVS Community Hub', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" color={color} size={size} /> }} /></Tabs>;
}
