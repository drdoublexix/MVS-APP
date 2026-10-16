import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { VeterinaryClinic } from '../../lib/clinics';
import { removeClinicImages, uploadClinicImage } from '../../lib/clinics';
import { getCurrentUser, supabase } from '../../lib/supabase';

type ClinicRow = Omit<VeterinaryClinic, 'distanceKm'>;

type ClinicForm = {
  clinicName: string;
  specialties: string[];
  customSpecialty: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
  profilePhotoUrl: string;
  galleryPhotoUrls: string[];
};

const emptyForm: ClinicForm = {
  clinicName: '',
  specialties: [],
  customSpecialty: '',
  description: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  latitude: '',
  longitude: '',
  profilePhotoUrl: '',
  galleryPhotoUrls: [],
};

const specialtyOptions = [
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

const nigeriaCoordinateBounds = {
  minimumLatitude: 4.2,
  maximumLatitude: 13.9,
  minimumLongitude: 2.6,
  maximumLongitude: 14.7,
};

export default function MerchantClinicsScreen() {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [form, setForm] = useState<ClinicForm>(emptyForm);
  const [specialtyPickerOpen, setSpecialtyPickerOpen] = useState(false);
  const [newProfilePhoto, setNewProfilePhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [newGalleryPhotos, setNewGalleryPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [removedGalleryUrls, setRemovedGalleryUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const selectedClinicId = useRef<string | null>(null);

  const loadClinic = useCallback(async () => {
    setLoading(true);
    setMerchantId(null);
    setLoadingError('');
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Sign in to manage your veterinary clinic.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== 'merchant') throw new Error('Only merchant accounts can manage a veterinary clinic.');

      setMerchantId(user.id);
      const { data, error } = await supabase
        .from('veterinary_clinics')
        .select('*')
        .eq('merchant_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const loadedClinics = (data || []) as ClinicRow[];
      setClinics(loadedClinics);
      const clinic = selectedClinicId.current
        ? loadedClinics.find((item) => item.id === selectedClinicId.current) || loadedClinics[0] || null
        : loadedClinics[0] || null;
      selectedClinicId.current = clinic?.id || null;
      const clinicSpecialties = clinic?.practice_specialties?.length
        ? clinic.practice_specialties
        : clinic?.practice_specialty.split(',').map((specialty) => specialty.trim()).filter(Boolean) || [];
      setClinicId(clinic?.id || null);
      setForm(clinic ? {
        clinicName: clinic.clinic_name,
        specialties: clinicSpecialties,
        customSpecialty: '',
        description: clinic.description || '',
        phone: clinic.phone_number,
        email: clinic.email,
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
        latitude: String(clinic.latitude),
        longitude: String(clinic.longitude),
        profilePhotoUrl: clinic.profile_photo_url || '',
        galleryPhotoUrls: clinic.gallery_photo_urls || [],
      } : emptyForm);
      setNewProfilePhoto(null);
      setNewGalleryPhotos([]);
      setRemovedGalleryUrls([]);
      setSpecialtyPickerOpen(false);
    } catch (error) {
      console.error('[Merchant Clinics] Failed to load clinic:', error);
      const message = error instanceof Error ? error.message : 'Unable to load your clinic right now.';
      setLoadingError(message);
      Alert.alert('Clinic unavailable', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadClinic();
    }, [loadClinic]),
  );

  const updateForm = <K extends keyof ClinicForm>(key: K, value: ClinicForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSuccessMessage('');
  };

  const selectClinic = (clinic: ClinicRow) => {
    selectedClinicId.current = clinic.id;
    setClinicId(clinic.id);
    setForm({
      clinicName: clinic.clinic_name,
      specialties: clinic.practice_specialties?.length
        ? clinic.practice_specialties
        : clinic.practice_specialty.split(',').map((specialty) => specialty.trim()).filter(Boolean),
      customSpecialty: '',
      description: clinic.description || '',
      phone: clinic.phone_number,
      email: clinic.email,
      address: clinic.address,
      city: clinic.city,
      state: clinic.state,
      latitude: String(clinic.latitude),
      longitude: String(clinic.longitude),
      profilePhotoUrl: clinic.profile_photo_url || '',
      galleryPhotoUrls: clinic.gallery_photo_urls || [],
    });
    setNewProfilePhoto(null);
    setNewGalleryPhotos([]);
    setRemovedGalleryUrls([]);
    setSuccessMessage('');
  };

  const startNewClinic = () => {
    selectedClinicId.current = null;
    setClinicId(null);
    setForm(emptyForm);
    setNewProfilePhoto(null);
    setNewGalleryPhotos([]);
    setRemovedGalleryUrls([]);
    setSpecialtyPickerOpen(false);
    setSuccessMessage('');
  };

  const toggleSpecialty = (specialty: string) => {
    updateForm(
      'specialties',
      form.specialties.includes(specialty)
        ? form.specialties.filter((selected) => selected !== specialty)
        : [...form.specialties, specialty],
    );
  };

  const addCustomSpecialty = () => {
    const specialty = form.customSpecialty.trim();
    if (!specialty) return;
    if (!form.specialties.some((selected) => selected.toLowerCase() === specialty.toLowerCase())) {
      updateForm('specialties', [...form.specialties, specialty]);
    }
    updateForm('customSpecialty', '');
  };

  const pickProfilePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setNewProfilePhoto(result.assets[0]);
  };

  const pickGalleryPhotos = async () => {
    const remaining = 5 - form.galleryPhotoUrls.length - newGalleryPhotos.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled) setNewGalleryPhotos((current) => [...current, ...result.assets].slice(0, remaining));
  };

  const detectCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        throw new Error('Allow location access to use your current clinic coordinates.');
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      updateForm('latitude', position.coords.latitude.toFixed(6));
      updateForm('longitude', position.coords.longitude.toFixed(6));
    } catch (error) {
      console.error('[Merchant Clinics] Could not determine clinic coordinates:', error);
      Alert.alert('Location unavailable', error instanceof Error ? error.message : 'Unable to read your current location.');
    }
  };

  const validateForm = () => {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.clinicName.trim() || form.specialties.length === 0 || !form.phone.trim() || !form.email.trim()
      || !form.address.trim() || !form.city.trim() || !form.state.trim()) {
      Alert.alert('Missing clinic details', 'Complete the clinic name, practice, contact, and address fields.');
      return null;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      Alert.alert('Invalid email', 'Enter a valid clinic email address.');
      return null;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < nigeriaCoordinateBounds.minimumLatitude
      || latitude > nigeriaCoordinateBounds.maximumLatitude
      || longitude < nigeriaCoordinateBounds.minimumLongitude
      || longitude > nigeriaCoordinateBounds.maximumLongitude) {
      Alert.alert('Clinic location required', 'Enter valid latitude and longitude coordinates within Nigeria, or use the current location button.');
      return null;
    }
    if (!form.profilePhotoUrl && !newProfilePhoto) {
      Alert.alert('Clinic photo required', 'Add a profile photo for your clinic before publishing it.');
      return null;
    }
    if (form.galleryPhotoUrls.length + newGalleryPhotos.length > 5) {
      Alert.alert('Too many photos', 'A clinic can have up to five gallery photos.');
      return null;
    }
    return { latitude, longitude };
  };

  const saveClinic = async () => {
    if (!merchantId || saving) return;
    const coordinates = validateForm();
    if (!coordinates) return;
    setSaving(true);
    const uploadedUrls: string[] = [];
    const obsoleteImageUrls = [
      ...removedGalleryUrls,
      ...(newProfilePhoto && form.profilePhotoUrl ? [form.profilePhotoUrl] : []),
    ];
    try {
      let profilePhotoUrl = form.profilePhotoUrl;
      if (newProfilePhoto) {
        profilePhotoUrl = await uploadClinicImage(newProfilePhoto, merchantId);
        uploadedUrls.push(profilePhotoUrl);
      }
      const uploadedGalleryUrls = await Promise.all(newGalleryPhotos.map((asset) => uploadClinicImage(asset, merchantId)));
      uploadedUrls.push(...uploadedGalleryUrls);
      const galleryPhotoUrls = [...form.galleryPhotoUrls, ...uploadedGalleryUrls];

      const clinicDetails = {
          merchant_id: merchantId,
          clinic_name: form.clinicName.trim(),
          practice_specialty: form.specialties.join(', '),
          practice_specialties: form.specialties,
          description: form.description.trim() || null,
          phone_number: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          profile_photo_url: profilePhotoUrl,
          gallery_photo_urls: galleryPhotoUrls,
          updated_at: new Date().toISOString(),
        };
      const saveQuery = clinicId
        ? supabase.from('veterinary_clinics').update(clinicDetails).eq('id', clinicId).eq('merchant_id', merchantId)
        : supabase.from('veterinary_clinics').insert(clinicDetails);
      const { data, error } = await saveQuery.select('*').single();
      if (error) throw error;

      const clinic = data as ClinicRow;
      selectedClinicId.current = clinic.id;
      setClinicId(clinic.id);
      setClinics((current) => {
        const existingIndex = current.findIndex((item) => item.id === clinic.id);
        if (existingIndex < 0) return [...current, clinic];
        return current.map((item) => item.id === clinic.id ? clinic : item);
      });
      setForm((current) => ({
        ...current,
        profilePhotoUrl: clinic.profile_photo_url || '',
        galleryPhotoUrls: clinic.gallery_photo_urls || [],
      }));
      setNewProfilePhoto(null);
      setNewGalleryPhotos([]);
      setRemovedGalleryUrls([]);
      setSuccessMessage(clinicId ? 'Your clinic changes have been saved.' : 'Your clinic is live and available to clients.');
      if (obsoleteImageUrls.length) {
        try {
          await removeClinicImages(obsoleteImageUrls);
        } catch (cleanupError) {
          console.error('[Merchant Clinics] Clinic was saved, but old photos could not be removed:', cleanupError);
          Alert.alert('Clinic saved', 'Your clinic details were saved, but some old photos could not be removed from storage.');
        }
      }
    } catch (error) {
      console.error('[Merchant Clinics] Failed to save clinic:', error);
      if (uploadedUrls.length) {
        try {
          await removeClinicImages(uploadedUrls);
        } catch (cleanupError) {
          console.error('[Merchant Clinics] Failed to clean up clinic photos after a save error:', cleanupError);
        }
      }
      const message = error instanceof Error ? error.message : 'Unable to save your clinic right now.';
      const isNetworkError = /failed to fetch|network request failed|err_connection_timed_out/i.test(message);
      Alert.alert(
        'Save failed',
        isNetworkError
          ? 'The app could not reach Supabase while publishing your clinic. Check your internet connection and try again.'
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const removeGalleryPhoto = (url: string) => {
    setForm((current) => ({
      ...current,
      galleryPhotoUrls: current.galleryPhotoUrls.filter((photoUrl) => photoUrl !== url),
    }));
    setRemovedGalleryUrls((current) => [...current, url]);
  };

  const deleteClinic = async () => {
    if (!clinicId || !merchantId || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('veterinary_clinics')
        .delete()
        .eq('id', clinicId)
        .eq('merchant_id', merchantId);
      if (error) throw error;

      const imageUrls = [form.profilePhotoUrl, ...form.galleryPhotoUrls, ...removedGalleryUrls].filter(Boolean);
      const remainingClinics = clinics.filter((clinic) => clinic.id !== clinicId);
      setClinics(remainingClinics);
      if (remainingClinics.length) {
        selectClinic(remainingClinics[0]);
      } else {
        startNewClinic();
      }
      setNewProfilePhoto(null);
      setNewGalleryPhotos([]);
      setRemovedGalleryUrls([]);
      try {
        await removeClinicImages(imageUrls);
      } catch (cleanupError) {
        console.error('[Merchant Clinics] Clinic was deleted, but its photos could not be removed:', cleanupError);
        Alert.alert('Clinic deleted', 'Your clinic was removed, but some photos could not be cleaned up from storage.');
        return;
      }
      setSuccessMessage('Your clinic has been deleted.');
    } catch (error) {
      console.error('[Merchant Clinics] Failed to delete clinic:', error);
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete your clinic right now.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete your veterinary clinic? This removes it from client search and cannot be undone.')) {
        void deleteClinic();
      }
      return;
    }
    Alert.alert('Delete clinic?', 'This removes your clinic from client search and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete clinic', style: 'destructive', onPress: () => { void deleteClinic(); } },
    ]);
  };

  const profilePhotoSource = newProfilePhoto?.uri || form.profilePhotoUrl;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>{clinicId ? 'Manage clinic' : 'Add veterinary clinic'}</Text>
      </View>

      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#2563EB" /></View>
      ) : !merchantId ? (
        <View style={styles.loadError}>
          <MaterialCommunityIcons name="alert-circle-outline" size={35} color="#FCA5A5" />
          <Text style={styles.loadErrorText}>{loadingError || 'Sign in to manage a clinic.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { void loadClinic(); }}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>Add accurate clinic details so nearby clients can find, contact, and rate your practice.</Text>

            <View style={styles.clinicsHeading}>
              <Text style={styles.sectionTitle}>Your clinics ({clinics.length})</Text>
              <TouchableOpacity style={styles.addClinicButton} onPress={startNewClinic} accessibilityRole="button">
                <MaterialCommunityIcons name="plus" size={17} color="#FFFFFF" />
                <Text style={styles.addClinicButtonText}>Add clinic</Text>
              </TouchableOpacity>
            </View>
            {clinics.length ? (
              <View style={styles.clinicsList}>
                {clinics.map((clinic) => (
                  <TouchableOpacity
                    key={clinic.id}
                    style={[styles.clinicListItem, clinic.id === clinicId && styles.clinicListItemSelected]}
                    onPress={() => selectClinic(clinic)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: clinic.id === clinicId }}
                  >
                    <View style={styles.clinicListCopy}>
                      <Text style={styles.clinicListName}>{clinic.clinic_name}</Text>
                      <Text style={styles.clinicListLocation}>{[clinic.city, clinic.state].filter(Boolean).join(', ')}</Text>
                    </View>
                    <MaterialCommunityIcons
                      name={clinic.id === clinicId ? 'pencil' : 'chevron-right'}
                      size={19}
                      color={clinic.id === clinicId ? '#93C5FD' : '#94A3B8'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.clinicsEmpty}>No clinics yet. Add your first clinic below.</Text>
            )}

            <Text style={styles.sectionTitle}>Clinic profile photo</Text>
            <View style={styles.profilePhotoRow}>
              {profilePhotoSource ? (
                <Image source={{ uri: profilePhotoSource }} style={styles.profilePhoto} />
              ) : (
                <View style={[styles.profilePhoto, styles.photoPlaceholder]}>
                  <MaterialCommunityIcons name="hospital-building" size={36} color="#94A3B8" />
                </View>
              )}
              <TouchableOpacity style={styles.secondaryButton} onPress={() => { void pickProfilePhoto(); }}>
                <MaterialCommunityIcons name="image-plus" size={18} color="#93C5FD" />
                <Text style={styles.secondaryButtonText}>{profilePhotoSource ? 'Change photo' : 'Choose photo'}</Text>
              </TouchableOpacity>
              {newProfilePhoto ? (
                <TouchableOpacity onPress={() => setNewProfilePhoto(null)} accessibilityLabel="Cancel new profile photo">
                  <MaterialCommunityIcons name="close-circle" size={22} color="#FCA5A5" />
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Clinic details</Text>
            <Field label="Clinic name" value={form.clinicName} onChangeText={(value) => updateForm('clinicName', value)} placeholder="e.g. Green Paws Veterinary Clinic" />
            <Text style={styles.label}>Practice specialties</Text>
            <TouchableOpacity
              style={styles.specialtyPickerButton}
              onPress={() => setSpecialtyPickerOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Choose one or more clinic specialties"
              accessibilityState={{ expanded: specialtyPickerOpen }}
            >
              <Text style={[styles.specialtyPickerText, form.specialties.length === 0 && styles.specialtyPlaceholder]}>
                {form.specialties.length ? `${form.specialties.length} selected` : 'Select practice specialties'}
              </Text>
              <MaterialCommunityIcons name={specialtyPickerOpen ? 'chevron-up' : 'chevron-down'} size={22} color="#93C5FD" />
            </TouchableOpacity>
            {form.specialties.length ? (
              <View style={styles.selectedSpecialties}>
                {form.specialties.map((specialty) => (
                  <TouchableOpacity key={specialty} style={styles.specialtyChip} onPress={() => toggleSpecialty(specialty)} accessibilityLabel={`Remove ${specialty}`}>
                    <Text style={styles.specialtyChipText}>{specialty}</Text>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#BFDBFE" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {specialtyPickerOpen ? (
              <View style={styles.specialtyPicker}>
                <ScrollView nestedScrollEnabled style={styles.specialtyOptions} keyboardShouldPersistTaps="handled">
                  {specialtyOptions.map((specialty) => {
                    const selected = form.specialties.includes(specialty);
                    return (
                      <TouchableOpacity key={specialty} style={styles.specialtyOption} onPress={() => toggleSpecialty(specialty)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
                        <MaterialCommunityIcons name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={19} color={selected ? '#60A5FA' : '#94A3B8'} />
                        <Text style={styles.specialtyOptionText}>{specialty}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={styles.customSpecialtyLabel}>Add another specialty</Text>
                <View style={styles.customSpecialtyRow}>
                  <TextInput
                    value={form.customSpecialty}
                    onChangeText={(value) => updateForm('customSpecialty', value)}
                    placeholder="Enter a custom specialty"
                    placeholderTextColor="#64748B"
                    style={[styles.input, styles.customSpecialtyInput]}
                    returnKeyType="done"
                    onSubmitEditing={addCustomSpecialty}
                  />
                  <TouchableOpacity style={styles.addSpecialtyButton} onPress={addCustomSpecialty} accessibilityLabel="Add custom specialty">
                    <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <Field label="About the clinic (optional)" value={form.description} onChangeText={(value) => updateForm('description', value)} placeholder="Services, opening hours, or other useful details" multiline />
            <Field label="Phone number" value={form.phone} onChangeText={(value) => updateForm('phone', value)} placeholder="+234..." keyboardType="phone-pad" />
            <Field label="Email address" value={form.email} onChangeText={(value) => updateForm('email', value)} placeholder="clinic@example.com" keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.sectionTitle}>Clinic location</Text>
            <Field label="Street address" value={form.address} onChangeText={(value) => updateForm('address', value)} placeholder="Street, area, or landmark" />
            <View style={styles.twoColumns}>
              <Field label="City" value={form.city} onChangeText={(value) => updateForm('city', value)} placeholder="City" />
              <Field label="State" value={form.state} onChangeText={(value) => updateForm('state', value)} placeholder="State" />
            </View>
            <TouchableOpacity style={styles.locationButton} onPress={() => { void detectCurrentLocation(); }}>
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#93C5FD" />
              <Text style={styles.secondaryButtonText}>Use current location for map pin</Text>
            </TouchableOpacity>
            <Text style={styles.locationGuidance}>
              (Tap this while you are at your clinic to pin its exact live location and help clients navigate to you.)
            </Text>
            <View style={styles.twoColumns}>
              <Field label="Latitude" value={form.latitude} onChangeText={(value) => updateForm('latitude', value)} placeholder="e.g. 6.5244" keyboardType="decimal-pad" />
              <Field label="Longitude" value={form.longitude} onChangeText={(value) => updateForm('longitude', value)} placeholder="e.g. 3.3792" keyboardType="decimal-pad" />
            </View>
            <Text style={styles.hint}>A map pin is required to appear in nearby clinic results. You can adjust the coordinates manually.</Text>

            <Text style={styles.sectionTitle}>Clinic photos ({form.galleryPhotoUrls.length + newGalleryPhotos.length}/5)</Text>
            <View style={styles.gallery}>
              {form.galleryPhotoUrls.map((url) => (
                <View key={url} style={styles.galleryItem}>
                  <Image source={{ uri: url }} style={styles.galleryPhoto} />
                  <TouchableOpacity style={styles.removePhoto} onPress={() => removeGalleryPhoto(url)} accessibilityLabel="Remove clinic photo">
                    <MaterialCommunityIcons name="close-circle" size={22} color="#FCA5A5" />
                  </TouchableOpacity>
                </View>
              ))}
              {newGalleryPhotos.map((asset, index) => (
                <View key={`${asset.uri}-${index}`} style={styles.galleryItem}>
                  <Image source={{ uri: asset.uri }} style={styles.galleryPhoto} />
                  <TouchableOpacity style={styles.removePhoto} onPress={() => setNewGalleryPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} accessibilityLabel="Remove selected clinic photo">
                    <MaterialCommunityIcons name="close-circle" size={22} color="#FCA5A5" />
                  </TouchableOpacity>
                </View>
              ))}
              {form.galleryPhotoUrls.length + newGalleryPhotos.length < 5 ? (
                <TouchableOpacity style={styles.addPhoto} onPress={() => { void pickGalleryPhotos(); }}>
                  <MaterialCommunityIcons name="plus" size={25} color="#93C5FD" />
                  <Text style={styles.addPhotoText}>Add photos</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={() => { void saveClinic(); }} disabled={saving || deleting}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>{clinicId ? 'Save clinic changes' : 'Publish clinic'}</Text>}
            </TouchableOpacity>
            {clinicId ? (
              <TouchableOpacity style={[styles.deleteButton, deleting && styles.disabled]} onPress={confirmDelete} disabled={saving || deleting}>
                {deleting ? <ActivityIndicator color="#FCA5A5" /> : <><MaterialCommunityIcons name="delete-outline" size={19} color="#FCA5A5" /><Text style={styles.deleteText}>Delete clinic</Text></>}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.addAnotherClinicButton} onPress={startNewClinic} disabled={saving || deleting}>
              <MaterialCommunityIcons name="plus-circle-outline" size={19} color="#93C5FD" />
              <Text style={styles.addAnotherClinicText}>Add another clinic</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        style={[styles.input, multiline && styles.multiline]}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  flex: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadErrorText: { color: '#FECACA', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  retryButton: { backgroundColor: '#2563EB', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, marginTop: 16 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  content: { padding: 18, paddingBottom: 36 },
  intro: { color: '#CBD5E1', fontSize: 14, lineHeight: 21, marginBottom: 22 },
  clinicsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  clinicsList: { gap: 8, marginBottom: 10 },
  clinicListItem: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#334155', borderRadius: 9, backgroundColor: '#1E293B' },
  clinicListItemSelected: { borderColor: '#3B82F6', backgroundColor: '#1E3A5F' },
  clinicListCopy: { flex: 1 },
  clinicListName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  clinicListLocation: { color: '#94A3B8', fontSize: 11, marginTop: 3 },
  clinicsEmpty: { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  addClinicButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, backgroundColor: '#2563EB', borderRadius: 8 },
  addClinicButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  success: { color: '#A7F3D0', backgroundColor: '#064E3B', padding: 12, margin: 16, borderRadius: 9, fontSize: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 17, marginBottom: 11 },
  profilePhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 10 },
  profilePhoto: { width: 82, height: 82, borderRadius: 12, backgroundColor: '#1E293B' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
  secondaryButton: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#1E293B', borderRadius: 8 },
  secondaryButtonText: { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  specialtyPickerButton: { minHeight: 45, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  specialtyPickerText: { color: '#FFFFFF', fontSize: 14 },
  specialtyPlaceholder: { color: '#64748B' },
  selectedSpecialties: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9, marginBottom: 4 },
  specialtyChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 16, backgroundColor: '#1D4ED8' },
  specialtyChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  specialtyPicker: { borderWidth: 1, borderColor: '#334155', borderRadius: 9, backgroundColor: '#111C2E', padding: 10, marginTop: 7, marginBottom: 12 },
  specialtyOptions: { maxHeight: 220 },
  specialtyOption: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  specialtyOptionText: { flex: 1, color: '#E2E8F0', fontSize: 12 },
  customSpecialtyLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '600', marginTop: 11, marginBottom: 7 },
  customSpecialtyRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  customSpecialtyInput: { flex: 1, marginBottom: 0 },
  addSpecialtyButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', borderRadius: 8 },
  field: { flex: 1, marginBottom: 12 },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { minHeight: 45, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, color: '#FFFFFF', fontSize: 14 },
  multiline: { minHeight: 88, paddingTop: 11 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 9, marginBottom: 8 },
  locationGuidance: { color: '#94A3B8', fontSize: 11, lineHeight: 16, marginTop: -5, marginBottom: 10 },
  hint: { color: '#94A3B8', fontSize: 11, lineHeight: 17, marginTop: -2, marginBottom: 4 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galleryItem: { position: 'relative' },
  galleryPhoto: { width: 78, height: 78, borderRadius: 9, backgroundColor: '#1E293B' },
  removePhoto: { position: 'absolute', top: -7, right: -7, backgroundColor: '#0F172A', borderRadius: 12 },
  addPhoto: { width: 78, height: 78, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: '#475569', justifyContent: 'center', alignItems: 'center' },
  addPhotoText: { color: '#93C5FD', fontSize: 10, fontWeight: '600', marginTop: 2 },
  saveButton: { minHeight: 48, backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 27 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  deleteButton: { minHeight: 46, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1, borderColor: '#7F1D1D', borderRadius: 10 },
  deleteText: { color: '#FCA5A5', fontWeight: '700', fontSize: 13 },
  addAnotherClinicButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  addAnotherClinicText: { color: '#93C5FD', fontSize: 13, fontWeight: '700' },
});
