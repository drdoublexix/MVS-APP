import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

export type VeterinaryClinic = {
  id: string;
  merchant_id: string;
  clinic_name: string;
  practice_specialty: string;
  practice_specialties: string[];
  description: string | null;
  phone_number: string;
  email: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  profile_photo_url: string | null;
  gallery_photo_urls: string[];
  created_at: string;
  updated_at: string;
  distanceKm: number | null;
};

export const isValidCoordinate = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number => typeof value === 'number'
  && Number.isFinite(value)
  && value >= minimum
  && value <= maximum;

export const haversineDistanceKm = (
  latitudeOne: number,
  longitudeOne: number,
  latitudeTwo: number,
  longitudeTwo: number,
) => {
  const radians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(latitudeTwo - latitudeOne);
  const longitudeDelta = radians(longitudeTwo - longitudeOne);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeOne)) * Math.cos(radians(latitudeTwo))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(haversine));
};

export const uploadClinicImage = async (asset: ImagePickerAsset, userId: string) => {
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Unable to read the selected clinic photo.');
  const file = await response.blob();
  const fileName = asset.fileName || asset.uri.split('/').pop() || 'clinic-photo.jpg';
  const fileExtension = fileName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const filePath = `${userId}/clinics/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExtension}`;
  const { error } = await supabase.storage
    .from('clinic-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      contentType: asset.mimeType || file.type || 'image/jpeg',
      upsert: false,
    });
  if (error) throw error;
  return supabase.storage.from('clinic-images').getPublicUrl(filePath).data.publicUrl;
};

export const removeClinicImages = async (imageUrls: string[]) => {
  const publicPathPrefix = '/storage/v1/object/public/clinic-images/';
  const objectPaths = imageUrls.flatMap((imageUrl) => {
    const pathStart = imageUrl.indexOf(publicPathPrefix);
    if (pathStart < 0) return [];
    const encodedPath = imageUrl.slice(pathStart + publicPathPrefix.length).split('?')[0];
    try {
      return [decodeURIComponent(encodedPath)];
    } catch {
      return [encodedPath];
    }
  });
  if (objectPaths.length === 0) return;
  const { error } = await supabase.storage.from('clinic-images').remove(objectPaths);
  if (error) throw error;
};
