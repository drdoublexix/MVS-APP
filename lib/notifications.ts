import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const ANDROID_CHANNEL_ID = 'mvs-default';
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
  categoryKey: string,
  data?: object
): Promise<void> => {
  try {
    // Fetch user profile preferences and push tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('expo_push_token, web_push_subscription, notification_preferences')
      .eq('id', recipientUserId)
      .maybeSingle();

    if (profileError) {
      console.warn('[Notifications] Failed to fetch profile:', profileError.message);
      return;
    }

    if (!profile) {
      console.warn('[Notifications] Profile not found for user:', recipientUserId);
      return;
    }

    // Check notification category preferences
    const notificationPreferences = profile.notification_preferences || {};
    const isNotificationEnabled = notificationPreferences[categoryKey] !== false;

    if (!isNotificationEnabled) {
      console.log('[Notifications] Notification category disabled by user:', categoryKey);
      return;
    }

    // A. Send Native Push Notification via Expo
    const expoPushToken = profile.expo_push_token;
    if (expoPushToken) {
      const response = await fetch(EXPO_PUSH_API, {
        method: 'POST',
        headers: {
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
        const responseText = await response.text();
        console.warn('[Notifications] Failed to send Expo push:', response.status, responseText);
      } else {
        console.log('[Notifications] Expo push notification sent to user:', recipientUserId);
      }
    }

    // B. Log Web Push trigger availability (Delivered via WebPush API / Service Worker backend)
    if (profile.web_push_subscription) {
      console.log('[Notifications] User has active web push subscription.');
    }
  } catch (error) {
    console.error(
      '[Notifications] Error sending push notification:',
      error instanceof Error ? error.message : error
    );
  }
};
