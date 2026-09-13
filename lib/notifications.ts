import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const ANDROID_CHANNEL_ID = 'default';
const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';
const EXPO_PROJECT_ID = '5013bac6-0c3a-4c17-b268-e477a44b';

const saveWebPushSubscription = async (userId: string): Promise<string | null> => {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration.pushManager) return null;

  const vapidKey = process.env.EXPO_PUBLIC_VAPID_KEY;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (vapidKey
      ? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
      : null);

  if (!subscription) return null;

  const subscriptionString = JSON.stringify(subscription);
  const { error } = await supabase
    .from('profiles')
    .update({ web_push_subscription: subscriptionString })
    .eq('id', userId);

  if (error) throw error;
  console.log('[Notifications] Web push subscription saved successfully.');
  return subscriptionString;
};

export const registerForPushNotifications = async (userId: string): Promise<string | null> => {
  // --- 1. WEB / PWA HANDLER ---
  if (Platform.OS === 'web') {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const vapidKey = process.env.EXPO_PUBLIC_VAPID_KEY;

    if (!vapidKey || isLocalhost) {
      const mockToken = `WebPushToken_${userId}`;
      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: mockToken })
        .eq('id', userId);
      if (error) throw error;
      console.log('[Notifications] Web mock push token saved:', mockToken);
      return mockToken;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('[Notifications] Web push notifications are not supported by this browser.');
      return null;
    }

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        console.log('[Notifications] Web notification permission denied.');
        return null;
      }

      try {
        const token = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
        console.log('Generated Push Token:', token.data);
        const { error } = await supabase
          .from('profiles')
          .update({ expo_push_token: token.data })
          .eq('id', userId);
        if (error) throw error;
        return token.data;
      } catch (expoError) {
        console.warn('[Notifications] Web Expo push token unavailable; trying Web Push:', expoError);
        return await saveWebPushSubscription(userId);
      }
    } catch (err) {
      console.warn('[Notifications] Web push registration failed:', err);
    }
    return null;
  }

  // --- 2. NATIVE IOS / ANDROID HANDLER ---
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'MVS Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'default',
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let permissionStatus = existingPermissions.status;
  if (permissionStatus !== Notifications.PermissionStatus.GRANTED) {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    permissionStatus = requestedPermissions.status;
  }

  if (permissionStatus !== Notifications.PermissionStatus.GRANTED) {
    console.log('[Notifications] Native permission was not granted.');
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
  const expoPushToken = tokenResponse.data;
  if (!expoPushToken) return null;

  console.log('Generated Push Token:', expoPushToken);
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: expoPushToken })
    .eq('id', userId);

  if (error) throw error;
  console.log('[Notifications] Expo push token saved.');
  return expoPushToken;
};

export const sendPushNotification = async (
  recipientUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> => {
  try {
    if (!recipientUserId || !title || !body) {
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('expo_push_token, web_push_subscription, notification_preferences')
      .eq('id', recipientUserId)
      .maybeSingle();

    if (profileError || !profile) {
      return;
    }

    const notificationPreferences = (profile.notification_preferences && typeof profile.notification_preferences === 'object'
      ? profile.notification_preferences
      : {}) as Record<string, unknown>;

    const preferenceKey = String(data?.preferenceKey || data?.category || data?.type || 'chat');
    const preferenceAliases: Record<string, string[]> = {
      chat: ['chat', 'chat_messages', 'messages'],
      consults: ['consults', 'consultations', 'consultation_updates'],
      orders: ['orders', 'order_updates', 'new_orders'],
    };

    const aliasKeys = preferenceAliases[preferenceKey] || [preferenceKey];
    const preferenceValue = aliasKeys
      .map((key) => notificationPreferences[key])
      .find((value) => typeof value === 'boolean');

    if (preferenceValue === false) {
      return;
    }

    const expoPushToken = profile.expo_push_token;
    if (expoPushToken) {
      try {
        const response = await fetch(EXPO_PUSH_API, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: expoPushToken,
            title,
            body,
            sound: 'default',
            channelId: ANDROID_CHANNEL_ID,
            data: data || {},
          }),
        });

        if (!response.ok) {
          try {
            await response.text();
          } catch {
            // Ignore response-body read issues; push delivery is best-effort.
          }
          return;
        }
      } catch {
        // Ignore localhost/CORS and network failures so UI actions are not interrupted.
        return;
      }
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const webNotificationOptions = {
          body,
          vibrate: [200, 100, 200],
        } as NotificationOptions & { vibrate?: number[] };

        new Notification(title, webNotificationOptions);
      } catch {
        // Ignore browser notification UI failures in development and restricted contexts.
      }
    }
  } catch {
    // Swallow notification delivery failures so messaging and status updates continue normally.
  }
};
