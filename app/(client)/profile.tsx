import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, {
    type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import Constants from 'expo-constants';
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AvatarPreviewModal from "../../components/AvatarPreviewModal";
import LogoutConfirmationModal from "../../components/LogoutConfirmationModal";
import MVSDiseasePredictor from "../../components/MVSDiseasePredictor";
import MVSFeedCalculator from "../../components/MVSFeedCalculator";
import EditPetModal, { type EditablePet } from "../../components/EditPetModal";
import FarmMedicalHistory from "../../components/FarmMedicalHistory";
import PetMedicalHistory from "../../components/PetMedicalHistory";
import { formatDateInput, parseDateInput } from "../../lib/dateFormat";
import { requestDeviceLocation } from "../../lib/location";
import { registerForPushNotifications } from "../../lib/notifications";
import { isValidPassword, PASSWORD_REQUIREMENTS } from "../../lib/password";
import { calculatePetAgeInWeeks } from "../../lib/petAge";
import { sanitizeInput } from "../../lib/sanitize";
import {
    getCurrentUser,
    readCachedAuthState,
    sendPasswordResetLink,
    signOutUser,
    supabase,
    updatePassword,
} from "../../lib/supabase";

let Notifications: typeof import('expo-notifications') | null = null;
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants.executionEnvironment as string) === 'storeClient' ||
  (Constants.executionEnvironment as string) === 'expo';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch (error) {
    console.warn('[Profile Notifications] expo-notifications was not available:', error);
    Notifications = null;
  }
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

type Pet = EditablePet & { owner_id: string };
type FarmRecord = {
  id: string;
  species: string;
  breed: string | null;
  flock_size: number | null;
  location: string | null;
  restock_date: string | null;
  medical_log: string | null;
  production_summary: string | null;
};
type FarmDraft = {
  species: string;
  customSpecies: string;
  breed: string;
  flockSize: string;
  location: string;
  restockDate: string;
  medicalLog: string;
  productionSummary: string;
};
type SettingsModal = "profile" | "password" | "notifications" | null;
const emptyPet: EditablePet = {
  id: "",
  name: "",
  type: "",
  breed: "",
  dob: "",
  vaccination_status: "Not Vaccinated",
  medical_notes: "",
  photos: [],
};
const farmSpecies = [
  "Caprine",
  "Laprine",
  "Avian/Poultry",
  "Ovine",
  "Bovine",
] as const;
const petAge = calculatePetAgeInWeeks;
type NotificationPreferences = {
  orders: boolean;
  chat: boolean;
  consultations: boolean;
  reminders: boolean;
  payouts: boolean;
};

const buildDefaultNotificationPreferences = (): NotificationPreferences => ({
  orders: true,
  chat: true,
  consultations: true,
  reminders: true,
  payouts: true,
});

const normalizeNotificationPreferences = (prefs?: Record<string, unknown> | null): NotificationPreferences => ({
  orders: typeof prefs?.orders === "boolean" ? prefs.orders : true,
  chat: typeof prefs?.chat === "boolean" ? prefs.chat : true,
  consultations: typeof prefs?.consultations === "boolean" ? prefs.consultations : true,
  reminders: typeof prefs?.reminders === "boolean" ? prefs.reminders : true,
  payouts: typeof prefs?.payouts === "boolean" ? prefs.payouts : true,
});

export default function ProfileScreen() {
  const router = useRouter();
  const [modal, setModal] = useState<SettingsModal>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [petEditorVisible, setPetEditorVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false);
  const [profileState, setProfile] = useState<{
    name?: string;
    phone?: string;
    email?: string;
    avatar_url?: string;
    latitude?: number | null;
    longitude?: number | null;
    city?: string;
    state?: string;
    loyalty_points?: number | null;
    vip_discount_active_until?: string | null;
  } | null>(null);
  const [storedAvatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const profile = {
    name: profileState?.name || "",
    phone: profileState?.phone || "",
    email: profileState?.email || "",
    avatar_url: profileState?.avatar_url,
    latitude: profileState?.latitude ?? null,
    longitude: profileState?.longitude ?? null,
    city: profileState?.city || "",
    state: profileState?.state || "",
  };
  const [currentUserId, setCurrentUserId] = useState("");
  const [pets, setPets] = useState<Pet[]>([]);
  const [farmRecords, setFarmRecords] = useState<FarmRecord[]>([]);
  const [farmModalVisible, setFarmModalVisible] = useState(false);
  const [farmDatePickerVisible, setFarmDatePickerVisible] = useState(false);
  const [restockDateInput, setRestockDateInput] = useState("");
  const [farmSaving, setFarmSaving] = useState(false);
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [farmDraft, setFarmDraft] = useState<FarmDraft>({
    species: farmSpecies[0],
    customSpecies: "",
    breed: "",
    flockSize: "",
    location: "",
    restockDate: "",
    medicalLog: "",
    productionSummary: "",
  });
  const [editingPet, setEditingPet] = useState<EditablePet>(emptyPet);
  const [password, setPassword] = useState({ next: "", confirm: "" });
  const role = "client";
  const notificationOptions: {
    key: keyof NotificationPreferences;
    label: string;
  }[] = [
    ...(role === "client"
      ? [
          { key: "orders" as const, label: "New Orders / Order Updates" },
          { key: "chat" as const, label: "Chat Messages / Inquiries" },
          {
            key: "consultations" as const,
            label: "Consultation Updates / New Consult Requests",
          },
          { key: "reminders" as const, label: "Vaccine & Health Reminders" },
        ]
      : []),
  ];

  const [notifications, setNotifications] = useState<NotificationPreferences>(
    buildDefaultNotificationPreferences()
  );

  const loadPets = async (ownerId: string) => {
    const { data } = await supabase
      .from("pets")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    setPets((data || []) as Pet[]);
  };

  const loadFarmRecords = async (clientId: string) => {
    const { data } = await supabase
      .from("farm_records")
      .select(
        "id, species, breed, flock_size, location, restock_date, medical_log, production_summary"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setFarmRecords((data || []) as FarmRecord[]);
  };

  const loadNotificationPreferences = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url, notification_preferences, phone_number")
      .eq("id", userId)
      .maybeSingle();

    if (
      data?.notification_preferences &&
      typeof data.notification_preferences === "object"
    ) {
      setNotifications(
        normalizeNotificationPreferences(
          data.notification_preferences as Record<string, unknown>
        )
      );
    } else {
      setNotifications(buildDefaultNotificationPreferences());
    }

    if (
      data?.avatar_url &&
      typeof data.avatar_url === "string" &&
      data.avatar_url.trim() !== ""
    ) {
      setProfile((current) => ({
        ...(current || {}),
        avatar_url: current?.avatar_url || data.avatar_url,
      }));
    }
    if (data?.phone_number)
      setProfile((current) => ({
        ...(current || {}),
        phone: data.phone_number,
      }));
  }, []);

  const saveNotificationPreferences = async (
    prefs: NotificationPreferences
  ) => {
    const user = await getCurrentUser();
    if (!user) return;
    try {
      await registerForPushNotifications(user.id);
    } catch (error) {
      console.warn(
        "[Notifications] Permission or token registration failed:",
        error
      );
    }
    await supabase
      .from("profiles")
      .update({ notification_preferences: prefs })
      .eq("id", user.id);
  };

  useEffect(() => {
    if (!Notifications) return undefined;

    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
      });
    }

    if (Platform.OS === "web") return undefined;

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log(
          "[Notifications] Received notification:",
          notification.request.identifier
        );
      }
    );
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(
          "[Notifications] Notification response:",
          response.notification.request.identifier
        );
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const profileLoadStartedAt = Date.now();
      const [cachedState, authResult] = await Promise.all([
        readCachedAuthState(),
        supabase.auth.getUser(),
      ]);
      const cachedUser = cachedState.user as any;
      const cachedProfile = cachedState.profile as any;

      if (cachedUser) {
        const cachedAvatar =
          cachedProfile?.avatar_url ||
          cachedProfile?.avatar ||
          cachedUser.user_metadata?.avatar_url ||
          cachedUser.user_metadata?.picture ||
          null;
        setUser(cachedUser);
        setCurrentUserId(cachedUser.id);
        setAvatarUrl(cachedAvatar);
        setProfile((current) => ({
          ...(current || {}),
          name:
            cachedProfile?.full_name ||
            cachedUser.user_metadata?.full_name ||
            cachedUser.user_metadata?.name ||
            "Pet Owner",
          phone:
            cachedProfile?.phone_number ||
            cachedUser.user_metadata?.phone ||
            "",
          email: cachedUser.email || cachedProfile?.email || "",
          avatar_url: cachedAvatar || "",
          loyalty_points: Number(cachedProfile?.loyalty_points) || 0,
          vip_discount_active_until:
            cachedProfile?.vip_discount_active_until || null,
        }));
      }

      const authUser = authResult.data.user;
      const currentUser = authUser || cachedUser || (await getCurrentUser());
      if (!currentUser) return;

      setUser(currentUser);
      setCurrentUserId(currentUser.id);

      const { data: profileData } = await supabase
        .from("profiles")
        .select(
          "avatar_url, phone_number, loyalty_points, vip_discount_active_until"
        )
        .eq("id", currentUser.id)
        .single();
      const activeAvatar =
        profileData?.avatar_url ||
        currentUser.user_metadata?.avatar_url ||
        currentUser.user_metadata?.picture ||
        null;
      setAvatarUrl(activeAvatar);

      setProfile((current) => ({
        ...(current || {}),
        name:
          currentUser.user_metadata?.full_name ||
          currentUser.user_metadata?.name ||
          "Pet Owner",
        phone:
          profileData?.phone_number || currentUser.user_metadata?.phone || "",
        email: currentUser.email || "",
        avatar_url:
          profileData?.avatar_url ||
          currentUser.user_metadata?.avatar_url ||
          currentUser.user_metadata?.picture ||
          "",
        loyalty_points: Number(profileData?.loyalty_points) || 0,
        vip_discount_active_until:
          profileData?.vip_discount_active_until || null,
      }));

      const dataLoadStartedAt = Date.now();
      await Promise.all([
        loadPets(currentUser.id),
        loadFarmRecords(currentUser.id),
        loadNotificationPreferences(currentUser.id),
      ]);
      console.debug("[Client Profile] Loaded profile data", {
        authMs: dataLoadStartedAt - profileLoadStartedAt,
        relatedDataMs: Date.now() - dataLoadStartedAt,
        totalMs: Date.now() - profileLoadStartedAt,
      });
    })().catch((error) => {
      console.error("[Client Profile] Initial data load failed:", error);
    });
  }, [loadNotificationPreferences]);

  const openPet = (pet?: Pet) => {
    setEditingPet(
      pet
        ? {
            id: pet.id,
            name: pet.name,
            type: pet.type,
            breed: pet.breed || "",
            dob: pet.dob,
            vaccination_status: pet.vaccination_status || "Not Vaccinated",
            medical_notes: pet.medical_notes || "",
            photos: pet.photos || [],
          }
        : { ...emptyPet }
    );
    setPetEditorVisible(true);
  };

  const savePet = async (petDraft: EditablePet) => {
    const cleanName = sanitizeInput(petDraft.name);
    const cleanType = sanitizeInput(petDraft.type);
    const cleanBreed = sanitizeInput(petDraft.breed);
    const cleanVaccinationStatus = sanitizeInput(petDraft.vaccination_status);
    const cleanMedicalNotes = sanitizeInput(petDraft.medical_notes);
    if (!currentUserId || !cleanName || !cleanType) return;
    const { data, error } = await supabase
      .from("pets")
      .upsert({
        id: petDraft.id || undefined,
        owner_id: currentUserId,
        name: cleanName,
        type: cleanType,
        breed: cleanBreed || null,
        dob: petDraft.dob || null,
        vaccination_status: cleanVaccinationStatus,
        medical_notes: cleanMedicalNotes || null,
        photos: petDraft.photos,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      Alert.alert("Could not save pet", error.message);
      return;
    }
    setPets((current) =>
      current.some((pet) => pet.id === data.id)
        ? current.map((pet) => (pet.id === data.id ? (data as Pet) : pet))
        : [...current, data as Pet]
    );
  };

  const resetFarmDraft = () => {
    setEditingFarmId(null);
    setFarmDraft({
      species: farmSpecies[0],
      customSpecies: "",
      breed: "",
      flockSize: "",
      location: "",
      restockDate: "",
      medicalLog: "",
      productionSummary: "",
    });
    setRestockDateInput("");
  };

  const openAddFarmModal = () => {
    resetFarmDraft();
    setFarmModalVisible(true);
  };

  const openEditFarmModal = (farm: FarmRecord) => {
    const isPreset = farmSpecies.includes(
      farm.species as (typeof farmSpecies)[number]
    );
    setEditingFarmId(farm.id);
    setFarmDraft({
      species: isPreset ? farm.species : "Custom",
      customSpecies: isPreset ? "" : farm.species,
      breed: farm.breed || "",
      flockSize: String(farm.flock_size ?? 0),
      location: farm.location || "",
      restockDate: farm.restock_date || "",
      medicalLog: farm.medical_log || "",
      productionSummary: farm.production_summary || "",
    });
    setRestockDateInput(formatDateInput(farm.restock_date));
    setFarmModalVisible(true);
  };

  const closeFarmModal = () => {
    setFarmModalVisible(false);
    setFarmDatePickerVisible(false);
    resetFarmDraft();
  };

  const saveFarmRecord = async () => {
    if (!currentUserId || farmSaving) return;
    const species = sanitizeInput(
      farmDraft.species === "Custom"
        ? farmDraft.customSpecies
        : farmDraft.species
    );
    const breed = sanitizeInput(farmDraft.breed);
    const location = sanitizeInput(farmDraft.location);
    const medicalLog = sanitizeInput(farmDraft.medicalLog);
    const productionSummary = sanitizeInput(farmDraft.productionSummary);
    const flockSize = Number.parseInt(farmDraft.flockSize, 10);
    if (!species || !Number.isInteger(flockSize) || flockSize < 0) {
      Alert.alert(
        "Incomplete farm record",
        "Select a species and enter a valid flock or herd size."
      );
      return;
    }
    setFarmSaving(true);
    const payload = {
      species,
      breed: breed || null,
      flock_size: flockSize,
      location: location || null,
      restock_date: farmDraft.restockDate || null,
      medical_log: medicalLog || null,
      production_summary: productionSummary || null,
    };
    const query = editingFarmId
      ? supabase
          .from("farm_records")
          .update(payload)
          .eq("id", editingFarmId)
          .eq("client_id", currentUserId)
          .select(
            "id, species, breed, flock_size, location, restock_date, medical_log, production_summary"
          )
          .single()
      : supabase
          .from("farm_records")
          .insert({ ...payload, client_id: currentUserId })
          .select(
            "id, species, breed, flock_size, location, restock_date, medical_log, production_summary"
          )
          .single();
    const { data, error } = await query;
    setFarmSaving(false);
    if (error) {
      Alert.alert("Could not save farm record", error.message);
      return;
    }
    const savedFarm = data as FarmRecord;
    setFarmRecords((current) =>
      editingFarmId
        ? current.map((farm) => (farm.id === editingFarmId ? savedFarm : farm))
        : [savedFarm, ...current]
    );
    closeFarmModal();
  };

  const deleteFarmRecord = () => {
    if (!editingFarmId || farmSaving) return;
    Alert.alert(
      "Delete farm record?",
      "This record and its farm details will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setFarmSaving(true);
              const { error } = await supabase
                .from("farm_records")
                .delete()
                .eq("id", editingFarmId)
                .eq("client_id", currentUserId);
              setFarmSaving(false);
              if (error) {
                Alert.alert("Could not delete farm record", error.message);
                return;
              }
              setFarmRecords((current) =>
                current.filter((farm) => farm.id !== editingFarmId)
              );
              closeFarmModal();
            })();
          },
        },
      ]
    );
  };

  const saveProfile = async () => {
    const user = await getCurrentUser();
    if (!user || !profile) return;
    const cleanName = sanitizeInput(profile.name);
    const cleanCity = sanitizeInput(profile.city);
    const cleanState = sanitizeInput(profile.state);
    const formattedPhoneNumber = sanitizeInput(profile.phone).replace(
      /[\s()-]/g,
      ""
    );
    if (!/^\+[1-9]\d{7,14}$/.test(formattedPhoneNumber)) {
      Alert.alert(
        "Invalid phone number",
        "Enter a valid international number, for example +2348000000000."
      );
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: cleanName,
        phone_number: formattedPhoneNumber,
        latitude: profile.latitude,
        longitude: profile.longitude,
        city: cleanCity,
        state: cleanState,
      })
      .eq("id", user.id);
    if (error) {
      Alert.alert(
        error.code === "23505"
          ? "Phone number unavailable"
          : "Could not save profile",
        error.code === "23505"
          ? "This phone number is already associated with another MVS account."
          : error.message
      );
      return;
    }
    await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        full_name: cleanName,
        phone: formattedPhoneNumber,
      },
    });
    setProfile((current) => ({
      ...current,
      name: cleanName,
      phone: formattedPhoneNumber,
      city: cleanCity,
      state: cleanState,
    }));
    setModal(null);
    setSuccessMessage("Profile has been updated successfully.");
    setTimeout(() => setSuccessMessage(null), 3000);
  };
  const detectAndSaveLocation = async () => {
    console.log("[Client Profile] Detecting location...");
    setLocationLoading(true);
    try {
      const location = await requestDeviceLocation();
      if (!location) throw new Error("Location permission was not granted.");
      const user = await getCurrentUser();
      setProfile((current) => ({ ...current, ...location }));
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update(location)
          .eq("id", user.id);
        if (error) throw error;
      }
      console.log("[Client Profile] Location saved:", location);
      setLocationPickerVisible(false);
      Alert.alert(
        "Location updated",
        `${location.city || "Nearby area"}, ${location.state || "Nigeria"}`
      );
    } catch (error) {
      console.log("[Client Profile] Location error:", error);
      Alert.alert(
        "Location unavailable",
        error instanceof Error
          ? error.message
          : "Enable location access or choose manually."
      );
    } finally {
      setLocationLoading(false);
    }
  };
  const changePassword = async () => {
    if (!isValidPassword(password.next)) {
      Alert.alert("Invalid password", PASSWORD_REQUIREMENTS);
      return;
    }
    if (password.next !== password.confirm) {
      Alert.alert(
        "Passwords do not match",
        "Please make sure both password fields match."
      );
      return;
    }
    await updatePassword(password.next);
    setPassword({ next: "", confirm: "" });
    setModal(null);
    Alert.alert("Password updated", "Your password has been changed.");
  };
  const sendResetLink = async () => {
    if (!profile?.email) return;
    await sendPasswordResetLink(profile.email);
    Alert.alert(
      "Reset link sent",
      "Check your email to choose a new password."
    );
  };
  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.warn('[Client Profile] Logout cleanup failed; continuing to auth screen:', error);
    } finally {
      setUser(null);
      setProfile(null);
      setAvatarUrl(null);
      setCurrentUserId("");
      setPets([]);
      setFarmRecords([]);
      router.replace('/auth?mode=signin');
    }
  };
  const handleDeleteAccount = async () => {
    try {
      const { error } = await supabase.rpc("delete_user_account");
      if (error) throw error;
      await signOutUser();
      setUser(null);
      setProfile(null);
      setAvatarUrl(null);
      setCurrentUserId("");
      setPets([]);
      setFarmRecords([]);
      router.replace('/auth?mode=signin');
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to delete account."
      );
    }
  };

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      const currentUser = await getCurrentUser();
      if (!currentUser) return;

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const file = await response.blob();
      const fileName =
        asset.fileName ||
        asset.uri.split("/").pop() ||
        `avatar-${Date.now()}.jpg`;
      const fileExt = fileName.split(".").pop() || "jpg";
      const filePath = `${currentUser.id}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: asset.mimeType || file.type,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);
      const newAvatarUrl = publicUrlData.publicUrl;
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: newAvatarUrl })
        .eq("id", currentUser.id);
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: { avatar_url: newAvatarUrl },
      });
      if (authError) throw authError;

      setProfile((current) => ({
        ...(current || {}),
        avatar_url: newAvatarUrl,
      }));
      setAvatarUrl(newAvatarUrl);
      setSuccessMessage("Profile photo updated successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      Alert.alert(
        "Could not update profile photo",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  };

  const profileData = {
    ...(profileState || {}),
    avatar_url: storedAvatarUrl || profileState?.avatar_url,
  };
  const avatarUrl =
    profileData?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;
  const loyaltyPoints = Math.max(
    0,
    Math.min(1000, Number(profileState?.loyalty_points) || 0)
  );
  const loyaltyProgress = `${(loyaltyPoints / 1000) * 100}%` as `${number}%`;
  const vipExpiry = profileState?.vip_discount_active_until
    ? new Date(profileState.vip_discount_active_until)
    : null;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const vipDaysRemaining =
    vipExpiry && vipExpiry.getTime() > currentTime
      ? Math.ceil((vipExpiry.getTime() - currentTime) / 86400000)
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      {successMessage ? (
        <View
          style={{
            position: "absolute",
            top: 14,
            left: 16,
            right: 16,
            zIndex: 10,
            backgroundColor: "#065F46",
            borderRadius: 9,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MaterialCommunityIcons
            name="check-circle"
            size={18}
            color="#D1FAE5"
          />
          <Text style={{ color: "#D1FAE5", fontWeight: "600" }}>
            {successMessage}
          </Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.profileHeader,
            { flexDirection: "row", gap: 16, marginBottom: 25 },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.avatarFallback,
              { alignSelf: "auto", marginBottom: 0 },
            ]}
            onPress={() => setAvatarPreviewVisible(true)}
            accessibilityLabel="View profile photo"
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[styles.avatar, { alignSelf: "auto", marginBottom: 0 }]}
                resizeMode="cover"
              />
            ) : (
              <MaterialCommunityIcons
                name="account"
                size={54}
                color="#94A3B8"
              />
            )}
          </TouchableOpacity>
          <View style={styles.flex}>
            <Text style={styles.title}>{profile?.name || "Pet Owner"}</Text>
            <Text style={styles.muted}>{profile?.email || ""}</Text>
            <Text
              style={{
                color: profile.phone ? "#34D399" : "#94A3B8",
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {profile.phone ? "Phone number saved" : "No phone number saved"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                void pickAvatar();
              }}
              accessibilityLabel="Tap to change photo"
            >
              <Text style={{ color: "#64748B", fontSize: 11, marginTop: 5 }}>
                Tap to change photo
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <AvatarPreviewModal
          imageUrl={avatarUrl}
          visible={avatarPreviewVisible}
          onClose={() => setAvatarPreviewVisible(false)}
        />
        <View
          style={{
            backgroundColor: "#1E293B",
            borderColor: "#92400E",
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            marginBottom: 25,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.flex}>
              <Text
                style={{ color: "#FBBF24", fontSize: 17, fontWeight: "700" }}
              >
                MVS CarePass Loyalty
              </Text>
              <Text style={{ color: "#CBD5E1", fontSize: 12, marginTop: 4 }}>
                Earn points from official invoice payments.
              </Text>
            </View>
            <MaterialCommunityIcons
              name="star-circle"
              size={28}
              color="#FBBF24"
            />
          </View>
          <View
            style={{
              height: 10,
              backgroundColor: "#334155",
              borderRadius: 5,
              overflow: "hidden",
              marginTop: 16,
            }}
          >
            <View
              style={{
                height: "100%",
                width: loyaltyProgress,
                backgroundColor: "#F59E0B",
                borderRadius: 5,
              }}
            />
          </View>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: "700",
              marginTop: 9,
            }}
          >
            {loyaltyPoints} / 1000 PTS to VIP Status
          </Text>
          {vipDaysRemaining > 0 ? (
            <View
              style={{
                backgroundColor: "#065F46",
                borderRadius: 8,
                padding: 10,
                marginTop: 12,
              }}
            >
              <Text
                style={{ color: "#D1FAE5", fontSize: 12, fontWeight: "700" }}
              >
                🔥 30% VIP Discount Active (Expires in {vipDaysRemaining} Days)
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.section}>
          <View style={styles.rowHeader}>
            <Text style={styles.sectionTitle}>My Pets Record</Text>
            <TouchableOpacity onPress={() => openPet()}>
              <Text style={styles.add}>+</Text>
            </TouchableOpacity>
          </View>
          {pets.length === 0 ? (
            <Text style={styles.muted}>
              Add your first pet to keep their details close.
            </Text>
          ) : (
            pets.map((pet) => (
              <View key={pet.id}>
                <TouchableOpacity
                  style={styles.pet}
                  onPress={() => openPet(pet)}
                >
                  {pet.photos?.[0] ? (
                    <Image
                      source={{ uri: pet.photos[0] }}
                      style={styles.petThumb}
                    />
                  ) : (
                    <View style={styles.paw}>
                      <Text style={styles.pawText}>+</Text>
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.primary}>{pet.name}</Text>
                    <Text style={styles.muted}>
                      {pet.type} · {pet.breed || "Breed unknown"} ·{" "}
                      {petAge(pet.dob)}
                    </Text>
                    <Text style={styles.status}>
                      {pet.vaccination_status} · {(pet.photos || []).length}/3
                      photos
                    </Text>
                  </View>
                </TouchableOpacity>
                <PetMedicalHistory petId={pet.id} />
              </View>
            ))
          )}
        </View>
        <View style={styles.section}>
          <View style={styles.rowHeader}>
            <Text style={styles.sectionTitle}>My Farm & Livestock Records</Text>
            <TouchableOpacity onPress={() => openAddFarmModal()}>
              <Text style={styles.add}>+</Text>
            </TouchableOpacity>
          </View>
          {farmRecords.length === 0 ? (
            <Text style={styles.muted}>
              Add a farm record to track your livestock.
            </Text>
          ) : (
            farmRecords.map((farm) => (
              <View key={farm.id}>
                <TouchableOpacity
                  style={{
                    backgroundColor: "#1E293B",
                    borderColor: "#334155",
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 13,
                    marginBottom: 9,
                    gap: 4,
                  }}
                  onPress={() => openEditFarmModal(farm)}
                >
                  <Text style={styles.primary}>{farm.species}</Text>
                  <Text style={styles.muted}>
                    Breed: {farm.breed || "Not specified"}
                  </Text>
                  <Text style={styles.muted}>
                    Flock/Herd Size: {farm.flock_size ?? 0}
                  </Text>
                  <Text style={styles.muted}>
                    Location: {farm.location || "Not specified"}
                  </Text>
                  <Text style={styles.muted}>
                    Restock Date: {farm.restock_date || "Not specified"}
                  </Text>
                  {farm.medical_log ? (
                    <>
                      <Text
                        style={{
                          color: "#60A5FA",
                          fontSize: 11,
                          fontWeight: "700",
                          marginTop: 6,
                        }}
                      >
                        Medical Log
                      </Text>
                      <Text style={styles.muted}>{farm.medical_log}</Text>
                    </>
                  ) : null}
                  {farm.production_summary ? (
                    <>
                      <Text
                        style={{
                          color: "#60A5FA",
                          fontSize: 11,
                          fontWeight: "700",
                          marginTop: 6,
                        }}
                      >
                        Production Summary
                      </Text>
                      <Text style={styles.muted}>
                        {farm.production_summary}
                      </Text>
                    </>
                  ) : null}
                </TouchableOpacity>
                <FarmMedicalHistory farmId={farm.id} />
              </View>
            ))
          )}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <MVSFeedCalculator onContactVendor={() => router.replace({ pathname: "/(client)", params: { openMarketplace: "true" } })} />
          <MVSDiseasePredictor onContactVet={() => router.push('/(client)/vets')} />
          <Setting label="Edit Profile" onPress={() => setModal("profile")} />
          <Setting
            label="Change Password"
            onPress={() => setModal("password")}
          />
          <Setting
            label="Notifications"
            onPress={() => setModal("notifications")}
          />
        </View>
        <TouchableOpacity
          style={styles.logout}
          onPress={() => {
            setLogoutConfirmationVisible(true);
          }}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteAccount}
          onPress={() => setDeleteConfirmationVisible(true)}
        >
          <Text style={styles.deleteText}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>
      <LogoutConfirmationModal
        visible={logoutConfirmationVisible}
        onCancel={() => setLogoutConfirmationVisible(false)}
        onConfirm={() => {
          setLogoutConfirmationVisible(false);
          void handleLogout();
        }}
      />
      <LogoutConfirmationModal
        visible={deleteConfirmationVisible}
        title="Deactivate account?"
        message="This will deactivate your account and sign you out."
        confirmLabel="Delete account"
        onCancel={() => setDeleteConfirmationVisible(false)}
        onConfirm={() => {
          setDeleteConfirmationVisible(false);
          void handleDeleteAccount();
        }}
      />
      <Modal
        visible={farmModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeFarmModal}
      >
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
            <TouchableOpacity
              style={styles.close}
              onPress={closeFarmModal}
              accessibilityLabel="Close farm record"
            >
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <ScrollView style={styles.modalBody} contentContainerStyle={[styles.modalContent, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator>
              <Text style={styles.modalTitle}>
                {editingFarmId ? "Edit Farm Record" : "Add Farm Record"}
              </Text>
              <Text style={styles.label}>Species</Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {[...farmSpecies, "Custom"].map((species) => (
                  <TouchableOpacity
                    key={species}
                    style={[
                      {
                        backgroundColor: "#0F172A",
                        borderColor: "#334155",
                        borderWidth: 1,
                        borderRadius: 7,
                        paddingHorizontal: 8,
                        paddingVertical: 7,
                      },
                      farmDraft.species === species && {
                        backgroundColor: "#065F46",
                        borderColor: "#10B981",
                      },
                    ]}
                    onPress={() =>
                      setFarmDraft((current) => ({ ...current, species }))
                    }
                  >
                    <Text
                      style={
                        farmDraft.species === species
                          ? {
                              color: "#FFFFFF",
                              fontSize: 12,
                              fontWeight: "700",
                            }
                          : styles.muted
                      }
                    >
                      {species}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {farmDraft.species === "Custom" ? (
                <Field
                  label="Custom Species"
                  value={farmDraft.customSpecies}
                  onChangeText={(customSpecies) =>
                    setFarmDraft((current) => ({ ...current, customSpecies }))
                  }
                />
              ) : null}
              <Field
                label="Breed"
                value={farmDraft.breed}
                onChangeText={(breed) =>
                  setFarmDraft((current) => ({ ...current, breed }))
                }
              />
              <Field
                label="Flock/Herd Size"
                value={farmDraft.flockSize}
                onChangeText={(flockSize) =>
                  setFarmDraft((current) => ({ ...current, flockSize }))
                }
                keyboardType="number-pad"
              />
              <Field
                label="Location/Address"
                value={farmDraft.location}
                onChangeText={(location) =>
                  setFarmDraft((current) => ({ ...current, location }))
                }
              />
              <Field
                label="Medical Log"
                value={farmDraft.medicalLog}
                onChangeText={(medicalLog) =>
                  setFarmDraft((current) => ({ ...current, medicalLog }))
                }
                multiline
                placeholder="Last Vaccination Date & Type / Last Deworming Date / Active Illnesses / Current Medications"
              />
              <Field
                label="Production Summary"
                value={farmDraft.productionSummary}
                onChangeText={(productionSummary) =>
                  setFarmDraft((current) => ({ ...current, productionSummary }))
                }
                multiline
                placeholder="Current Weight / Breeding Status (e.g., Pregnant) / Average Daily Yield (Milk/Eggs)"
              />
              <Text style={styles.label}>Estimated Restock Date</Text>
              {Platform.OS === "web" ? (
                <TextInput
                  value={restockDateInput}
                  onChangeText={(value) => {
                    setRestockDateInput(value);
                    const restockDate = parseDateInput(value);
                    if (restockDate) setFarmDraft((current) => ({ ...current, restockDate }));
                  }}
                  placeholder="DD-MM-YYYY"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                />
              ) : (
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setFarmDatePickerVisible(true)}
                >
                  <Text
                    style={
                      farmDraft.restockDate ? styles.primary : styles.muted
                    }
                  >
                    {farmDraft.restockDate ? formatDateInput(farmDraft.restockDate) : "DD-MM-YYYY"}
                  </Text>
                </TouchableOpacity>
              )}
              {farmDatePickerVisible ? (
                <DateTimePicker
                  value={farmDraft.restockDate ? new Date(`${farmDraft.restockDate}T00:00:00`) : new Date()}
                  mode="date"
                  onChange={(_event: DateTimePickerEvent, date?: Date) => {
                    setFarmDatePickerVisible(false);
                    if (date)
                      setFarmDraft((current) => ({
                        ...current,
                        restockDate: date.toISOString().slice(0, 10),
                      }));
                    if (date) setRestockDateInput(formatDateInput(date));
                  }}
                />
              ) : null}
              <TouchableOpacity
                style={styles.save}
                onPress={() => {
                  void saveFarmRecord();
                }}
                disabled={farmSaving}
              >
                <Text style={styles.saveText}>
                  {farmSaving
                    ? "Saving..."
                    : editingFarmId
                    ? "Update Farm Record"
                    : "Save Farm Record"}
                </Text>
              </TouchableOpacity>
              {editingFarmId ? (
                <TouchableOpacity
                  onPress={deleteFarmRecord}
                  disabled={farmSaving}
                  style={{ alignItems: "center", padding: 10, marginTop: 8 }}
                >
                  <Text
                    style={{
                      color: "#F87171",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    Delete Record
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <EditPetModal
        isVisible={petEditorVisible}
        onClose={() => setPetEditorVisible(false)}
        pet={editingPet}
        userId={currentUserId}
        onSave={savePet}
      />
      <Modal
        visible={modal === "profile" || modal === "notifications"}
        animationType="fade"
        transparent
        onRequestClose={() => setModal(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <TouchableOpacity
              style={styles.close}
              onPress={() => setModal(null)}
              accessibilityLabel="Close profile modal"
            >
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {modal === "profile" ? (
              <Form
                title="Edit Profile"
                onSave={() => {
                  void saveProfile();
                }}
              >
                <Field
                  label="Full Name"
                  value={profile.name}
                  onChangeText={(name) => setProfile({ ...profile, name })}
                />
                <Field
                  label="Phone Number"
                  value={profile.phone}
                  onChangeText={(phone) => setProfile({ ...profile, phone })}
                />
                <Text style={styles.label}>Location</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setLocationPickerVisible(true)}
                >
                  <Text
                    style={
                      profile.city && profile.state
                        ? styles.primary
                        : styles.muted
                    }
                  >
                    {profile.city && profile.state
                      ? `${profile.city}, ${profile.state}`
                      : "Select city and state"}
                  </Text>
                </TouchableOpacity>
              </Form>
            ) : modal === "notifications" ? (
              <KeyboardAvoidingView style={styles.settingsModalContent} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
                <View style={styles.notificationHeader}>
                  <Text style={styles.modalTitle}>Notifications</Text>
                </View>
                <ScrollView style={{ flex: 1 }}>
                  <View style={styles.notificationContent}>
                    {notificationOptions.map((option) => (
                      <Toggle
                        key={option.key}
                        label={option.label}
                        value={notifications[option.key]}
                        onChange={(value) => {
                          const updated = {
                            ...notifications,
                            [option.key]: value,
                          } as NotificationPreferences;
                          setNotifications(updated);
                          void saveNotificationPreferences(updated);
                        }}
                      />
                    ))}
                  </View>
                </ScrollView>
                <TouchableOpacity
                  style={styles.save}
                  onPress={() => setModal(null)}
                >
                  <Text style={styles.saveText}>Save Preferences</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            ) : null}
          </View>
        </View>
      </Modal>
      <Modal
        visible={locationPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationPickerVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.locationModal}>
            <View style={locationStyles.locationHeader}>
              <Text style={styles.modalTitle}>Choose location</Text>
              <TouchableOpacity
                onPress={() => setLocationPickerVisible(false)}
                accessibilityLabel="Close location picker"
              >
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.save}
              onPress={() => {
                void detectAndSaveLocation();
              }}
              disabled={locationLoading}
            >
              <Text style={styles.saveText}>
                {locationLoading ? "Detecting location..." : "Use My Location"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={locationStyles.locationCancel}
              onPress={() => setLocationPickerVisible(false)}
            >
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={modal === "password"}
        animationType="fade"
        transparent
        onRequestClose={() => setModal(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 480,
              backgroundColor: "#1E293B",
              borderColor: "#334155",
              borderWidth: 1,
              borderRadius: 16,
              padding: 22,
            }}
          >
            <KeyboardAvoidingView style={{ width: "100%", maxHeight: "100%" }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
              }}
            >
              <TouchableOpacity
                style={{ position: "absolute", left: 0, padding: 4 }}
                onPress={() => setModal(null)}
                accessibilityLabel="Close change password"
              >
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
              <Text
                style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }}
              >
                Change Password
              </Text>
            </View>
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 13,
                lineHeight: 19,
                marginBottom: 16,
              }}
            >
              Or use the button below to send yourself a password reset link.
            </Text>
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 13,
                lineHeight: 19,
                marginBottom: 16,
              }}
            >
              Password must contain at least 8 characters including a capital
              letter, small letters, numbers, and symbols.
            </Text>
            <Field
              label="New Password"
              value={password.next}
              onChangeText={(next) => setPassword({ ...password, next })}
              placeholder={PASSWORD_REQUIREMENTS}
              secureTextEntry
            />
            <Field
              label="Confirm Password"
              value={password.confirm}
              onChangeText={(confirm) => setPassword({ ...password, confirm })}
              placeholder="Re-enter your password"
              secureTextEntry
            />
            <TouchableOpacity
              style={styles.save}
              onPress={() => {
                void changePassword();
              }}
            >
              <Text style={styles.saveText}>Update Password</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                borderColor: "#10B981",
                borderWidth: 1,
                borderRadius: 9,
                padding: 13,
                alignItems: "center",
                marginTop: 10,
              }}
              onPress={() => {
                void sendResetLink();
              }}
            >
              <Text style={{ color: "#6EE7B7", fontWeight: "700" }}>
                Send Reset Link via Email
              </Text>
            </TouchableOpacity>
            </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Setting({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.setting} onPress={onPress}>
      <Text style={styles.primary}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad" | "number-pad";
  multiline?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {secureTextEntry ? (
        <View
          style={[
            styles.input,
            { flexDirection: "row", alignItems: "center", padding: 0 },
          ]}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#64748B"
            secureTextEntry={!visible}
            keyboardType={keyboardType}
            style={{
              flex: 1,
              padding: 13,
              paddingRight: 8,
              color: "#FFFFFF",
              fontSize: 15,
            }}
          />
          <TouchableOpacity
            onPress={() => setVisible((current) => !current)}
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            style={{ padding: 10 }}
          >
            <MaterialCommunityIcons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#94A3B8"
            />
          </TouchableOpacity>
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? 4 : undefined}
          textAlignVertical={multiline ? "top" : "auto"}
          style={[
            styles.input,
            multiline ? { minHeight: 88, textAlignVertical: "top" } : null,
          ]}
        />
      )}
    </View>
  );
}
function Form({
  title,
  onSave,
  children,
}: {
  title: string;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={styles.modalTitle}>{title}</Text>
        {children}
        <TouchableOpacity style={styles.save} onPress={onSave}>
          <Text style={styles.saveText}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const locationStyles = StyleSheet.create({
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  locationList: { flex: 1, minHeight: 0 },
  locationListContent: { paddingBottom: 8 },
  locationBack: { paddingVertical: 8 },
  locationCancel: {
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 12,
    alignItems: "center",
  },
});
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.primary}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#334155", true: "#10B981" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  content: { padding: 16, paddingBottom: 35 },
  profileHeader: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    marginBottom: 22,
    flexDirection: "column",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: "center",
    marginBottom: 12,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  initial: { color: "#FFFFFF", fontSize: 30, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  muted: { color: "#94A3B8", fontSize: 12 },
  section: { marginBottom: 25 },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 17 },
  add: { color: "#3B82F6", fontSize: 30 },
  pet: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 9,
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  petThumb: { width: 48, height: 48, borderRadius: 12 },
  paw: {
    width: 48,
    height: 48,
    backgroundColor: "#102E2A",
    alignItems: "center",
    justifyContent: "center",
  },
  pawText: { color: "#10B981", fontSize: 24 },
  flex: { flex: 1 },
  primary: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  status: { color: "#10B981", fontSize: 11, marginTop: 5 },
  setting: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  chevron: { color: "#64748B", fontSize: 22 },
  logout: {
    backgroundColor: "#EF4444",
    borderRadius: 9,
    padding: 13,
    alignItems: "center",
  },
  logoutText: { color: "#FFFFFF", fontWeight: "700" },
  deleteAccount: {
    borderColor: "#EF4444",
    borderWidth: 1,
    borderRadius: 9,
    padding: 13,
    alignItems: "center",
    marginTop: 10,
  },
  deleteText: { color: "#FCA5A5", fontWeight: "700" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 1000,
  },
  modal: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    height: "88%",
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  modalBody: { flexGrow: 0, paddingHorizontal: 0 },
  settingsModalContent: { flex: 1, maxHeight: "85%" },
  modalContent: { paddingBottom: 4 },
  close: { alignSelf: "flex-end", paddingTop: 12 },
  closeText: { color: "#64748B", fontSize: 16, fontWeight: "600" },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    paddingVertical: 12,
  },
  notificationHeader: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  notificationContent: { paddingVertical: 12 },
  toggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  field: { marginBottom: 12 },
  label: { color: "#94A3B8", fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
  },
  resetLink: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  resetText: { color: "#60A5FA", fontSize: 12 },
  save: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 0,
    marginBottom: 16,
  },
  saveText: { color: "#FFFFFF", fontWeight: "700" },
  locationModal: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    maxHeight: "88%",
    paddingHorizontal: 16,
  },
  locationOption: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
});
