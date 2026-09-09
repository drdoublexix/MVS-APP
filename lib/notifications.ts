import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const ANDROID_CHANNEL_ID = 'mvs-default';
const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

export const registerForPushNotifications = async (userId: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Push registration is unavailable on web.');
    return null;
  }

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
    console.log('[Notifications] Permission was not granted.');
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const expoPushToken = tokenResponse.data;
  if (!expoPushToken) return null;

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
    // Fetch user's expo push token and notification preferences
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('expo_push_token, notification_preferences')
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

    const expoPushToken = profile.expo_push_token;
    if (!expoPushToken) {
      console.warn('[Notifications] No expo push token for user:', recipientUserId);
      return;
    }

    // Check if this notification category is enabled
    const notificationPreferences = profile.notification_preferences || {};
    const isNotificationEnabled = notificationPreferences[categoryKey] !== false; // Default to true if missing

    if (!isNotificationEnabled) {
      console.log('[Notifications] Notification category disabled:', categoryKey);
      return;
    }

    // Send push notification via Expo API
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
        data: data || {},
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.warn('[Notifications] Failed to send push notification:', response.status, responseText);
      return;
    }

    console.log('[Notifications] Push notification sent successfully to user:', recipientUserId);
  } catch (error) {
    console.error('[Notifications] Error sending push notification:', error instanceof Error ? error.message : error);
  }
};
