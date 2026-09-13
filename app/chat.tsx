import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioPlayer,
    useAudioPlayerStatus,
    useAudioRecorder,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { PayWithFlutterwave } from "flutterwave-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
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
import PetMedicalHistory from "../components/PetMedicalHistory";
import VetMedicalLogForm from "../components/VetMedicalLogForm";
import { FLUTTERWAVE_CONFIG, handleFlutterwaveWebPayment } from "../lib/flutterwave";
import { calculatePetAgeInWeeks } from "../lib/petAge";
import { sanitizeInput } from "../lib/sanitize";
import {
    deleteRealtimeMessage,
    ensureConsultationRecord,
    getCurrentUser,
    isUuid,
    normalizeUuid,
    sendRealtimeMessage,
    subscribeToMessages,
    supabase,
    uploadChatAttachment,
    type ConsultationStatus,
    type RealtimeMessage,
} from "../lib/supabase";
import { markConversationRead, useUnreadMessages } from "../lib/unreadMessages";

type ChatParams = {
  conversationId?: string;
  recipientId?: string;
  merchantId?: string;
  merchantName?: string;
  vet_id?: string;
  receiver_id?: string;
  vet?: string;
  category?: string;
  initialMessage?: string;
  productId?: string;
  productName?: string;
  productPrice?: string;
  starterMessage?: string;
  resetThread?: string;
};

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
  role?: string | null;
  business_name?: string | null;
  location?: string | null;
  business_number?: string | null;
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
};

type InvoiceMetadata = {
  order_id: string;
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
type Category = "Emergency Request" | "Vaccination" | "Routine Checks" | "General Inquiry" | "Others";

const getCategoryInitialMessage = (category: Category, vetName: string) => {
  switch (category) {
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
  value === "Emergency Request" || value === "Vaccination" || value === "Routine Checks" || value === "General Inquiry" || value === "Others";

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
      <Text style={styles.completeButtonText}>Order: {label}{canUpdate && (nextStatus || isCompleteAction) ? (isCompleteAction ? " (Complete)" : " →") : ""}</Text>
    </TouchableOpacity>
  );
}

function MerchantProfileModal({ visible, profile, onClose }: { visible: boolean; profile?: RecipientProfile; onClose: () => void }) {
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
          <Text style={styles.profileModalLabel}>Business Name</Text>
          <Text style={styles.profileModalValue}>{profile?.business_name || "N/A"}</Text>
          <Text style={styles.profileModalLabel}>Location</Text>
          <Text style={styles.profileModalValue}>{profile?.location || "N/A"}</Text>
          <Text style={styles.profileModalLabel}>Business Number</Text>
          <Text style={styles.profileModalValue}>{profile?.business_number || "N/A"}</Text>
          <Text style={styles.profileModalLabel}>Phone Number</Text>
          <Text style={styles.profileModalValue}>{profile?.phone_number || "N/A"}</Text>
        </View>
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
            <Text style={styles.protectionModalTitle}>🛡️ MVS Buyer Protection & 48-Hour Refund Policy</Text>
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
  headerActions: { width: "100%", flexGrow: 1, flexShrink: 1, minHeight: 44, maxHeight: 56, zIndex: 11, elevation: 6, overflow: "visible" },
  headerActionsContent: { flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: 8, zIndex: 12, elevation: 7 },
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
  consultationButton: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  startConsultationButton: { backgroundColor: "#10B981" },
  endConsultationButton: { backgroundColor: "#EF4444" },
  consultationButtonText: { color: "#FFFFFF", fontWeight: "700" },
  invoiceAction: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  prescriptionActionHeader: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#0E7490", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
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
  completeButton: { backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  patientButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  orderStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1C2541", borderColor: "#10B981", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  orderStatusGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewProfileButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  buyerProtectionButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#92400E", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  profileModalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#00000099", padding: 20 },
  profileModal: { width: "100%", maxWidth: 380, backgroundColor: "#1E293B", borderRadius: 14, padding: 20 },
  protectionModal: { width: "100%", maxWidth: 420, maxHeight: "88%", backgroundColor: "#1E293B", borderColor: "#92400E", borderWidth: 1, borderRadius: 14, padding: 20 },
  protectionModalTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", flex: 1, marginRight: 12 },
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
  patientClose: { alignSelf: "flex-end", padding: 8 },
  patientCloseText: { color: "#FFFFFF", fontWeight: "700" },
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
  messages: { padding: 16, flexGrow: 1 },
  messageRow: { marginBottom: 10 },
  thread: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155", borderRadius: 12, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  threadNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  threadDeleteButton: { padding: 4 },
  activeConsultBadge: { backgroundColor: "#065F46", borderColor: "#10B981", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  activeConsultBadgeText: { color: "#10B981", fontSize: 10, fontWeight: "700" },
  primary: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  messageTimestamp: { color: "#A7F3D0", fontSize: 10, alignSelf: "flex-end", marginTop: 5 },
  muted: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  message: { color: "#CBD5E1", fontSize: 12, marginTop: 7 },
  empty: { color: "#94A3B8", textAlign: "center", marginTop: 24 },
  bubble: { maxWidth: "84%", padding: 13, borderRadius: 12, marginBottom: 10 },
  outgoing: { alignSelf: "flex-end", backgroundColor: "#0E7490" },
  incoming: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  attachment: { width: 220, height: 180, borderRadius: 10, marginBottom: 8 },
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
  locationTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  locationAddress: { color: "#CBD5E1", fontSize: 12, marginTop: 3 },
  locationCoordinates: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
  liveLocationBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#064E3B" },
  liveLocationText: { color: "#D1FAE5", fontSize: 12, flex: 1 },
  stopLiveLocationText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.65)" },
  consultationTypeModal: { backgroundColor: "#1E293B", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 22, gap: 10 },
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
  composer: { padding: 12, borderTopWidth: 1, borderTopColor: "#334155", gap: 8 },
  composerRow: { flexDirection: "row", gap: 8, minHeight: 44 },
  selectedAttachment: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectedAttachmentImage: { width: 56, height: 56, borderRadius: 8 },
  recordingAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  recordingStatus: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#EF4444" },
  recordingTimer: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  recordingLabel: { color: "#94A3B8", fontSize: 13 },
  attach: { width: 44, borderRadius: 8, backgroundColor: "#475569", alignItems: "center", justifyContent: "center" },
  input: { backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155", borderRadius: 8, color: "#FFFFFF", padding: 11 },
  send: { width: 44, borderRadius: 8, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  voiceIdleMic: { width: 44, borderRadius: 8, backgroundColor: "#0E7490", alignItems: "center", justifyContent: "center" },
  recordingBar: { flex: 1, borderRadius: 8, backgroundColor: "#172554", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  unreadBadge: { minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginLeft: 8 },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  deleteActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 4 },
  deletePrompt: { color: "#FCA5A5", fontSize: 12, marginRight: 4 },
  deleteButton: { backgroundColor: "#DC2626", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  deleteButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  cancelButton: { backgroundColor: "#475569", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  cancelButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
} as const;

const appendUniqueMessage = (
  messages: RealtimeMessage[],
  newMessage: RealtimeMessage
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

  if (existingIndex === -1) return [...messages, newMessage];

  return messages.map((message, index) =>
    index === existingIndex ? newMessage : message
  );
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
  const conversationIdParam = firstParam(params.conversationId);
  const recipientIdParam = firstParam(params.recipientId);
  const merchantIdParam = firstParam(params.merchantId);
  const merchantNameParam = firstParam(params.merchantName);
  const vetIdParam = firstParam(params.vet_id);
  const receiverIdParam = firstParam(params.receiver_id);
  const vetParam = firstParam(params.vet);
  const categoryParam = firstParam(params.category);
  const productNameParam = firstParam(params.productName);
  const initialMessageParam = firstParam(params.initialMessage);
  const starterMessageParam = firstParam(params.starterMessage);
  const resetThreadParam = firstParam(params.resetThread);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userRole, setUserRole] = useState("client");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [recipientProfile, setRecipientProfile] = useState<RecipientProfile | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
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
  const [consultation, setConsultation] = useState<ConsultationRecord | null>(
    null
  );
  const [invoiceVisible, setInvoiceVisible] = useState(false);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [prescriptionVisible, setPrescriptionVisible] = useState(false);
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [patientFileVisible, setPatientFileVisible] = useState(false);
  const [patientPets, setPatientPets] = useState<PatientPet[]>([]);
  const [patientFileLoading, setPatientFileLoading] = useState(false);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [soapVisible, setSoapVisible] = useState(false);
  const [soapSubmitting, setSoapSubmitting] = useState(false);
  const [consultationTypeVisible, setConsultationTypeVisible] = useState(false);
  const [farmRecordsVisible, setFarmRecordsVisible] = useState(false);
  const [farmRecordsLoading, setFarmRecordsLoading] = useState(false);
  const [farmRecords, setFarmRecords] = useState<FarmRecord[]>([]);
  const [farmSelectionMode, setFarmSelectionMode] = useState(false);
  const [farmSoapVisible, setFarmSoapVisible] = useState(false);
  const [farmSoapSubmitting, setFarmSoapSubmitting] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
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

  useEffect(() => {
    let mounted = true;
    const loadInbox = async () => {
      try {
        const user = await getCurrentUser();
        const cleanUserId = normalizeUuid(user?.id);
        if (!cleanUserId) return;
        const roleResult = await supabase
          .from("profiles")
          .select("role")
          .eq("id", cleanUserId)
          .maybeSingle();
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .or(`sender_id.eq.${cleanUserId},receiver_id.eq.${cleanUserId}`)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []) as RealtimeMessage[];
        const participantIds = [
          ...new Set(
            rows
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
        const consultations = roleResult.data?.role === "merchant"
          ? { data: [], error: null }
          : await supabase
              .from("consultations")
              .select(
                "conversation_id, client_id, vet_id, merchant_id, status, deleted_by_user_ids"
              )
              .or(
                `client_id.eq.${cleanUserId},vet_id.eq.${cleanUserId},merchant_id.eq.${cleanUserId}`
              );
        if (consultations.error) throw consultations.error;
        const consultationRows = (consultations.data || []) as {
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
            ? await supabase
                .from("profiles")
                .select("id, full_name, email, role, business_name, location, business_number, phone_number")
                .in("id", allParticipantIds)
            : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const profileMap = new Map(
          (profiles.data || []).map((profile) => [profile.id, profile])
        );
        const grouped = new Map<string, RealtimeMessage[]>();
        for (const row of rows) {
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
        setUserRole(roleResult.data?.role || "client");
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
          .filter((thread) => !thread.deleted_by_user_ids.includes(cleanUserId))
          .sort((first, second) => getLatestThreadTime(second) - getLatestThreadTime(first));
        setThreads(activeThreads);
      } catch (error) {
        console.error("[Chat] Failed to load conversations:", error);
        if (mounted) {
          setThreads([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadInbox();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const inboxChannel = supabase
      .channel(`messages:inbox:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const incoming = payload.new as RealtimeMessage;
          if (
            incoming.sender_id !== currentUserId &&
            incoming.receiver_id !== currentUserId
          ) {
            return;
          }
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
            const updatedThread = {
              ...thread,
              messages: appendUniqueMessage(thread.messages, incoming).sort(
                (first, second) => first.created_at.localeCompare(second.created_at)
              ),
            };
            return [
              updatedThread,
              ...current.filter((_, index) => index !== threadIndex),
            ];
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(inboxChannel);
    };
  }, [currentUserId]);

  useEffect(() => {
    const routeRecipient = normalizeUuid(
      recipientIdParam || merchantIdParam || vetIdParam || receiverIdParam
    );
    const routeKey = conversationIdParam || "";
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
    const nextActive: Thread = {
      id: conversationIdFor(currentUserId, routeRecipient),
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
    categoryParam,
  ]);

  useEffect(() => {
    if (!active?.participantId) {
      setRecipientProfile(null);
      return;
    }
    let mounted = true;
    void supabase
      .from("profiles")
      .select("role, business_name, location, business_number, phone_number")
      .eq("id", active.participantId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) setRecipientProfile((data as RecipientProfile | null) || null);
      });
    return () => {
      mounted = false;
    };
  }, [active?.participantId]);

  useEffect(() => {
    if (
      !active ||
      !currentUserId ||
      !["client", "veterinarian", "vet"].includes(userRole) ||
      !["client", "veterinarian"].includes(active.participantRole)
    )
      return;
    let mounted = true;
    const loadConsultation = async () => {
      try {
        const { data: activeConsultations, error: lookupError } = await supabase
          .from("consultations")
          .select("id, conversation_id, client_id, vet_id, status")
          .eq("conversation_id", active.id)
          .not("status", "in", '("completed")')
          .order("created_at", { ascending: false })
          .limit(1);
        if (lookupError) throw lookupError;

        const existingConsultation = activeConsultations?.[0];
        if (existingConsultation) {
          if (mounted) setConsultation(existingConsultation as ConsultationRecord);
          return;
        }
        if (mounted) setConsultation(null);
      } catch (error) {
        console.error("[Consultation] Failed to ensure consultation:", error);
      }
    };
    void loadConsultation();
    const consultationChannel = supabase
      .channel(`consultations:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consultations", filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          if (mounted) setConsultation(payload.new as ConsultationRecord);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultations", filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          if (mounted) setConsultation(payload.new as ConsultationRecord);
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
    if (!active || !isUuid(currentUserId) || !isUuid(active.participantId))
      return;
    let mounted = true;
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${active.participantId}),and(sender_id.eq.${active.participantId},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: true });
      if (error || !mounted) return;
      const loadedMessages = (data || []) as RealtimeMessage[];
      const orderIds = loadedMessages
        .filter((item) => item.message_type === "invoice")
        .map((item) => (item.metadata as Partial<InvoiceMetadata> | null)?.order_id)
        .filter((orderId): orderId is string => Boolean(orderId));
      const isMerchantConversation = userRole === "merchant" || active.participantRole === "merchant";
      if (orderIds.length === 0 || !isMerchantConversation) {
        setMessages(loadedMessages);
        return;
      }
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, status")
        .in("id", orderIds);
      if (ordersError) {
        console.error("Error loading invoice statuses:", ordersError);
        setMessages(loadedMessages);
        return;
      }
      const orderStatusMap = new Map(orders?.map((order) => [order.id, order.status]) || []);
      setMessages(loadedMessages.map((item) => {
        const orderId = (item.metadata as Partial<InvoiceMetadata> | null)?.order_id;
        const status = orderId ? orderStatusMap.get(orderId) : undefined;
        return status ? { ...item, metadata: { ...item.metadata, status } } : item;
      }));
    };
    void loadMessages();
    const unsubscribe = subscribeToMessages(
      active.id,
      (incoming) => {
        if (mounted)
          setMessages((current) => appendUniqueMessage(current, incoming));
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
    setActive(thread);
    setMessages(thread.messages);
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

  const openPatientFile = async (): Promise<string | null> => {
    setPatientFileVisible(true);
    setPatientFileLoading(true);
    setPatientPets([]);
    setMedicalRecords([]);
    try {
      if (!active || !["vet", "veterinarian"].includes(userRole)) {
        console.warn("[Patient File] No active vet conversation available");
        return null;
      }
      const targetClientId = consultation?.client_id || active.participantId;
      if (!targetClientId) {
        console.warn("[Patient File] No client ID available");
        return null;
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
      if (selectedPetId) {
        const { data: records, error: recordsError } = await supabase
          .from("medical_records")
          .select("id, created_at, pet_id, weight_kg, temperature_c, heart_rate_bpm, subjective, objective, assessment, plan")
          .eq("pet_id", selectedPetId)
          .order("created_at", { ascending: false });
        if (recordsError) throw recordsError;
        setMedicalRecords((records || []) as MedicalRecord[]);
      }
      return selectedPetId;
    } catch (error) {
      console.error("[Patient File] Failed to load pets:", error);
      setPatientPets([]);
      setMedicalRecords([]);
      return null;
    } finally {
      setPatientFileLoading(false);
    }
  };

  const selectPatientPet = async (petId: string) => {
    setActivePetId(petId);
    const { data, error } = await supabase
      .from("medical_records")
      .select("id, created_at, pet_id, weight_kg, temperature_c, heart_rate_bpm, subjective, objective, assessment, plan")
      .eq("pet_id", petId)
      .order("created_at", { ascending: false });
    if (error) {
      Alert.alert("Unable to load history", error.message);
      setMedicalRecords([]);
      return;
    }
    setMedicalRecords((data || []) as MedicalRecord[]);
  };

  const openFarmRecords = async (selectFarm = false, openSoap = false) => {
    const clientId = consultation?.client_id || active?.participantId;
    if (!clientId) return;
    setFarmSelectionMode(selectFarm);
    setFarmRecordsVisible(true);
    setFarmRecordsLoading(true);
    try {
      const { data: farms, error: farmError } = await supabase
        .from("farm_records")
        .select("id, species, breed, flock_size, location, restock_date")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (farmError) throw farmError;
      const farmIds = (farms || []).map((farm) => farm.id);
      const { data: soapRecords, error: soapError } = farmIds.length
        ? await supabase
            .from("farm_soap_records")
            .select("id, farm_id, subjective, objective, tentative_diagnosis, plan, created_at")
            .in("farm_id", farmIds)
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
          return;
        }
        setSelectedFarmId(firstFarmId);
        setFarmRecordsVisible(false);
        setFarmSoapVisible(true);
      }
    } catch (error) {
      setFarmRecords([]);
      Alert.alert("Unable to load farm records", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setFarmRecordsLoading(false);
    }
  };

  const chooseFarmConsultation = async () => {
    setConsultationTypeVisible(false);
    await openFarmRecords(true, true);
  };

  const updateConsultation = async (status: ConsultationStatus) => {
    let currentConsultation = consultation;
    if (!currentConsultation) return;

    const previousStatus = currentConsultation.status;
    setConsultation((current) => (current ? { ...current, status } : current));

    try {
      const { error } = await supabase
        .from("consultations")
        .update({ status })
        .eq("id", currentConsultation.id)
        .eq("conversation_id", currentConsultation.conversation_id);
      if (error) throw error;
    } catch (error) {
      setConsultation((current) => (current ? { ...current, status: previousStatus } : current));
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
    const { data, error } = await supabase
      .from("consultations")
      .upsert(
        {
          conversation_id: active.id,
          client_id: currentUserId,
          vet_id: active.participantId,
          status: "active",
          created_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" }
      )
      .select("id, conversation_id, client_id, vet_id, status")
      .single();
    if (error) {
      console.error("[Consultation] Failed to start consultation:", error);
      Alert.alert("Unable to start consultation", error.message);
      return;
    }
    setConsultation(data as ConsultationRecord);
    setThreads((current) => current.map((thread) =>
      thread.id === active.id ? { ...thread, consultation_status: "active" } : thread
    ));
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
    const selectedPetId = activePetId || await openPatientFile();
    if (!selectedPetId) {
      Alert.alert("Select a patient", "Open Patient File and select a pet before ending the consultation.");
      return;
    }
    setActivePetId(selectedPetId);
    setSoapVisible(true);
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
      const { error } = await supabase.from("medical_records").insert({
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
      const { data: order, error } = await supabase
        .from("orders")
        .insert({ conversation_id: active.id, merchant_id: currentUserId, buyer_id: active.participantId, amount, platform_fee: amount * 0.10, vendor_payout: amount * 0.90, payout_status: "unsettled", status: "pending" })
        .select("id, amount, status")
        .single();
      if (error) throw error;
      const invoiceMetadata: InvoiceMetadata = { order_id: order.id, amount: Number(order.amount), items, note: cleanNote || undefined, seller_name: sellerName, seller_subaccount_id: sellerSubaccountId, status: "pending" };
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

  const payInvoice = async (orderId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "pending" })
      .eq("id", orderId)
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
      p_invoice_id: orderId,
      p_points: 100,
    });
    if (loyaltyError) {
      console.error("[Loyalty] Failed to award CarePass points:", loyaltyError);
    }
    setMessages((current) => current.map((item) => item.metadata && item.metadata.order_id === orderId ? { ...item, metadata: { ...item.metadata, status: "paid" } } : item));
      setActiveOrder((current) => (current?.id === orderId ? { ...current, status: "pending" } : current));
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
    if (messageToDelete.sender_id !== currentUserId) return;
    if (messageToDelete.id.startsWith("temp-")) {
      setMessages((current) =>
        current.filter((message) => message.id !== messageToDelete.id)
      );
      return;
    }
    setDeleteCandidate(messageToDelete);
  };

  const confirmDeleteMessage = async () => {
    if (!deleteCandidate) return;
    try {
      await deleteRealtimeMessage(deleteCandidate.id, currentUserId);
      setMessages((current) =>
        current.filter((message) => message.id !== deleteCandidate.id)
      );
      setDeleteCandidate(null);
    } catch (error) {
      console.error("[Supabase Chat Delete Error]:", error);
      Alert.alert(
        "Delete failed",
        error instanceof Error ? error.message : "Could not delete message."
      );
    }
  };

  const sendMessage = async () => {
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
      ["client", "veterinarian"].includes(active.participantRole)
    ) {
      try {
        const consultation = await ensureConsultationRecord(
          conversationId,
          cleanSenderId,
          cleanReceiverId,
          userRole,
          active.participantRole
        );
        if (consultation) {
          setConsultation({
            id: consultation.id,
            conversation_id: conversationId,
            client_id: userRole === "client" ? cleanSenderId : cleanReceiverId,
            vet_id: userRole === "client" ? cleanReceiverId : cleanSenderId,
            status: consultation.status,
          });
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
      message_type: "text",
      metadata: {
        sender_name: senderEmail,
        sender_email: senderEmail,
        client_generated_id: tempId,
      },
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
        message_type: "text",
        metadata: optimistic.metadata,
        media_url: uploaded?.publicUrl,
        media_type: uploaded?.mediaType,
      });
      setMessages((current) =>
        appendUniqueMessage(current, { ...confirmed, temp_id: tempId })
      );
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
        mediaTypes: ["images"],
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
        deleteCandidate={deleteCandidate}
        onConfirmDelete={confirmDeleteMessage}
        onCancelDelete={() => setDeleteCandidate(null)}
        consultation={consultation}
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
        <PatientFileOverlay visible={patientFileVisible} loading={patientFileLoading} pets={patientPets} activePetId={activePetId} records={medicalRecords} userRole={userRole} onSelectPet={(petId) => void selectPatientPet(petId)} onClose={() => setPatientFileVisible(false)} />
        <SoapConsultationModal visible={soapVisible} submitting={soapSubmitting} onClose={() => setSoapVisible(false)} onSubmit={createMedicalRecord} />
        <ConsultationTypeModal visible={consultationTypeVisible} onClose={() => setConsultationTypeVisible(false)} onPet={() => { void beginPetConsultation(); }} onFarm={() => { void chooseFarmConsultation(); }} />
        <FarmRecordsModal visible={farmRecordsVisible} loading={farmRecordsLoading} records={farmRecords} selectFarm={farmSelectionMode} onClose={() => setFarmRecordsVisible(false)} onSelectFarm={(farmId) => { setFarmRecordsVisible(false); setSelectedFarmId(farmId); setFarmSoapVisible(true); }} />
        <FarmSoapModal visible={farmSoapVisible} submitting={farmSoapSubmitting} onClose={() => setFarmSoapVisible(false)} onSubmit={createFarmSoapRecord} />
      </View>
    );

  return (
    <SafeAreaView style={styles.container}>
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
  deleteCandidate,
  onConfirmDelete,
  onCancelDelete,
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
  onSend: () => void;
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
  deleteCandidate: RealtimeMessage | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  consultation: ConsultationRecord | null;
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
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesScrollRef = useRef<ScrollView>(null);
  const [buyerProtectionVisible, setBuyerProtectionVisible] = useState(false);
  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    []
  );

  const startDeletePress = (item: RealtimeMessage) => {
    if (item.sender_id !== currentUserId) return;
    pressTimer.current = setTimeout(() => onDeleteMessage(item), 600);
  };

  const isPetParent = userRole === "client" || consultation?.client_id === currentUserId;
  const isVetClientThread =
    (["vet", "veterinarian"].includes(userRole) && active.participantRole === "client") ||
    (userRole === "client" && ["vet", "veterinarian"].includes(active.participantRole));
  const consultationStatus = consultation?.status || null;
  const isMerchantConversation = userRole === "merchant" || active.participantRole === "merchant";
  const showInvoiceAction = canCreateInvoice && (!isMerchantConversation || userRole === "merchant");
  const roomConsultation = consultation;

  const cancelDeletePress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

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
        deleteCandidate={deleteCandidate}
        onConfirmDelete={onConfirmDelete}
        onCancelDelete={onCancelDelete}
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
    <SafeAreaView style={styles.container}>
      <View style={styles.roomHeader}>
        <View style={styles.headerTopRow}>
        <TouchableOpacity onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {active.productName || active.participantName}
          </Text>
          <Text style={styles.subtitle}>
            {active.productName
              ? `${active.participantName} · Marketplace`
              : active.participantName}
          </Text>
        </View>
        </View>
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.headerActions}
          contentContainerStyle={styles.headerActionsContent}
        >
        {isMerchantConversation ? <OrderStatusBadge order={activeOrder} canUpdate={userRole === "merchant"} canCreate={userRole === "merchant"} onUpdate={onUpdateOrderStatus} onCreate={onCreateOrder} recipientProfile={recipientProfile} /> : null}
        {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
          <TouchableOpacity
            style={styles.patientButton}
            onPress={onOpenPatientFile}
          >
            <MaterialCommunityIcons
              name="file-account"
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.completeButtonText}>Patient File</Text>
          </TouchableOpacity>
        ) : null}
        {userRole === "vet" || userRole === "veterinarian" ? (
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
        {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
          <TouchableOpacity style={styles.prescriptionActionHeader} onPress={onOpenPrescription}>
            <MaterialCommunityIcons name="prescription" size={17} color="#FFFFFF" />
            <Text style={styles.completeButtonText}>Prescribe</Text>
          </TouchableOpacity>
        ) : null}
        {isVetClientThread && consultationStatus === "active" ? (
          <>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={isPetParent ? onToggleConsultation : onEndConsultationByVet}
            >
              <Text style={styles.completeButtonText}>
                End Consultation
              </Text>
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
            <Text style={styles.completeButtonText}>🛡️ Buyer Protection</Text>
          </TouchableOpacity>
        ) : null}
        </ScrollView>
      </View>
      <BuyerProtectionModal visible={buyerProtectionVisible} onClose={() => setBuyerProtectionVisible(false)} />
      {isVetClientThread && consultationStatus ? (
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
        onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={styles.messages}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            No messages yet. Start the conversation.
          </Text>
        ) : (
          messages.map((item) => (
            <View key={item.id} style={styles.messageRow}>
              <TouchableOpacity
                {...(item.sender_id === currentUserId
                  ? contextMenuProps(() => onDeleteMessage(item))
                  : {})}
                activeOpacity={0.8}
                onPressIn={() => startDeletePress(item)}
                onPressOut={cancelDeletePress}
                onPress={() => {
                  if (item.location_data) {
                    openSafeExternalUrl(`https://www.google.com/maps/search/?api=1&query=${item.location_data.latitude},${item.location_data.longitude}`);
                  }
                }}
                disabled={item.sender_id !== currentUserId && !item.location_data}
                style={[
                  styles.bubble,
                  item.sender_id === currentUserId
                    ? styles.outgoing
                    : styles.incoming,
                ]}
              >
                {item.media_url && item.media_type === "image" ? (
                  <Image
                    source={{ uri: item.media_url }}
                    style={styles.attachment}
                  />
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
              </TouchableOpacity>
              {deleteCandidate?.id === item.id ? (
                <View style={styles.deleteActions}>
                  <Text style={styles.deletePrompt}>Delete this message?</Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={onConfirmDelete}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onCancelDelete}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.composer}>
        {selectedImageUri ? (
          <View style={styles.selectedAttachment}>
            <Image source={{ uri: selectedImageUri }} style={styles.selectedAttachmentImage} />
            <TouchableOpacity onPress={onRemoveImage} accessibilityLabel="Remove selected image">
              <MaterialCommunityIcons name="close-circle" size={24} color="#F87171" />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.composerRow}>
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
            <TextInput value={message} onChangeText={setMessage} selection={message ? { start: message.length, end: message.length } : undefined} placeholder="Write a message..." placeholderTextColor="#64748B" style={[styles.input, styles.flex]} multiline />
            {message.trim() || selectedImageUri ? (
              <TouchableOpacity style={styles.send} onPress={onSend}>
                <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
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
      {invoiceVisible ? <InvoiceModal visible={invoiceVisible} onClose={onCloseInvoice} onSubmit={onCreateInvoice} submitting={invoiceSubmitting} /> : null}
      <PrescriptionModal visible={prescriptionVisible} onClose={onClosePrescription} onSubmit={onCreatePrescription} submitting={prescriptionSubmitting} />
    </SafeAreaView>
  );
}
function VoiceNoteMessage({ mediaUrl }: { mediaUrl: string }) {
  const player = useAudioPlayer(mediaUrl, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const positionMillis = status.currentTime * 1000;
  const durationMillis = status.duration * 1000;
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const togglePlayback = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  const cyclePlaybackSpeed = () => {
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    player.setPlaybackRate(nextSpeed);
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
            <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
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
        <Text style={styles.locationTitle}>📍 Shared Location</Text>
        {location.addressName ? <Text style={styles.locationAddress}>{location.addressName}</Text> : null}
        <Text style={styles.locationCoordinates}>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </Text>
      </View>
    </View>
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
              <Text style={styles.locationOptionText}>Send Photo</Text>
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

function PatientFileOverlay({ visible, loading, pets, activePetId, records, userRole, onSelectPet, onClose }: { visible: boolean; loading: boolean; pets: PatientPet[]; activePetId: string | null; records: MedicalRecord[]; userRole: string; onSelectPet: (petId: string) => void; onClose: () => void }) {
  const [historyVersion, setHistoryVersion] = useState(0);
  if (!visible) return null;
  return <View style={styles.patientOverlay}><View style={styles.patientSheet}><TouchableOpacity onPress={onClose} style={styles.patientClose}><Text style={styles.patientCloseText}>Close ✕</Text></TouchableOpacity><Text style={styles.patientTitle}>Patient File</Text>{loading ? <ActivityIndicator color="#10B981" /> : pets.length === 0 ? <Text style={styles.empty}>No patient record found for this client</Text> : <ScrollView>{pets.map((pet) => <View key={`${pet.id}-${historyVersion}`} style={styles.patientPet}>{pet.photos?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientGallery}>{pet.photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.patientPhoto} />)}</ScrollView> : null}<TouchableOpacity onPress={() => onSelectPet(pet.id)}><Text style={styles.patientPetName}>{pet.name}{activePetId === pet.id ? "  • Selected" : ""}</Text></TouchableOpacity><Text style={styles.patientDetail}>{pet.type} · {pet.breed || "Breed unknown"} · {formatPatientAge(pet.dob)}</Text><Text style={styles.patientLabel}>Vaccination</Text><Text style={styles.patientDetail}>{pet.vaccination_status || "Not provided"}</Text><Text style={styles.patientLabel}>Medical Notes & History</Text><Text style={styles.patientDetail}>{pet.medical_notes || "No medical notes provided."}</Text>{activePetId === pet.id ? <><Text style={styles.patientLabel}>SOAP History</Text>{records.length === 0 ? <Text style={styles.patientDetail}>No consultation records found.</Text> : records.map((record) => <View key={record.id} style={{ backgroundColor: "#1C2541", borderRadius: 8, padding: 10, marginTop: 8 }}><Text style={styles.patientDetail}>{new Date(record.created_at).toLocaleDateString()}</Text><Text style={styles.patientLabel}>Vitals</Text><Text style={styles.patientDetail}>Weight: {record.weight_kg ?? "-"} kg · Temp: {record.temperature_c ?? "-"} °C · Heart rate: {record.heart_rate_bpm ?? "-"} bpm</Text><Text style={styles.patientLabel}>Assessment</Text><Text style={styles.patientDetail}>{record.assessment}</Text><Text style={styles.patientLabel}>Subjective</Text><Text style={styles.patientDetail}>{record.subjective}</Text><Text style={styles.patientLabel}>Objective</Text><Text style={styles.patientDetail}>{record.objective || "-"}</Text><Text style={styles.patientLabel}>Plan</Text><Text style={styles.patientDetail}>{record.plan}</Text></View>)}</> : null}<PetMedicalHistory key={`history-${pet.id}-${historyVersion}`} petId={pet.id} />{userRole === "vet" || userRole === "veterinarian" ? <VetMedicalLogForm petId={pet.id} onSaved={() => setHistoryVersion((version) => version + 1)} /> : null}</View>)}</ScrollView>}</View></View>;
}

function ConsultationTypeModal({ visible, onClose, onPet, onFarm }: { visible: boolean; onClose: () => void; onPet: () => void; onFarm: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.consultationTypeModal}><Text style={styles.invoiceModalTitle}>Which type of consultation summary are you completing?</Text><TouchableOpacity style={styles.consultationTypeButton} onPress={onPet}><Text style={styles.completeButtonText}>Pet Consultation</Text></TouchableOpacity><TouchableOpacity style={styles.consultationTypeButton} onPress={onFarm}><Text style={styles.completeButtonText}>Farm Consultation</Text></TouchableOpacity><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity></View></View></Modal>;
}

function FarmRecordsModal({ visible, loading, records, selectFarm, onClose, onSelectFarm }: { visible: boolean; loading: boolean; records: FarmRecord[]; selectFarm: boolean; onClose: () => void; onSelectFarm: (farmId: string) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.patientOverlay}><View style={styles.farmRecordsSheet}><View style={styles.patientHeader}><Text style={styles.patientTitle}>Farm & Livestock Records</Text><TouchableOpacity onPress={onClose} style={styles.patientClose}><Text style={styles.patientCloseText}>Close</Text></TouchableOpacity></View>{loading ? <ActivityIndicator color="#10B981" /> : records.length === 0 ? <Text style={styles.empty}>No farm records found for this client.</Text> : <ScrollView style={styles.farmRecordsScroll} contentContainerStyle={styles.farmRecordsContent}>{records.map((farm) => <View key={farm.id} style={styles.farmRecordCard}><TouchableOpacity disabled={!selectFarm} onPress={selectFarm ? () => onSelectFarm(farm.id) : undefined}><Text style={styles.primary}>{farm.species}</Text><Text style={styles.farmRecordDetail}>Breed: {farm.breed || "Not specified"}</Text><Text style={styles.farmRecordDetail}>Flock Size: {farm.flock_size ?? 0}</Text><Text style={styles.farmRecordDetail}>Location: {farm.location || "Not specified"}</Text><Text style={styles.farmRecordDetail}>Restock Date: {farm.restock_date || "Not specified"}</Text>{farm.soapRecords?.length ? <View><Text style={styles.farmRecordHistory}>SOAP History</Text>{farm.soapRecords.map((soap) => <View key={soap.id} style={styles.farmSoapHistory}><Text style={styles.farmRecordDetail}>{new Date(soap.created_at).toLocaleDateString()}</Text>{soap.subjective ? <Text style={styles.farmRecordDetail}>Symptoms: {soap.subjective}</Text> : null}{soap.objective ? <Text style={styles.farmRecordDetail}>Findings: {soap.objective}</Text> : null}{soap.tentative_diagnosis ? <Text style={styles.farmRecordDetail}>Tentative Diagnosis: {soap.tentative_diagnosis}</Text> : null}{soap.plan ? <Text style={styles.farmRecordDetail}>Plan: {soap.plan}</Text> : null}</View>)}</View> : <Text style={styles.farmRecordDetail}>No SOAP history</Text>}</TouchableOpacity></View>)}</ScrollView>}</View></View></Modal>;
}

function FarmSoapModal({ visible, submitting, onClose, onSubmit }: { visible: boolean; submitting: boolean; onClose: () => void; onSubmit: (draft: FarmSoapDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<FarmSoapDraft>({ subjective: "", objective: "", tentative_diagnosis: "", plan: "" });
  const update = (field: keyof FarmSoapDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.prescriptionModal}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>Farm Consultation Summary</Text><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.prescriptionForm}>{(["subjective", "objective", "tentative_diagnosis", "plan"] as const).map((field) => <View key={field}><Text style={styles.prescriptionLabel}>{field === "subjective" ? "Symptoms & Owner Complaints" : field === "objective" ? "Farm Findings" : field === "tentative_diagnosis" ? "Tentative Diagnosis" : "Treatment Plan & Follow-up"}</Text><TextInput value={draft[field]} onChangeText={(value) => update(field, value)} multiline placeholder="Enter details" placeholderTextColor="#64748B" style={[styles.input, styles.prescriptionInstructionsInput]} /></View>)}<TouchableOpacity style={styles.prescriptionSubmit} onPress={() => void onSubmit(draft)} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Saving..." : "Save & End Consultation"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
}

function SoapConsultationModal({ visible, submitting, onClose, onSubmit }: { visible: boolean; submitting: boolean; onClose: () => void; onSubmit: (draft: SoapDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<SoapDraft>({ weightKg: "", temperatureC: "", heartRateBpm: "", subjective: "", objective: "", assessment: "", plan: "" });
  const update = (field: keyof SoapDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.prescriptionModal, { backgroundColor: "#1C2541" }]}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>SOAP Consultation Summary</Text><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.prescriptionForm}><Text style={styles.prescriptionLabel}>Vitals</Text><View style={{ flexDirection: "row", gap: 8 }}><TextInput value={draft.weightKg} onChangeText={(value) => update("weightKg", value)} keyboardType="decimal-pad" placeholder="Weight (kg)" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /><TextInput value={draft.temperatureC} onChangeText={(value) => update("temperatureC", value)} keyboardType="decimal-pad" placeholder="Temp (°C)" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /><TextInput value={draft.heartRateBpm} onChangeText={(value) => update("heartRateBpm", value)} keyboardType="number-pad" placeholder="Heart rate" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /></View>{(["subjective", "objective", "assessment", "plan"] as const).map((field) => <View key={field}><Text style={styles.prescriptionLabel}>{field === "subjective" ? "Symptoms & Owner Complaints" : field === "objective" ? "Clinical Findings" : field === "assessment" ? "Diagnosis / Primary Concern" : "Treatment Plan & Follow-up"}</Text><TextInput value={draft[field]} onChangeText={(value) => update(field, value)} multiline placeholder="Enter details" placeholderTextColor="#64748B" style={[styles.input, styles.prescriptionInstructionsInput]} /></View>)}<TouchableOpacity style={styles.prescriptionSubmit} onPress={() => void onSubmit(draft)} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Saving..." : "Save & End Consultation"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
}

function InvoiceMessage({ item, currentUserId, onPayInvoice }: { item: RealtimeMessage; currentUserId: string; onPayInvoice: (orderId: string) => Promise<void> }) {
  const metadata = (item.metadata || {}) as Partial<InvoiceMetadata>;
  const [customer, setCustomer] = useState<{ email: string; name: string } | null>(null);
  const isBuyer = item.receiver_id === currentUserId && item.sender_id !== currentUserId;
  const isPendingInvoice = metadata.status === "pending" && Boolean(metadata.order_id) && isBuyer;

  useEffect(() => {
    if (!isPendingInvoice) return;
    void getCurrentUser().then((user) => {
      if (user?.email) setCustomer({ email: user.email, name: user.user_metadata?.full_name || user.user_metadata?.name || user.email });
    });
  }, [isPendingInvoice]);

  const handlePaymentSuccess = (response: unknown) => {
    const paymentResponse = response as { status?: string; transaction_id?: string };
    if (paymentResponse.status === "successful" || paymentResponse.transaction_id) {
      void onPayInvoice(metadata.order_id || "");
      return;
    }
    Alert.alert("Payment not completed", "Payment was not completed. Please try again.");
  };

  const handleWebPayment = () => {
    if (!customer || !metadata.order_id) return;
    handleFlutterwaveWebPayment({
      public_key: FLUTTERWAVE_CONFIG.PUBLIC_KEY,
      tx_ref: metadata.order_id,
      amount: Number(metadata.amount),
      currency: "NGN",
      customer,
      subaccounts: metadata.seller_subaccount_id ? [{ id: metadata.seller_subaccount_id, transaction_split_ratio: 90 }] : undefined,
      onSuccess: handlePaymentSuccess,
      onClose: () => Alert.alert("Payment not completed", "Payment was not completed. Please try again."),
    });
  };

  const payButton = isPendingInvoice && customer ? Platform.OS === "web" ? <TouchableOpacity style={styles.payButton} onPress={handleWebPayment}><Text style={styles.payButtonText}>Pay Now</Text></TouchableOpacity> : <PayWithFlutterwave style={styles.payButton} options={{ authorization: FLUTTERWAVE_CONFIG.PUBLIC_KEY, tx_ref: metadata.order_id || "", amount: Number(metadata.amount), currency: "NGN", payment_options: "card,ussd,account_transfer", customer, subaccounts: metadata.seller_subaccount_id ? [{ id: metadata.seller_subaccount_id, transaction_split_ratio: 90 }] : undefined, customizations: { title: "Mobile Vet Invoice Payment", description: metadata.note || "Service / Product Payment" } }} onRedirect={handlePaymentSuccess} onAbort={() => Alert.alert("Payment not completed", "Payment was not completed. Please try again.")} onInitializeError={() => Alert.alert("Payment not completed", "Payment was not completed. Please try again.")} customButton={({ disabled, onPress }) => <TouchableOpacity style={styles.payButton} onPress={onPress} disabled={disabled}><Text style={styles.payButtonText}>Pay Now</Text></TouchableOpacity>} /> : null;

  return <View style={styles.invoiceCard}><Text style={styles.invoiceTitle}>Invoice</Text><Text style={styles.invoiceSeller}>Seller: {metadata.seller_name || "Seller"}</Text><Text style={styles.invoiceAmount}>₦{Number(metadata.amount || 0).toLocaleString("en-NG")}</Text>{metadata.items?.map((invoiceItem, index) => <View key={`${invoiceItem.description}-${index}`} style={styles.invoiceBreakdownRow}><Text style={styles.invoiceBreakdownName}>{invoiceItem.description}</Text><Text style={styles.invoiceBreakdownAmount}>NGN {Number(invoiceItem.amount).toLocaleString("en-NG")}</Text></View>)}{metadata.note ? <Text style={styles.invoiceNote}>{metadata.note}</Text> : null}<View style={styles.invoiceFooter}><View style={[styles.pendingBadge, metadata.status === "paid" && styles.paidBadge]}><Text style={[styles.pendingBadgeText, metadata.status === "paid" && styles.paidBadgeText]}>{metadata.status === "paid" ? "Paid" : "Pending"}</Text></View>{payButton}</View></View>;
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

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.invoiceOverlay}><View style={styles.invoiceModal}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>Create Invoice</Text><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.invoiceForm}><Text style={styles.invoiceLabel}>Invoice Items</Text>{items.map((item, index) => <View key={item.id} style={styles.invoiceItemRow}><TextInput value={item.description} onChangeText={(value) => updateItem(index, "description", value)} placeholder="Service or treatment" placeholderTextColor="#64748B" style={[styles.input, styles.invoiceDescriptionInput]} /><TextInput value={item.amount ? String(item.amount) : ""} onChangeText={(value) => updateItem(index, "amount", value)} keyboardType="decimal-pad" placeholder="Amount" placeholderTextColor="#64748B" style={[styles.input, styles.invoiceAmountInput]} /><TouchableOpacity style={styles.invoiceDeleteButton} onPress={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><MaterialCommunityIcons name="delete-outline" size={20} color="#F87171" /></TouchableOpacity></View>)}<TouchableOpacity style={styles.addInvoiceItem} onPress={() => setItems((current) => { const nextItemNumber = current.reduce((max, currentItem) => Math.max(max, Number(currentItem.id) || 0), 0) + 1; return [...current, { id: String(nextItemNumber), description: `Item ${nextItemNumber}`, amount: 1000 }]; })}><MaterialCommunityIcons name="plus" size={17} color="#60A5FA" /><Text style={styles.addInvoiceItemText}>Add item</Text></TouchableOpacity><Text style={styles.invoiceTotal}>Total: NGN {subtotal.toLocaleString("en-NG")}</Text><Text style={styles.invoiceLabel}>Note or description (optional)</Text><TextInput value={note} onChangeText={setNote} placeholder="Additional clinical context..." placeholderTextColor="#64748B" style={[styles.input, styles.invoiceNoteInput]} multiline /><TouchableOpacity style={styles.sendButton} onPress={submit} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Creating..." : "Create Invoice"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
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
  deleteCandidate,
  onConfirmDelete,
  onCancelDelete,
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
  onSend: () => void;
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
  deleteCandidate: RealtimeMessage | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
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
  const [buyerProtectionVisible, setBuyerProtectionVisible] = useState(false);
  const isConsultActive = consultation.status === "active";
  const isPetParent =
    currentUserId === consultation.client_id || userRole === "client";
  const isVetClientThread =
    (["vet", "veterinarian"].includes(userRole) && active.participantRole === "client") ||
    (userRole === "client" && ["vet", "veterinarian"].includes(active.participantRole));
  const isMerchantConversation = userRole === "merchant" || active.participantRole === "merchant";
  const showInvoiceAction = canCreateInvoice && (!isMerchantConversation || userRole === "merchant");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.roomHeader}>
        <View style={styles.headerTopRow}>
        <TouchableOpacity onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {active.productName || active.participantName}
          </Text>
          <Text style={styles.subtitle}>
            {active.productName
              ? `${active.participantName} · Marketplace`
              : active.participantName}
          </Text>
        </View>
        </View>
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.headerActions}
          contentContainerStyle={styles.headerActionsContent}
        >
          {isMerchantConversation ? <OrderStatusBadge order={activeOrder} canUpdate={userRole === "merchant"} canCreate={userRole === "merchant"} onUpdate={onUpdateOrderStatus} onCreate={onCreateOrder} recipientProfile={recipientProfile} /> : null}
          {isVetClientThread && ["vet", "veterinarian"].includes(userRole) ? (
            <TouchableOpacity
              style={styles.patientButton}
              onPress={onOpenPatientFile}
            >
              <MaterialCommunityIcons
                name="file-account"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.completeButtonText}>Patient File</Text>
            </TouchableOpacity>
          ) : null}
          {userRole === "vet" || userRole === "veterinarian" ? (
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
                isConsultActive
                  ? styles.endConsultationButton
                  : styles.startConsultationButton,
              ]}
              onPress={onToggleConsultation}
            >
              <Text style={styles.consultationButtonText}>
                End Consultation
              </Text>
            </TouchableOpacity>
          ) : isVetClientThread && isConsultActive ? (
            <TouchableOpacity
              style={styles.endConsultationButton}
              onPress={onEndConsultationByVet}
            >
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
              <Text style={styles.completeButtonText}>🛡️ Buyer Protection</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
      <BuyerProtectionModal visible={buyerProtectionVisible} onClose={() => setBuyerProtectionVisible(false)} />
      {isVetClientThread ? (
        <View
          style={[
            styles.consultationBanner,
            isConsultActive
              ? styles.consultationActive
              : styles.consultationCompleted,
          ]}
        >
          <View style={styles.consultationStatus}>
            <View
              style={[
                styles.consultationIndicator,
                isConsultActive
                  ? styles.consultationIndicatorActive
                  : styles.consultationIndicatorCompleted,
              ]}
            />
            <Text style={styles.consultationText}>
              {isConsultActive ? "Active Consultation" : "Consultation Ended"}
            </Text>
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
      <ScrollView
        ref={messagesScrollRef}
        onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={styles.messages}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            No messages yet. Start the conversation.
          </Text>
        ) : (
          messages.map((item) => (
            <View key={item.id} style={styles.messageRow}>
              <TouchableOpacity
                {...(item.sender_id === currentUserId
                  ? contextMenuProps(() => onDeleteMessage(item))
                  : {})}
                activeOpacity={0.8}
                onPressIn={item.location_data ? undefined : () => {
                  if (item.sender_id === currentUserId)
                    setTimeout(() => onDeleteMessage(item), 600);
                }}
                onLongPress={item.location_data ? () => onDeleteMessage(item) : undefined}
                delayLongPress={item.location_data ? 300 : undefined}
                onPress={() => {
                  if (item.location_data) {
                    openSafeExternalUrl(`https://www.google.com/maps/search/?api=1&query=${item.location_data.latitude},${item.location_data.longitude}`);
                  }
                }}
                disabled={item.sender_id !== currentUserId && !item.location_data}
                style={[
                  styles.bubble,
                  item.sender_id === currentUserId
                    ? styles.outgoing
                    : styles.incoming,
                ]}
              >
                {item.media_url && item.media_type === "image" ? (
                  <Image
                    source={{ uri: item.media_url }}
                    style={styles.attachment}
                  />
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
              </TouchableOpacity>
              {deleteCandidate?.id === item.id ? (
                <View style={styles.deleteActions}>
                  <Text style={styles.deletePrompt}>Delete this message?</Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={onConfirmDelete}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onCancelDelete}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.composer}>
        {selectedImageUri ? (
          <View style={styles.selectedAttachment}>
            <Image source={{ uri: selectedImageUri }} style={styles.selectedAttachmentImage} />
            <TouchableOpacity onPress={onRemoveImage} accessibilityLabel="Remove selected image">
              <MaterialCommunityIcons name="close-circle" size={24} color="#F87171" />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.composerRow}>
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
            <TextInput value={message} onChangeText={setMessage} selection={message ? { start: message.length, end: message.length } : undefined} placeholder="Write a message..." placeholderTextColor="#64748B" style={[styles.input, styles.flex]} multiline />
            {message.trim() || selectedImageUri ? (
              <TouchableOpacity style={styles.send} onPress={onSend}>
                <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
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
      {invoiceVisible ? <InvoiceModal visible={invoiceVisible} onClose={onCloseInvoice} onSubmit={onCreateInvoice} submitting={invoiceSubmitting} initialItems={invoiceItems} /> : null}
      <PrescriptionModal visible={prescriptionVisible} onClose={onClosePrescription} onSubmit={onCreatePrescription} submitting={prescriptionSubmitting} />
    </SafeAreaView>
  );
}


