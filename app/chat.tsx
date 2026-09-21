import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioPlayer,
    useAudioPlayerStatus,
    useAudioRecorder,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { PayWithFlutterwave } from "flutterwave-react-native";
import { ShieldCheck, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarPreviewModal from "../components/AvatarPreviewModal";
import FarmMedicalHistory from "../components/FarmMedicalHistory";
import PetMedicalHistory from "../components/PetMedicalHistory";
import SwipeableMessage from "../components/SwipeableMessage";
import VetFarmMedicalLogForm from "../components/VetFarmMedicalLogForm";
import VetMedicalLogForm from "../components/VetMedicalLogForm";
import { FLUTTERWAVE_CONFIG, handleFlutterwaveWebPayment } from "../lib/flutterwave";
import { sendPushNotification } from "../lib/notifications";
import { calculatePetAgeInWeeks } from "../lib/petAge";
import { sanitizeInput } from "../lib/sanitize";
import {
    deleteMessageForEveryone,
    ensureConsultationRecord,
    getCurrentUser,
    hideMessageForCurrentUser,
    isUuid,
    normalizeUuid,
    safeSupabaseCall,
    sendRealtimeMessage,
    subscribeToMessages,
    supabase,
    uploadChatAttachment,
    type ConsultationStatus,
    type MessageReactions,
    type RealtimeMessage,
    type ReplySnippet
} from "../lib/supabase";
import { markConversationRead, useUnreadMessages } from "../lib/unreadMessages";
import { useVisualViewport } from "../lib/useVisualViewport";

type ChatParams = {
  conversationId?: string;
  recipientId?: string;
  merchantId?: string;
  merchantName?: string;
  orderId?: string;
  vet_id?: string;
  receiver_id?: string;
  vet?: string;
  category?: string;
  initialMessage?: string;
  productId?: string;
  productName?: string;
  productPrice?: string;
  starterMessage?: string;
  inquiryKey?: string;
  resetThread?: string;
};

type ReplyTarget = { id: string; senderName: string; content: string };
const reactionOptions = ["👍", "❤️", "😂", "😮", "😢", "🙏", "💯"] as const;

const toReplySnippet = (replyTarget: ReplyTarget | null | undefined): ReplySnippet | null =>
  replyTarget
    ? { id: replyTarget.id, sender_name: replyTarget.senderName, content: replyTarget.content }
    : null;

type Thread = {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: string;
  created_at?: string;
  consultation_status?: ConsultationStatus;
  productName?: string;
  messages: RealtimeMessage[];
  recipientProfile?: RecipientProfile;
};

type RecipientProfile = {
  avatar_url?: string | null;
  role?: string | null;
  business_name?: string | null;
  location?: string | null;
  phone_number?: string | null;
};

type PatientPet = {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  dob: string | null;
  vaccination_status: string | null;
  medical_notes: string | null;
  photos: string[] | null;
};

type MedicalRecord = {
  id: string;
  created_at: string;
  pet_id: string;
  weight_kg: number | null;
  temperature_c: number | null;
  heart_rate_bpm: number | null;
  subjective: string;
  objective: string | null;
  assessment: string;
  plan: string;
  is_deleted: boolean;
};

type SoapDraft = {
  weightKg: string;
  temperatureC: string;
  heartRateBpm: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type FarmRecord = {
  id: string;
  species: string;
  breed: string | null;
  flock_size: number | null;
  location: string | null;
  restock_date: string | null;
  medical_log: string | null;
  production_summary: string | null;
  soapRecords?: FarmSoapRecord[];
};

type FarmSoapRecord = {
  id: string;
  farm_id: string | null;
  subjective: string | null;
  objective: string | null;
  tentative_diagnosis?: string | null;
  plan: string | null;
  created_at: string;
  is_deleted: boolean;
};

type FarmSoapDraft = {
  subjective: string;
  objective: string;
  tentative_diagnosis: string;
  plan: string;
};

type ConsultationRecord = {
  id: string;
  conversation_id: string;
  client_id: string;
  vet_id: string;
  merchant_id?: string | null;
  status: ConsultationStatus;
  service_type?: string | null;
};

const consultationCachePrefix = "mvs_consultation_cache:";
const consultationMemoryCache = new Map<string, ConsultationRecord>();

const rememberConsultation = (consultation: ConsultationRecord) => {
  consultationMemoryCache.set(consultation.conversation_id, consultation);
  void AsyncStorage.setItem(
    `${consultationCachePrefix}${consultation.conversation_id}`,
    JSON.stringify(consultation)
  ).catch(() => undefined);
};

const readCachedConsultation = async (conversationId: string): Promise<ConsultationRecord | null> => {
  const memoryValue = consultationMemoryCache.get(conversationId);
  if (memoryValue) return memoryValue;
  try {
    const storedValue = await AsyncStorage.getItem(`${consultationCachePrefix}${conversationId}`);
    if (!storedValue) return null;
    const parsedValue = JSON.parse(storedValue) as ConsultationRecord;
    if (parsedValue?.conversation_id !== conversationId || !parsedValue?.status) return null;
    consultationMemoryCache.set(conversationId, parsedValue);
    return parsedValue;
  } catch {
    return null;
  }
};

const inboxCachePrefix = "mvs_inbox_cache:";
const inboxMemoryCache = new Map<string, Thread[]>();

const rememberInboxThreads = (userId: string, threads: Thread[]) => {
  inboxMemoryCache.set(userId, threads);
  void AsyncStorage.setItem(`${inboxCachePrefix}${userId}`, JSON.stringify(threads)).catch(() => undefined);
};

const readCachedInboxThreads = async (userId: string): Promise<Thread[] | null> => {
  const memoryValue = inboxMemoryCache.get(userId);
  if (memoryValue) return memoryValue;
  try {
    const storedValue = await AsyncStorage.getItem(`${inboxCachePrefix}${userId}`);
    if (!storedValue) return null;
    const parsedValue = JSON.parse(storedValue) as Thread[];
    if (!Array.isArray(parsedValue)) return null;
    inboxMemoryCache.set(userId, parsedValue);
    return parsedValue;
  } catch {
    return null;
  }
};

type InvoiceMetadata = {
  invoice_id: string;
  amount: number;
  items?: InvoiceItem[];
  note?: string;
  seller_name: string;
  status: "pending" | "paid" | "completed";
  seller_subaccount_id?: string;
};

type InvoiceProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (amount: number, note: string, items: InvoiceItem[]) => Promise<void>;
  submitting: boolean;
  initialItems?: InvoiceItem[];
};

type InvoiceItem = { id: string; description: string; amount: number };
type Category = "Online Consultation" | "Emergency Request" | "Vaccination" | "Routine Checks" | "General Inquiry" | "Others";

const getCategoryInitialMessage = (category: Category, vetName: string) => {
  switch (category) {
    case "Online Consultation":
      return `Hello Dr. ${vetName}, I would like to book an online consultation for my `;
    case "Emergency Request":
      return `Hello Dr. ${vetName}, I have an urgent medical emergency regarding my pet: `;
    case "Vaccination":
      return `Hello Dr. ${vetName}, I would like to inquire about vaccination services for my `;
    case "Routine Checks":
      return `Hello Dr. ${vetName}, I would like to schedule a routine health check for my `;
    case "General Inquiry":
      return `Hello Dr. ${vetName}, I have a general consultation inquiry regarding `;
    case "Others":
      return `Hello Dr. ${vetName}, I would like to consult with you regarding `;
  }
};

const isCategory = (value: string | undefined): value is Category =>
  value === "Online Consultation" || value === "Emergency Request" || value === "Vaccination" || value === "Routine Checks" || value === "General Inquiry" || value === "Others";

type OrderStatus = "pending" | "processing" | "dispatched" | "delivered";
type ActiveOrder = {
  id: string;
  conversation_id: string;
  buyer_id: string;
  merchant_id: string;
  status: OrderStatus;
  tracking_number?: string | null;
  delivery_notes?: string | null;
};

type PrescriptionDraft = {
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  refills: string;
  instructions: string;
};

type PrescriptionMetadata = PrescriptionDraft & {
  prescription_id: string;
};

type VoiceNoteControls = {
  recording: boolean;
  recordingSeconds: number;
  onStartRecording: () => Promise<void>;
  onCancelRecording: () => Promise<void>;
  onSendRecording: () => Promise<void>;
};

const formatPatientAge = calculatePetAgeInWeeks;

const formatMessageTime = (createdAt: string) =>
  new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const getLatestThreadTime = (thread: Thread) =>
  new Date(
    thread.messages?.[thread.messages.length - 1]?.created_at ||
      thread.created_at ||
      0
  ).getTime();

const getPublicAvatarUrl = (avatarPath?: string | null): string | null => {
  if (!avatarPath) return null;
  if (/^https?:\/\//i.test(avatarPath)) return avatarPath;
  return supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl || null;
};

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const conversationIdFor = (firstId: string, secondId: string) => {
  const ids = [firstId, secondId].sort();
  return `conv_${ids[0]}_${ids[1]}`;
};

const openSafeExternalUrl = (url: string) => {
  if (!/^https?:\/\//i.test(url)) return;
  void Linking.openURL(url);
};

const orderStatusSequence: OrderStatus[] = ["pending", "processing", "dispatched", "delivered"];

function OrderStatusBadge({ order, canUpdate, canCreate, onUpdate, onCreate, recipientProfile }: { order: ActiveOrder | null; canUpdate: boolean; canCreate: boolean; onUpdate: (status: OrderStatus | "completed") => Promise<void>; onCreate: () => Promise<void>; recipientProfile?: RecipientProfile | null }) {
  const isMerchant = recipientProfile?.role === "merchant";
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  if (!order) {
    return (
      <View style={styles.orderStatusGroup}>
        {canUpdate ? (
          <TouchableOpacity style={styles.orderStatusBadge} onPress={() => void onCreate()}>
            <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.completeButtonText}>Create Order</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.idleBadge}>No Active Order</Text>
        {isMerchant ? (
          <TouchableOpacity style={styles.viewProfileButton} onPress={() => setIsProfileModalVisible(true)}>
            <MaterialCommunityIcons name="account-card-outline" size={16} color="#FFFFFF" />
            <Text style={styles.completeButtonText}>View Profile</Text>
          </TouchableOpacity>
        ) : null}
        {isMerchant ? (
          <MerchantProfileModal
            visible={isProfileModalVisible}
            profile={recipientProfile}
            onClose={() => setIsProfileModalVisible(false)}
          />
        ) : null}
      </View>
    );
  }
  const statusIndex = orderStatusSequence.indexOf(order.status);
  const nextStatus = statusIndex >= 0 && statusIndex < orderStatusSequence.length - 1
    ? orderStatusSequence[statusIndex + 1]
    : null;
  const label = order.status.charAt(0).toUpperCase() + order.status.slice(1);
  const isCompleteAction = order.status === "delivered";
  if (!canUpdate) {
    return (
      <View style={styles.orderStatusBadge}>
        <MaterialCommunityIcons name="package-variant" size={16} color="#FFFFFF" />
        <Text style={styles.completeButtonText}>Order: {label}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.orderStatusBadge}
      disabled={!canUpdate || (!nextStatus && !isCompleteAction)}
      onPress={() => {
        if (isCompleteAction) void onUpdate("completed");
        else if (nextStatus) void onUpdate(nextStatus);
      }}
    >
      <MaterialCommunityIcons name="package-variant" size={16} color="#FFFFFF" />
      <Text style={styles.completeButtonText}>Order: {label}{canUpdate && (nextStatus || isCompleteAction) ? (isCompleteAction ? " (Complete)" : " ->") : ""}</Text>
    </TouchableOpacity>
  );
}

function MerchantProfileModal({ visible, profile, onClose }: { visible: boolean; profile?: RecipientProfile; onClose: () => void }) {
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const avatarUrl = getPublicAvatarUrl(profile?.avatar_url);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.profileModalBackdrop}>
        <View style={styles.profileModal}>
          <View style={styles.profileModalHeader}>
            <Text style={styles.profileModalTitle}>Merchant Profile</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close merchant profile">
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.merchantAvatar}
            onPress={() => setAvatarPreviewVisible(true)}
            disabled={!avatarUrl}
            accessibilityLabel="View merchant profile photo"
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.merchantAvatarImage} resizeMode="cover" />
            ) : (
              <MaterialCommunityIcons name="storefront" size={42} color="#FFFFFF" />
            )}
          </TouchableOpacity>
          <Text style={styles.profileModalLabel}>Business Name</Text>
          <Text style={styles.profileModalValue}>{profile?.business_name || "N/A"}</Text>
          <Text style={styles.profileModalLabel}>Location</Text>
          <Text style={styles.profileModalValue}>{profile?.location || "N/A"}</Text>
          <Text style={styles.profileModalLabel}>Phone Number</Text>
          <Text style={styles.profileModalValue}>{profile?.phone_number || "N/A"}</Text>
        </View>
        <AvatarPreviewModal
          imageUrl={avatarUrl}
          visible={avatarPreviewVisible}
          onClose={() => setAvatarPreviewVisible(false)}
        />
      </View>
    </Modal>
  );
}

function BuyerProtectionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.profileModalBackdrop}>
        <View style={styles.protectionModal}>
          <View style={styles.profileModalHeader}>
            <View style={styles.protectionTitle}>
              <ShieldCheck size={18} color="#FFFFFF" />
              <Text style={styles.protectionModalTitle}>MVS User Protection & 48-Hour Refund Policy</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close buyer protection">
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.protectionHeading}>48-Hour Guarantee</Text>
          <Text style={styles.protectionText}>Refunds or replacements apply strictly to items paid via official MVS In-Chat Invoices.</Text>
          <Text style={styles.protectionHeading}>Scam Warning</Text>
          <Text style={styles.protectionText}>Never make an off-platform bank transfer or off-app payment to a seller.</Text>
          <Text style={styles.protectionHeading}>Non-Liability Disclaimer</Text>
          <Text style={styles.protectionText}>MVS will not mediate, resolve disputes, or refund any off-platform transaction.</Text>
          <Text style={styles.protectionHeading}>VIP Loyalty Perks</Text>
          <Text style={styles.protectionText}>Paying through official invoices builds real MVS CarePass points toward a 30-Day 30% VIP discount.</Text>
          <TouchableOpacity style={styles.protectionCloseButton} onPress={onClose}>
            <Text style={styles.completeButtonText}>Understood</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: "#0F172A" },
  chatRoot: { flex: 1, position: "relative" },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: "#334155", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#334155", flexDirection: "column", alignItems: "stretch", gap: 12, position: "relative", zIndex: 10, elevation: 5 },
  headerTopRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitleContainer: { flex: 1, flexShrink: 1, minWidth: 0 },
  headerActionsWrapper: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, overflow: "hidden" },
  headerActions: { flex: 1, minHeight: 44, maxHeight: 56, zIndex: 11, elevation: 6 },
  headerActionsContent: { flexGrow: 1, flexDirection: "row", flexWrap: "nowrap", alignItems: "center", paddingHorizontal: 12, gap: 8, zIndex: 12, elevation: 7 },
  consultationBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  consultationStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerConsultationControl: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  headerConsultationStatus: { color: "#D1FAE5", fontSize: 12, fontWeight: "600" },
  consultationEndedBadge: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  consultationIndicator: { width: 8, height: 8, borderRadius: 4 },
  consultationIndicatorActive: { backgroundColor: "#10B981" },
  consultationIndicatorCompleted: { backgroundColor: "#9CA3AF" },
  consultationActive: { backgroundColor: "#065F46" },
  consultationCompleted: { backgroundColor: "#1F2937" },
  consultationText: { color: "#FFFFFF", fontWeight: "600", flex: 1 },
  consultationButton: { flexShrink: 0, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  startConsultationButton: { flexShrink: 0, backgroundColor: "#10B981" },
  endConsultationButton: { flexShrink: 0, backgroundColor: "#EF4444" },
  consultationButtonText: { color: "#FFFFFF", fontWeight: "700" },
  invoiceAction: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  prescriptionActionHeader: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#0E7490", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  invoiceCard: { alignSelf: "stretch", backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14, minWidth: 240 },
  invoiceTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  invoiceSeller: { color: "#475569", fontSize: 12, marginTop: 5 },
  invoiceAmount: { color: "#0F172A", fontSize: 22, fontWeight: "700", marginTop: 10 },
  invoiceNote: { color: "#475569", fontSize: 13, marginTop: 6 },
  invoiceBreakdownRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 6 },
  invoiceBreakdownName: { color: "#475569", fontSize: 12, flex: 1 },
  invoiceBreakdownAmount: { color: "#0F172A", fontSize: 12, fontWeight: "600" },
  invoiceFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  pendingBadge: { backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  pendingBadgeText: { color: "#B45309", fontSize: 11, fontWeight: "700" },
  paidBadge: { backgroundColor: "#D1FAE5" },
  paidBadgeText: { color: "#047857" },
  payButton: { backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  payButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  invoiceOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  invoiceModal: { backgroundColor: "#1E293B", padding: 22, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  prescriptionOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  prescriptionModal: { backgroundColor: "#1E293B", padding: 22, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  prescriptionForm: { paddingBottom: 12, gap: 8 },
  prescriptionLabel: { color: "#94A3B8", fontSize: 12, marginTop: 8, marginBottom: 4 },
  prescriptionInstructionsInput: { minHeight: 90, textAlignVertical: "top" },
  prescriptionSubmit: { backgroundColor: "#10B981", borderRadius: 9, padding: 13, alignItems: "center", marginTop: 16 },
  invoiceModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  invoiceModalTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  closeText: { color: "#94A3B8", fontSize: 13 },
  invoiceLabel: { color: "#94A3B8", fontSize: 12, marginBottom: 6, marginTop: 10 },
  invoiceForm: { paddingBottom: 10 },
  invoiceItemRow: { flexDirection: "row", alignItems: "center", gap: 7, width: "100%", marginBottom: 8 },
  invoiceDescriptionInput: { flex: 2, minWidth: 0 },
  invoiceAmountInput: { flex: 1, minWidth: 0 },
  invoiceDeleteButton: { width: 32, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  addInvoiceItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 9 },
  addInvoiceItemText: { color: "#60A5FA", fontSize: 13, fontWeight: "700" },
  invoiceTotal: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 4 },
  invoiceNoteInput: { minHeight: 80, textAlignVertical: "top" },
  prescriptionCard: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14, minWidth: 250 },
  prescriptionHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  prescriptionTitle: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  prescriptionMedication: { color: "#0F172A", fontSize: 18, fontWeight: "700", marginTop: 10 },
  prescriptionBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  prescriptionBadge: { color: "#065F46", backgroundColor: "#D1FAE5", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  prescriptionDetail: { color: "#475569", fontSize: 12, marginTop: 9 },
  prescriptionInstructions: { color: "#334155", fontSize: 13, lineHeight: 19, marginTop: 8 },
  prescriptionAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0E7490", borderRadius: 8, paddingVertical: 8, marginTop: 12 },
  prescriptionActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  sendButton: { backgroundColor: "#10B981", borderRadius: 9, padding: 13, alignItems: "center", marginTop: 18 },
  sendText: { color: "#FFFFFF", fontWeight: "700" },
  completeButton: { flexShrink: 0, backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  patientButton: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  orderStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1C2541", borderColor: "#10B981", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  orderStatusGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewProfileButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  buyerProtectionButton: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#92400E", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  clearThreadAction: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1F2937", borderColor: "#FCA5A5", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  clearThreadText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700" },
  headerMenuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" },
  headerMenuButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155", marginLeft: 2 },
  headerMenuList: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#334155", borderRadius: 10, paddingVertical: 6, marginTop: 0 },
  headerMenuItem: { paddingHorizontal: 14, paddingVertical: 10 },
  headerMenuText: { color: "#E2E8F0", fontSize: 13, fontWeight: "600" },
  searchBarContainer: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#111827", borderBottomWidth: 1, borderBottomColor: "#334155", paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, backgroundColor: "#0F172A", borderRadius: 8, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#334155" },
  searchNavigationButtons: { flexDirection: "row", alignItems: "center", gap: 6 },
  searchStatusText: { color: "#94A3B8", fontSize: 11, fontWeight: "600" },
  selectionBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#111827", borderTopWidth: 1, borderTopColor: "#334155", borderBottomWidth: 1, borderBottomColor: "#334155" },
  selectionCounter: { color: "#E2E8F0", fontSize: 13, fontWeight: "700" },
  selectionActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  selectionDeleteButton: { borderWidth: 1, borderColor: "#475569", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  selectionDeleteText: { color: "#E2E8F0", fontSize: 12, fontWeight: "700" },
  selectionDeleteButtonPrimary: { backgroundColor: "#DC2626", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  selectionDeleteTextPrimary: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  selectionCheck: { position: "absolute", top: 10, left: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: "#0F172A", borderWidth: 2, borderColor: "#94A3B8", alignItems: "center", justifyContent: "center", zIndex: 2 },
  selectionCheckActive: { backgroundColor: "#10B981", borderColor: "#34D399" },
  deleteModalCard: { width: "100%", maxWidth: 360, backgroundColor: "#1E293B", borderColor: "#334155", borderWidth: 1, borderRadius: 14, padding: 20, marginHorizontal: 20 },
  deleteModalTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  deleteModalAction: { backgroundColor: "#0F172A", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  deleteModalActionText: { color: "#F8FAFC", fontSize: 14, fontWeight: "700", textAlign: "center" },
  deleteModalCancel: { alignItems: "center", paddingVertical: 12, marginTop: 10 },
  deleteModalCancelText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
  messageSelected: { borderWidth: 2, borderColor: "#34D399" },
  profileModalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#00000099", padding: 20 },
  profileModal: { width: "100%", maxWidth: 380, backgroundColor: "#1E293B", borderRadius: 14, padding: 20 },
  merchantAvatar: { width: 96, height: 96, borderRadius: 48, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#10B981", marginBottom: 14, overflow: "hidden" },
  merchantAvatarImage: { width: "100%", height: "100%" },
  protectionModal: { width: "100%", maxWidth: 420, maxHeight: "88%", backgroundColor: "#1E293B", borderColor: "#92400E", borderWidth: 1, borderRadius: 14, padding: 20 },
  protectionModalTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", flex: 1, marginRight: 12 },
    protectionTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  protectionHeading: { color: "#FBBF24", fontSize: 13, fontWeight: "700", marginTop: 14 },
  protectionText: { color: "#CBD5E1", fontSize: 14, lineHeight: 21, marginTop: 5 },
  protectionCloseButton: { backgroundColor: "#B45309", borderRadius: 8, padding: 11, alignItems: "center", marginTop: 20 },
  profileModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  profileModalTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  profileModalLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginTop: 10 },
  profileModalValue: { color: "#FFFFFF", fontSize: 15, marginTop: 3 },
  idleBadge: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  completeButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  completedBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#14532D" },
  completedText: { color: "#DCFCE7", fontSize: 12, flex: 1 },
  patientOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, elevation: 9999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.75)", padding: 16 },
  patientSheet: { width: "100%", maxWidth: 500, maxHeight: "88%", backgroundColor: "#1E293B", borderRadius: 12, padding: 20 },
  farmRecordsSheet: { width: "90%", maxWidth: 500, maxHeight: "85%", backgroundColor: "#1E293B", borderRadius: 12, padding: 20 },
  farmRecordsScroll: { flexGrow: 0, maxHeight: "85%" },
  farmRecordsContent: { paddingBottom: 4 },
  farmSoapHistory: { borderTopWidth: 1, borderTopColor: "#334155", marginTop: 8, paddingTop: 8, gap: 3 },
  patientClose: { alignSelf: "flex-end", alignItems: "center", justifyContent: "center", padding: 8 },
  patientHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  patientTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  patientPet: { borderTopWidth: 1, borderTopColor: "#334155", paddingVertical: 14 },
  patientGallery: { gap: 8, marginBottom: 10 },
  patientPhoto: { width: 110, height: 90, borderRadius: 8 },
  patientPetName: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  patientLabel: { color: "#60A5FA", fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 3 },
  patientDetail: { color: "#CBD5E1", fontSize: 13, lineHeight: 20 },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700", flexShrink: 1 },
  subtitle: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  list: { padding: 16 },
  messages: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12, flexGrow: 1, flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch" },
  messageList: { flex: 1 },
  messageRow: { marginBottom: 10 },
  thread: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155", borderRadius: 12, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  threadNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  threadDeleteButton: { padding: 4 },
  activeConsultBadge: { backgroundColor: "#065F46", borderColor: "#10B981", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  activeConsultBadgeText: { color: "#10B981", fontSize: 10, fontWeight: "700" },
  primary: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  quotedMessage: { borderLeftWidth: 3, borderLeftColor: "#6EE7B7", backgroundColor: "#0F172A66", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 8 },
  quotedMessageSender: { color: "#6EE7B7", fontSize: 11, fontWeight: "700" },
  quotedMessageText: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  messageTimestamp: { color: "#A7F3D0", fontSize: 10, alignSelf: "flex-end", marginTop: 5 },
  muted: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  message: { color: "#CBD5E1", fontSize: 12, marginTop: 7 },
  empty: { color: "#94A3B8", textAlign: "center", marginTop: 24 },
  bubble: { maxWidth: "84%", padding: 13, borderRadius: 12, marginBottom: 10 },
  reactionBadge: { position: "absolute", right: -4, bottom: -12, minWidth: 28, height: 28, paddingHorizontal: 5, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", zIndex: 2, elevation: 2 },
  reactionBadgeText: { fontSize: 17 },
  reactionBar: { flexDirection: "row", alignSelf: "center", alignItems: "center", backgroundColor: "#1E293B", borderColor: "#475569", borderWidth: 1, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 5, marginBottom: 10, elevation: 6 },
  reactionButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  reactionEmoji: { fontSize: 24 },
  videoBubble: { cursor: "pointer" },
  outgoing: { alignSelf: "flex-end", backgroundColor: "#0E7490" },
  incoming: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  attachment: { width: 220, height: 180, borderRadius: 10, marginBottom: 8 },
  videoAttachment: { width: 220, height: 140, borderRadius: 10, marginBottom: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#0E7490", gap: 6 },
  videoAttachmentText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  voiceNoteBubble: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 210 },
  voicePlayButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  voiceProgressArea: { flex: 1, gap: 4 },
  voiceProgressTrack: { height: 4, borderRadius: 2, backgroundColor: "#64748B", overflow: "hidden" },
  voiceProgressFill: { height: 4, borderRadius: 2, backgroundColor: "#A7F3D0" },
  voiceBars: { height: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 2 },
  voiceBar: { width: 3, minHeight: 3, borderRadius: 2, backgroundColor: "#64748B" },
  voiceBarActive: { backgroundColor: "#A7F3D0" },
  voiceDuration: { color: "#CBD5E1", fontSize: 11 },
  voiceSpeedButton: { minWidth: 34, paddingHorizontal: 5, paddingVertical: 4, borderRadius: 6, backgroundColor: "#334155", alignItems: "center" },
  voiceSpeedText: { color: "#A7F3D0", fontSize: 11, fontWeight: "700" },
  locationCard: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 220, padding: 2 },
  locationTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  locationAddress: { color: "#CBD5E1", fontSize: 12, marginTop: 3 },
  locationCoordinates: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
  liveLocationBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#064E3B" },
  liveLocationText: { color: "#D1FAE5", fontSize: 12, flex: 1 },
  stopLiveLocationText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.65)" },
  consultationTypeModal: { backgroundColor: "#1E293B", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 22, gap: 10 },
  entitySelectionBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "rgba(0, 0, 0, 0.65)" },
  entitySelectionModal: { width: "100%", maxWidth: 440, maxHeight: "75%", backgroundColor: "#1E293B", borderRadius: 14, padding: 18 },
  entitySelectionList: { paddingBottom: 4, gap: 8 },
  entitySelectionItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#334155", borderRadius: 9, padding: 13 },
  consultationTypeButton: { backgroundColor: "#2563EB", borderRadius: 8, padding: 13, alignItems: "center" },
  farmRecordCard: { backgroundColor: "#0F172A", borderColor: "#334155", borderWidth: 1, borderRadius: 10, padding: 13, marginBottom: 9, gap: 4 },
  farmRecordDetail: { color: "#CBD5E1", fontSize: 12 },
  farmRecordHistory: { color: "#6EE7B7", fontSize: 12, marginTop: 4, fontWeight: "700" },
  threadDeleteOverlay: { zIndex: 9999, elevation: 9999 },
  locationSheet: { backgroundColor: "#1E293B", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 8 },
  locationSheetTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginBottom: 6 },
  locationOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#334155" },
  locationOptionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  locationHint: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  locationCancel: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  locationCancelText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
  composer: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    gap: 8,
    flexShrink: 0,
    backgroundColor: "#0F172A",
  },
  replyPreview: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderLeftWidth: 3, borderLeftColor: "#10B981", backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  replyPreviewCopy: { flex: 1, minWidth: 0 },
  replyPreviewName: { color: "#6EE7B7", fontSize: 11, fontWeight: "700" },
  replyPreviewText: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  copyToast: { position: "absolute", alignSelf: "center", bottom: 86, backgroundColor: "#1E293B", borderColor: "#475569", borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, zIndex: 20 },
  copyToastText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  composerRow: { flexDirection: "row", gap: 8, minHeight: 42, alignItems: "center" },
  composerInputShell: {
    flex: 1,
    minHeight: 42,
    maxHeight: 132,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 6,
    justifyContent: "center",
  },
  selectedAttachment: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectedAttachmentImage: { width: 56, height: 56, borderRadius: 8 },
  recordingAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  recordingStatus: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#EF4444" },
  recordingTimer: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  recordingLabel: { color: "#94A3B8", fontSize: 13 },
  attach: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#475569", alignItems: "center", justifyContent: "center" },
  input: { backgroundColor: "transparent", borderWidth: 0, ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}), color: "#FFFFFF", fontSize: 16, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: "top" },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  voiceIdleMic: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#0E7490", alignItems: "center", justifyContent: "center" },
  recordingBar: { flex: 1, borderRadius: 8, backgroundColor: "#172554", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  unreadBadge: { minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginLeft: 8 },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  deleteActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 4 },
  deletePrompt: { color: "#FCA5A5", fontSize: 12, marginRight: 4 },
  deleteButton: { backgroundColor: "#DC2626", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  deleteButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  cancelButton: { backgroundColor: "#475569", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  cancelButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
  videoPreviewOverlay: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  videoPreviewHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 48 },
  videoPreviewTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  videoPreviewAction: { backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  videoPreviewActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  videoPreview: { width: "100%", height: "70%" },
  imagePreviewOverlay: { flex: 1, backgroundColor: "#000000", justifyContent: "center", alignItems: "center" },
  imagePreview: { width: "100%", height: "100%" },
  imagePreviewClose: { position: "absolute", top: 48, right: 16, zIndex: 2, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#00000099" },
} as const;

const isMessageHiddenForUser = (message: Pick<RealtimeMessage, "hidden_for_users"> | null | undefined, currentUserId: string) =>
  Boolean(
    message &&
    Array.isArray(message.hidden_for_users) &&
    message.hidden_for_users.includes(currentUserId)
  );

const filterVisibleMessages = (items: RealtimeMessage[], currentUserId: string) =>
  items.filter((message) => {
    if (message.is_deleted) return false;
    if (isMessageHiddenForUser(message, currentUserId)) return false;
    return true;
  });

const syncClearedThreadStorage = async (userId: string, threadIds: Set<string>) => {
  const storageKey = `mvs_cleared_threads_${userId}`;
  const nextIds = [...threadIds];
  if (nextIds.length === 0) {
    await AsyncStorage.removeItem(storageKey);
    return;
  }
  await AsyncStorage.setItem(storageKey, JSON.stringify(nextIds));
};

const appendUniqueMessage = (
  messages: RealtimeMessage[],
  newMessage: RealtimeMessage,
  currentUserId?: string
) => {
  const clientGeneratedId =
    newMessage.metadata &&
    typeof newMessage.metadata.client_generated_id === "string"
      ? newMessage.metadata.client_generated_id
      : undefined;
  const existingIndex = messages.findIndex((message) => {
    const existingClientGeneratedId =
      message.metadata &&
      typeof message.metadata.client_generated_id === "string"
        ? message.metadata.client_generated_id
        : undefined;
    return (
      message.id === newMessage.id ||
      (Boolean(message.temp_id) && message.temp_id === newMessage.temp_id) ||
      (Boolean(clientGeneratedId) &&
        existingClientGeneratedId === clientGeneratedId)
    );
  });

  const nextMessages = existingIndex === -1 ? [...messages, newMessage] : messages.map((message, index) =>
    index === existingIndex ? newMessage : message
  );

  return typeof currentUserId === 'string' ? filterVisibleMessages(nextMessages, currentUserId) : nextMessages;
};

const contextMenuProps = (onDelete: () => void) =>
  ({
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      onDelete();
    },
  } as unknown as Record<string, unknown>);

export default function ChatScreen() {
  const params = useLocalSearchParams<ChatParams>();
  const router = useRouter();
  const visualViewportHeight = useVisualViewport();
  const mobileWebRootStyle: ViewStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: visualViewportHeight ?? 0,
  };
  const conversationIdParam = firstParam(params.conversationId);
  const recipientIdParam = firstParam(params.recipientId);
  const merchantIdParam = firstParam(params.merchantId);
  const merchantNameParam = firstParam(params.merchantName);
  const orderIdParam = firstParam(params.orderId);
  const vetIdParam = firstParam(params.vet_id);
  const receiverIdParam = firstParam(params.receiver_id);
  const vetParam = firstParam(params.vet);
  const categoryParam = firstParam(params.category);
  const productNameParam = firstParam(params.productName);
  const initialMessageParam = firstParam(params.initialMessage);
  const starterMessageParam = firstParam(params.starterMessage);
  const inquiryKeyParam = firstParam(params.inquiryKey);
  const resetThreadParam = firstParam(params.resetThread);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userRole, setUserRole] = useState("client");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [recipientProfile, setRecipientProfile] = useState<RecipientProfile | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const clearedThreadsRef = useRef<Set<string>>(new Set());
  const [message, setMessage] = useState(
    isCategory(categoryParam)
      ? getCategoryInitialMessage(categoryParam, vetParam || "Veterinarian")
      : initialMessageParam || starterMessageParam || ""
  );
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [attachmentVisible, setAttachmentVisible] = useState(false);
  const [locationVisible, setLocationVisible] = useState(false);
  const [liveLocationActive, setLiveLocationActive] = useState(false);
  const [deleteCandidate, setDeleteCandidate] =
    useState<RealtimeMessage | null>(null);
  const [threadDeleteCandidate, setThreadDeleteCandidate] = useState<Thread | null>(null);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [batchDeleteCandidate, setBatchDeleteCandidate] = useState<string[]>([]);
  const resetThreadSelectionState = useCallback(() => {
    setSelectedMessageIds([]);
    setBatchDeleteCandidate([]);
    setMultiSelectMode(false);
  }, []);
  const cancelMultiSelectMode = useCallback(() => {
    setSelectedMessageIds([]);
    setBatchDeleteCandidate([]);
    setMultiSelectMode(false);
  }, []);
  const toggleMultiSelectMode = () => {
    setMultiSelectMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedMessageIds([]);
        setBatchDeleteCandidate([]);
      }
      return next;
    });
  };
  const [consultation, setConsultation] = useState<ConsultationRecord | null>(
    null
  );
  const [consultationLoading, setConsultationLoading] = useState(true);
  const [invoiceVisible, setInvoiceVisible] = useState(false);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [prescriptionVisible, setPrescriptionVisible] = useState(false);
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  useEffect(() => {
    setDeleteCandidate(null);
    setThreadDeleteCandidate(null);
    setSelectedMessageIds([]);
    setBatchDeleteCandidate([]);
    setMultiSelectMode(false);
    resetThreadSelectionState();
  }, [active?.id, activeOrder?.id, currentUserId, resetThreadSelectionState]);
  const [patientFileVisible, setPatientFileVisible] = useState(false);
  const [patientPets, setPatientPets] = useState<PatientPet[]>([]);
  const [patientFileLoading, setPatientFileLoading] = useState(false);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [soapVisible, setSoapVisible] = useState(false);
  const [soapSubmitting, setSoapSubmitting] = useState(false);
  const [consultationTypeVisible, setConsultationTypeVisible] = useState(false);
  const [petSelectionVisible, setPetSelectionVisible] = useState(false);
  const [farmSelectionVisible, setFarmSelectionVisible] = useState(false);
  const [farmRecordsVisible, setFarmRecordsVisible] = useState(false);
  const [farmRecordsLoading, setFarmRecordsLoading] = useState(false);
  const [farmRecords, setFarmRecords] = useState<FarmRecord[]>([]);
  const [farmSelectionMode, setFarmSelectionMode] = useState(false);
  const [farmSoapVisible, setFarmSoapVisible] = useState(false);
  const [farmSoapSubmitting, setFarmSoapSubmitting] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const messageLongPressLockRef = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const openedRoute = useRef<string | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveLocationSubscription = useRef<Location.LocationSubscription | null>(null);
  const activeLiveMessageIdRef = useRef<string | null>(null);
  const { counts: unreadCounts, refreshUnreadCounts } = useUnreadMessages();

  const stopRecordingTimer = () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    recordingTimer.current = null;
  };

  const startRecording = async () => {
    if (recording) return;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Microphone permission required", "Allow MVS to record a voice note.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimer.current = setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
    } catch (error) {
      console.error("[Voice Note] Failed to start recording:", error);
      Alert.alert("Recording failed", "Could not access the microphone.");
    }
  };

  const cancelRecording = async () => {
    stopRecordingTimer();
    setRecording(false);
    setRecordingSeconds(0);
    if (audioRecorder.isRecording) {
      try {
        await audioRecorder.stop();
      } catch (error) {
        console.warn("[Voice Note] Failed to discard recording:", error);
      }
    }
    await setAudioModeAsync({ allowsRecording: false });
  };

  const sendRecording = async () => {
    const cleanSenderId = normalizeUuid(currentUserId);
    const cleanReceiverId = normalizeUuid(active?.participantId);
    if (!recording || !active || !cleanSenderId || !cleanReceiverId) return;
    stopRecordingTimer();
    setRecording(false);
    setRecordingSeconds(0);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("The recording file is unavailable.");
      const response = await fetch(uri);
      const blob = await response.blob();
      const filePath = `${cleanSenderId}/${Date.now()}.m4a`;
      const { error: uploadError } = await supabase.storage
        .from("voice-notes")
        .upload(filePath, blob, {
          cacheControl: "3600",
          contentType: blob.type || "audio/m4a",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("voice-notes").getPublicUrl(filePath);
      const voiceMessage = await sendRealtimeMessage({
        conversation_id: conversationIdFor(cleanSenderId, cleanReceiverId),
        sender_id: cleanSenderId,
        receiver_id: cleanReceiverId,
        content: "Voice note",
        message_type: "voice_note" as RealtimeMessage["message_type"],
        media_url: data.publicUrl,
        media_type: null,
      });
      setMessages((current) => appendUniqueMessage(current, voiceMessage));
    } catch (error) {
      console.error("[Voice Note] Failed to send recording:", error);
      Alert.alert("Voice note failed", "Could not upload the recording.");
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
  };

  useEffect(() => () => {
    stopRecordingTimer();
    if (audioRecorder.isRecording) void audioRecorder.stop().catch(() => undefined);
  }, [audioRecorder]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadCounts();
    }, [refreshUnreadCounts])
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      let freshInboxLoaded = false;
      const loadInbox = async () => {
        try {
          const user = await getCurrentUser();
          const cleanUserId = normalizeUuid(user?.id);
          if (!cleanUserId) return;

          const clearedThreadStorageKey = `mvs_cleared_threads_${cleanUserId}`;
          const clearedThreadIdsRaw = await AsyncStorage.getItem(clearedThreadStorageKey);
          const clearedThreadIds = new Set<string>(
            clearedThreadIdsRaw ? (JSON.parse(clearedThreadIdsRaw) as string[]) : []
          );
          clearedThreadsRef.current = new Set(clearedThreadIds);

          const cachedThreads = inboxMemoryCache.get(cleanUserId);
          if (cachedThreads) {
            const filteredCachedThreads = cachedThreads.filter((thread) => {
              if (clearedThreadIds.has(thread.id)) return false;
              if (thread.messages.length === 0) return false;
              const hasVisibleMessage = thread.messages.some((message) => {
                if (message.is_deleted) return false;
                return !isMessageHiddenForUser(message, cleanUserId);
              });
              return hasVisibleMessage;
            });
            setThreads(filteredCachedThreads);
            setLoading(false);
          } else {
            void readCachedInboxThreads(cleanUserId).then((storedThreads) => {
              if (!mounted || freshInboxLoaded || !storedThreads) return;
              const filteredStoredThreads = storedThreads.filter((thread) => {
                if (clearedThreadIds.has(thread.id)) return false;
                if (thread.messages.length === 0) return false;
                const hasVisibleMessage = thread.messages.some((message) => {
                  if (message.is_deleted) return false;
                  return !isMessageHiddenForUser(message, cleanUserId);
                });
                return hasVisibleMessage;
              });
              setThreads(filteredStoredThreads);
              setLoading(false);
            });
          }

          const [roleData, rows] = await Promise.all([
            safeSupabaseCall<{ role: string | null } | null>(() => supabase
              .from("profiles")
              .select("role")
              .eq("id", cleanUserId)
              .maybeSingle()),
            safeSupabaseCall(() => supabase
              .from("messages")
              .select("*")
              .not("hidden_for_users", "cs", `{${cleanUserId}}`)
              .or(`sender_id.eq.${cleanUserId},receiver_id.eq.${cleanUserId}`)
              .order("created_at", { ascending: false })),
          ]);
          const messageRows = (rows || []) as RealtimeMessage[];
          const participantIds = [
            ...new Set(
              messageRows
                .map((row) =>
                  normalizeUuid(
                    row.sender_id === cleanUserId
                      ? row.receiver_id
                      : row.sender_id
                  )
                )
                .filter((id): id is string => Boolean(id))
            ),
          ];
          const consultationRowsData = roleData?.role === "merchant"
            ? []
            : await safeSupabaseCall(() => supabase
                .from("consultations")
                .select(
                  "conversation_id, client_id, vet_id, merchant_id, status, deleted_by_user_ids"
                )
                .or(
                  `client_id.eq.${cleanUserId},vet_id.eq.${cleanUserId},merchant_id.eq.${cleanUserId}`
                    ));
                  const consultationRows = (consultationRowsData || []) as {
            conversation_id: string;
            client_id: string | null;
            vet_id: string | null;
            merchant_id: string | null;
            status: ConsultationStatus;
            deleted_by_user_ids: string[] | null;
          }[];
          const consultationParticipantIds = consultationRows.flatMap((row) =>
            [row.client_id, row.vet_id, row.merchant_id]
              .map((id) => normalizeUuid(id))
              .filter((id): id is string => Boolean(id) && id !== cleanUserId)
          );
          const allParticipantIds = [
            ...new Set([...participantIds, ...consultationParticipantIds]),
          ];
          const profiles =
            allParticipantIds.length > 0
              ? await safeSupabaseCall(() => supabase
                  .from("profiles")
                  .select("id, full_name, email, role, avatar_url, business_name, location, phone_number")
                  .in("id", allParticipantIds))
              : [];
          const profileMap = new Map(
            (profiles || []).map((profile) => [profile.id, profile])
          );
          const grouped = new Map<string, RealtimeMessage[]>();
          for (const row of messageRows) {
            const participantId = normalizeUuid(
              row.sender_id === cleanUserId ? row.receiver_id : row.sender_id
            );
            if (!participantId || !profileMap.has(participantId)) continue;
            grouped.set(participantId, [
              ...(grouped.get(participantId) || []),
              row,
            ]);
          }
          const consultationStatusMap = new Map(
            consultationRows.map((consultation) => [
              consultation.conversation_id,
              consultation.status as ConsultationStatus,
            ])
          );
          const deletedByUserMap = new Map(
            consultationRows.map((consultation) => [
              consultation.conversation_id,
              Array.isArray(consultation.deleted_by_user_ids)
                ? consultation.deleted_by_user_ids
                : [],
            ])
          );
          if (!mounted) return;
          setCurrentUserId(cleanUserId);
          setUserRole(roleData?.role || "client");
          const rawThreads = allParticipantIds.map((participantId) => {
            const profile = profileMap.get(participantId);
            const conversationId = conversationIdFor(cleanUserId, participantId);
            const participantMessages = grouped.get(participantId) || [];
            const latestMessage = [...participantMessages].sort((first, second) =>
              second.created_at.localeCompare(first.created_at)
            )[0];
            const messageDeletedByUserIds = latestMessage
              ? (latestMessage as RealtimeMessage & {
                  deleted_by_user_ids?: string[] | null;
                }).deleted_by_user_ids
              : undefined;
            return {
              id: conversationId,
              participantId,
              participantName: profile?.full_name || profile?.email || "Contact",
              participantRole: profile?.role || "user",
              recipientProfile: profile as RecipientProfile,
              consultation_status: consultationStatusMap.get(conversationId),
              deleted_by_user_ids:
                participantMessages.length > 0
                  ? Array.isArray(messageDeletedByUserIds)
                    ? messageDeletedByUserIds
                    : []
                  : deletedByUserMap.get(conversationId) || [],
              messages: [...participantMessages].sort((first, second) =>
                first.created_at.localeCompare(second.created_at)
              ),
            };
          });
          const activeThreads = rawThreads
            .filter((thread) => {
              if (thread.deleted_by_user_ids.includes(cleanUserId)) return false;
              if (clearedThreadIds.has(thread.id)) return false;

              const hasVisibleMessage = thread.messages.some((message) => {
                if (message.is_deleted) return false;
                return !isMessageHiddenForUser(message, cleanUserId);
              });

              if (hasVisibleMessage) {
                clearedThreadIds.delete(thread.id);
                return true;
              }

              return !thread.messages.length || !thread.messages.every((message) => isMessageHiddenForUser(message, cleanUserId));
            })
            .sort((first, second) => getLatestThreadTime(second) - getLatestThreadTime(first));
          await syncClearedThreadStorage(cleanUserId, clearedThreadIds);
          rememberInboxThreads(cleanUserId, activeThreads);
          freshInboxLoaded = true;
          setThreads(activeThreads);
        } catch (error) {
          console.error("[Chat] Failed to load conversations:", error);
        } finally {
          if (mounted) setLoading(false);
        }
      };

      void loadInbox();
      return () => {
        mounted = false;
      };
    }, [])
  );

  useEffect(() => {
    if (!currentUserId) return;

    const consultationChannel = supabase
      .channel('public:consultations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consultations' },
        (payload) => {
          const consultation = payload.eventType === 'DELETE'
            ? (payload.old as ConsultationRecord & { conversation_id?: string; status?: ConsultationStatus })
            : (payload.new as ConsultationRecord & { conversation_id?: string; status?: ConsultationStatus });
          if (!consultation?.conversation_id) return;
          if (payload.eventType !== 'DELETE' && consultation.status) {
            rememberConsultation(consultation as ConsultationRecord);
          }

          setThreads((current) =>
            current.map((thread) =>
              thread.id === consultation.conversation_id
                ? {
                    ...thread,
                    consultation_status:
                      consultation.status ?? thread.consultation_status,
                  }
                : thread
            )
          );

          if (payload.eventType === 'DELETE') {
            return;
          }

          setConsultation((current) => {
            if (current?.conversation_id !== consultation.conversation_id) {
              return current;
            }
            return {
              ...current,
              status: consultation.status ?? current.status,
            };
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(consultationChannel);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      clearedThreadsRef.current = new Set();
      return;
    }

    let isMounted = true;
    void AsyncStorage.getItem(`mvs_cleared_threads_${currentUserId}`).then((value) => {
      if (!isMounted) return;
      try {
        clearedThreadsRef.current = new Set(value ? (JSON.parse(value) as string[]) : []);
      } catch {
        clearedThreadsRef.current = new Set();
      }
    });

    const inboxChannel = supabase
      .channel(`messages:inbox:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const incoming = payload.eventType === "DELETE"
            ? (payload.old as RealtimeMessage)
            : (payload.new as RealtimeMessage);

          if (!incoming) return;
          if (
            incoming.sender_id !== currentUserId &&
            incoming.receiver_id !== currentUserId
          ) {
            return;
          }

          if (incoming.conversation_id && clearedThreadsRef.current.has(incoming.conversation_id)) {
            clearedThreadsRef.current.delete(incoming.conversation_id);
            void syncClearedThreadStorage(currentUserId, clearedThreadsRef.current);
          }
          if (isMessageHiddenForUser(incoming, currentUserId)) return;

          setThreads((current) => {
            const participantId = normalizeUuid(
              incoming.sender_id === currentUserId
                ? incoming.receiver_id
                : incoming.sender_id
            );
            if (!participantId) return current;
            const threadIndex = current.findIndex(
              (thread) => thread.participantId === participantId
            );
            if (threadIndex === -1) return current;
            const thread = current[threadIndex];

            let nextMessages = thread.messages;
            if (payload.eventType === "DELETE") {
              nextMessages = thread.messages.filter((message) => message.id !== incoming.id);
            } else {
              nextMessages = appendUniqueMessage(thread.messages, incoming, currentUserId).sort(
                (first, second) => first.created_at.localeCompare(second.created_at)
              );
            }

            const updatedThread = {
              ...thread,
              messages: nextMessages,
            };
            const nextThreads = [
              updatedThread,
              ...current.filter((_, index) => index !== threadIndex),
            ];
            rememberInboxThreads(currentUserId, nextThreads);
            return nextThreads;
          });
        }
      )
      .subscribe();
    return () => {
      isMounted = false;
      void supabase.removeChannel(inboxChannel);
    };
  }, [currentUserId]);

  useEffect(() => {
    const routeRecipient = normalizeUuid(
      recipientIdParam || merchantIdParam || vetIdParam || receiverIdParam
    );
    const routeKey = `${conversationIdParam || ""}:${inquiryKeyParam || ""}`;
    if (
      !currentUserId ||
      !routeRecipient ||
      !conversationIdParam ||
      openedRoute.current === routeKey
    ) {
      return;
    }
    openedRoute.current = routeKey;
    let cancelled = false;
    const participantName = merchantNameParam || vetParam || "Merchant";
    const resolvedConversationId = conversationIdParam || conversationIdFor(currentUserId, routeRecipient);
    const nextActive: Thread = {
      id: resolvedConversationId,
      participantId: routeRecipient,
      participantName,
      participantRole: vetParam ? "veterinarian" : "merchant",
      productName: productNameParam,
      messages: [],
    };
    queueMicrotask(() => {
      if (cancelled) return;
      setActive(nextActive);
      setMessage(isCategory(categoryParam) ? getCategoryInitialMessage(categoryParam, vetParam || "Veterinarian") : initialMessageParam || starterMessageParam || "");
    });
    return () => {
      cancelled = true;
    };
  }, [
    currentUserId,
    userRole,
    conversationIdParam,
    recipientIdParam,
    merchantIdParam,
    merchantNameParam,
    receiverIdParam,
    vetIdParam,
    vetParam,
    productNameParam,
    initialMessageParam,
    starterMessageParam,
    inquiryKeyParam,
    categoryParam,
  ]);


  useEffect(() => {
    if (!active?.participantId) {
      setRecipientProfile(null);
      return;
    }
    let mounted = true;
    const loadRecipientProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, avatar_url, business_name, location, phone_number")
        .eq("id", active.participantId)
        .maybeSingle();
      if (mounted) setRecipientProfile((data as RecipientProfile | null) || null);
    };
    void loadRecipientProfile();
    const profileChannel = supabase
      .channel(`profile:${active.participantId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${active.participantId}` },
        () => {
          if (mounted) void loadRecipientProfile();
        }
      )
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(profileChannel);
    };
  }, [active?.participantId]);

  useEffect(() => {
    if (
      !active ||
      !currentUserId ||
      !["client", "veterinarian", "vet"].includes(userRole) ||
      !["client", "veterinarian", "vet"].includes(active.participantRole)
    )
      {
        setConsultationLoading(false);
        return;
      }
    let mounted = true;
    let queryResolved = false;
    const cachedConsultation = consultationMemoryCache.get(active.id);
    if (cachedConsultation) {
      setConsultation(cachedConsultation);
      setThreads((current) => current.map((thread) =>
        thread.id === active.id
          ? { ...thread, consultation_status: cachedConsultation.status }
          : thread
      ));
    }
    setConsultationLoading(!cachedConsultation);
    void readCachedConsultation(active.id).then((storedConsultation) => {
      if (!mounted || queryResolved || cachedConsultation || !storedConsultation) return;
      setConsultation(storedConsultation);
      setConsultationLoading(false);
      setThreads((current) => current.map((thread) =>
        thread.id === active.id
          ? { ...thread, consultation_status: storedConsultation.status }
          : thread
      ));
    });
    const loadConsultation = async () => {
      try {
        const { data: activeConsultations, error: lookupError } = await supabase
          .from("consultations")
          .select("id, conversation_id, client_id, vet_id, status, service_type")
          .eq("conversation_id", active.id)
          .eq(userRole === "client" ? "client_id" : "vet_id", currentUserId)
          .eq(userRole === "client" ? "vet_id" : "client_id", active.participantId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);
        if (lookupError) throw lookupError;

        let existingConsultation = activeConsultations?.[0];
        if (!existingConsultation) {
          const { data: latestConsultations, error: latestLookupError } = await supabase
            .from("consultations")
            .select("id, conversation_id, client_id, vet_id, status, service_type")
            .eq("conversation_id", active.id)
            .eq(userRole === "client" ? "client_id" : "vet_id", currentUserId)
            .eq(userRole === "client" ? "vet_id" : "client_id", active.participantId)
            .order("created_at", { ascending: false })
            .limit(1);
          if (latestLookupError) throw latestLookupError;
          existingConsultation = latestConsultations?.[0];
        }
        if (existingConsultation) {
          const resolvedConsultation = existingConsultation as ConsultationRecord;
          rememberConsultation(resolvedConsultation);
          if (mounted) {
            setConsultation(resolvedConsultation);
            setThreads((current) =>
              current.map((thread) =>
                thread.id === active.id
                  ? { ...thread, consultation_status: resolvedConsultation.status }
                  : thread
              )
            );
          }
          return;
        }
        if (mounted) {
          setConsultation((current) => current?.status === "active" ? current : null);
        }
      } catch (error) {
        console.error("[Consultation] Failed to ensure consultation:", error);
      } finally {
        queryResolved = true;
        if (mounted) setConsultationLoading(false);
      }
    };
    void loadConsultation();
    const consultationChannel = supabase
      .channel(`consultations:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consultations", filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          const nextConsultation = payload.new as ConsultationRecord;
          rememberConsultation(nextConsultation);
          if (mounted) {
            setConsultation(nextConsultation);
            setThreads((current) => current.map((thread) => thread.id === active.id ? { ...thread, consultation_status: nextConsultation.status } : thread));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultations", filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          const nextConsultation = payload.new as ConsultationRecord;
          rememberConsultation(nextConsultation);
          if (mounted) {
            setConsultation(nextConsultation);
            setThreads((current) => current.map((thread) => thread.id === active.id ? { ...thread, consultation_status: nextConsultation.status } : thread));
          }
        }
      )
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(consultationChannel);
    };
  }, [active, currentUserId, userRole]);

  useEffect(() => {
    if (!active) {
      setActiveOrder(null);
      return;
    }
    let mounted = true;
    const loadActiveOrder = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("conversation_id", active.id)
        .not("status", "in", '("completed","cancelled")')
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) {
        console.error("[Chat Order] Failed to load active order:", error);
        if (mounted) setActiveOrder(null);
        return;
      }
      const currentOrder = data && data.length > 0 ? data[0] : null;
      if (mounted) setActiveOrder(currentOrder as ActiveOrder | null);
    };
    void loadActiveOrder();
    return () => {
      mounted = false;
    };
  }, [active, userRole]);

  useEffect(() => {
    if (!active) return;
    const orderChannel = supabase
      .channel(`orders:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `conversation_id=eq.${active.id}` },
        (payload) => setActiveOrder(payload.new as ActiveOrder)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          const order = payload.new as ActiveOrder;
          const status: string = order.status as string;
          setActiveOrder(status === "completed" || status === "cancelled" ? null : order);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(orderChannel);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const invoiceChannel = supabase
      .channel(`invoices:${active.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "invoices", filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          const invoice = payload.new as { id?: string; status?: string };
          if (!invoice.id || !invoice.status) return;
          setMessages((current) => current.map((item) => {
            const metadata = item.metadata as Partial<InvoiceMetadata> | null;
            return metadata?.invoice_id === invoice.id
              ? { ...item, metadata: { ...metadata, status: invoice.status } }
              : item;
          }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(invoiceChannel);
    };
  }, [active]);

  useEffect(() => {
    if (!initialMessageParam && !isCategory(categoryParam)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMessage(isCategory(categoryParam) ? getCategoryInitialMessage(categoryParam, vetParam || "Veterinarian") : initialMessageParam || "");
    });
    return () => {
      cancelled = true;
    };
  }, [initialMessageParam, categoryParam, vetParam]);

  useEffect(() => {
    if (!inquiryKeyParam || !starterMessageParam) return;
    setMessage(starterMessageParam);
  }, [inquiryKeyParam, starterMessageParam]);

  useEffect(() => {
    if (!active || !isUuid(currentUserId) || !isUuid(active.participantId))
      return;
    let mounted = true;
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .not("hidden_for_users", "cs", `{${currentUserId}}`)
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${active.participantId}),and(sender_id.eq.${active.participantId},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: true });
      if (error || !mounted) return;
      const loadedMessages = filterVisibleMessages((data || []) as RealtimeMessage[], currentUserId);
      const invoiceIds = loadedMessages
        .filter((item) => item.message_type === "invoice")
        .map((item) => (item.metadata as Partial<InvoiceMetadata> | null)?.invoice_id)
        .filter((invoiceId): invoiceId is string => Boolean(invoiceId));
      const isMerchantConversation = userRole === "merchant" || active.participantRole === "merchant";
      if (invoiceIds.length === 0 || !isMerchantConversation) {
        setMessages(loadedMessages);
        return;
      }
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id, status")
        .in("id", invoiceIds);
      if (invoicesError) {
        console.error("Error loading invoice statuses:", invoicesError);
        setMessages(loadedMessages);
        return;
      }
      const invoiceStatusMap = new Map(invoices?.map((invoice) => [invoice.id, invoice.status]) || []);
      setMessages(loadedMessages.map((item) => {
        const invoiceId = (item.metadata as Partial<InvoiceMetadata> | null)?.invoice_id;
        const status = invoiceId ? invoiceStatusMap.get(invoiceId) : undefined;
        return status ? { ...item, metadata: { ...item.metadata, status } } : item;
      }));
    };
    void loadMessages();
    const unsubscribe = subscribeToMessages(
      active.id,
      (incoming) => {
        if (!mounted) return;
        if (!incoming || incoming.conversation_id !== active.id) return;
        if (incoming.conversation_id && clearedThreadsRef.current.has(incoming.conversation_id)) {
          clearedThreadsRef.current.delete(incoming.conversation_id);
          void syncClearedThreadStorage(currentUserId, clearedThreadsRef.current);
        }
        if (isMessageHiddenForUser(incoming, currentUserId)) return;

        setMessages((current) => {
          const visibleCurrent = filterVisibleMessages(current, currentUserId);
          if (isMessageHiddenForUser(incoming, currentUserId)) return visibleCurrent;
          const existingMessage = visibleCurrent.some((message) => message.id === incoming.id);
          const nextMessages = existingMessage
            ? visibleCurrent.map((message) => message.id === incoming.id ? incoming : message)
            : appendUniqueMessage(visibleCurrent, incoming, currentUserId);
          return nextMessages;
        });
      },
      (messageId) => {
        if (mounted)
          setMessages((current) =>
            current.filter((message) => message.id !== messageId)
          );
      }
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [active, currentUserId, userRole]);

  useEffect(() => {
    if (!active || !currentUserId) return;
    void markConversationRead(active.id, currentUserId, active.participantId).catch((error) => {
      console.error("[Chat] Failed to mark conversation as read:", error);
    });
  }, [active, currentUserId]);

  useEffect(() => {
    return () => {
      liveLocationSubscription.current?.remove();
      liveLocationSubscription.current = null;
      activeLiveMessageIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    return () => {
      liveLocationSubscription.current?.remove();
      liveLocationSubscription.current = null;
      setLiveLocationActive(false);
      activeLiveMessageIdRef.current = null;
    };
  }, [active, currentUserId, userRole]);

  const requestLocationPermission = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Location permission required",
        "Allow MVS to access your location to share it in chat."
      );
      return false;
    }
    return true;
  };

  const getLocationData = useCallback(async (location: Location.LocationObject) => {
    let addressName = "";
    try {
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      addressName = address?.name || address?.formattedAddress || "";
    } catch {
      // Coordinates remain useful when reverse geocoding is unavailable.
    }

    return {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      addressName,
    };
  }, []);

  const sendLocationMessage = async (
    messageType: "location_static" | "location_live",
    location: Location.LocationObject
  ) => {
    const cleanSenderId = normalizeUuid(currentUserId);
    const cleanReceiverId = normalizeUuid(active?.participantId);
    if (!active || !cleanSenderId || !cleanReceiverId) return;

    const locationData = await getLocationData(location);

    const liveMessage = await sendRealtimeMessage({
      conversation_id: conversationIdFor(cleanSenderId, cleanReceiverId),
      sender_id: cleanSenderId,
      receiver_id: cleanReceiverId,
      content: messageType === "location_live" ? "Live Location" : "Shared Location",
      message_type: messageType as RealtimeMessage["message_type"],
      location_data: locationData,
      metadata: messageType === "location_live" ? { location_session_active: "true" } : undefined,
    });

    if (messageType === "location_live") {
      activeLiveMessageIdRef.current = liveMessage.id;
      setMessages((current) => appendUniqueMessage(current, liveMessage));
    }
  };

  const updateLiveLocationMessage = useCallback(async (location: Location.LocationObject) => {
    const messageId = activeLiveMessageIdRef.current;
    if (!messageId || !active) return;

    const locationData = await getLocationData(location);
    const { data, error } = await supabase
      .from("messages")
      .update({ location_data: locationData })
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? (data as RealtimeMessage) : item))
    );
  }, [active, getLocationData]);

  const watchLiveLocation = useCallback(async () => {
    if (liveLocationSubscription.current) return;
    liveLocationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000,
        distanceInterval: 0,
      },
      (location) => {
        void updateLiveLocationMessage(location).catch((error) =>
          console.error("[Chat] Failed to update live location:", error)
        );
      }
    );
  }, [updateLiveLocationMessage]);

  useEffect(() => {
    if (!active || !isUuid(currentUserId)) return;
    let mounted = true;

    const restoreLiveLocationSession = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, metadata, created_at")
        .eq("conversation_id", active.id)
        .eq("sender_id", currentUserId)
        .eq("message_type", "location_live")
        .eq("metadata->>location_session_active", "true")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !mounted || !data) return;

      activeLiveMessageIdRef.current = data.id;
      setLiveLocationActive(true);

      const permission = await Location.getForegroundPermissionsAsync();
      if (!mounted || !permission.granted || liveLocationSubscription.current) return;
      await watchLiveLocation();
    };

    void restoreLiveLocationSession();
    return () => {
      mounted = false;
    };
  }, [active, currentUserId, watchLiveLocation]);

  const sendCurrentLocation = async () => {
    if (!(await requestLocationPermission())) return;
    try {
      const location = await Location.getCurrentPositionAsync({});
      await sendLocationMessage("location_static", location);
      setLocationVisible(false);
      setAttachmentVisible(false);
    } catch (error) {
      Alert.alert(
        "Location unavailable",
        error instanceof Error ? error.message : "Could not get your current location."
      );
    }
  };

  const startLiveLocation = async () => {
    if (!active || liveLocationSubscription.current || !(await requestLocationPermission())) return;
    try {
      const cleanSenderId = normalizeUuid(currentUserId);
      const cleanReceiverId = normalizeUuid(active.participantId);
      if (!cleanSenderId || !cleanReceiverId) return;

      const initialLocation = await Location.getCurrentPositionAsync({});
      await sendLocationMessage("location_live", initialLocation);
      await watchLiveLocation();
      setLiveLocationActive(true);
      setLocationVisible(false);
      setAttachmentVisible(false);
    } catch (error) {
      Alert.alert(
        "Live location unavailable",
        error instanceof Error ? error.message : "Could not start live location."
      );
    }
  };

  const stopLiveLocation = () => {
    const messageId = activeLiveMessageIdRef.current;
    if (messageId && isUuid(currentUserId)) {
      void supabase
        .from("messages")
        .update({
          metadata: {
            location_session_active: "false",
            stopped_at: new Date().toISOString(),
          },
        })
        .eq("id", messageId)
        .eq("sender_id", currentUserId)
        .then(({ error }) => {
          if (error) console.error("[Chat] Failed to persist stopped live location:", error);
        });
    }
    liveLocationSubscription.current?.remove();
    liveLocationSubscription.current = null;
    activeLiveMessageIdRef.current = null;
    setLiveLocationActive(false);
  };

  const openThread = (thread: Thread) => {
    const visibleMessages = filterVisibleMessages(Array.isArray(thread.messages) ? thread.messages : [], currentUserId);
    setActive(thread);
    setMessages(visibleMessages);
    setMessage("");
  };

  const handleThreadPress = (thread: Thread) => {
    if (isLongPressActive) {
      setIsLongPressActive(false);
      return;
    }
    openThread(thread);
  };

  const handleRequestDelete = (thread: Thread) => {
    setIsLongPressActive(true);
    setThreadDeleteCandidate(thread);
    setTimeout(() => {
      setIsLongPressActive(false);
    }, 750);
  };

  const deleteThread = async (thread: Thread) => {
    setThreads((current) => current.filter((item) => item.id !== thread.id));
    setThreadDeleteCandidate(null);

    try {
      const { data: consultation, error: consultationLookupError } =
        userRole === "merchant" || thread.participantRole === "merchant"
          ? { data: null, error: null }
          : await supabase
              .from("consultations")
              .select("id, deleted_by_user_ids")
              .eq("conversation_id", thread.id)
              .maybeSingle();

      if (!consultationLookupError && consultation) {
        const deletedByUserIds = Array.isArray(consultation.deleted_by_user_ids)
          ? consultation.deleted_by_user_ids
          : [];
        const { error: rpcError } = await supabase.rpc("soft_delete_consultation", {
          p_consultation_id: consultation.id,
          p_user_id: currentUserId,
        });

        if (rpcError) {
          await supabase
            .from("consultations")
            .update({
              deleted_by_user_ids: deletedByUserIds.includes(currentUserId)
                ? deletedByUserIds
                : [...deletedByUserIds, currentUserId],
            })
            .eq("id", consultation.id);
        }

        try {
          const { data: messages } = await supabase
            .from("messages")
            .select("id, deleted_by_user_ids")
            .eq("conversation_id", thread.id);
          await Promise.all(
            (messages || []).map((message) => {
              const messageDeletedByUserIds = Array.isArray(message.deleted_by_user_ids)
                ? message.deleted_by_user_ids
                : [];
              return supabase
                .from("messages")
                .update({
                  deleted_by_user_ids: messageDeletedByUserIds.includes(currentUserId)
                    ? messageDeletedByUserIds
                    : [...messageDeletedByUserIds, currentUserId],
                })
                .eq("id", message.id);
            })
          );
        } catch (messageUpdateError) {
          console.error("Failed to soft-delete consultation messages:", messageUpdateError);
        }
        return;
      }

      try {
        const { data: messages, error: messagesLookupError } = await supabase
          .from("messages")
          .select("id, deleted_by_user_ids")
          .eq("conversation_id", thread.id);

        if (messagesLookupError) return;

        await Promise.all(
          (messages || []).map(async (message) => {
            const deletedByUserIds = Array.isArray(message.deleted_by_user_ids)
              ? message.deleted_by_user_ids
              : [];
            await supabase
              .from("messages")
              .update({
                deleted_by_user_ids: deletedByUserIds.includes(currentUserId)
                  ? deletedByUserIds
                  : [...deletedByUserIds, currentUserId],
              })
              .eq("id", message.id);
          })
        );
      } catch (messagesError) {
        console.error("Failed to soft-delete message-backed thread:", messagesError);
      }
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
  };

  const handleBack = () => {
    setActive(null);
    setMessages([]);
    setMessage("");
    setConsultation(null);
    setPatientFileVisible(false);
    setPatientPets([]);
    setActivePetId(null);
    setMedicalRecords([]);
    setSoapVisible(false);
    setPatientFileVisible(false);
    setPetSelectionVisible(false);
    setFarmSelectionVisible(false);
    setFarmRecordsVisible(false);
    setFarmRecords([]);
    setSelectedFarmId(null);
    setFarmSoapVisible(false);
    router.setParams({
      conversationId: undefined,
      recipientId: undefined,
      merchantId: undefined,
      vet_id: undefined,
      receiver_id: undefined,
      productId: undefined,
      productName: undefined,
      productPrice: undefined,
      starterMessage: undefined,
    });
    router.replace("/chat");
  };

  useEffect(() => {
    if (!resetThreadParam) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setActive(null);
      setMessages([]);
      setMessage("");
      setConsultation(null);
      setPatientFileVisible(false);
      setPatientPets([]);
      setActivePetId(null);
      setMedicalRecords([]);
      setSoapVisible(false);
      setPatientFileVisible(false);
      setPetSelectionVisible(false);
      setFarmSelectionVisible(false);
      setFarmRecordsVisible(false);
      setFarmRecords([]);
      setSelectedFarmId(null);
      setFarmSoapVisible(false);
      router.setParams({
        resetThread: undefined,
        conversationId: undefined,
        recipientId: undefined,
        merchantId: undefined,
        vet_id: undefined,
        receiver_id: undefined,
        productId: undefined,
        productName: undefined,
        productPrice: undefined,
        starterMessage: undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [resetThreadParam, router]);

  const openPatientFile = async (showModal = true): Promise<PatientPet[]> => {
    setPatientFileVisible(showModal);
    setPatientFileLoading(true);
    setPatientPets([]);
    setMedicalRecords([]);
    try {
      if (!active || !["vet", "veterinarian"].includes(userRole)) {
        console.warn("[Patient File] No active vet conversation available");
        return [];
      }
      const targetClientId = consultation?.client_id || active.participantId;
      if (!targetClientId) {
        console.warn("[Patient File] No client ID available");
        return [];
      }
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, type, breed, dob, vaccination_status, medical_notes, photos")
        .eq("owner_id", targetClientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const pets = (data || []) as PatientPet[];
      const selectedPetId = pets[0]?.id || null;
      setPatientPets(pets);
      setActivePetId(selectedPetId);
      if (pets.length) {
        const { data: records, error: recordsError } = await supabase
          .from("pet_soap_records")
          .select("id, created_at, pet_id, weight_kg, temperature_c, heart_rate_bpm, subjective, objective, assessment, plan, is_deleted")
          .in("pet_id", pets.map((pet) => pet.id))
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });
        if (recordsError) throw recordsError;
        setMedicalRecords((records || []) as MedicalRecord[]);
      }
      return pets;
    } catch (error) {
      console.error("[Patient File] Failed to load pets:", error);
      setPatientPets([]);
      setMedicalRecords([]);
      return [];
    } finally {
      setPatientFileLoading(false);
    }
  };

  const selectPatientPet = async (petId: string) => {
    setActivePetId(petId);
  };

  const deletePetSoapRecord = async (recordId: string) => {
    const { error } = await supabase.from("pet_soap_records").update({ is_deleted: true }).eq("id", recordId);
    if (error) {
      Alert.alert("Unable to archive SOAP record", error.message);
      return;
    }
    setMedicalRecords((current) => current.filter((record) => record.id !== recordId));
  };

  const openFarmRecords = async (selectFarm = false, openSoap = false, showModal = true): Promise<FarmRecord[]> => {
    const clientId = consultation?.client_id || active?.participantId;
    setFarmSelectionMode(selectFarm);
    setFarmRecordsVisible(showModal);
    setFarmRecordsLoading(true);
    setFarmRecords([]);
    if (!clientId) {
      setFarmRecordsLoading(false);
      setFarmRecordsVisible(false);
      return [];
    }
    try {
      const { data: farms, error: farmError } = await supabase
        .from("farm_records")
        .select("id, species, breed, flock_size, location, restock_date, medical_log, production_summary")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (farmError) throw farmError;
      const farmIds = (farms || []).map((farm) => farm.id);
      const { data: soapRecords, error: soapError } = farmIds.length
        ? await supabase
            .from("farm_soap_records")
            .select("id, farm_id, subjective, objective, tentative_diagnosis, plan, created_at, is_deleted")
            .in("farm_id", farmIds)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (soapError) throw soapError;
      const recordsWithHistory = (farms || []).map((farm) => ({
        ...(farm as FarmRecord),
        soapRecords: (soapRecords || []).filter((record) => record.farm_id === farm.id) as FarmSoapRecord[],
      }));
      setFarmRecords(recordsWithHistory);
      if (openSoap) {
        const firstFarmId = recordsWithHistory[0]?.id;
        if (!firstFarmId) {
          setFarmRecordsVisible(false);
          Alert.alert("No farm records found", "Add a farm record before completing a farm consultation.");
          return [];
        }
        setSelectedFarmId(firstFarmId);
        setFarmRecordsVisible(false);
        setFarmSoapVisible(true);
      }
      return recordsWithHistory;
    } catch (error) {
      setFarmRecords([]);
      setFarmRecordsVisible(false);
      Alert.alert("Unable to load farm records", error instanceof Error ? error.message : "Please try again.");
      return [];
    } finally {
      setFarmRecordsLoading(false);
    }
  };

  const deleteFarmSoapRecord = async (recordId: string) => {
    const { error } = await supabase.from("farm_soap_records").update({ is_deleted: true }).eq("id", recordId);
    if (error) {
      Alert.alert("Unable to archive SOAP record", error.message);
      return;
    }
    setFarmRecords((current) => current.map((farm) => ({
      ...farm,
      soapRecords: farm.soapRecords?.filter((record) => record.id !== recordId),
    })));
  };

  const updateConsultation = async (status: ConsultationStatus) => {
    let currentConsultation = consultation;
    if (!currentConsultation || ![currentConsultation.client_id, currentConsultation.vet_id].includes(currentUserId)) return;

    try {
      const { data, error } = await supabase
        .from("consultations")
        .update({ status })
        .eq("id", currentConsultation.id)
        .eq("conversation_id", currentConsultation.conversation_id)
        .select("id, conversation_id, client_id, vet_id, merchant_id, status, service_type")
        .single();
      if (error) throw error;
      const updatedConsultation = data as ConsultationRecord;
      rememberConsultation(updatedConsultation);
      setConsultation(updatedConsultation);
      setThreads((current) => current.map((thread) =>
        thread.id === currentConsultation.conversation_id ? { ...thread, consultation_status: status } : thread
      ));

      const recipientUserId = currentUserId === currentConsultation.client_id
        ? currentConsultation.vet_id
        : currentConsultation.client_id;

      void sendPushNotification(recipientUserId, 'Consultation update', `Consultation marked as ${status}.`, {
        preferenceKey: 'consults',
        type: 'consultation_status',
        conversation_id: currentConsultation.conversation_id,
        status,
      });
    } catch (error) {
      Alert.alert(
        "Unable to update consultation",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  };

  const handleToggleConsultation = async () => {
    if (userRole !== "client" || consultation?.status !== "active") return;
    await updateConsultation("completed");
  };

  const handleStartConsultation = async () => {
    if (
      !active ||
      userRole !== "client" ||
      !isUuid(currentUserId) ||
      !isUuid(active.participantId) ||
      !["vet", "veterinarian"].includes(active.participantRole) ||
      consultation?.status === "active"
    ) {
      return;
    }

    let nextConsultation: ConsultationRecord;
    try {
      nextConsultation = await ensureConsultationRecord(
        active.id,
        currentUserId,
        active.participantId,
        userRole,
        active.participantRole,
        consultation?.service_type || (isCategory(categoryParam) ? categoryParam : undefined)
      ) as ConsultationRecord;
    } catch (error) {
      console.error("[Consultation] Failed to start consultation:", error);
      Alert.alert("Unable to start consultation", error instanceof Error ? error.message : "Please try again.");
      return;
    }

    rememberConsultation(nextConsultation);
    setConsultation(nextConsultation);
    setThreads((current) => current.map((thread) =>
      thread.id === active.id ? { ...thread, consultation_status: nextConsultation.status } : thread
    ));

    void sendPushNotification(active.participantId, 'Consultation active', 'A consultation has started for this chat.', {
      preferenceKey: 'consults',
      type: 'consultation_status',
      conversation_id: active.id,
      status: 'active',
    });
  };

  const handleEndConsultationByVet = async () => {
    if (
      !(["vet", "veterinarian"].includes(userRole)) ||
      !consultation ||
      consultation.vet_id !== currentUserId ||
      consultation.status !== "active"
    )
      return;
    setConsultationTypeVisible(true);
  };

  const beginPetConsultation = async () => {
    setConsultationTypeVisible(false);
    const pets = await openPatientFile(false);
    if (!pets.length) {
      Alert.alert("No pets found", "Add a pet record before completing a pet consultation.");
      return;
    }
    setPetSelectionVisible(true);
  };

  const choosePetForConsultation = (petId: string) => {
    setActivePetId(petId);
    setPetSelectionVisible(false);
    setSoapVisible(true);
  };

  const chooseFarmConsultation = async () => {
    setConsultationTypeVisible(false);
    const farms = await openFarmRecords(false, false, false);
    if (!farms.length) {
      Alert.alert("No farm records found", "Add a farm record before completing a farm consultation.");
      return;
    }
    setFarmSelectionVisible(true);
  };

  const chooseFarmForConsultation = (farmId: string) => {
    setSelectedFarmId(farmId);
    setFarmSelectionVisible(false);
    setFarmSoapVisible(true);
  };

  const createMedicalRecord = async (draft: SoapDraft) => {
    const activeConversationId = active?.id || null;
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!activePetId || !session?.user?.id) {
      Alert.alert("Error", "Missing required pet or vet details for medical record creation.");
      return;
    }
    if (!activeConversationId) {
      Alert.alert("Error", "Missing active conversation ID.");
      return;
    }
    const parsedWeightKg = parseFloat(draft.weightKg.trim());
    const parsedTemperatureC = parseFloat(draft.temperatureC.trim());
    const parsedHeartRateBpm = parseInt(draft.heartRateBpm.trim(), 10);
    const weightKg = Number.isNaN(parsedWeightKg) ? null : parsedWeightKg;
    const temperatureC = Number.isNaN(parsedTemperatureC) ? null : parsedTemperatureC;
    const heartRateBpm = Number.isNaN(parsedHeartRateBpm) ? null : parsedHeartRateBpm;
    if ([weightKg, temperatureC, heartRateBpm].some((value) => value !== null && !Number.isFinite(value))) {
      Alert.alert("Invalid vitals", "Enter valid numeric values for the recorded vitals.");
      return;
    }
    const subjective = sanitizeInput(draft.subjective).trim();
    const objective = sanitizeInput(draft.objective).trim();
    const assessment = sanitizeInput(draft.assessment).trim();
    const plan = sanitizeInput(draft.plan).trim();
    setSoapSubmitting(true);
    try {
      const { error } = await supabase.from("pet_soap_records").insert({
        pet_id: activePetId,
        vet_id: session.user.id,
        conversation_id: activeConversationId,
        weight_kg: weightKg,
        temperature_c: temperatureC,
        heart_rate_bpm: heartRateBpm,
        subjective,
        objective,
        assessment,
        plan,
      });
      if (error) {
        console.error("[SOAP Insert Error Details]:", error);
        Alert.alert("Unable to save consultation", error.message);
        return;
      }
      await updateConsultation("completed");
      setSoapVisible(false);
      handleBack();
    } catch (error) {
      console.error("[SOAP Insert Error Details]:", error);
      Alert.alert("Unable to save consultation", error instanceof Error ? error.message : "Could not save medical record.");
    } finally {
      setSoapSubmitting(false);
    }
  };

  const createFarmSoapRecord = async (draft: FarmSoapDraft) => {
    const clientId = consultation?.client_id || active?.participantId;
    if (!selectedFarmId || !clientId || !currentUserId || !consultation?.id) {
      Alert.alert("Error", "Missing required farm, client, vet, or consultation details.");
      return;
    }
    setFarmSoapSubmitting(true);
    try {
      const { error } = await supabase.from("farm_soap_records").insert({
        farm_id: selectedFarmId,
        client_id: clientId,
        vet_id: currentUserId,
        consultation_id: consultation.id,
        subjective: sanitizeInput(draft.subjective).trim(),
        objective: sanitizeInput(draft.objective).trim(),
        tentative_diagnosis: sanitizeInput(draft.tentative_diagnosis).trim(),
        plan: sanitizeInput(draft.plan).trim(),
      });
      if (error) throw error;
      await updateConsultation("completed");
      setFarmSoapVisible(false);
      setSelectedFarmId(null);
      handleBack();
    } catch (error) {
      Alert.alert("Unable to save farm consultation", error instanceof Error ? error.message : "Could not save farm SOAP record.");
    } finally {
      setFarmSoapSubmitting(false);
    }
  };

  const createInvoice = async (amount: number, note: string, items: InvoiceItem[]) => {
    if (!active || !currentUserId || !isUuid(active.participantId) || !["merchant", "vet", "veterinarian"].includes(userRole)) return;
    setInvoiceSubmitting(true);
    try {
      const user = await getCurrentUser();
      const sellerName = sanitizeInput(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Seller");
      const cleanNote = sanitizeInput(note);
      let sellerSubaccountId: string | undefined;
      const { data: sellerProfile, error: sellerProfileError } = await supabase.from("profiles").select("flutterwave_subaccount_id").eq("id", currentUserId).maybeSingle();
      if (sellerProfileError) console.warn("[Invoice] Seller Flutterwave subaccount unavailable:", sellerProfileError.message);
      else sellerSubaccountId = sellerProfile?.flutterwave_subaccount_id || undefined;
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({ conversation_id: active.id, merchant_id: currentUserId, buyer_id: active.participantId, amount, note: cleanNote || null, items, status: "pending" })
        .select("id, amount, status")
        .single();
      if (error) throw error;
      const invoiceMetadata: InvoiceMetadata = { invoice_id: invoice.id, amount: Number(invoice.amount), items, note: cleanNote || undefined, seller_name: sellerName, seller_subaccount_id: sellerSubaccountId, status: "pending" };
      const invoiceMessage = await sendRealtimeMessage({ conversation_id: active.id, sender_id: currentUserId, receiver_id: active.participantId, content: cleanNote || "Invoice", message_type: "invoice", metadata: invoiceMetadata });
      setMessages((current) => appendUniqueMessage(current, invoiceMessage));
      setInvoiceVisible(false);
    } catch (error) {
      Alert.alert("Invoice failed", error instanceof Error ? error.message : "Could not create invoice.");
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const createOrder = async () => {
    if (
      !active ||
      userRole !== "merchant" ||
      !isUuid(currentUserId) ||
      !isUuid(active.participantId) ||
      activeOrder
    ) {
      return;
    }
    const paidInvoice = [...messages].reverse().find((item) => {
      if (item.message_type !== "invoice") return false;
      const metadata = item.metadata as Partial<InvoiceMetadata> | null;
      return metadata?.status === "paid";
    });
    const invoiceMetadata = paidInvoice?.metadata as Partial<InvoiceMetadata> | undefined;
    const conversationId = active.id;
    const merchantId = currentUserId;
    const clientId = active.participantId;
    const { data, error } = await supabase
      .from("orders")
      .insert([{
        conversation_id: conversationId,
        buyer_id: clientId,
        merchant_id: merchantId,
        amount: Number(invoiceMetadata?.amount || 0),
        status: "pending",
      }])
      .select("*")
      .single();
    if (error) {
      console.error("[Chat Order] Failed to create order:", error);
      Alert.alert("Order creation failed", error.message);
      return;
    }
    setActiveOrder(data as ActiveOrder);
  };

  const updateActiveOrderStatus = async (newStatus: OrderStatus | "completed") => {
    if (userRole !== "merchant") return;
    if (!active || !activeOrder?.id) {
      Alert.alert("Order update failed", "No active order was found for this conversation.");
      return;
    }
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", activeOrder.id);
    if (error) {
      console.error("[Chat Order] Failed to update status:", error);
      Alert.alert("Order update failed", error.message);
      return;
    }

    void sendPushNotification(active.participantId, 'Order status updated', `Order status changed to ${newStatus}.`, {
      preferenceKey: 'orders',
      type: 'order_status',
      order_id: activeOrder.id,
      status: newStatus,
    });

    if (newStatus === "completed") {
      setActiveOrder(null);
    } else {
      setActiveOrder((current) => (current ? { ...current, status: newStatus } : current));
    }
    const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
    const notification = await sendRealtimeMessage({
      conversation_id: active.id,
      sender_id: currentUserId,
      receiver_id: active.participantId,
      content: `Order status updated to ${statusLabel}`,
      message_type: "text",
    });
    setMessages((current) => appendUniqueMessage(current, notification));
  };

  const payInvoice = async (invoiceId: string) => {
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("status", "pending")
      .select();
    if (error) {
      console.error("Error updating order:", error);
      Alert.alert("Payment failed", error.message);
      return;
    }
    if (!data?.length) {
      Alert.alert("Payment failed", "This invoice is no longer pending.");
      return;
    }
    const { error: loyaltyError } = await supabase.rpc("award_mvs_loyalty_points", {
      p_user_id: currentUserId,
      p_invoice_id: invoiceId,
      p_points: 100,
    });
    if (loyaltyError) {
      console.error("[Loyalty] Failed to award CarePass points:", loyaltyError);
    }
    setMessages((current) => current.map((item) => item.metadata && item.metadata.invoice_id === invoiceId ? { ...item, metadata: { ...item.metadata, status: "paid" } } : item));
    Alert.alert("Payment Successful!", "Your invoice has been marked as paid.");
  };

  const createPrescription = async (draft: PrescriptionDraft) => {
    if (!active || !currentUserId || !["vet", "veterinarian"].includes(userRole)) return;
    const activeConversationId = active.id;
    if (!activeConversationId) {
      Alert.alert("Error", "Missing active conversation ID.");
      return;
    }
    setPrescriptionSubmitting(true);
    try {
      const payload = {
        conversation_id: activeConversationId,
        vet_id: currentUserId,
        client_id: active.participantId,
        consultation_id: consultation?.id || null,
        medication_name: sanitizeInput(draft.medicationName),
        dosage: sanitizeInput(draft.dosage),
        frequency: sanitizeInput(draft.frequency),
        duration: sanitizeInput(draft.duration),
        refills: Number(draft.refills) || 0,
        instructions: sanitizeInput(draft.instructions),
      };
      const { data: prescription, error } = await supabase
        .from("prescriptions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      const metadata: PrescriptionMetadata = {
        ...draft,
        medicationName: payload.medication_name,
        dosage: payload.dosage,
        frequency: payload.frequency,
        duration: payload.duration,
        refills: String(payload.refills),
        instructions: payload.instructions,
        prescription_id: prescription.id,
      };
      const prescriptionMessage = await sendRealtimeMessage({
        conversation_id: activeConversationId,
        sender_id: currentUserId,
        receiver_id: active.participantId,
        content: "Prescription",
        message_type: "prescription" as RealtimeMessage["message_type"],
        metadata,
      });
      setMessages((current) => appendUniqueMessage(current, prescriptionMessage));
      setPrescriptionVisible(false);
    } catch (error) {
      console.error("[Prescription] Failed to create prescription:", error);
      Alert.alert("Prescription failed", error instanceof Error ? error.message : "Could not save prescription.");
    } finally {
      setPrescriptionSubmitting(false);
    }
  };

  const handleDeleteMessage = (messageToDelete: RealtimeMessage) => {
    if (messageToDelete.id.startsWith("temp-")) {
      setMessages((current) =>
        current.filter((message) => message.id !== messageToDelete.id)
      );
      return;
    }
    messageLongPressLockRef.current = messageToDelete.id;
    setDeleteCandidate(messageToDelete);
    setTimeout(() => {
      if (messageLongPressLockRef.current === messageToDelete.id) {
        messageLongPressLockRef.current = null;
      }
    }, 250);
  };

  const handleLongPressMessage = (message: RealtimeMessage) => {
    if (multiSelectMode) return;
    messageLongPressLockRef.current = message.id;
    handleDeleteMessage(message);
  };

  const handleReactMessage = async (messageToReact: RealtimeMessage, emoji: string) => {
    if (messageToReact.id.startsWith("temp-")) return;
    const nextReactions: MessageReactions = { ...(messageToReact.reactions || {}) };
    if (emoji) nextReactions[currentUserId] = emoji;
    else delete nextReactions[currentUserId];
    setMessages((current) => current.map((message) => (
      message.id === messageToReact.id ? { ...message, reactions: nextReactions } : message
    )));
    setDeleteCandidate(null);
    const { error } = await supabase
      .from("messages")
      .update({ reactions: nextReactions })
      .eq("id", messageToReact.id);
    if (error) {
      setMessages((current) => current.map((message) => (
        message.id === messageToReact.id ? { ...message, reactions: messageToReact.reactions || {} } : message
      )));
      Alert.alert("Reaction failed", "Could not save your reaction. Please try again.");
    }
  };

  const confirmDeleteMessage = async (mode: "everyone" | "me" = "everyone") => {
    if (!deleteCandidate) return;
    try {
      if (mode === "everyone" && deleteCandidate.sender_id === currentUserId) {
        await deleteMessageForEveryone(deleteCandidate.id, currentUserId);
      } else {
        await hideMessageForCurrentUser(deleteCandidate.id, currentUserId);
      }
      setMessages((current) => filterVisibleMessages(current.filter((message) => message.id !== deleteCandidate.id), currentUserId));
      setDeleteCandidate(null);
    } catch (error) {
      console.error("[Supabase Chat Delete Error]:", error);
      Alert.alert(
        "Delete failed",
        error instanceof Error ? error.message : "Could not delete message."
      );
    }
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId]
    );
  };

  const clearThreadLocally = async () => {
    if (!active || !currentUserId) return;

    const resolvedConversationIds = Array.from(
      new Set([
        normalizeUuid(conversationIdParam || active.id || "") || active.id || null,
        active.id,
        conversationIdParam,
        conversationIdFor(currentUserId, active.participantId),
      ].filter((id): id is string => Boolean(id)))
    );
    const resolvedOrderIds = Array.from(
      new Set([
        activeOrder?.id,
        orderIdParam,
        active?.id && (active as Thread & { order_id?: string }).order_id ? (active as Thread & { order_id?: string }).order_id : null,
      ].filter((id): id is string => Boolean(id)))
    );

    const matchesThreadTarget = (message: RealtimeMessage) => {
      const messageConversationId = message.conversation_id ?? null;
      const messageOrderId = (message as RealtimeMessage & { order_id?: string | null }).order_id ?? null;
      const matchesConversation = Boolean(messageConversationId && resolvedConversationIds.includes(messageConversationId));
      const matchesOrder = Boolean(messageOrderId && resolvedOrderIds.includes(messageOrderId));
      return matchesConversation || matchesOrder;
    };

    let updateError: Error | null = null;

    try {
      const [conversationMatches, orderMatches] = await Promise.all([
        resolvedConversationIds.length > 0
          ? supabase
              .from("messages")
              .select("id, hidden_for_users, conversation_id, order_id")
              .in("conversation_id", resolvedConversationIds)
          : Promise.resolve({ data: [] as Array<{ id: string; hidden_for_users?: string[] | null; conversation_id: string | null; order_id?: string | null }>, error: null }),
        resolvedOrderIds.length > 0
          ? supabase
              .from("messages")
              .select("id, hidden_for_users, conversation_id, order_id")
              .in("order_id", resolvedOrderIds)
          : Promise.resolve({ data: [] as Array<{ id: string; hidden_for_users?: string[] | null; conversation_id: string | null; order_id?: string | null }>, error: null }),
      ]);

      if (conversationMatches.error) throw conversationMatches.error;
      if (orderMatches.error) throw orderMatches.error;

      const dedupedRows = Array.from(
        new Map(
          [...(conversationMatches.data || []), ...(orderMatches.data || [])]
            .map((message) => [message.id, message])
        ).values()
      );

      const messageIds = dedupedRows
        .filter((message) => !Array.isArray(message.hidden_for_users) || !message.hidden_for_users.includes(currentUserId))
        .map((message) => message.id);

      if (messageIds.length > 0) {
        const chunks: string[][] = [];
        for (let index = 0; index < messageIds.length; index += 200) {
          chunks.push(messageIds.slice(index, index + 200));
        }

        await Promise.all(chunks.map(async (chunk) => {
          const rowSet = dedupedRows.filter((message) => chunk.includes(message.id));
          const nextHiddenUsers = rowSet.map((message) => ({
            id: message.id,
            hidden_for_users: Array.from(
              new Set([
                ...(Array.isArray(message.hidden_for_users) ? message.hidden_for_users : []),
                currentUserId,
              ])
            ),
          }));

          if (!nextHiddenUsers.length) return;

          const idsToApply = nextHiddenUsers.map((row) => row.id);
          const hiddenUsersById = Object.fromEntries(nextHiddenUsers.map((row) => [row.id, row.hidden_for_users]));
          const { data, error } = await supabase
            .from("messages")
            .select("id")
            .in("id", idsToApply);

          if (error) throw error;

          const existingIds = (data || []).map((row) => row.id);
          const idsToUpdate = idsToApply.filter((id) => existingIds.includes(id));

          if (!idsToUpdate.length) return;

          await Promise.all(idsToUpdate.map(async (id) => {
            const currentHiddenUsers = Array.from(
              new Set([
                ...((hiddenUsersById[id] as string[] | undefined) || []),
                currentUserId,
              ])
            );
            const { error: updateErrorItem } = await supabase
              .from("messages")
              .update({ hidden_for_users: currentHiddenUsers })
              .in("id", [id]);

            if (updateErrorItem) throw updateErrorItem;
          }));
        }));
      }
    } catch (error) {
      updateError = error instanceof Error ? error : new Error("Unknown clear-thread update failure");
      console.error("[Chat Clear Thread] Failed to hide messages for current user:", updateError);
    }

    const storageKey = `mvs_cleared_threads_${currentUserId}`;
    const existing = await AsyncStorage.getItem(storageKey);
    const clearedThreads = new Set(existing ? JSON.parse(existing) as string[] : []);
    for (const targetConversationId of resolvedConversationIds) {
      clearedThreads.add(targetConversationId);
    }
    for (const targetOrderId of resolvedOrderIds) {
      clearedThreads.add(targetOrderId);
    }
    clearedThreadsRef.current = new Set(clearedThreads);
    await AsyncStorage.setItem(storageKey, JSON.stringify([...clearedThreads]));

    setMessages((current) => current.filter((message) => !matchesThreadTarget(message)));
    setThreads((current) => current.filter((thread) => {
      const threadOrderId = (thread as Thread & { order_id?: string | null }).order_id ?? null;
      return !(resolvedConversationIds.includes(thread.id) || (threadOrderId ? resolvedOrderIds.includes(threadOrderId) : false));
    }));
    setSelectedMessageIds([]);
    setMultiSelectMode(false);
    setBatchDeleteCandidate([]);

    if (updateError) {
      console.warn("[Chat Clear Thread] Local clear applied despite database update friction.");
    }
  };

  const handleBatchDelete = async (mode: "everyone" | "me") => {
    const ids = batchDeleteCandidate.length ? batchDeleteCandidate : selectedMessageIds;
    if (!ids.length) return;
    try {
      const selectedMessages = messages.filter((item) => ids.includes(item.id));
      if (mode === "everyone") {
        const ownOnly = selectedMessages.every((message) => message.sender_id === currentUserId);
        if (!ownOnly) {
          Alert.alert("Delete unavailable", "Only your own messages can be deleted for everyone.");
          return;
        }
        await Promise.all(selectedMessages.map((message) => deleteMessageForEveryone(message.id, currentUserId)));
      } else {
        await Promise.all(selectedMessages.map((message) => hideMessageForCurrentUser(message.id, currentUserId)));
      }
      setMessages((current) => filterVisibleMessages(current.filter((message) => !ids.includes(message.id)), currentUserId));
      setSelectedMessageIds([]);
      setBatchDeleteCandidate([]);
      setMultiSelectMode(false);
    } catch (error) {
      console.error("[Batch Delete Error]:", error);
      Alert.alert("Bulk delete failed", error instanceof Error ? error.message : "Could not delete the selected messages.");
    }
  };

  const sendMessage = async (replyTarget?: ReplyTarget | null) => {
    const cleanSenderId = normalizeUuid(currentUserId);
    const cleanReceiverId = normalizeUuid(active?.participantId);
    const text = sanitizeInput(message);
    if (!active || (!text && !selectedImage) || !cleanSenderId || !cleanReceiverId) {
      console.error("[Chat Error]: Missing sender or receiver ID");
      return;
    }
    const conversationId = conversationIdFor(cleanSenderId, cleanReceiverId);
    const user = await getCurrentUser();
    const senderEmail = sanitizeInput(user?.email);
    if (!senderEmail) {
      console.error("[Chat Error]: Authenticated user email is missing");
      return;
    }
    setUploading(Boolean(selectedImage));
    let uploaded: Awaited<ReturnType<typeof uploadChatAttachment>> | null = null;
    try {
      if (selectedImage) uploaded = await uploadChatAttachment(conversationId, selectedImage);
    } catch (error) {
      setUploading(false);
      Alert.alert(
        "Attachment failed",
        error instanceof Error ? error.message : "Could not upload attachment."
      );
      return;
    }
    if (
      ["client", "veterinarian", "vet"].includes(userRole) &&
      ["client", "veterinarian", "vet"].includes(active.participantRole)
    ) {
      try {
        const consultation = await ensureConsultationRecord(
          conversationId,
          cleanSenderId,
          cleanReceiverId,
          userRole,
          active.participantRole,
          undefined,
          false
        );
        if (consultation) {
          const resolvedConsultation: ConsultationRecord = {
            id: consultation.id,
            conversation_id: conversationId,
            client_id: userRole === "client" ? cleanSenderId : cleanReceiverId,
            vet_id: userRole === "client" ? cleanReceiverId : cleanSenderId,
            status: consultation.status,
          };
          rememberConsultation(resolvedConsultation);
          setConsultation(resolvedConsultation);
        }
      } catch (error) {
        console.error(
          "[Consultation] Failed to ensure consultation before send:",
          error
        );
      }
    }
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: RealtimeMessage = {
      id: tempId,
      temp_id: tempId,
      conversation_id: conversationId,
      sender_id: cleanSenderId,
      receiver_id: cleanReceiverId,
      content: text,
      message_type: uploaded?.mediaType === "video" ? "video" : "text",
      metadata: {
        sender_name: senderEmail,
        sender_email: senderEmail,
        client_generated_id: tempId,
      },
      reply_to: toReplySnippet(replyTarget),
      media_url: uploaded?.publicUrl,
      media_type: uploaded?.mediaType,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => appendUniqueMessage(current, optimistic));
    try {
      const confirmed = await sendRealtimeMessage({
        conversation_id: conversationId,
        sender_id: cleanSenderId,
        receiver_id: cleanReceiverId,
        content: text,
        message_type: uploaded?.mediaType === "video" ? "video" : "text",
        metadata: optimistic.metadata,
        media_url: uploaded?.publicUrl,
        media_type: uploaded?.mediaType,
        reply_to: toReplySnippet(replyTarget),
      });
      setMessages((current) =>
        appendUniqueMessage(current, { ...confirmed, temp_id: tempId })
      );
      void sendPushNotification(cleanReceiverId, 'New message', text, {
        preferenceKey: 'chat',
        type: 'chat_message',
        conversation_id: conversationId,
        sender_id: cleanSenderId,
      });
      setMessage("");
      setSelectedImage(null);
      router.setParams({ initialMessage: undefined });
    } catch (error) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimistic.id)
      );
      console.error("[Supabase Chat Insert Error]:", error);
      Alert.alert(
        "Message failed",
        error instanceof Error ? error.message : "Failed to send message."
      );
    } finally {
      setUploading(false);
    }
  };

  const attachMessage = async () => {
    if (uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      setSelectedImage(result.assets[0]);
    } catch (error) {
      Alert.alert(
        "Attachment failed",
        error instanceof Error ? error.message : "Could not upload attachment."
      );
    }
  };

  if (active)
    return (
      <View style={styles.chatRoot}>
        <ChatRoom
        active={active}
        currentUserId={currentUserId}
        userRole={userRole}
        messages={messages}
        message={message}
        setMessage={setMessage}
        selectedImageUri={selectedImage?.uri || null}
        onRemoveImage={() => setSelectedImage(null)}
        recipientProfile={recipientProfile || active.recipientProfile || null}
        onBack={handleBack}
        onSend={sendMessage}
        onAttach={() => setAttachmentVisible(true)}
        onSendPhoto={attachMessage}
        attachmentVisible={attachmentVisible}
        locationVisible={locationVisible}
        onCloseAttachment={() => setAttachmentVisible(false)}
        onOpenLocation={() => {
          setAttachmentVisible(false);
          setLocationVisible(true);
        }}
        onCloseLocation={() => setLocationVisible(false)}
        onSendCurrentLocation={sendCurrentLocation}
        onStartLiveLocation={startLiveLocation}
        liveLocationActive={liveLocationActive}
        onStopLiveLocation={stopLiveLocation}
        onDeleteMessage={handleDeleteMessage}
        onReactMessage={handleReactMessage}
        deleteCandidate={deleteCandidate}
        onConfirmDelete={confirmDeleteMessage}
        onCancelDelete={() => setDeleteCandidate(null)}
        multiSelectMode={multiSelectMode}
        selectedMessageIds={selectedMessageIds}
        onToggleMessageSelection={toggleMessageSelection}
        onClearSelection={() => {
          cancelMultiSelectMode();
        }}
        onDeleteSelected={(mode) => {
          setBatchDeleteCandidate([...selectedMessageIds]);
          void handleBatchDelete(mode);
        }}
        onClearThread={() => { void clearThreadLocally(); }}
        onToggleMultiSelectMode={toggleMultiSelectMode}
        consultation={consultation}
        consultationLoading={consultationLoading}
        onToggleConsultation={handleToggleConsultation}
        onStartConsultation={handleStartConsultation}
        onEndConsultationByVet={handleEndConsultationByVet}
        onOpenFarmRecords={() => { void openFarmRecords(); }}
        onChoosePetConsultation={() => { void beginPetConsultation(); }}
        onChooseFarmConsultation={() => { void chooseFarmConsultation(); }}
        activeOrder={activeOrder}
        onUpdateOrderStatus={updateActiveOrderStatus}
        onCreateOrder={createOrder}
        onOpenPatientFile={() => {
          console.log("Patient File Clicked");
          setPatientFileVisible(true);
          void openPatientFile();
        }}
        patientFileVisible={patientFileVisible}
        patientPets={patientPets}
        patientFileLoading={patientFileLoading}
        onClosePatientFile={() => setPatientFileVisible(false)}
        uploading={uploading}
        canCreateInvoice={["merchant", "vet", "veterinarian"].includes(userRole)}
        invoiceVisible={invoiceVisible}
        invoiceSubmitting={invoiceSubmitting}
        onOpenInvoice={() => { setInvoiceItems([]); setInvoiceVisible(true); }}
        invoiceItems={invoiceItems}
        onCloseInvoice={() => setInvoiceVisible(false)}
        onCreateInvoice={createInvoice}
        onPayInvoice={payInvoice}
        prescriptionVisible={prescriptionVisible}
        prescriptionSubmitting={prescriptionSubmitting}
        onOpenPrescription={() => setPrescriptionVisible(true)}
        onClosePrescription={() => setPrescriptionVisible(false)}
        onCreatePrescription={createPrescription}
        voiceNoteControls={{
          recording: Boolean(recording),
          recordingSeconds,
          onStartRecording: startRecording,
          onCancelRecording: cancelRecording,
          onSendRecording: sendRecording,
        }}
        />
        <PatientFileOverlay visible={patientFileVisible} loading={patientFileLoading} pets={patientPets} activePetId={activePetId} records={medicalRecords} userRole={userRole} onDeleteRecord={(recordId) => void deletePetSoapRecord(recordId)} onSelectPet={(petId) => void selectPatientPet(petId)} onClose={() => setPatientFileVisible(false)} />
        <SoapConsultationModal visible={soapVisible} submitting={soapSubmitting} onClose={() => setSoapVisible(false)} onSubmit={createMedicalRecord} />
        <ConsultationTypeModal visible={consultationTypeVisible} onClose={() => setConsultationTypeVisible(false)} onPet={() => { void beginPetConsultation(); }} onFarm={() => { void chooseFarmConsultation(); }} />
        <EntitySelectionModal visible={petSelectionVisible} title="Select Pet for SOAP History" items={patientPets} getTitle={(pet) => pet.name} getSubtitle={(pet) => `${pet.type} - ${pet.breed || "Breed unknown"}`} onClose={() => setPetSelectionVisible(false)} onSelect={(pet) => choosePetForConsultation(pet.id)} />
        <EntitySelectionModal visible={farmSelectionVisible} title="Select Farm for SOAP History" items={farmRecords} getTitle={(farm) => farm.species} getSubtitle={(farm) => `${farm.breed || "Breed unknown"} - ${farm.flock_size ?? 0} animals`} onClose={() => setFarmSelectionVisible(false)} onSelect={(farm) => chooseFarmForConsultation(farm.id)} />
        <FarmRecordsModal visible={farmRecordsVisible} loading={farmRecordsLoading} records={farmRecords} selectFarm={farmSelectionMode} userRole={userRole} clientId={consultation?.client_id || active?.participantId || null} onDeleteRecord={(recordId) => void deleteFarmSoapRecord(recordId)} onRefresh={() => { void openFarmRecords(farmSelectionMode); }} onClose={() => setFarmRecordsVisible(false)} onSelectFarm={(farmId) => { setFarmRecordsVisible(false); setSelectedFarmId(farmId); setFarmSoapVisible(true); }} />
        <FarmSoapModal visible={farmSoapVisible} submitting={farmSoapSubmitting} onClose={() => setFarmSoapVisible(false)} onSubmit={createFarmSoapRecord} />
      </View>
    );

  return (
    <SafeAreaView style={Platform.OS === "web" ? { ...styles.container, ...mobileWebRootStyle } : styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>
            {userRole === "merchant"
              ? "Connect with pet parents and vets"
              : ["vet", "veterinarian"].includes(userRole)
                ? "Connect with pet parents and merchants"
                : "Connect with vets and merchants"}
          </Text>
        </View>
        <MaterialCommunityIcons name="message-text" size={25} color="#10B981" />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color="#10B981" />
        ) : threads.length === 0 ? (
          <Text style={styles.empty}>No conversations yet.</Text>
        ) : (
          [...threads].sort((first, second) => getLatestThreadTime(second) - getLatestThreadTime(first)).map((thread) => {
            const unreadCount = unreadCounts[thread.id] || 0;
            return (
              <Pressable
                key={thread.id}
                style={styles.thread}
                onPress={() => handleThreadPress(thread)}
                onLongPress={() => handleRequestDelete(thread)}
                {...contextMenuProps(() => handleRequestDelete(thread))}
                delayLongPress={500}
              >
                {getPublicAvatarUrl(thread.recipientProfile?.avatar_url) ? (
                  <Pressable
                    style={styles.avatar}
                    onPress={() => setSelectedAvatarUrl(getPublicAvatarUrl(thread.recipientProfile?.avatar_url))}
                    accessibilityLabel={`View ${thread.participantName}'s profile photo`}
                  >
                    <Image
                      source={{ uri: getPublicAvatarUrl(thread.recipientProfile?.avatar_url) ?? undefined }}
                      style={styles.avatar}
                      resizeMode="cover"
                    />
                  </Pressable>
                ) : (
                  <View style={styles.avatar}>
                    <MaterialCommunityIcons
                      name={
                        thread.participantRole === "merchant"
                          ? "store"
                          : thread.participantRole === "vet" ||
                            thread.participantRole === "veterinarian"
                          ? "hospital-box"
                          : "account"
                      }
                      size={22}
                      color="#FFFFFF"
                    />
                  </View>
                )}
                <View style={styles.flex}>
                  <View style={styles.threadNameRow}>
                    <Text style={styles.primary}>{thread.participantName}</Text>
                    {userRole !== "merchant" && thread.participantRole === "client" && thread.consultation_status === "active" ? (
                      <View style={styles.activeConsultBadge}>
                        <Text style={styles.activeConsultBadgeText}>
                          Active Consult
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.muted}>
                    {thread.participantRole === "merchant"
                      ? "Merchant"
                      : thread.participantRole === "vet" ||
                        thread.participantRole === "veterinarian"
                      ? "Veterinarian"
                      : "Pet parent"}
                  </Text>
                  <Text style={styles.message} numberOfLines={1}>
                    {thread.messages[thread.messages.length - 1]?.content}
                  </Text>
                </View>
                {unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
                {Platform.OS === "web" ? (
                  <Pressable
                    accessibilityLabel="Delete conversation"
                    onPress={() => handleRequestDelete(thread)}
                    style={styles.threadDeleteButton}
                  >
                    <Ionicons color="#ef4444" name="trash-outline" size={20} />
                  </Pressable>
                ) : null}
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color="#64748B"
                />
              </Pressable>
            );
          })
        )}
      </ScrollView>
      <AvatarPreviewModal
        imageUrl={selectedAvatarUrl}
        visible={selectedAvatarUrl !== null}
        onClose={() => setSelectedAvatarUrl(null)}
      />
      <Modal
        visible={threadDeleteCandidate !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setThreadDeleteCandidate(null);
        }}
      >
        <View style={[styles.modalBackdrop, styles.threadDeleteOverlay]}>
          <View style={styles.locationSheet}>
            <Text style={styles.locationSheetTitle}>Delete Conversation?</Text>
            <Text style={styles.locationHint}>
              This will remove it from your inbox while preserving the consultation and message history.
            </Text>
            <TouchableOpacity
              style={styles.locationOption}
              onPress={() => {
                const thread = threadDeleteCandidate;
                if (thread) void deleteThread(thread);
              }}
            >
              <MaterialCommunityIcons name="delete-outline" size={22} color="#F87171" />
              <Text style={styles.locationOptionText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.locationCancel}
              onPress={() => {
                setThreadDeleteCandidate(null);
              }}
            >
              <Text style={styles.locationCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
function ChatRoom({
  active,
  currentUserId,
  userRole,
  messages,
  message,
  setMessage,
  selectedImageUri,
  onRemoveImage,
  onBack,
  onSend,
  onAttach,
  onSendPhoto,
  attachmentVisible,
  locationVisible,
  onCloseAttachment,
  onOpenLocation,
  onCloseLocation,
  onSendCurrentLocation,
  onStartLiveLocation,
  liveLocationActive,
  onStopLiveLocation,
  onDeleteMessage,
  onReactMessage,
  deleteCandidate,
  onConfirmDelete,
  onCancelDelete,
  multiSelectMode,
  selectedMessageIds,
  onToggleMessageSelection,
  onClearSelection,
  onDeleteSelected,
  onClearThread,
  onToggleMultiSelectMode,
  consultation,
  consultationLoading,
  onToggleConsultation,
  onStartConsultation,
  onEndConsultationByVet,
  onOpenFarmRecords,
  onChoosePetConsultation,
  onChooseFarmConsultation,
  activeOrder,
  onUpdateOrderStatus,
  onCreateOrder,
  recipientProfile,
  onOpenPatientFile,
  patientFileVisible,
  patientPets,
  patientFileLoading,
  onClosePatientFile,
  uploading,
  canCreateInvoice,
  invoiceVisible,
  invoiceSubmitting,
  onOpenInvoice,
  invoiceItems,
  onCloseInvoice,
  onCreateInvoice,
  onPayInvoice,
  prescriptionVisible,
  prescriptionSubmitting,
  onOpenPrescription,
  onClosePrescription,
  onCreatePrescription,
  voiceNoteControls,
}: {
  active: Thread;
  currentUserId: string;
  userRole: string;
  messages: RealtimeMessage[];
  message: string;
  setMessage: (value: string) => void;
  selectedImageUri: string | null;
  onRemoveImage: () => void;
  onBack: () => void;
  onSend: (replyTarget?: ReplyTarget | null) => void | Promise<void>;
  onAttach: () => void;
  onSendPhoto: () => void;
  attachmentVisible: boolean;
  locationVisible: boolean;
  onCloseAttachment: () => void;
  onOpenLocation: () => void;
  onCloseLocation: () => void;
  onSendCurrentLocation: () => Promise<void>;
  onStartLiveLocation: () => Promise<void>;
  liveLocationActive: boolean;
  onStopLiveLocation: () => void;
  onDeleteMessage: (message: RealtimeMessage) => void;
  onReactMessage: (message: RealtimeMessage, emoji: string) => Promise<void>;
  deleteCandidate: RealtimeMessage | null;
  onConfirmDelete: (mode?: "everyone" | "me") => void;
  onCancelDelete: () => void;
  multiSelectMode: boolean;
  selectedMessageIds: string[];
  onToggleMessageSelection: (messageId: string) => void;
  onClearSelection: () => void;
  onDeleteSelected: (mode: "everyone" | "me") => void;
  onClearThread: () => void;
  onToggleMultiSelectMode: () => void;
  consultation: ConsultationRecord | null;
  consultationLoading: boolean;
  onToggleConsultation: () => void;
  onStartConsultation: () => Promise<void>;
  onEndConsultationByVet: () => void;
  onOpenFarmRecords: () => void;
  onChoosePetConsultation: () => void;
  onChooseFarmConsultation: () => void;
  activeOrder: ActiveOrder | null;
  onUpdateOrderStatus: (status: OrderStatus | "completed") => Promise<void>;
  onCreateOrder: () => Promise<void>;
  recipientProfile: RecipientProfile | null;
  onOpenPatientFile: () => void;
  patientFileVisible: boolean;
  patientPets: PatientPet[];
  patientFileLoading: boolean;
  onClosePatientFile: () => void;
  uploading: boolean;
  canCreateInvoice: boolean;
  invoiceVisible: boolean;
  invoiceSubmitting: boolean;
  onOpenInvoice: () => void;
  invoiceItems: InvoiceItem[];
  onCloseInvoice: () => void;
  onCreateInvoice: (amount: number, note: string, items: InvoiceItem[]) => Promise<void>;
  onPayInvoice: (orderId: string) => Promise<void>;
  prescriptionVisible: boolean;
  prescriptionSubmitting: boolean;
  onOpenPrescription: () => void;
  onClosePrescription: () => void;
  onCreatePrescription: (draft: PrescriptionDraft) => Promise<void>;
  voiceNoteControls: VoiceNoteControls;
}) {
  const messagesScrollRef = useRef<ScrollView>(null);
  const initialScrollDone = useRef(false);
  const previousMessageCount = useRef(0);
  const messageLongPressLockRef = useRef<string | null>(null);
  const visualViewportHeight = useVisualViewport();
  const safeAreaInsets = useSafeAreaInsets();
  const bottomTabOffset = Math.max(64, safeAreaInsets.bottom);
  const mobileWebRootStyle: ViewStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: visualViewportHeight ?? 0,
  };
  const scrollToLatest = (animated = false) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        messagesScrollRef.current?.scrollToEnd({ animated });
      });
    });
  };
  useEffect(() => {
    initialScrollDone.current = false;
    previousMessageCount.current = 0;
  }, [active.id]);
  useEffect(() => {
    if (!messages.length) {
      previousMessageCount.current = 0;
      return;
    }
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      previousMessageCount.current = messages.length;
      scrollToLatest();
      return;
    }
    if (messages.length > previousMessageCount.current && messages[messages.length - 1]?.sender_id === currentUserId) {
      scrollToLatest(true);
    }
    previousMessageCount.current = messages.length;
  }, [currentUserId, messages]);
  const [buyerProtectionVisible, setBuyerProtectionVisible] = useState(false);
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const [searchBarVisible, setSearchBarVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [clearThreadConfirmVisible, setClearThreadConfirmVisible] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const selectedCount = selectedMessageIds.length;
  const dismissSearchBar = () => {
    setSearchBarVisible(false);
    setSearchQuery("");
    setSearchResultIndex(0);
  };
  const confirmClearThread = () => {
    setHeaderMenuVisible(false);
    setClearThreadConfirmVisible(true);
  };
  const openClearThreadConfirm = () => {
    setHeaderMenuVisible(false);
    setClearThreadConfirmVisible(true);
  };

  const handleCopyMessage = async () => {
    if (!deleteCandidate?.content) return;
    await Clipboard.setStringAsync(deleteCandidate.content);
    onCancelDelete();
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 1800);
  };
  useEffect(() => {
    setHeaderMenuVisible(false);
    setSearchBarVisible(false);
    setSearchQuery("");
    setSearchResultIndex(0);
    setClearThreadConfirmVisible(false);
    setSelectedImagePreview(null);
    setVideoPreviewUrl(null);
  }, [active.id]);
  const trimmedSearchQuery = searchQuery.trim();
  const matchingMessages = trimmedSearchQuery.length > 0
    ? messages.filter((item) => {
        const haystack = [
          item.content || "",
          item.message_type || "",
          item.location_data ? `${item.location_data.latitude ?? ""} ${item.location_data.longitude ?? ""}` : "",
        ].join(" ").toLowerCase();
        return haystack.includes(trimmedSearchQuery.toLowerCase());
      })
    : [];
  const activeSearchMatch = matchingMessages[searchResultIndex] ?? null;
  const focusMessageMatch = (nextIndex: number) => {
    if (!matchingMessages.length) return;
    const boundedIndex = (nextIndex + matchingMessages.length) % matchingMessages.length;
    setSearchResultIndex(boundedIndex);
    const matchedMessage = matchingMessages[boundedIndex];
    if (!matchedMessage) return;
    const matchedIndex = messages.findIndex((message) => message.id === matchedMessage.id);
    const targetY = Math.max(0, matchedIndex * 120);
    requestAnimationFrame(() => {
      messagesScrollRef.current?.scrollTo({ y: targetY, animated: true });
    });
  };
  useEffect(() => {
    if (!trimmedSearchQuery.length) {
      setSearchResultIndex(0);
      return;
    }
    if (searchResultIndex >= matchingMessages.length) {
      setSearchResultIndex(0);
    }
  }, [matchingMessages.length, searchResultIndex, trimmedSearchQuery.length]);
  const isPetParent = userRole === "client" || consultation?.client_id === currentUserId;
  const isVetClientThread =
    (["vet", "veterinarian"].includes(userRole) && active.participantRole === "client") ||
    (userRole === "client" && ["vet", "veterinarian"].includes(active.participantRole));
  const consultationStatus = consultation?.status || null;
  const consultationPending = consultationLoading || (
    isVetClientThread && consultation?.conversation_id !== active.id
  );
  const isMerchantConversation = userRole === "merchant" || active.participantRole === "merchant";
  const showInvoiceAction = canCreateInvoice && (!isMerchantConversation || userRole === "merchant");
  const roomConsultation = consultation;

  if (roomConsultation)
    return (
      <ConsultationChatRoom
        active={active}
        currentUserId={currentUserId}
        userRole={userRole}
        messages={messages}
        message={message}
        setMessage={setMessage}
        selectedImageUri={selectedImageUri}
        onRemoveImage={onRemoveImage}
        onBack={onBack}
        onSend={onSend}
        onAttach={onAttach}
        onSendPhoto={onSendPhoto}
        attachmentVisible={attachmentVisible}
        locationVisible={locationVisible}
        onCloseAttachment={onCloseAttachment}
        onOpenLocation={onOpenLocation}
        onCloseLocation={onCloseLocation}
        onSendCurrentLocation={onSendCurrentLocation}
        onStartLiveLocation={onStartLiveLocation}
        liveLocationActive={liveLocationActive}
        onStopLiveLocation={onStopLiveLocation}
        onDeleteMessage={onDeleteMessage}
        onReactMessage={onReactMessage}
        deleteCandidate={deleteCandidate}
        onConfirmDelete={onConfirmDelete}
        onCancelDelete={onCancelDelete}
        multiSelectMode={multiSelectMode}
        selectedMessageIds={selectedMessageIds}
        onToggleMessageSelection={onToggleMessageSelection}
        onToggleMultiSelectMode={onToggleMultiSelectMode}
        onClearSelection={onClearSelection}
        onDeleteSelected={onDeleteSelected}
        onClearThread={onClearThread}
        consultation={roomConsultation}
        onToggleConsultation={onToggleConsultation}
        onStartConsultation={onStartConsultation}
        onEndConsultationByVet={onEndConsultationByVet}
        onOpenFarmRecords={onOpenFarmRecords}
        onChoosePetConsultation={onChoosePetConsultation}
        onChooseFarmConsultation={onChooseFarmConsultation}
        activeOrder={activeOrder}
        onUpdateOrderStatus={onUpdateOrderStatus}
        onCreateOrder={onCreateOrder}
        recipientProfile={recipientProfile}
        onOpenPatientFile={onOpenPatientFile}
        patientFileVisible={patientFileVisible}
        patientPets={patientPets}
        patientFileLoading={patientFileLoading}
        onClosePatientFile={onClosePatientFile}
        canCreateInvoice={canCreateInvoice}
        invoiceVisible={invoiceVisible}
        invoiceSubmitting={invoiceSubmitting}
        onOpenInvoice={onOpenInvoice}
        invoiceItems={invoiceItems}
        onCloseInvoice={onCloseInvoice}
        onCreateInvoice={onCreateInvoice}
        onPayInvoice={onPayInvoice}
        prescriptionVisible={prescriptionVisible}
        prescriptionSubmitting={prescriptionSubmitting}
        onOpenPrescription={onOpenPrescription}
        onClosePrescription={onClosePrescription}
        onCreatePrescription={onCreatePrescription}
        voiceNoteControls={voiceNoteControls}
        uploading={uploading}
      />
    );

  return (
    <SafeAreaView style={Platform.OS === "web" ? [styles.container, mobileWebRootStyle] : styles.container}>
      <View style={styles.roomHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {active.productName || active.participantName}
            </Text>
            <Text style={styles.subtitle}>
              {active.productName ? `${active.participantName} - Marketplace` : active.participantName}
            </Text>
          </View>
        </View>

        <View style={styles.headerActionsWrapper}>
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            style={styles.headerActions}
            contentContainerStyle={styles.headerActionsContent}
          >
            {isMerchantConversation ? (
              <OrderStatusBadge order={activeOrder} canUpdate={userRole === "merchant"} canCreate={userRole === "merchant"} onUpdate={onUpdateOrderStatus} onCreate={onCreateOrder} recipientProfile={recipientProfile} />
            ) : null}
            {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
              <TouchableOpacity style={styles.patientButton} onPress={onOpenPatientFile}>
                <MaterialCommunityIcons name="file-account" size={18} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Pet Records</Text>
              </TouchableOpacity>
            ) : null}
            {!isMerchantConversation && (userRole === "vet" || userRole === "veterinarian") ? (
              <TouchableOpacity style={styles.patientButton} onPress={onOpenFarmRecords}>
                <MaterialCommunityIcons name="barn" size={18} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Farm Records</Text>
              </TouchableOpacity>
            ) : null}
            {showInvoiceAction ? (
              <TouchableOpacity style={styles.invoiceAction} onPress={onOpenInvoice}>
                <MaterialCommunityIcons name="file-document-edit" size={17} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Create Invoice</Text>
              </TouchableOpacity>
            ) : null}
            {multiSelectMode ? (
              <TouchableOpacity style={styles.clearThreadAction} onPress={openClearThreadConfirm}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FCA5A5" />
                <Text style={styles.clearThreadText}>Clear Thread</Text>
              </TouchableOpacity>
            ) : null}
            {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
              <TouchableOpacity style={styles.prescriptionActionHeader} onPress={onOpenPrescription}>
                <MaterialCommunityIcons name="prescription" size={17} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Prescribe</Text>
              </TouchableOpacity>
            ) : null}
            {isVetClientThread && consultationPending ? (
              <Text style={styles.consultationEndedBadge}>Checking consultation...</Text>
            ) : isVetClientThread && consultationStatus === "active" ? (
              <>
                <TouchableOpacity style={styles.completeButton} onPress={isPetParent ? onToggleConsultation : onEndConsultationByVet}>
                  <Text style={styles.completeButtonText}>End Consultation</Text>
                </TouchableOpacity>
                <Text style={styles.headerConsultationStatus}>Active Consultation</Text>
              </>
            ) : isVetClientThread ? (
              <>
                <Text style={styles.consultationEndedBadge}>Consultation Ended</Text>
                {isPetParent ? (
                  <TouchableOpacity style={styles.completeButton} onPress={() => void onStartConsultation()}>
                    <Text style={styles.completeButtonText}>+ Start Consultation</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
            {userRole === "client" && (recipientProfile?.role === "merchant" || recipientProfile?.role === "vet") ? (
              <TouchableOpacity style={styles.buyerProtectionButton} onPress={() => setBuyerProtectionVisible(true)}>
                <ShieldCheck size={16} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>MVS User Protection</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <TouchableOpacity accessibilityLabel="Chat options menu" style={styles.headerMenuButton} onPress={() => setHeaderMenuVisible((visible) => !visible)}>
            <MaterialCommunityIcons name="dots-vertical" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {headerMenuVisible ? (
          <View style={styles.headerMenuList}>
            <TouchableOpacity style={styles.headerMenuItem} onPress={() => { setHeaderMenuVisible(false); if (searchBarVisible) { dismissSearchBar(); return; } setSearchBarVisible(true); setSearchQuery(""); setSearchResultIndex(0); }}>
              <Text style={styles.headerMenuText}>Search Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerMenuItem}
              onPress={() => {
                setHeaderMenuVisible(false);
                if (multiSelectMode) {
                  onClearSelection();
                  return;
                }
                onToggleMultiSelectMode();
              }}
            >
              <Text style={styles.headerMenuText}>Select Multiple Messages</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={openClearThreadConfirm}>
              <Text style={styles.headerMenuText}>Clear All Messages</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {searchBarVisible ? (
        <>
          <Pressable
            onPress={dismissSearchBar}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}
          />
          <View style={[styles.searchBarContainer, { zIndex: 1 }]}>
            <TextInput
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                setSearchResultIndex(0);
              }}
              placeholder="Search conversation"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={dismissSearchBar} accessibilityLabel="Close search" style={{ padding: 6 }}>
              <MaterialCommunityIcons name="close" size={18} color="#E2E8F0" />
            </TouchableOpacity>
            <View style={styles.searchNavigationButtons}>
              <TouchableOpacity onPress={() => focusMessageMatch(searchResultIndex - 1)} accessibilityLabel="Previous result">
                <MaterialCommunityIcons name="chevron-up" size={20} color="#E2E8F0" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => focusMessageMatch(searchResultIndex + 1)} accessibilityLabel="Next result">
                <MaterialCommunityIcons name="chevron-down" size={20} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <Text style={styles.searchStatusText}>
              {matchingMessages.length > 0 ? `${Math.min(searchResultIndex + 1, matchingMessages.length)} of ${matchingMessages.length} results` : "No results"}
            </Text>
          </View>
        </>
      ) : null}

      <BuyerProtectionModal visible={buyerProtectionVisible} onClose={() => setBuyerProtectionVisible(false)} />
      {clearThreadConfirmVisible ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setClearThreadConfirmVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.deleteModalCard}>
              <Text style={styles.deleteModalTitle}>Do you wish to clear all your messages? This action cannot be undone.</Text>
              <TouchableOpacity
                style={[styles.deleteModalAction, { backgroundColor: "#DC2626" }]}
                onPress={() => {
                  setClearThreadConfirmVisible(false);
                  void onClearThread();
                }}
              >
                <Text style={styles.deleteModalActionText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteModalCancel} onPress={() => setClearThreadConfirmVisible(false)}>
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
      {isVetClientThread && consultationPending ? (
        <View style={[styles.consultationBanner, styles.consultationCompleted]}>
          <Text style={styles.consultationText}>Checking consultation status...</Text>
        </View>
      ) : isVetClientThread && consultationStatus ? (
        <View
          style={[
            styles.consultationBanner,
            consultationStatus === "active"
              ? styles.consultationActive
              : styles.consultationCompleted,
          ]}
        >
          <Text style={styles.consultationText}>
            {consultationStatus === "active"
              ? "Active Consultation"
              : "Consultation Ended"}
          </Text>
        </View>
      ) : null}
      {liveLocationActive ? (
        <View style={styles.liveLocationBanner}>
          <Text style={styles.liveLocationText}>Live location sharing is active</Text>
          <TouchableOpacity onPress={onStopLiveLocation}>
            <Text style={styles.stopLiveLocationText}>Stop Sharing Live Location</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <ScrollView
        ref={messagesScrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messages}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            No messages yet. Start the conversation.
          </Text>
        ) : (
          messages.map((item) => {
            const isSelected = selectedMessageIds.includes(item.id);
            return (
              <View key={item.id} style={styles.messageRow}>
                {multiSelectMode ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => onToggleMessageSelection(item.id)}
                    style={[styles.selectionCheck, isSelected && styles.selectionCheckActive]}
                  >
                    {isSelected ? <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                ) : null}
                <SwipeableMessage
                  onReply={() => {
                    setReplyTarget({ id: item.id, senderName: item.sender_id === currentUserId ? "You" : active.participantName, content: item.content || "Attachment" });
                  }}
                  disabled={multiSelectMode}
                >
                <TouchableOpacity
                  {...(!multiSelectMode ? contextMenuProps(() => onDeleteMessage(item)) : {})}
                  activeOpacity={0.8}
                  onLongPress={() => {
                    messageLongPressLockRef.current = item.id;
                    onDeleteMessage(item);
                  }}
                  delayLongPress={2000}
                  onPress={() => {
                    if (multiSelectMode) {
                      onToggleMessageSelection(item.id);
                      return;
                    }
                    if (messageLongPressLockRef.current === item.id) {
                      messageLongPressLockRef.current = null;
                      return;
                    }
                    if (item.location_data) {
                      openSafeExternalUrl(`https://www.google.com/maps/search/?api=1&query=${item.location_data.latitude},${item.location_data.longitude}`);
                    } else if (item.media_type === "image" && item.media_url) {
                      setSelectedImagePreview(item.media_url);
                    } else if (item.media_type === "video" && item.media_url) {
                      setVideoPreviewUrl(item.media_url);
                    }
                  }}
                  style={[
                    styles.bubble,
                    multiSelectMode && isSelected ? styles.messageSelected : null,
                    item.media_type === "video" && item.media_url ? styles.videoBubble : null,
                    item.sender_id === currentUserId
                      ? styles.outgoing
                      : styles.incoming,
                  ]}
                >
                  {item.reply_to ? (
                    <View style={styles.quotedMessage}>
                      <Text style={styles.quotedMessageSender} numberOfLines={1}>{item.reply_to.sender_name}</Text>
                      <Text style={styles.quotedMessageText} numberOfLines={2}>{item.reply_to.content}</Text>
                    </View>
                  ) : null}
                  {item.media_url && item.media_type === "image" ? (
                    <Image
                      source={{ uri: item.media_url }}
                      style={styles.attachment}
                    />
                  ) : null}
                  {item.media_url && item.media_type === "video" ? (
                    <View style={styles.videoAttachment}>
                      <MaterialCommunityIcons name="play-circle" size={46} color="#FFFFFF" />
                      <Text style={styles.videoAttachmentText}>Tap to watch video</Text>
                    </View>
                  ) : null}
                  {item.message_type === "invoice" ? (
                    <InvoiceMessage item={item} currentUserId={currentUserId} onPayInvoice={onPayInvoice} />
                  ) : (item.message_type as string) === "prescription" ? (
                    <PrescriptionMessage item={item} />
                  ) : (item.message_type as string) === "voice_note" && item.media_url ? (
                    <VoiceNoteMessage mediaUrl={item.media_url} />
                  ) : item.location_data ? (
                    <LocationMessage item={item} />
                  ) : item.content ? (
                    <Text style={styles.primary}>{item.content}</Text>
                  ) : null}
                  <Text style={styles.messageTimestamp}>{formatMessageTime(item.created_at)}</Text>
                  {Object.values(item.reactions || {}).length > 0 ? (
                    <TouchableOpacity
                      style={styles.reactionBadge}
                      onPress={() => {
                        if (item.reactions?.[currentUserId]) void onReactMessage(item, "");
                      }}
                      disabled={!item.reactions?.[currentUserId]}
                      accessibilityLabel={item.reactions?.[currentUserId] ? "Remove your reaction" : "Message reactions"}
                    >
                      <Text style={styles.reactionBadgeText}>{Array.from(new Set(Object.values(item.reactions || {}))).join(" ")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
                </SwipeableMessage>
              </View>
            );
          })
        )}
      </ScrollView>
      {selectedCount > 0 ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCounter}>{selectedCount} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionDeleteButton} onPress={onClearSelection}>
              <Text style={styles.selectionDeleteText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionDeleteButton} onPress={() => onDeleteSelected("me")}>
              <Text style={styles.selectionDeleteText}>Delete for Me</Text>
            </TouchableOpacity>
            {messages.filter((item) => selectedMessageIds.includes(item.id) && item.sender_id === currentUserId).length === selectedCount ? (
              <TouchableOpacity style={styles.selectionDeleteButtonPrimary} onPress={() => onDeleteSelected("everyone")}>
                <Text style={styles.selectionDeleteTextPrimary}>Delete for Everyone</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      <ChatComposer
        message={message}
        setMessage={setMessage}
        selectedImageUri={selectedImageUri}
        onRemoveImage={onRemoveImage}
        onAttach={onAttach}
        onSend={async () => { await onSend(replyTarget); setReplyTarget(null); }}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        uploading={uploading}
        bottomInset={bottomTabOffset}
        voiceNoteControls={voiceNoteControls}
      />
      <AttachmentOptions
        attachmentVisible={attachmentVisible}
        locationVisible={locationVisible}
        onCloseAttachment={onCloseAttachment}
        onSendPhoto={onSendPhoto}
        onOpenLocation={onOpenLocation}
        onCloseLocation={onCloseLocation}
        onSendCurrentLocation={onSendCurrentLocation}
        onStartLiveLocation={onStartLiveLocation}
        liveLocationActive={liveLocationActive}
      />
      <ImagePreviewModal imageUrl={selectedImagePreview} onClose={() => setSelectedImagePreview(null)} />
      <VideoPreviewModal videoUrl={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />
      {deleteCandidate ? (
        <Modal transparent animationType="fade" visible={Boolean(deleteCandidate)} onRequestClose={onCancelDelete}>
          <View style={styles.modalBackdrop}>
            <ReactionBar onSelect={(emoji) => { void onReactMessage(deleteCandidate, emoji); }} />
            <View style={styles.deleteModalCard}>
              <Text style={styles.deleteModalTitle}>Delete message?</Text>
              {deleteCandidate.content ? (
                <TouchableOpacity style={styles.deleteModalAction} onPress={() => void handleCopyMessage()}>
                  <Text style={styles.deleteModalActionText}>Copy</Text>
                </TouchableOpacity>
              ) : null}
              {deleteCandidate.sender_id === currentUserId ? (
                <TouchableOpacity style={styles.deleteModalAction} onPress={() => onConfirmDelete('everyone')}>
                  <Text style={styles.deleteModalActionText}>Delete for Everyone</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.deleteModalAction} onPress={() => onConfirmDelete('me')}>
                <Text style={styles.deleteModalActionText}>Delete for Me</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteModalCancel} onPress={onCancelDelete}>
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
      {copyToast ? <View style={styles.copyToast}><Text style={styles.copyToastText}>Message copied</Text></View> : null}
      {invoiceVisible ? <InvoiceModal visible={invoiceVisible} onClose={onCloseInvoice} onSubmit={onCreateInvoice} submitting={invoiceSubmitting} /> : null}
      <PrescriptionModal visible={prescriptionVisible} onClose={onClosePrescription} onSubmit={onCreatePrescription} submitting={prescriptionSubmitting} />
    </SafeAreaView>
  );
}

function ChatComposer({
  message,
  setMessage,
  selectedImageUri,
  onRemoveImage,
  onAttach,
  onSend,
  replyTarget,
  onCancelReply,
  uploading,
  bottomInset,
  voiceNoteControls,
}: {
  message: string;
  setMessage: (value: string) => void;
  selectedImageUri: string | null;
  onRemoveImage: () => void;
  onAttach: () => void;
  onSend: (replyTarget?: ReplyTarget | null) => void | Promise<void>;
  replyTarget: ReplyTarget | null;
  onCancelReply: () => void;
  uploading: boolean;
  bottomInset: number;
  voiceNoteControls: VoiceNoteControls;
}) {
  const messageInputRef = useRef<TextInput>(null);
  const [isSending, setIsSending] = useState(false);
  const [inputHeight, setInputHeight] = useState(42);
  const compactInputHeight = 42;
  const maximumInputHeight = 132;
  const inputLineHeight = 22;

  useEffect(() => {
    if (replyTarget) {
      requestAnimationFrame(() => messageInputRef.current?.focus());
    }
  }, [replyTarget]);

  const handleInputContentSizeChange = (event: any) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const nextHeight = Math.min(
      Math.max(contentHeight + 4, compactInputHeight),
      maximumInputHeight
    );

    setInputHeight(nextHeight);
  };

  const handleSend = async () => {
    const trimmedText = message.trim();

    if (isSending || (!trimmedText && !selectedImageUri)) {
      return;
    }

    const pendingMessage = message;
    setIsSending(true);
    setMessage('');
    setInputHeight(compactInputHeight);

    try {
      await onSend();
    } catch (error) {
      console.error('[ChatComposer] Failed to send message:', error);
      setMessage(pendingMessage);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    }
  };

  return (
    <View style={[styles.composer, { marginBottom: bottomInset }]}>
      {replyTarget ? (
        <View style={styles.replyPreview}>
          <View style={styles.replyPreviewCopy}>
            <Text style={styles.replyPreviewName} numberOfLines={1}>{replyTarget.senderName}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>{replyTarget.content}</Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} accessibilityLabel="Cancel reply">
            <MaterialCommunityIcons name="close" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
      ) : null}
      {selectedImageUri ? (
        <View style={styles.selectedAttachment}>
          <Image source={{ uri: selectedImageUri }} style={styles.selectedAttachmentImage} />
          <TouchableOpacity onPress={onRemoveImage} accessibilityLabel="Remove selected image">
            <MaterialCommunityIcons name="close-circle" size={24} color="#F87171" />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={[styles.composerRow, { minHeight: compactInputHeight }]}>
        {voiceNoteControls.recording ? (
          <View style={styles.recordingBar}>
            <TouchableOpacity onPress={() => void voiceNoteControls.onCancelRecording()} style={styles.recordingAction}>
              <Ionicons name="trash-outline" size={21} color="#F87171" />
            </TouchableOpacity>
            <View style={styles.recordingStatus}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTimer}>0:{String(voiceNoteControls.recordingSeconds).padStart(2, "0")}</Text>
              <Text style={styles.recordingLabel}>Recording...</Text>
            </View>
            <TouchableOpacity onPress={() => void voiceNoteControls.onSendRecording()} style={styles.send}>
              <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.attach} onPress={onAttach} disabled={uploading}>
              <MaterialCommunityIcons name="paperclip" size={21} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={[styles.composerInputShell, { height: inputHeight, maxHeight: maximumInputHeight }]}>
              <TextInput
                ref={messageInputRef}
                value={message}
                onChangeText={setMessage}
                selection={message ? { start: message.length, end: message.length } : undefined}
                placeholder="Write a message..."
                placeholderTextColor="#64748B"
                style={[styles.input, { height: inputHeight, lineHeight: inputLineHeight }]}
                multiline
                scrollEnabled={inputHeight >= maximumInputHeight}
                onContentSizeChange={handleInputContentSizeChange}
              />
            </View>
            {message.trim() || selectedImageUri ? (
              <TouchableOpacity
                style={styles.send}
                onPress={() => void handleSend()}
                disabled={isSending || (!message.trim() && !selectedImageUri)}
              >
                {isSending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.voiceIdleMic} onPressIn={() => void voiceNoteControls.onStartRecording()}>
                <Ionicons name="mic" size={21} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function ReactionBar({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <View style={styles.reactionBar}>
      {reactionOptions.map((emoji) => (
        <TouchableOpacity key={emoji} style={styles.reactionButton} onPress={() => onSelect(emoji)} accessibilityLabel={`React ${emoji}`}>
          <Text style={styles.reactionEmoji}>{emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function VoiceNoteMessage({ mediaUrl }: { mediaUrl: string }) {
  const player = useAudioPlayer(mediaUrl, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const positionMillis = status.currentTime * 1000;
  const durationMillis = status.duration * 1000;
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  useEffect(() => {
    player.shouldCorrectPitch = true;
  }, [player]);
  const togglePlayback = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  const cyclePlaybackSpeed = () => {
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(nextSpeed, "high");
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };

  return (
    <View style={styles.voiceNoteBubble}>
      <TouchableOpacity onPress={() => void togglePlayback()} style={styles.voicePlayButton}>
        <Ionicons name={playing ? "pause" : "play"} size={18} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.voiceProgressArea}>
        <View style={styles.voiceProgressTrack}>
          <View style={[styles.voiceProgressFill, { width: `${durationMillis ? Math.min(positionMillis / durationMillis, 1) * 100 : 0}%` }]} />
        </View>
        <View style={styles.voiceBars}>
          {[3, 7, 12, 8, 15, 10, 18, 9, 14, 6, 12, 16, 8, 13, 5, 10].map((height, index) => (
            <View key={index} style={[styles.voiceBar, { height }, index / 16 < (durationMillis ? positionMillis / durationMillis : 0) ? styles.voiceBarActive : null]} />
          ))}
        </View>
        <Text style={styles.voiceDuration}>{formatDuration(playing ? positionMillis : durationMillis)}</Text>
      </View>
      <TouchableOpacity onPress={() => void cyclePlaybackSpeed()} style={styles.voiceSpeedButton}>
        <Text style={styles.voiceSpeedText}>{playbackSpeed}x</Text>
      </TouchableOpacity>
    </View>
  );
}

function PrescriptionMessage({ item }: { item: RealtimeMessage }) {
  const metadata = (item.metadata || {}) as Partial<PrescriptionMetadata>;
  const searchMedication = () => {
    const query = encodeURIComponent(metadata.medicationName || "prescribed medication");
    openSafeExternalUrl(`https://www.google.com/search?q=${query}+medication`);
  };
  return (
    <View style={styles.prescriptionCard}>
      <View style={styles.prescriptionHeading}>
        <MaterialCommunityIcons name="medical-bag" size={20} color="#10B981" />
        <Text style={styles.prescriptionTitle}>Prescription</Text>
      </View>
      <Text style={styles.prescriptionMedication}>{metadata.medicationName || "Medication"}</Text>
      <View style={styles.prescriptionBadges}>
        <Text style={styles.prescriptionBadge}>{metadata.dosage || "Dosage pending"}</Text>
        <Text style={styles.prescriptionBadge}>{metadata.frequency || "Frequency pending"}</Text>
        <Text style={styles.prescriptionBadge}>{metadata.duration || "Duration pending"}</Text>
      </View>
      <Text style={styles.prescriptionDetail}>Refills: {metadata.refills || "0"}</Text>
      {metadata.instructions ? <Text style={styles.prescriptionInstructions}>{metadata.instructions}</Text> : null}
      <TouchableOpacity style={styles.prescriptionAction} onPress={searchMedication}>
        <Ionicons name="search-outline" size={16} color="#FFFFFF" />
        <Text style={styles.prescriptionActionText}>Search medication</Text>
      </TouchableOpacity>
    </View>
  );
}

function PrescriptionModal({
  visible,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (draft: PrescriptionDraft) => Promise<void>;
  submitting: boolean;
}) {
  const [draft, setDraft] = useState<PrescriptionDraft>({
    medicationName: "",
    dosage: "",
    frequency: "",
    duration: "",
    refills: "0",
    instructions: "",
  });
  const update = (field: keyof PrescriptionDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const submit = () => {
    if (!draft.medicationName.trim() || !draft.dosage.trim() || !draft.frequency.trim() || !draft.duration.trim()) {
      Alert.alert("Incomplete prescription", "Add medication, dosage, frequency, and duration.");
      return;
    }
    void onSubmit(draft);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.prescriptionOverlay}>
        <View style={styles.prescriptionModal}>
          <View style={styles.invoiceModalHeader}>
            <Text style={styles.invoiceModalTitle}>Write Prescription</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close prescription"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.prescriptionForm}>
            {([
              ["medicationName", "Medication Name", "e.g. Amoxicillin"],
              ["dosage", "Dosage", "e.g. 250mg"],
              ["frequency", "Frequency", "e.g. 2x daily"],
              ["duration", "Duration", "e.g. 7 days"],
              ["refills", "Refills", "0"],
            ] as const).map(([field, label, placeholder]) => (
              <View key={field}>
                <Text style={styles.prescriptionLabel}>{label}</Text>
                <TextInput
                  value={draft[field]}
                  onChangeText={(value) => update(field, value)}
                  placeholder={placeholder}
                  placeholderTextColor="#64748B"
                  keyboardType={field === "refills" ? "number-pad" : "default"}
                  style={styles.input}
                />
              </View>
            ))}
            <Text style={styles.prescriptionLabel}>Administration Instructions</Text>
            <TextInput
              value={draft.instructions}
              onChangeText={(value) => update("instructions", value)}
              placeholder="e.g. Give after meals and complete the course."
              placeholderTextColor="#64748B"
              multiline
              style={[styles.input, styles.prescriptionInstructionsInput]}
            />
            <TouchableOpacity style={styles.prescriptionSubmit} onPress={submit} disabled={submitting}>
              <Text style={styles.sendText}>{submitting ? "Saving..." : "Send Prescription"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LocationMessage({ item }: { item: RealtimeMessage }) {
  const location = item.location_data;
  if (!location) return null;
  return (
    <View style={styles.locationCard}>
      <MaterialCommunityIcons name="map-marker" size={22} color="#34D399" />
      <View style={styles.flex}>
        <View style={styles.locationTitleRow}>
          <MaterialCommunityIcons name="map-marker" size={18} color="#34D399" />
          <Text style={styles.locationTitle}>Shared Location</Text>
        </View>
        {location.addressName ? <Text style={styles.locationAddress}>{location.addressName}</Text> : null}
        <Text style={styles.locationCoordinates}>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </Text>
      </View>
    </View>
  );
}

function VideoPreviewModal({ videoUrl, onClose }: { videoUrl: string | null; onClose: () => void }) {
  const player = useVideoPlayer(videoUrl, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  const saveVideo = async () => {
    if (!videoUrl) return;
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(videoUrl);
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error("Temporary storage is unavailable.");
      const localUri = `${FileSystem.cacheDirectory}mvs-video-${Date.now()}.mp4`;
      const download = await FileSystem.downloadAsync(videoUrl, localUri);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Video downloaded", "The video was downloaded to the app storage, but sharing is unavailable on this device.");
        return;
      }
      await Sharing.shareAsync(download.uri, { mimeType: "video/mp4", dialogTitle: "Save video" });
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save the video.");
    }
  };

  return (
    <Modal visible={Boolean(videoUrl)} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.videoPreviewOverlay}>
        <View style={styles.videoPreviewHeader}>
          <Text style={styles.videoPreviewTitle}>Video</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity style={styles.videoPreviewAction} onPress={() => void saveVideo()}>
              <Text style={styles.videoPreviewActionText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.videoPreviewAction} onPress={onClose} accessibilityLabel="Close video preview">
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
        <VideoView player={player} style={styles.videoPreview} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
      </View>
    </Modal>
  );
}

function ImagePreviewModal({ imageUrl, onClose }: { imageUrl: string | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(imageUrl)} animationType="fade" presentationStyle="fullScreen" transparent onRequestClose={onClose}>
      <Pressable style={styles.imagePreviewOverlay} onPress={onClose} accessibilityLabel="Close image preview">
        <Image source={imageUrl ? { uri: imageUrl } : undefined} style={styles.imagePreview} resizeMode="contain" />
        <TouchableOpacity style={styles.imagePreviewClose} onPress={onClose} accessibilityLabel="Close image preview">
          <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  );
}

function AttachmentOptions({
  attachmentVisible,
  locationVisible,
  onCloseAttachment,
  onSendPhoto,
  onOpenLocation,
  onCloseLocation,
  onSendCurrentLocation,
  onStartLiveLocation,
  liveLocationActive,
}: {
  attachmentVisible: boolean;
  locationVisible: boolean;
  onCloseAttachment: () => void;
  onSendPhoto: () => void;
  onOpenLocation: () => void;
  onCloseLocation: () => void;
  onSendCurrentLocation: () => Promise<void>;
  onStartLiveLocation: () => Promise<void>;
  liveLocationActive: boolean;
}) {
  return (
    <>
      <Modal visible={attachmentVisible} transparent animationType="fade" onRequestClose={onCloseAttachment}>
        <View style={styles.modalBackdrop}>
          <View style={styles.locationSheet}>
            <Text style={styles.locationSheetTitle}>Share with this contact</Text>
            <TouchableOpacity style={styles.locationOption} onPress={() => { onCloseAttachment(); onSendPhoto(); }}>
              <MaterialCommunityIcons name="image-outline" size={22} color="#34D399" />
              <Text style={styles.locationOptionText}>Send Media</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locationOption} onPress={onOpenLocation}>
              <MaterialCommunityIcons name="map-marker-outline" size={22} color="#34D399" />
              <Text style={styles.locationOptionText}>Share Location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locationCancel} onPress={onCloseAttachment}>
              <Text style={styles.locationCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={locationVisible} transparent animationType="fade" onRequestClose={onCloseLocation}>
        <View style={styles.modalBackdrop}>
          <View style={styles.locationSheet}>
            <Text style={styles.locationSheetTitle}>Share Location</Text>
            <TouchableOpacity style={styles.locationOption} onPress={() => void onSendCurrentLocation()}>
              <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#34D399" />
              <View style={styles.flex}>
                <Text style={styles.locationOptionText}>Send Current Location</Text>
                <Text style={styles.locationHint}>Exact GPS coordinate snapshot</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locationOption} onPress={() => void onStartLiveLocation()} disabled={liveLocationActive}>
              <MaterialCommunityIcons name="access-point" size={22} color="#34D399" />
              <View style={styles.flex}>
                <Text style={styles.locationOptionText}>Share Live Location</Text>
                <Text style={styles.locationHint}>Updates every 30 seconds while active</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locationCancel} onPress={onCloseLocation}>
              <Text style={styles.locationCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PatientFileOverlay({ visible, loading, pets, activePetId, records, userRole, onDeleteRecord, onSelectPet, onClose }: { visible: boolean; loading: boolean; pets: PatientPet[]; activePetId: string | null; records: MedicalRecord[]; userRole: string; onDeleteRecord: (recordId: string) => void; onSelectPet: (petId: string) => void; onClose: () => void }) {
  const [historyVersion, setHistoryVersion] = useState(0);
  if (!visible) return null;
  return (
    <View style={styles.patientOverlay}>
      <View style={styles.patientSheet}>
        <TouchableOpacity onPress={onClose} style={styles.patientClose} accessibilityLabel="Close patient file">
          <X size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.patientTitle}>Pet Records</Text>
        {loading ? <ActivityIndicator color="#10B981" /> : pets.length === 0 ? (
          <Text style={styles.empty}>No patient record found for this client</Text>
        ) : (
          <ScrollView>
            {pets.map((pet) => (
              <View key={`${pet.id}-${historyVersion}`} style={styles.patientPet}>
                {pet.photos?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientGallery}>
                    {pet.photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.patientPhoto} />)}
                  </ScrollView>
                ) : null}
                <TouchableOpacity onPress={() => onSelectPet(pet.id)}>
                  <Text style={styles.patientPetName}>{pet.name}{activePetId === pet.id ? " - Selected" : ""}</Text>
                </TouchableOpacity>
                <Text style={styles.patientDetail}>{pet.type} - {pet.breed || "Breed unknown"} - {formatPatientAge(pet.dob)}</Text>
                <Text style={styles.patientLabel}>Vaccination</Text>
                <Text style={styles.patientDetail}>{pet.vaccination_status || "Not provided"}</Text>
                <Text style={styles.patientLabel}>Medical Notes & History</Text>
                <Text style={styles.patientDetail}>{pet.medical_notes || "No medical notes provided."}</Text>
                <>
                    <Text style={styles.patientLabel}>SOAP History</Text>
                    {records.filter((record) => record.pet_id === pet.id).length === 0 ? <Text style={styles.patientDetail}>No consultation records found.</Text> : records.filter((record) => record.pet_id === pet.id).map((record) => (
                      <View key={record.id} style={{ backgroundColor: "#1C2541", borderRadius: 8, padding: 10, marginTop: 8 }}>
                        <Text style={styles.patientDetail}>{new Date(record.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.patientLabel}>Vitals</Text>
                        <Text style={styles.patientDetail}>Weight: {record.weight_kg ?? "-"} kg - Temp: {record.temperature_c ?? "-"} C - Heart rate: {record.heart_rate_bpm ?? "-"} bpm</Text>
                        <Text style={styles.patientLabel}>Assessment</Text>
                        <Text style={styles.patientDetail}>{record.assessment}</Text>
                        <Text style={styles.patientLabel}>Subjective</Text>
                        <Text style={styles.patientDetail}>{record.subjective}</Text>
                        <Text style={styles.patientLabel}>Objective</Text>
                        <Text style={styles.patientDetail}>{record.objective || "-"}</Text>
                        <Text style={styles.patientLabel}>Plan</Text>
                        <Text style={styles.patientDetail}>{record.plan}</Text>
                        {userRole === "vet" || userRole === "veterinarian" ? <TouchableOpacity style={styles.deleteButton} onPress={() => onDeleteRecord(record.id)}><Text style={styles.deleteButtonText}>Mark as Done</Text></TouchableOpacity> : null}
                      </View>
                    ))}
                </>
                <PetMedicalHistory key={`history-${pet.id}-${historyVersion}`} petId={pet.id} />
                {userRole === "vet" || userRole === "veterinarian" ? <VetMedicalLogForm petId={pet.id} onSaved={() => setHistoryVersion((version) => version + 1)} /> : null}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function EntitySelectionModal<T extends { id: string }>({ visible, title, items, getTitle, getSubtitle, onClose, onSelect }: { visible: boolean; title: string; items: T[]; getTitle: (item: T) => string; getSubtitle: (item: T) => string; onClose: () => void; onSelect: (item: T) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.entitySelectionBackdrop}><View style={styles.entitySelectionModal}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>{title}</Text><TouchableOpacity onPress={onClose} accessibilityLabel="Close entity selection"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.entitySelectionList}>{items.map((item) => <TouchableOpacity key={item.id} style={styles.entitySelectionItem} onPress={() => onSelect(item)}><View style={styles.flex}><Text style={styles.primary}>{getTitle(item)}</Text><Text style={styles.farmRecordDetail}>{getSubtitle(item)}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color="#60A5FA" /></TouchableOpacity>)}</ScrollView></View></View></Modal>;
}

function ConsultationTypeModal({ visible, onClose, onPet, onFarm }: { visible: boolean; onClose: () => void; onPet: () => void; onFarm: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.consultationTypeModal}><Text style={styles.invoiceModalTitle}>Which type of consultation summary are you completing?</Text><TouchableOpacity style={styles.consultationTypeButton} onPress={onPet}><Text style={styles.completeButtonText}>Pet Consultation</Text></TouchableOpacity><TouchableOpacity style={styles.consultationTypeButton} onPress={onFarm}><Text style={styles.completeButtonText}>Farm Consultation</Text></TouchableOpacity><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity></View></View></Modal>;
}

function FarmRecordsModal({ visible, loading, records, selectFarm, userRole, clientId, onDeleteRecord, onRefresh, onClose, onSelectFarm }: { visible: boolean; loading: boolean; records: FarmRecord[]; selectFarm: boolean; userRole: string; clientId: string | null; onDeleteRecord: (recordId: string) => void; onRefresh: () => void; onClose: () => void; onSelectFarm: (farmId: string) => void }) {
  const isVet = userRole === 'vet' || userRole === 'veterinarian';
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.patientOverlay}><View style={styles.farmRecordsSheet}><View style={styles.patientHeader}><Text style={styles.patientTitle}>Farm & Livestock Records</Text><TouchableOpacity onPress={onClose} style={styles.patientClose} accessibilityLabel="Close farm records"><X size={22} color="#FFFFFF" /></TouchableOpacity></View>{loading ? <ActivityIndicator color="#10B981" /> : records.length === 0 ? <Text style={styles.empty}>No farm records found for this client.</Text> : <ScrollView style={styles.farmRecordsScroll} contentContainerStyle={styles.farmRecordsContent}>{records.map((farm) => { const farmSoapRecords = (farm.soapRecords || []).filter((soap) => soap.farm_id === farm.id); return <View key={farm.id} style={styles.farmRecordCard}><TouchableOpacity disabled={!selectFarm} onPress={selectFarm ? () => onSelectFarm(farm.id) : undefined}><Text style={styles.primary}>{farm.species}</Text><Text style={styles.farmRecordDetail}>Breed: {farm.breed || "Not specified"}</Text><Text style={styles.farmRecordDetail}>Flock Size: {farm.flock_size ?? 0}</Text><Text style={styles.farmRecordDetail}>Location: {farm.location || "Not specified"}</Text><Text style={styles.farmRecordDetail}>Restock Date: {farm.restock_date || "Not specified"}</Text>{farm.medical_log ? <><Text style={styles.farmRecordHistory}>Medical Log</Text><Text style={styles.farmRecordDetail}>{farm.medical_log}</Text></> : null}{farm.production_summary ? <><Text style={styles.farmRecordHistory}>Production Summary</Text><Text style={styles.farmRecordDetail}>{farm.production_summary}</Text></> : null}{farmSoapRecords.length ? <View><Text style={styles.farmRecordHistory}>SOAP History</Text>{farmSoapRecords.map((soap) => <View key={soap.id} style={styles.farmSoapHistory}><Text style={styles.farmRecordDetail}>{new Date(soap.created_at).toLocaleDateString()}</Text>{soap.subjective ? <Text style={styles.farmRecordDetail}>Symptoms: {soap.subjective}</Text> : null}{soap.objective ? <Text style={styles.farmRecordDetail}>Findings: {soap.objective}</Text> : null}{soap.tentative_diagnosis ? <Text style={styles.farmRecordDetail}>Tentative Diagnosis: {soap.tentative_diagnosis}</Text> : null}{soap.plan ? <Text style={styles.farmRecordDetail}>Plan: {soap.plan}</Text> : null}{isVet ? <TouchableOpacity style={styles.deleteButton} onPress={() => onDeleteRecord(soap.id)}><Text style={styles.deleteButtonText}>Mark as Done</Text></TouchableOpacity> : null}</View>)}</View> : <Text style={styles.farmRecordDetail}>No SOAP history</Text>}</TouchableOpacity><FarmMedicalHistory farmId={farm.id} />{isVet && clientId ? <VetFarmMedicalLogForm farmId={farm.id} clientId={clientId} onSaved={onRefresh} /> : null}</View>; })}</ScrollView>}</View></View></Modal>;
}

function FarmSoapModal({ visible, submitting, onClose, onSubmit }: { visible: boolean; submitting: boolean; onClose: () => void; onSubmit: (draft: FarmSoapDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<FarmSoapDraft>({ subjective: "", objective: "", tentative_diagnosis: "", plan: "" });
  const update = (field: keyof FarmSoapDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.prescriptionModal}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>Farm Consultation Summary</Text><TouchableOpacity onPress={onClose} accessibilityLabel="Close farm consultation"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.prescriptionForm}>{(["subjective", "objective", "tentative_diagnosis", "plan"] as const).map((field) => <View key={field}><Text style={styles.prescriptionLabel}>{field === "subjective" ? "Symptoms & Owner Complaints" : field === "objective" ? "Farm Findings" : field === "tentative_diagnosis" ? "Tentative Diagnosis" : "Treatment Plan & Follow-up"}</Text><TextInput value={draft[field]} onChangeText={(value) => update(field, value)} multiline placeholder="Enter details" placeholderTextColor="#64748B" style={[styles.input, styles.prescriptionInstructionsInput]} /></View>)}<TouchableOpacity style={styles.prescriptionSubmit} onPress={() => void onSubmit(draft)} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Saving..." : "Save & End Consultation"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
}

function SoapConsultationModal({ visible, submitting, onClose, onSubmit }: { visible: boolean; submitting: boolean; onClose: () => void; onSubmit: (draft: SoapDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<SoapDraft>({ weightKg: "", temperatureC: "", heartRateBpm: "", subjective: "", objective: "", assessment: "", plan: "" });
  const update = (field: keyof SoapDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.prescriptionModal, { backgroundColor: "#1C2541" }]}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>SOAP Consultation Summary</Text><TouchableOpacity onPress={onClose} accessibilityLabel="Close SOAP consultation"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.prescriptionForm}><Text style={styles.prescriptionLabel}>Vitals</Text><View style={{ flexDirection: "row", gap: 8 }}><TextInput value={draft.weightKg} onChangeText={(value) => update("weightKg", value)} keyboardType="decimal-pad" placeholder="Weight (kg)" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /><TextInput value={draft.temperatureC} onChangeText={(value) => update("temperatureC", value)} keyboardType="decimal-pad" placeholder="Temp (C)" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /><TextInput value={draft.heartRateBpm} onChangeText={(value) => update("heartRateBpm", value)} keyboardType="number-pad" placeholder="Heart rate" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /></View>{(["subjective", "objective", "assessment", "plan"] as const).map((field) => <View key={field}><Text style={styles.prescriptionLabel}>{field === "subjective" ? "Symptoms & Owner Complaints" : field === "objective" ? "Clinical Findings" : field === "assessment" ? "Diagnosis / Primary Concern" : "Treatment Plan & Follow-up"}</Text><TextInput value={draft[field]} onChangeText={(value) => update(field, value)} multiline placeholder="Enter details" placeholderTextColor="#64748B" style={[styles.input, styles.prescriptionInstructionsInput]} /></View>)}<TouchableOpacity style={styles.prescriptionSubmit} onPress={() => void onSubmit(draft)} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Saving..." : "Save & End Consultation"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
}

function InvoiceMessage({ item, currentUserId, onPayInvoice }: { item: RealtimeMessage; currentUserId: string; onPayInvoice: (orderId: string) => Promise<void> }) {
  const metadata = (item.metadata || {}) as Partial<InvoiceMetadata>;
  const [customer, setCustomer] = useState<{ email: string; name: string } | null>(null);
  const [sellerSubaccountId, setSellerSubaccountId] = useState<string | undefined>();
  const [sellerProfileLoaded, setSellerProfileLoaded] = useState(false);
  const isBuyer = item.receiver_id === currentUserId && item.sender_id !== currentUserId;
  const isPendingInvoice = metadata.status === "pending" && Boolean(metadata.invoice_id) && isBuyer;

  useEffect(() => {
    if (!isPendingInvoice) return;
    void getCurrentUser().then((user) => {
      if (user?.email) setCustomer({ email: user.email, name: user.user_metadata?.full_name || user.user_metadata?.name || user.email });
    });
  }, [isPendingInvoice]);

  useEffect(() => {
    if (!isPendingInvoice || !item.sender_id) {
      setSellerSubaccountId(undefined);
      setSellerProfileLoaded(true);
      return;
    }

    let mounted = true;
    setSellerProfileLoaded(false);
    void supabase
      .from("profiles")
      .select("flutterwave_subaccount_id")
      .eq("id", item.sender_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn("[Invoice] Seller Flutterwave subaccount unavailable:", error.message);
        }
        if (!mounted) return;
        const candidate = data?.flutterwave_subaccount_id;
        setSellerSubaccountId(typeof candidate === "string" && /^RS_[A-Za-z0-9_-]+$/.test(candidate) ? candidate : undefined);
        setSellerProfileLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [isPendingInvoice, item.sender_id]);

  const handlePaymentSuccess = (response: unknown) => {
    const paymentResponse = response as { status?: string; transaction_id?: string };
    if (paymentResponse.status === "successful" || paymentResponse.transaction_id) {
      void onPayInvoice(metadata.invoice_id || "");
      return;
    }
    Alert.alert("Payment not completed", "Payment was not completed. Please try again.");
  };

  const handleWebPayment = () => {
    if (!customer || !metadata.invoice_id) return;
    handleFlutterwaveWebPayment({
      public_key: FLUTTERWAVE_CONFIG.PUBLIC_KEY,
      tx_ref: metadata.invoice_id,
      amount: Number(metadata.amount),
      currency: "NGN",
      customer,
      subaccounts: sellerSubaccountId ? [{ id: sellerSubaccountId, transaction_split_ratio: 90 }] : undefined,
      onSuccess: handlePaymentSuccess,
      onClose: () => Alert.alert("Payment not completed", "Payment was not completed. Please try again."),
    });
  };

  const payButton = isPendingInvoice && customer && sellerProfileLoaded ? Platform.OS === "web" ? <TouchableOpacity style={styles.payButton} onPress={handleWebPayment}><Text style={styles.payButtonText}>Pay Now</Text></TouchableOpacity> : <PayWithFlutterwave style={styles.payButton} options={{ authorization: FLUTTERWAVE_CONFIG.PUBLIC_KEY, tx_ref: metadata.invoice_id || "", amount: Number(metadata.amount), currency: "NGN", payment_options: "card,ussd,account_transfer", customer, subaccounts: sellerSubaccountId ? [{ id: sellerSubaccountId, transaction_split_ratio: 90 }] : undefined, customizations: { title: "Mobile Vet Invoice Payment", description: metadata.note || "Service / Product Payment" } }} onRedirect={handlePaymentSuccess} onAbort={() => Alert.alert("Payment not completed", "Payment was not completed. Please try again.")} onInitializeError={() => Alert.alert("Payment not completed", "Payment was not completed. Please try again.")} customButton={({ disabled, onPress }) => <TouchableOpacity style={styles.payButton} onPress={onPress} disabled={disabled}><Text style={styles.payButtonText}>Pay Now</Text></TouchableOpacity>} /> : null;

  return <View style={styles.invoiceCard}><Text style={styles.invoiceTitle}>Invoice</Text><Text style={styles.invoiceSeller}>Seller: {metadata.seller_name || "Seller"}</Text><Text style={styles.invoiceAmount}>NGN {Number(metadata.amount || 0).toLocaleString("en-NG")}</Text>{metadata.items?.map((invoiceItem, index) => <View key={`${invoiceItem.description}-${index}`} style={styles.invoiceBreakdownRow}><Text style={styles.invoiceBreakdownName}>{invoiceItem.description}</Text><Text style={styles.invoiceBreakdownAmount}>NGN {Number(invoiceItem.amount).toLocaleString("en-NG")}</Text></View>)}{metadata.note ? <Text style={styles.invoiceNote}>{metadata.note}</Text> : null}<View style={styles.invoiceFooter}><View style={[styles.pendingBadge, metadata.status === "paid" && styles.paidBadge]}><Text style={[styles.pendingBadgeText, metadata.status === "paid" && styles.paidBadgeText]}>{metadata.status === "paid" ? "Paid" : "Pending"}</Text></View>{payButton}</View></View>;
}

const defaultInvoiceItems: InvoiceItem[] = [
  { id: "1", description: "Item 1", amount: 1000 },
  { id: "2", description: "Item 2", amount: 1000 },
];

const normalizeInvoiceItems = (items: InvoiceItem[]) => items.map((item, index) => ({
  ...item,
  id: item.id || String(index + 1),
}));

function InvoiceModal({ visible, onClose, onSubmit, submitting, initialItems }: InvoiceProps) {
  const draftItems = initialItems && initialItems.length > 0 ? normalizeInvoiceItems(initialItems) : defaultInvoiceItems;
  const [items, setItems] = useState<InvoiceItem[]>(() => draftItems.map((item) => ({ ...item })));
  const [note, setNote] = useState(initialItems && initialItems.length > 0 ? draftItems.map((item) => `${item.description}: NGN ${item.amount.toLocaleString("en-NG")}`).join("; ") : "");

  const subtotal = items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const updateItem = (index: number, field: keyof InvoiceItem, value: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === "amount" ? Number(value.replace(/[^\d.]/g, "")) || 0 : value } : item));
  };
  const submit = () => {
    const validItems = items.filter((item) => item.description.trim() && item.amount > 0);
    const total = validItems.reduce((sum, item) => sum + item.amount, 0);
    if (!validItems.length || !Number.isFinite(total) || total <= 0) {
      Alert.alert("Invalid invoice", "Add at least one item with a valid amount.");
      return;
    }
    const normalizedItems = validItems.map((item) => ({
      id: item.id,
      description: item.description.trim(),
      amount: item.amount,
    }));
    const itemNote = normalizedItems.map((item) => `${item.description}: NGN ${item.amount.toLocaleString("en-NG")}`).join("; ");
    void onSubmit(total, note.trim() || itemNote, normalizedItems);
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.invoiceOverlay}><View style={styles.invoiceModal}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>Create Invoice</Text><TouchableOpacity onPress={onClose} accessibilityLabel="Close invoice"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.invoiceForm}><Text style={styles.invoiceLabel}>Invoice Items</Text>{items.map((item, index) => <View key={item.id} style={styles.invoiceItemRow}><TextInput value={item.description} onChangeText={(value) => updateItem(index, "description", value)} placeholder="Service or treatment" placeholderTextColor="#64748B" style={[styles.input, styles.invoiceDescriptionInput]} /><TextInput value={item.amount ? String(item.amount) : ""} onChangeText={(value) => updateItem(index, "amount", value)} keyboardType="decimal-pad" placeholder="Amount" placeholderTextColor="#64748B" style={[styles.input, styles.invoiceAmountInput]} /><TouchableOpacity style={styles.invoiceDeleteButton} onPress={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><MaterialCommunityIcons name="delete-outline" size={20} color="#F87171" /></TouchableOpacity></View>)}<TouchableOpacity style={styles.addInvoiceItem} onPress={() => setItems((current) => { const nextItemNumber = current.reduce((max, currentItem) => Math.max(max, Number(currentItem.id) || 0), 0) + 1; return [...current, { id: String(nextItemNumber), description: `Item ${nextItemNumber}`, amount: 1000 }]; })}><MaterialCommunityIcons name="plus" size={17} color="#60A5FA" /><Text style={styles.addInvoiceItemText}>Add item</Text></TouchableOpacity><Text style={styles.invoiceTotal}>Total: NGN {subtotal.toLocaleString("en-NG")}</Text><Text style={styles.invoiceLabel}>Note or description (optional)</Text><TextInput value={note} onChangeText={setNote} placeholder="Additional clinical context..." placeholderTextColor="#64748B" style={[styles.input, styles.invoiceNoteInput]} multiline /><TouchableOpacity style={styles.sendButton} onPress={submit} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Creating..." : "Create Invoice"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
}

 function ConsultationChatRoom({
  active,
  currentUserId,
  userRole,
  messages,
  message,
  setMessage,
  selectedImageUri,
  onRemoveImage,
  onBack,
  onSend,
  onAttach,
  onSendPhoto,
  attachmentVisible,
  locationVisible,
  onCloseAttachment,
  onOpenLocation,
  onCloseLocation,
  onSendCurrentLocation,
  onStartLiveLocation,
  liveLocationActive,
  onStopLiveLocation,
  onDeleteMessage,
  onReactMessage,
  deleteCandidate,
  onConfirmDelete,
  onCancelDelete,
  multiSelectMode,
  selectedMessageIds,
  onToggleMessageSelection,
  onToggleMultiSelectMode,
  onClearSelection,
  onDeleteSelected,
  onClearThread,
  consultation,
  onToggleConsultation,
  onStartConsultation,
  onEndConsultationByVet,
  onOpenFarmRecords,
  onChoosePetConsultation,
  onChooseFarmConsultation,
  activeOrder,
  onUpdateOrderStatus,
  onCreateOrder,
  recipientProfile,
  onOpenPatientFile,
  patientFileVisible,
  patientPets,
  patientFileLoading,
  onClosePatientFile,
  uploading,
  canCreateInvoice,
  invoiceVisible,
  invoiceSubmitting,
  onOpenInvoice,
  invoiceItems,
  onCloseInvoice,
  onCreateInvoice,
  onPayInvoice,
  prescriptionVisible,
  prescriptionSubmitting,
  onOpenPrescription,
  onClosePrescription,
  onCreatePrescription,
  voiceNoteControls,
}: {
  active: Thread;
  currentUserId: string;
  userRole: string;
  messages: RealtimeMessage[];
  message: string;
  setMessage: (value: string) => void;
  selectedImageUri: string | null;
  onRemoveImage: () => void;
  onBack: () => void;
  onSend: (replyTarget?: ReplyTarget | null) => void | Promise<void>;
  onAttach: () => void;
  onSendPhoto: () => void;
  attachmentVisible: boolean;
  locationVisible: boolean;
  onCloseAttachment: () => void;
  onOpenLocation: () => void;
  onCloseLocation: () => void;
  onSendCurrentLocation: () => Promise<void>;
  onStartLiveLocation: () => Promise<void>;
  liveLocationActive: boolean;
  onStopLiveLocation: () => void;
  onDeleteMessage: (message: RealtimeMessage) => void;
  onReactMessage: (message: RealtimeMessage, emoji: string) => Promise<void>;
  deleteCandidate: RealtimeMessage | null;
  onConfirmDelete: (mode?: "everyone" | "me") => void;
  onCancelDelete: () => void;
  multiSelectMode: boolean;
  selectedMessageIds: string[];
  onToggleMessageSelection: (messageId: string) => void;
  onToggleMultiSelectMode: () => void;
  onClearSelection: () => void;
  onDeleteSelected: (mode: "everyone" | "me") => void;
  onClearThread: () => void;
  consultation: ConsultationRecord;
  onToggleConsultation: () => void;
  onStartConsultation: () => Promise<void>;
  onEndConsultationByVet: () => void;
  onOpenFarmRecords: () => void;
  onChoosePetConsultation: () => void;
  onChooseFarmConsultation: () => void;
  activeOrder: ActiveOrder | null;
  onUpdateOrderStatus: (status: OrderStatus | "completed") => Promise<void>;
  onCreateOrder: () => Promise<void>;
  recipientProfile: RecipientProfile | null;
  onOpenPatientFile: () => void;
  patientFileVisible: boolean;
  patientPets: PatientPet[];
  patientFileLoading: boolean;
  onClosePatientFile: () => void;
  uploading: boolean;
  canCreateInvoice: boolean;
  invoiceVisible: boolean;
  invoiceSubmitting: boolean;
  onOpenInvoice: () => void;
  invoiceItems: InvoiceItem[];
  onCloseInvoice: () => void;
  onCreateInvoice: (amount: number, note: string, items: InvoiceItem[]) => Promise<void>;
  onPayInvoice: (orderId: string) => Promise<void>;
  prescriptionVisible: boolean;
  prescriptionSubmitting: boolean;
  onOpenPrescription: () => void;
  onClosePrescription: () => void;
  onCreatePrescription: (draft: PrescriptionDraft) => Promise<void>;
  voiceNoteControls: VoiceNoteControls;
}) {
  const messagesScrollRef = useRef<ScrollView>(null);
  const initialScrollDone = useRef(false);
  const previousMessageCount = useRef(0);
  const messageLongPressLockRef = useRef<string | null>(null);
  const visualViewportHeight = useVisualViewport();
  const safeAreaInsets = useSafeAreaInsets();
  const bottomTabOffset = Math.max(64, safeAreaInsets.bottom);
  const mobileWebRootStyle: ViewStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: visualViewportHeight ?? 0,
  };

  const scrollToLatest = (animated = false) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        messagesScrollRef.current?.scrollToEnd({ animated });
      });
    });
  };

  useEffect(() => {
    initialScrollDone.current = false;
    previousMessageCount.current = 0;
  }, [active.id]);

  useEffect(() => {
    if (!messages.length) {
      previousMessageCount.current = 0;
      return;
    }
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      previousMessageCount.current = messages.length;
      scrollToLatest();
      return;
    }
    if (messages.length > previousMessageCount.current && messages[messages.length - 1]?.sender_id === currentUserId) {
      scrollToLatest(true);
    }
    previousMessageCount.current = messages.length;
  }, [currentUserId, messages]);

  const [buyerProtectionVisible, setBuyerProtectionVisible] = useState(false);
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const [searchBarVisible, setSearchBarVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [clearThreadConfirmVisible, setClearThreadConfirmVisible] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [copyToast, setCopyToast] = useState(false);

  const dismissSearchBar = () => {
    setSearchBarVisible(false);
    setSearchQuery("");
    setSearchResultIndex(0);
  };

  const confirmClearThread = () => {
    setHeaderMenuVisible(false);
    setClearThreadConfirmVisible(true);
  };

  const openClearThreadConfirm = () => {
    setHeaderMenuVisible(false);
    setClearThreadConfirmVisible(true);
  };

  const handleCopyMessage = async () => {
    if (!deleteCandidate?.content) return;
    await Clipboard.setStringAsync(deleteCandidate.content);
    onCancelDelete();
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 1800);
  };

  useEffect(() => {
    setHeaderMenuVisible(false);
    setSearchBarVisible(false);
    setSearchQuery("");
    setSearchResultIndex(0);
    setClearThreadConfirmVisible(false);
    setSelectedImagePreview(null);
    setVideoPreviewUrl(null);
  }, [active.id]);

  const selectedCount = selectedMessageIds.length;
  const trimmedSearchQuery = searchQuery.trim();
  const matchingMessages = trimmedSearchQuery.length > 0
    ? messages.filter((item) => {
        const haystack = [
          item.content || "",
          item.message_type || "",
          item.location_data ? `${item.location_data.latitude ?? ""} ${item.location_data.longitude ?? ""}` : "",
        ].join(" ").toLowerCase();
        return haystack.includes(trimmedSearchQuery.toLowerCase());
      })
    : [];

  const focusMessageMatch = (nextIndex: number) => {
    if (!matchingMessages.length) return;
    const boundedIndex = (nextIndex + matchingMessages.length) % matchingMessages.length;
    setSearchResultIndex(boundedIndex);
    const matchedMessage = matchingMessages[boundedIndex];
    if (!matchedMessage) return;
    const matchedIndex = messages.findIndex((message) => message.id === matchedMessage.id);
    const targetY = Math.max(0, matchedIndex * 120);
    requestAnimationFrame(() => {
      messagesScrollRef.current?.scrollTo({ y: targetY, animated: true });
    });
  };

  useEffect(() => {
    if (!trimmedSearchQuery.length) {
      setSearchResultIndex(0);
      return;
    }
    if (searchResultIndex >= matchingMessages.length) {
      setSearchResultIndex(0);
    }
  }, [matchingMessages.length, searchResultIndex, trimmedSearchQuery.length]);

  const isConsultActive = consultation.status === "active";
  const isPetParent = currentUserId === consultation.client_id || userRole === "client";
  const isVetClientThread =
    (["vet", "veterinarian"].includes(userRole) && active.participantRole === "client") ||
    (userRole === "client" && ["vet", "veterinarian"].includes(active.participantRole));
  const isMerchantConversation = userRole === "merchant" || active.participantRole === "merchant";
  const showInvoiceAction = canCreateInvoice && (!isMerchantConversation || userRole === "merchant");

  return (
    <SafeAreaView style={Platform.OS === "web" ? { ...styles.container, ...mobileWebRootStyle } : styles.container}>
      <View style={styles.roomHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {active.productName || active.participantName}
            </Text>
            <Text style={styles.subtitle}>
              {active.productName ? `${active.participantName} - Marketplace` : active.participantName}
            </Text>
          </View>
        </View>

        <View style={styles.headerActionsWrapper}>
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            style={styles.headerActions}
            contentContainerStyle={styles.headerActionsContent}
          >
            {isMerchantConversation ? (
              <OrderStatusBadge
                order={activeOrder}
                canUpdate={userRole === "merchant"}
                canCreate={userRole === "merchant"}
                onUpdate={onUpdateOrderStatus}
                onCreate={onCreateOrder}
                recipientProfile={recipientProfile}
              />
            ) : null}
            {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
              <TouchableOpacity style={styles.patientButton} onPress={onOpenPatientFile}>
                <MaterialCommunityIcons name="file-account" size={18} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Pet Records</Text>
              </TouchableOpacity>
            ) : null}
            {!isMerchantConversation && (userRole === "vet" || userRole === "veterinarian") ? (
              <TouchableOpacity style={styles.patientButton} onPress={onOpenFarmRecords}>
                <MaterialCommunityIcons name="barn" size={18} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Farm Records</Text>
              </TouchableOpacity>
            ) : null}
            {showInvoiceAction ? (
              <TouchableOpacity style={styles.invoiceAction} onPress={onOpenInvoice}>
                <MaterialCommunityIcons name="file-document-edit" size={17} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Create Invoice</Text>
              </TouchableOpacity>
            ) : null}
            {multiSelectMode ? (
              <TouchableOpacity style={styles.clearThreadAction} onPress={openClearThreadConfirm}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FCA5A5" />
                <Text style={styles.clearThreadText}>Clear Thread</Text>
              </TouchableOpacity>
            ) : null}
            {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
              <TouchableOpacity style={styles.prescriptionActionHeader} onPress={onOpenPrescription}>
                <MaterialCommunityIcons name="prescription" size={17} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>Prescribe</Text>
              </TouchableOpacity>
            ) : null}
            {isVetClientThread && isPetParent && isConsultActive ? (
              <TouchableOpacity
                style={[
                  styles.consultationButton,
                  isConsultActive ? styles.endConsultationButton : styles.startConsultationButton,
                ]}
                onPress={onToggleConsultation}
              >
                <Text style={styles.consultationButtonText}>End Consultation</Text>
              </TouchableOpacity>
            ) : isVetClientThread && isConsultActive ? (
              <TouchableOpacity style={styles.endConsultationButton} onPress={onEndConsultationByVet}>
                <Text style={styles.consultationButtonText}>End Consultation</Text>
              </TouchableOpacity>
            ) : isVetClientThread ? (
              <>
                <Text style={styles.consultationEndedBadge}>Consultation Ended</Text>
                {isPetParent ? (
                  <TouchableOpacity style={styles.completeButton} onPress={() => void onStartConsultation()}>
                    <Text style={styles.completeButtonText}>+ Start Consultation</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
            {isVetClientThread && isConsultActive ? (
              <Text style={styles.headerConsultationStatus}>Active Consultation</Text>
            ) : null}
            {userRole === "client" && (recipientProfile?.role === "merchant" || recipientProfile?.role === "vet") ? (
              <TouchableOpacity style={styles.buyerProtectionButton} onPress={() => setBuyerProtectionVisible(true)}>
                <ShieldCheck size={16} color="#FFFFFF" />
                <Text style={styles.completeButtonText}>MVS User Protection</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            accessibilityLabel="Chat options menu"
            style={styles.headerMenuButton}
            onPress={() => setHeaderMenuVisible((visible) => !visible)}
          >
            <MaterialCommunityIcons name="dots-vertical" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {headerMenuVisible ? (
          <View style={styles.headerMenuList}>
            <TouchableOpacity
              style={styles.headerMenuItem}
              onPress={() => {
                setHeaderMenuVisible(false);
                if (searchBarVisible) {
                  dismissSearchBar();
                  return;
                }
                setSearchBarVisible(true);
                setSearchQuery("");
                setSearchResultIndex(0);
              }}
            >
              <Text style={styles.headerMenuText}>Search Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerMenuItem}
              onPress={() => {
                setHeaderMenuVisible(false);
                if (multiSelectMode) {
                  onClearSelection();
                  return;
                }
                onToggleMultiSelectMode();
              }}
            >
              <Text style={styles.headerMenuText}>Select Multiple Messages</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={openClearThreadConfirm}>
              <Text style={styles.headerMenuText}>Clear All Messages</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {searchBarVisible ? (
        <>
          <Pressable
            onPress={dismissSearchBar}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}
          />
          <View style={[styles.searchBarContainer, { zIndex: 1 }]}>
            <TextInput
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                setSearchResultIndex(0);
              }}
              placeholder="Search conversation"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={dismissSearchBar} accessibilityLabel="Close search" style={{ padding: 6 }}>
              <MaterialCommunityIcons name="close" size={18} color="#E2E8F0" />
            </TouchableOpacity>
            <View style={styles.searchNavigationButtons}>
              <TouchableOpacity onPress={() => focusMessageMatch(searchResultIndex - 1)} accessibilityLabel="Previous result">
                <MaterialCommunityIcons name="chevron-up" size={20} color="#E2E8F0" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => focusMessageMatch(searchResultIndex + 1)} accessibilityLabel="Next result">
                <MaterialCommunityIcons name="chevron-down" size={20} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <Text style={styles.searchStatusText}>
              {matchingMessages.length > 0 ? `${Math.min(searchResultIndex + 1, matchingMessages.length)} of ${matchingMessages.length} results` : "No results"}
            </Text>
          </View>
        </>
      ) : null}

      <BuyerProtectionModal visible={buyerProtectionVisible} onClose={() => setBuyerProtectionVisible(false)} />
      {clearThreadConfirmVisible ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setClearThreadConfirmVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.deleteModalCard}>
              <Text style={styles.deleteModalTitle}>Do you wish to clear all your messages? This action cannot be undone.</Text>
              <TouchableOpacity
                style={[styles.deleteModalAction, { backgroundColor: "#DC2626" }]}
                onPress={() => {
                  setClearThreadConfirmVisible(false);
                  void onClearThread();
                }}
              >
                <Text style={styles.deleteModalActionText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteModalCancel} onPress={() => setClearThreadConfirmVisible(false)}>
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}

      {isVetClientThread ? (
        <View style={[styles.consultationBanner, isConsultActive ? styles.consultationActive : styles.consultationCompleted]}>
          <View style={styles.consultationStatus}>
            <View style={[styles.consultationIndicator, isConsultActive ? styles.consultationIndicatorActive : styles.consultationIndicatorCompleted]} />
            <Text style={styles.consultationText}>{isConsultActive ? "Active Consultation" : "Consultation Ended"}</Text>
          </View>
        </View>
      ) : null}

      {liveLocationActive ? (
        <View style={styles.liveLocationBanner}>
          <Text style={styles.liveLocationText}>Live location sharing is active</Text>
          <TouchableOpacity onPress={onStopLiveLocation}>
            <Text style={styles.stopLiveLocationText}>Stop Sharing Live Location</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView ref={messagesScrollRef} style={styles.messageList} contentContainerStyle={styles.messages}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet. Start the conversation.</Text>
        ) : (
          messages.map((item) => {
            const isSelected = selectedMessageIds.includes(item.id);
            return (
              <View key={item.id} style={styles.messageRow}>
                {multiSelectMode ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => onToggleMessageSelection(item.id)}
                    style={[styles.selectionCheck, isSelected && styles.selectionCheckActive]}
                  >
                    {isSelected ? <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                ) : null}
                <SwipeableMessage
                  onReply={() => {
                    setReplyTarget({ id: item.id, senderName: item.sender_id === currentUserId ? "You" : active.participantName, content: item.content || "Attachment" });
                  }}
                  disabled={multiSelectMode}
                >
                <TouchableOpacity
                  {...(!multiSelectMode ? contextMenuProps(() => onDeleteMessage(item)) : {})}
                  activeOpacity={0.8}
                  onLongPress={() => {
                    messageLongPressLockRef.current = item.id;
                    onDeleteMessage(item);
                  }}
                  delayLongPress={2000}
                  onPress={() => {
                    if (multiSelectMode) {
                      onToggleMessageSelection(item.id);
                      return;
                    }
                    if (messageLongPressLockRef.current === item.id) {
                      messageLongPressLockRef.current = null;
                      return;
                    }
                    if (item.location_data) {
                      openSafeExternalUrl(
                        `https://www.google.com/maps/search/?api=1&query=${item.location_data.latitude},${item.location_data.longitude}`
                      );
                    } else if (item.media_type === "image" && item.media_url) {
                      setSelectedImagePreview(item.media_url);
                    } else if (item.media_type === "video" && item.media_url) {
                      setVideoPreviewUrl(item.media_url);
                    }
                  }}
                  style={[
                    styles.bubble,
                    multiSelectMode && isSelected ? styles.messageSelected : null,
                    item.media_type === "video" && item.media_url ? styles.videoBubble : null,
                    item.sender_id === currentUserId ? styles.outgoing : styles.incoming,
                  ]}
                >
                  {item.reply_to ? (
                    <View style={styles.quotedMessage}>
                      <Text style={styles.quotedMessageSender} numberOfLines={1}>{item.reply_to.sender_name}</Text>
                      <Text style={styles.quotedMessageText} numberOfLines={2}>{item.reply_to.content}</Text>
                    </View>
                  ) : null}
                  {item.media_url && item.media_type === "image" ? (
                    <Image source={{ uri: item.media_url }} style={styles.attachment} />
                  ) : null}
                  {item.media_url && item.media_type === "video" ? (
                    <View style={styles.videoAttachment}>
                      <MaterialCommunityIcons name="play-circle" size={46} color="#FFFFFF" />
                      <Text style={styles.videoAttachmentText}>Tap to watch video</Text>
                    </View>
                  ) : null}
                  {item.message_type === "invoice" ? (
                    <InvoiceMessage item={item} currentUserId={currentUserId} onPayInvoice={onPayInvoice} />
                  ) : (item.message_type as string) === "prescription" ? (
                    <PrescriptionMessage item={item} />
                  ) : (item.message_type as string) === "voice_note" && item.media_url ? (
                    <VoiceNoteMessage mediaUrl={item.media_url} />
                  ) : item.location_data ? (
                    <LocationMessage item={item} />
                  ) : item.content ? (
                    <Text style={styles.primary}>{item.content}</Text>
                  ) : null}
                  <Text style={styles.messageTimestamp}>{formatMessageTime(item.created_at)}</Text>
                  {Object.values(item.reactions || {}).length > 0 ? (
                    <TouchableOpacity
                      style={styles.reactionBadge}
                      onPress={() => {
                        if (item.reactions?.[currentUserId]) void onReactMessage(item, "");
                      }}
                      disabled={!item.reactions?.[currentUserId]}
                      accessibilityLabel={item.reactions?.[currentUserId] ? "Remove your reaction" : "Message reactions"}
                    >
                      <Text style={styles.reactionBadgeText}>{Array.from(new Set(Object.values(item.reactions || {}))).join(" ")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
                </SwipeableMessage>
              </View>
            );
          })
        )}
      </ScrollView>

      {selectedCount > 0 ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCounter}>{selectedCount} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionDeleteButton} onPress={onClearSelection}>
              <Text style={styles.selectionDeleteText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionDeleteButton} onPress={() => onDeleteSelected("me")}>
              <Text style={styles.selectionDeleteText}>Delete for Me</Text>
            </TouchableOpacity>
            {messages.filter((item) => selectedMessageIds.includes(item.id) && item.sender_id === currentUserId).length === selectedCount ? (
              <TouchableOpacity style={styles.selectionDeleteButtonPrimary} onPress={() => onDeleteSelected("everyone")}>
                <Text style={styles.selectionDeleteTextPrimary}>Delete for Everyone</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <ChatComposer
        message={message}
        setMessage={setMessage}
        selectedImageUri={selectedImageUri}
        onRemoveImage={onRemoveImage}
        onAttach={onAttach}
        onSend={async () => { await onSend(replyTarget); setReplyTarget(null); }}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        uploading={uploading}
        bottomInset={bottomTabOffset}
        voiceNoteControls={voiceNoteControls}
      />

      <AttachmentOptions
        attachmentVisible={attachmentVisible}
        locationVisible={locationVisible}
        onCloseAttachment={onCloseAttachment}
        onSendPhoto={onSendPhoto}
        onOpenLocation={onOpenLocation}
        onCloseLocation={onCloseLocation}
        onSendCurrentLocation={onSendCurrentLocation}
        onStartLiveLocation={onStartLiveLocation}
        liveLocationActive={liveLocationActive}
      />

      <ImagePreviewModal imageUrl={selectedImagePreview} onClose={() => setSelectedImagePreview(null)} />
      <VideoPreviewModal videoUrl={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />
      {deleteCandidate ? (
        <Modal transparent animationType="fade" visible={Boolean(deleteCandidate)} onRequestClose={onCancelDelete}>
          <View style={styles.modalBackdrop}>
            <ReactionBar onSelect={(emoji) => { void onReactMessage(deleteCandidate, emoji); }} />
            <View style={styles.deleteModalCard}>
              <Text style={styles.deleteModalTitle}>Delete message?</Text>
              {deleteCandidate.content ? (
                <TouchableOpacity style={styles.deleteModalAction} onPress={() => void handleCopyMessage()}>
                  <Text style={styles.deleteModalActionText}>Copy</Text>
                </TouchableOpacity>
              ) : null}
              {deleteCandidate.sender_id === currentUserId ? (
                <TouchableOpacity style={styles.deleteModalAction} onPress={() => onConfirmDelete('everyone')}>
                  <Text style={styles.deleteModalActionText}>Delete for Everyone</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.deleteModalAction} onPress={() => onConfirmDelete('me')}>
                <Text style={styles.deleteModalActionText}>Delete for Me</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteModalCancel} onPress={onCancelDelete}>
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
      {copyToast ? <View style={styles.copyToast}><Text style={styles.copyToastText}>Message copied</Text></View> : null}
      {invoiceVisible ? (
        <InvoiceModal
          visible={invoiceVisible}
          onClose={onCloseInvoice}
          onSubmit={onCreateInvoice}
          submitting={invoiceSubmitting}
          initialItems={invoiceItems}
        />
      ) : null}
      <PrescriptionModal
        visible={prescriptionVisible}
        onClose={onClosePrescription}
        onSubmit={onCreatePrescription}
        submitting={prescriptionSubmitting}
      />
    </SafeAreaView>
  );
}




