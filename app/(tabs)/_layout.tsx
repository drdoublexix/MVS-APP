import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function CommunityLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'bottom',
        tabBarStyle: {
          height: 56,
          minHeight: 56,
          maxHeight: 56,
          paddingTop: 1,
          paddingBottom: 0,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 13, marginBottom: 1 },
      }}
    >
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
