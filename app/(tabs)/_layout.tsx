import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CommunityLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'bottom',
        tabBarStyle: {
          height: 56 + insets.bottom,
          minHeight: 56 + insets.bottom,
          maxHeight: 56 + insets.bottom,
          paddingTop: 1,
          paddingBottom: insets.bottom,
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
