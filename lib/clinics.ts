import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

export const businessTypes = [
  { value: 'veterinary_clinic', label: 'Veterinary clinic' },
  { value: 'veterinary_hospital', label: 'Veterinary hospital' },
  { value: 'veterinary_practice', label: 'Veterinary practice' },
  { value: 'pet_shop', label: 'Pet shop' },
  { value: 'pet_supplies_store', label: 'Pet supplies and accessories store' },
  { value: 'animal_feed_store', label: 'Animal feed and farm supplies store' },
  { value: 'pet_grooming_boarding', label: 'Pet grooming and boarding' },
  { value: 'animal_shelter', label: 'Animal shelter or rescue' },
  { value: 'other', label: 'Other animal-care business' },
] as const;

export type BusinessType = typeof businessTypes[number]['value'];

export const getBusinessTypeLabel = (type: string | null | undefined, customLabel?: string | null) => {
  if (type === 'other' && customLabel?.trim()) return customLabel.trim();
  return businessTypes.find((option) => option.value === type)?.label || 'Veterinary clinic';
};

export const getOfferingLabel = (type: BusinessType) =>
  type === 'pet_shop' || type === 'pet_supplies_store' || type === 'animal_feed_store'
    ? 'Products and services'
    : 'Services and specialties';

export const getOfferingOptions = (type: BusinessType): string[] => {
  switch (type) {
    case 'pet_shop':
    case 'pet_supplies_store':
      return [
        'Pet food and treats',
        'Toys and enrichment',
        'Collars, leads, and harnesses',
        'Beds, crates, and carriers',
        'Grooming tools and supplies',
        'Pet clothing and accessories',
        'Health and wellness products',
        'Aquariums and fish supplies',
        'Bird supplies',
        'Small animal supplies',
        'Pet delivery',
      ];
    case 'animal_feed_store':
      return [
        'Poultry feed',
        'Cattle and dairy feed',
        'Fish and aquaculture feed',
        'Pig feed',
        'Sheep and goat feed',
        'Pet food',
        'Feed supplements and premixes',
        'Animal health supplies',
        'Farm equipment and supplies',
        'Feed delivery',
      ];
    case 'pet_grooming_boarding':
      return [
        'Pet grooming',
        'Bathing and coat care',
        'Nail trimming',
        'Pet boarding',
        'Day care',
        'Pet sitting',
        'Pet pickup and drop-off',
      ];
    case 'animal_shelter':
      return [
        'Animal rescue and adoption',
        'Temporary animal shelter',
        'Foster care',
        'Animal welfare support',
        'Vaccination and basic care',
        'Lost and found animal support',
      ];
    default:
      return [
        'Small animal practice',
        'Large animal practice',
        'Mixed animal practice',
        'Equine medicine',
        'Farm animal medicine',
        'Poultry medicine',
        'Swine medicine',
        'Cattle and dairy medicine',
        'Sheep and goat medicine',
        'Avian and exotic animal medicine',
        'Wildlife medicine',
        'Zoo and captive wildlife medicine',
        'Aquatic animal medicine',
        'Emergency and critical care',
        'Internal medicine',
        'Soft tissue surgery',
        'Orthopedic surgery',
        'Dentistry',
        'Dermatology',
        'Ophthalmology',
        'Cardiology',
        'Neurology',
        'Oncology',
        'Reproduction and breeding',
        'Obstetrics',
        'Anesthesia and pain management',
        'Diagnostic imaging',
        'Laboratory diagnostics',
        'Pathology',
        'Preventive care and vaccination',
        'Animal nutrition',
        'Animal behavior',
        'Rehabilitation and physiotherapy',
        'Parasitology',
        'Public health and epidemiology',
        'Food safety and meat inspection',
        'Animal welfare',
      ];
  }
};

export type VeterinaryClinic = {
  id: string;
  merchant_id: string;
  clinic_name: string;
  business_type: BusinessType;
  business_type_other: string | null;
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
