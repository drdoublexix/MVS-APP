import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { getCurrentAdminStatus } from '../../lib/admin';

export default function AdminLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentAdminStatus()
      .then((user) => {
        if (active) setAuthorized(Boolean(user));
      })
      .catch((reason: unknown) => {
        console.error('[Admin Dashboard] Access check failed:', reason);
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not verify administrator access.');
          setAuthorized(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (authorized === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000A14' }}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#000A14' }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Access restricted</Text>
        <Text style={{ color: '#8a9ba8', marginTop: 8, textAlign: 'center' }}>
          {error || 'This dashboard is only available to the authorized account.'}
        </Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#000A14' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: '#000A14' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Super Admin' }} />
      <Stack.Screen name="users" options={{ title: 'Manage Users' }} />
      <Stack.Screen name="activity-logs" options={{ title: 'Activity Logs' }} />
      <Stack.Screen name="email-manager" options={{ title: 'Send Email' }} />
      <Stack.Screen name="email-logs" options={{ title: 'Email History' }} />
    </Stack>
  );
}
