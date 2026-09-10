import * as Location from 'expo-location';
import { supabase } from './supabase';

export type ProfileLocation = {
  latitude: number | null;
  longitude: number | null;
  city: string;
  state: string;
};

export const NIGERIAN_LOCATIONS = [
  { state: 'Lagos', city: 'Lagos', areas: ['Ikeja', 'Lekki', 'Victoria Island', 'Yaba', 'Surulere', 'Ajah', 'Agege', 'Alimosho', 'Amuwo-Odofin', 'Apapa', 'Badagry', 'Epe', 'Ikorodu', 'Kosofe', 'Oshodi-Isolo', 'Maryland', 'Ebute Metta', 'Festac'] },
  { state: 'Kaduna', city: 'Kaduna', areas: ['Kaduna North', 'Kaduna South', 'Sabon Gari', 'Zaria', 'Barnawa', 'Kawo', 'Tudun Wada', 'Kakuri', 'Rigasa', 'Chikun'] },
  { state: 'Kano', city: 'Kano', areas: ['Dala', 'Fagge', 'Gwale', 'Kano Municipal', 'Nasarawa', 'Tarauni', 'Kumbotso', 'Ungogo'] },
  { state: 'Federal Capital Territory', city: 'Abuja', areas: ['Garki', 'Wuse', 'Maitama', 'Asokoro', 'Gwarinpa', 'Kubwa', 'Lugbe', 'Utako', 'Jabi', 'Life Camp', 'Nyanya', 'Karu'] },
  { state: 'Rivers', city: 'Port Harcourt', areas: ['Port Harcourt City', 'Obio-Akpor', 'Eleme', 'Oyigbo', 'Ikwerre'] },
  { state: 'Oyo', city: 'Ibadan', areas: ['Ibadan North', 'Ibadan North-East', 'Ibadan South-West', 'Bodija', 'Oluyole', 'Egbeda', 'Ring Road'] },
  { state: 'Enugu', city: 'Enugu', areas: ['Enugu North', 'Enugu South', 'Independence Layout', 'Abakpa', 'Trans-Ekulu'] },
];

export const requestDeviceLocation = async (): Promise<ProfileLocation | null> => {
  let latitude: number;
  let longitude: number;

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) throw new Error('Location permission was not granted.');
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
  } catch (nativeError) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.warn('[Location] Geolocation not available');
      return null;
    }
    console.log('[Location] Falling back to browser geolocation');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (browserError) {
      console.warn('[Location] Browser geolocation error:', browserError);
      return null;
    }
  }

  let city = '';
  let state = '';
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
    if (response.ok) {
      const data = await response.json();
      city = data.address?.city || data.address?.town || data.address?.suburb || data.address?.county || '';
      state = data.address?.state || '';
    }
  } catch (nominatimError) {
    console.log('[Location] OpenStreetMap reverse geocoding failed:', nominatimError);
  }

  const result = { latitude, longitude, city, state };

  // Automatically update Supabase profile so "Location Pending" disappears
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from('profiles')
        .update({
          latitude,
          longitude,
          city: city || 'Local Area',
          state: state || 'Nigeria',
        })
        .eq('id', session.user.id);
      console.log('[Location] Successfully updated profile coordinates in database');
    }
  } catch (dbError) {
    console.error('[Location] Failed to save location to database:', dbError);
  }

  return result;
};
