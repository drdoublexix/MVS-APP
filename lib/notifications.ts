import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

let Notifications: typeof import('expo-notifications') | null = null;
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants.executionEnvironment as string) === 'storeClient' ||
  (Constants.executionEnvironment as string) === 'expo';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch (error) {
    console.warn('[Notifications] expo-notifications could not be loaded in this runtime:', error);
    Notifications = null;
  }
}

export type StoredNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read_status: boolean;
  created_at: string;
};

const locallyNotifiedKey = (userId: string) => `mvs_notified_notifications:${userId}`;

if (isExpoGo) {
  console.log('[Notifications] Expo Go detected; skipping native notification setup.');
} else if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (error) {
    console.warn('[Notifications] Native notification handler setup failed:', error);
  }
}

const ANDROID_CHANNEL_ID = 'default';
const EXPO_PROJECT_ID = '5013bac6-0c3a-4c17-b268-e477a44b';

const showWebPermissionAlert = () => {
  if (Platform.OS !== 'web') return;

  Alert.alert(
    'Enable notifications',
    'Notifications are currently blocked for this browser. Please allow notifications in your browser/site settings, then sign in again to receive chat and reminder alerts.',
    [{ text: 'OK' }]
  );
};

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

  const subscriptionPayload = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  const subscriptionString = JSON.stringify(subscriptionPayload);
  console.log('[PUSH DIAGNOSTIC] Web Subscription:', subscriptionString);
  const { error } = await supabase
    .from('profiles')
    .update({ web_push_subscription: subscriptionString })
    .eq('id', userId);

  if (error) throw error;
  console.log('[Notifications] Web push subscription saved successfully.');
  return subscriptionString;
};

export const registerForPushNotifications = async (userId: string): Promise<string | null> => {
  if (isExpoGo || !Notifications) {
    console.log('[Notifications] Skipping push registration in Expo Go.');
    return null;
  }

  // --- 1. WEB / PWA HANDLER ---
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('[Notifications] Web push notifications are not supported by this browser.');
      return null;
    }

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Ignore registration failures; browser push is best-effort.
      }
    }

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        console.log('[Notifications] Web notification permission denied.');
        showWebPermissionAlert();
        return null;
      }

      return await saveWebPushSubscription(userId);
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

  console.log('[PUSH DIAGNOSTIC] Expo Token:', expoPushToken);
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
      .select('notification_preferences')
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
      chat: ['chat', 'mvsai_chat_messages', 'messages'],
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

    await supabase.functions.invoke('send-push-notification', {
      body: {
        recipientId: recipientUserId,
        title,
        body,
        data,
      },
    });
  } catch {
    // Swallow notification delivery failures so messaging and status updates continue normally.
  }
};

const showPendingNotificationLocally = async (notification: StoredNotification) => {
  if (Platform.OS === 'web' || isExpoGo || !Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: { notificationId: notification.id },
    },
    trigger: null,
  });
};

export const syncPendingNotifications = async (userId: string): Promise<StoredNotification[]> => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, title, body, read_status, created_at')
    .eq('user_id', userId)
    .eq('read_status', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const notifications = (data || []) as StoredNotification[];
  let notifiedIds: string[] = [];
  try {
    const cachedIds = await AsyncStorage.getItem(locallyNotifiedKey(userId));
    notifiedIds = cachedIds ? JSON.parse(cachedIds) : [];
  } catch {
    notifiedIds = [];
  }

  const notifiedIdSet = new Set(notifiedIds);
  const missedNotifications = notifications.filter((notification) => !notifiedIdSet.has(notification.id));
  for (const notification of missedNotifications) {
    try {
      await showPendingNotificationLocally(notification);
      notifiedIdSet.add(notification.id);
    } catch (notificationError) {
      console.warn('[Notifications] Failed to show pending notification locally:', notificationError);
    }
  }

  await AsyncStorage.setItem(
    locallyNotifiedKey(userId),
    JSON.stringify(Array.from(notifiedIdSet).slice(-100))
  );

  return notifications;
};

export const markNotificationRead = async (notificationId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read_status: true })
    .eq('id', notificationId);

  if (error) throw error;
};
