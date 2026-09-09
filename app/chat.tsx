import { MaterialCommunityIcons } from "@expo/vector-icons";
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
    SafeAreaView,
    ScrollView,
    StyleSheet,
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
};

type Thread = {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: string;
  consultation_status?: ConsultationStatus;
  productName?: string;
  messages: RealtimeMessage[];
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

type ConsultationRecord = {
  id: string;
  conversation_id: string;
  client_id: string;
  vet_id: string;
  status: ConsultationStatus;
};

type InvoiceMetadata = {
  order_id: string;
  amount: number;
  note?: string;
  seller_name: string;
  status: "pending" | "paid" | "completed";
  seller_subaccount_id?: string;
};

type InvoiceProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (amount: number, note: string) => Promise<void>;
  submitting: boolean;
  initialItems?: InvoiceItem[];
};

type InvoiceItem = { description: string; amount: number };

const formatPatientAge = calculatePetAgeInWeeks;

const parseInvoiceItems = (answer: string): InvoiceItem[] => {
  const jsonMatch = answer.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        const items = parsed
          .map((item) => ({ description: String(item.description || item.name || "").trim(), amount: Number(item.amount) }))
          .filter((item) => item.description && Number.isFinite(item.amount) && item.amount > 0);
        if (items.length > 0) return items;
      }
    } catch {
      // Fall back to parsing readable itemized lines.
    }
  }

  const items: InvoiceItem[] = [];
  const linePattern = /^\s*(?:[-*•]\s*)?(.+?)\s*[:|-]\s*(?:NGN|₦)\s*([\d,]+(?:\.\d+)?)/gim;
  for (const match of answer.matchAll(linePattern)) {
    const amount = Number(match[2].replace(/,/g, ""));
    if (match[1].trim() && Number.isFinite(amount) && amount > 0) {
      items.push({ description: match[1].trim(), amount });
    }
  }
  return items;
};

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const conversationIdFor = (firstId: string, secondId: string) => {
  const ids = [firstId, secondId].sort();
  return `conv_${ids[0]}_${ids[1]}`;
};

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
  const [currentUserId, setCurrentUserId] = useState("");
  const [userRole, setUserRole] = useState("client");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [message, setMessage] = useState(
    initialMessageParam || starterMessageParam || ""
  );
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [attachmentVisible, setAttachmentVisible] = useState(false);
  const [locationVisible, setLocationVisible] = useState(false);
  const [liveLocationActive, setLiveLocationActive] = useState(false);
  const [activeLiveMessageId, setActiveLiveMessageId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<RealtimeMessage | null>(null);
  const [consultation, setConsultation] = useState<ConsultationRecord | null>(
    null
  );
  const [invoiceVisible, setInvoiceVisible] = useState(false);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [aiInvoiceLoading, setAiInvoiceLoading] = useState(false);
  const [patientFileVisible, setPatientFileVisible] = useState(false);
  const [patientPets, setPatientPets] = useState<PatientPet[]>([]);
  const [patientFileLoading, setPatientFileLoading] = useState(false);
  const openedRoute = useRef<string | null>(null);
  const liveLocationSubscription = useRef<Location.LocationSubscription | null>(null);
  const activeLiveMessageIdRef = useRef<string | null>(null);
  const stoppedLiveMessageIds = useRef<Set<string>>(new Set());
  const { counts: unreadCounts, refreshUnreadCounts } = useUnreadMessages();

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
        const profiles =
          participantIds.length > 0
            ? await supabase
                .from("profiles")
                .select("id, full_name, email, role")
                .in("id", participantIds)
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
          if (!participantId) continue;
          grouped.set(participantId, [
            ...(grouped.get(participantId) || []),
            row,
          ]);
        }
        const conversationIds = [...grouped.keys()].map((participantId) =>
          conversationIdFor(cleanUserId, participantId)
        );
        const consultations =
          conversationIds.length > 0
            ? await supabase
                .from("consultations")
                .select("conversation_id, status")
                .in("conversation_id", conversationIds)
            : { data: [], error: null };
        if (consultations.error) throw consultations.error;
        const consultationStatusMap = new Map(
          (consultations.data || []).map((consultation) => [
            consultation.conversation_id,
            consultation.status as ConsultationStatus,
          ])
        );
        if (!mounted) return;
        setCurrentUserId(cleanUserId);
        setUserRole(roleResult.data?.role || "client");
        setThreads(
          Array.from(grouped.entries())
            .map(([participantId, participantMessages]) => {
              const profile = profileMap.get(participantId);
              const conversationId = conversationIdFor(
                cleanUserId,
                participantId
              );
              return {
                id: conversationId,
                participantId,
                participantName:
                  profile?.full_name || profile?.email || "Contact",
                participantRole: profile?.role || "user",
                consultation_status: consultationStatusMap.get(conversationId),
                messages: [...participantMessages].sort((first, second) =>
                  first.created_at.localeCompare(second.created_at)
                ),
              };
            })
            .sort(
              (first, second) =>
                Number(second.consultation_status === "active") -
                Number(first.consultation_status === "active")
            )
        );
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
  }, []);

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
    )
      return;
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
      setMessage(initialMessageParam || starterMessageParam || "");
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
  ]);

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
        const ensured = await ensureConsultationRecord(
          active.id,
          currentUserId,
          active.participantId,
          userRole,
          active.participantRole
        );
        if (!ensured) {
          if (mounted) setConsultation(null);
          return;
        }
        const { data, error } = await supabase
          .from("consultations")
          .select("id, conversation_id, client_id, vet_id, status")
          .eq("id", ensured.id)
          .single();
        if (error) throw error;
        if (mounted) setConsultation(data as ConsultationRecord);
      } catch (error) {
        console.error("[Consultation] Failed to ensure consultation:", error);
      }
    };
    void loadConsultation();
    return () => {
      mounted = false;
    };
  }, [active, currentUserId, userRole]);

  useEffect(() => {
    if (!initialMessageParam) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMessage(initialMessageParam);
    });
    return () => {
      cancelled = true;
    };
  }, [initialMessageParam, categoryParam]);

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
      if (orderIds.length === 0) {
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
  }, [active, currentUserId]);

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
    const stoppedMessageIds = stoppedLiveMessageIds.current;
    return () => {
      liveLocationSubscription.current?.remove();
      liveLocationSubscription.current = null;
      setLiveLocationActive(false);
      activeLiveMessageIdRef.current = null;
      setActiveLiveMessageId(null);
      stoppedMessageIds.clear();
    };
  }, [active]);

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

  const getLocationData = async (location: Location.LocationObject) => {
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
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      addressName,
    };
  };

  const sendLocationMessage = async (
    messageType: "location_exact" | "location_live",
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
      message_type: messageType,
      location_data: locationData,
    });

    if (messageType === "location_live") {
      activeLiveMessageIdRef.current = liveMessage.id;
      setActiveLiveMessageId(liveMessage.id);
      setMessages((current) => appendUniqueMessage(current, liveMessage));
    }
  };

  const updateLiveLocationMessage = async (location: Location.LocationObject) => {
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
  };

  const sendCurrentLocation = async () => {
    if (!(await requestLocationPermission())) return;
    try {
      const location = await Location.getCurrentPositionAsync({});
      await sendLocationMessage("location_exact", location);
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

      let existingLiveMessageId = activeLiveMessageId || activeLiveMessageIdRef.current;
      if (!existingLiveMessageId) {
        const stateMessage = [...messages]
          .reverse()
          .find(
            (item) =>
              item.message_type === "location_live" &&
              item.sender_id === cleanSenderId &&
              !stoppedLiveMessageIds.current.has(item.id)
          );
        existingLiveMessageId = stateMessage?.id || null;
      }
      if (!existingLiveMessageId) {
        const { data: liveMessages, error: lookupError } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", active.id)
          .eq("sender_id", cleanSenderId)
          .eq("receiver_id", cleanReceiverId)
          .eq("message_type", "location_live")
          .order("created_at", { ascending: false });
        if (lookupError) throw lookupError;
        existingLiveMessageId =
          (liveMessages || []).find(
            (item) => !stoppedLiveMessageIds.current.has(item.id)
          )?.id || null;
      }

      if (existingLiveMessageId) {
        activeLiveMessageIdRef.current = existingLiveMessageId;
        setActiveLiveMessageId(existingLiveMessageId);
      }

      const initialLocation = await Location.getCurrentPositionAsync({});
      if (activeLiveMessageIdRef.current) {
        await updateLiveLocationMessage(initialLocation);
      } else {
        await sendLocationMessage("location_live", initialLocation);
      }
      const subscription = await Location.watchPositionAsync(
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
      liveLocationSubscription.current = subscription;
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
    liveLocationSubscription.current?.remove();
    liveLocationSubscription.current = null;
    if (activeLiveMessageIdRef.current) {
      stoppedLiveMessageIds.current.add(activeLiveMessageIdRef.current);
    }
    activeLiveMessageIdRef.current = null;
    setActiveLiveMessageId(null);
    setLiveLocationActive(false);
  };

  const openThread = (thread: Thread) => {
    setActive(thread);
    setMessages(thread.messages);
    setMessage("");
  };

  const handleBack = () => {
    setActive(null);
    setMessages([]);
    setMessage("");
    setConsultation(null);
    setPatientFileVisible(false);
    setPatientPets([]);
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

  const openPatientFile = async () => {
    setPatientFileVisible(true);
    setPatientFileLoading(true);
    setPatientPets([]);
    try {
      if (!active || !["vet", "veterinarian"].includes(userRole)) {
        console.warn("[Patient File] No active vet conversation available");
        return;
      }
      const targetClientId = consultation?.client_id || active.participantId;
      if (!targetClientId) {
        console.warn("[Patient File] No client ID available");
        return;
      }
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, type, breed, dob, vaccination_status, medical_notes, photos")
        .eq("owner_id", targetClientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setPatientPets((data || []) as PatientPet[]);
    } catch (error) {
      console.error("[Patient File] Failed to load pets:", error);
      setPatientPets([]);
    } finally {
      setPatientFileLoading(false);
    }
  };

  const updateConsultation = async (
    status: ConsultationStatus,
    completedAt: string | null
  ) => {
    if (!consultation) return;
    const { error } = await supabase
      .from("consultations")
      .update({ status, completed_at: completedAt })
      .eq("id", consultation.id)
      .eq("conversation_id", consultation.conversation_id)
      .eq("status", consultation.status);
    if (error) {
      Alert.alert("Unable to update consultation", error.message);
      return;
    }
    setConsultation({ ...consultation, status });
  };

  const handleToggleConsultation = async () => {
    if (!consultation || consultation.client_id !== currentUserId) return;
    await updateConsultation(
      consultation.status === "active" ? "completed" : "active",
      consultation.status === "active" ? new Date().toISOString() : null
    );
  };

  const handleEndConsultationByVet = async () => {
    if (
      !consultation ||
      consultation.vet_id !== currentUserId ||
      consultation.status !== "active"
    )
      return;
    await updateConsultation("completed", new Date().toISOString());
  };

  const createInvoice = async (amount: number, note: string) => {
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
      const invoiceMetadata: InvoiceMetadata = { order_id: order.id, amount: Number(order.amount), note: cleanNote || undefined, seller_name: sellerName, seller_subaccount_id: sellerSubaccountId, status: "pending" };
      const invoiceMessage = await sendRealtimeMessage({ conversation_id: active.id, sender_id: currentUserId, receiver_id: active.participantId, content: cleanNote || "Invoice", message_type: "invoice", metadata: invoiceMetadata });
      setMessages((current) => appendUniqueMessage(current, invoiceMessage));
      setInvoiceVisible(false);
    } catch (error) {
      Alert.alert("Invoice failed", error instanceof Error ? error.message : "Could not create invoice.");
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const summarizeAndDraftInvoice = async () => {
    if (!active || !["vet", "veterinarian"].includes(userRole) || aiInvoiceLoading) return;
    const chatHistoryText = messages
      .map((item) => `${item.sender_id === currentUserId ? "Veterinarian" : active.participantName}: ${item.content}`)
      .filter((line) => line.trim().length > 0)
      .join("\n");
    if (!chatHistoryText) {
      Alert.alert("No chat notes", "Add consultation notes or messages before drafting an invoice.");
      return;
    }

    setAiInvoiceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          prompt: `Review this veterinary consultation chat and extract billable services or treatments. Return ONLY a JSON array with objects containing description and amount as a number in NGN. Use reasonable suggested NGN prices when the chat mentions a service without a price. If nothing is billable, return an empty array.\n\nChat history:\n${chatHistoryText}`,
          role: "vet",
        },
      });
      if (error || !data?.answer) throw new Error(error?.message || data?.error || "Could not draft invoice items.");
      const suggestedItems = parseInvoiceItems(data.answer);
      if (suggestedItems.length === 0) {
        Alert.alert("No invoice items found", "The assistant could not identify billable services. You can create an invoice manually.");
        return;
      }
      setInvoiceItems(suggestedItems);
      setInvoiceVisible(true);
    } catch (error) {
      Alert.alert("AI invoice unavailable", error instanceof Error ? error.message : "Could not draft invoice items.");
    } finally {
      setAiInvoiceLoading(false);
    }
  };

  const payInvoice = async (orderId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "paid" })
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
    setMessages((current) => current.map((item) => item.metadata && item.metadata.order_id === orderId ? { ...item, metadata: { ...item.metadata, status: "paid" } } : item));
    Alert.alert("Payment Successful!", "Your invoice has been marked as paid.");
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
    if (!active || !text || !cleanSenderId || !cleanReceiverId) {
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
        if (consultation)
          setConsultation((current) =>
            current ? { ...current, status: consultation.status } : current
          );
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
      });
      setMessages((current) =>
        appendUniqueMessage(current, { ...confirmed, temp_id: tempId })
      );
      setMessage("");
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
    }
  };

  const attachMessage = async () => {
    const cleanSenderId = normalizeUuid(currentUserId);
    const cleanReceiverId = normalizeUuid(active?.participantId);
    if (!active || !cleanSenderId || !cleanReceiverId || uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true);
      const uploaded = await uploadChatAttachment(
        conversationIdFor(cleanSenderId, cleanReceiverId),
        result.assets[0]
      );
      const user = await getCurrentUser();
      const senderEmail = user?.email || "";
      if (!senderEmail) throw new Error("Authenticated user email is missing.");
      await sendRealtimeMessage({
        conversation_id: conversationIdFor(cleanSenderId, cleanReceiverId),
        sender_id: cleanSenderId,
        receiver_id: cleanReceiverId,
        content: sanitizeInput(message),
        message_type: "text",
        metadata: { sender_name: senderEmail, sender_email: senderEmail },
        media_url: uploaded.publicUrl,
        media_type: uploaded.mediaType,
      });
      setMessage("");
    } catch (error) {
      Alert.alert(
        "Attachment failed",
        error instanceof Error ? error.message : "Could not upload attachment."
      );
    } finally {
      setUploading(false);
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
        onEndConsultationByVet={handleEndConsultationByVet}
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
        onSummarizeInvoice={summarizeAndDraftInvoice}
        aiInvoiceLoading={aiInvoiceLoading}
        invoiceItems={invoiceItems}
        onCloseInvoice={() => setInvoiceVisible(false)}
        onCreateInvoice={createInvoice}
        onPayInvoice={payInvoice}
        />
        <PatientFileOverlay visible={patientFileVisible} loading={patientFileLoading} pets={patientPets} userRole={userRole} onClose={() => setPatientFileVisible(false)} />
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
          threads.map((thread) => {
            const unreadCount = unreadCounts[thread.id] || 0;
            return (
              <TouchableOpacity
                key={thread.id}
                style={styles.thread}
                onPress={() => openThread(thread)}
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
                    {thread.consultation_status === "active" ? (
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
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color="#64748B"
                />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
  onEndConsultationByVet,
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
  onSummarizeInvoice,
  aiInvoiceLoading,
  invoiceItems,
  onCloseInvoice,
  onCreateInvoice,
  onPayInvoice,
}: {
  active: Thread;
  currentUserId: string;
  userRole: string;
  messages: RealtimeMessage[];
  message: string;
  setMessage: (value: string) => void;
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
  onEndConsultationByVet: () => void;
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
  onSummarizeInvoice: () => void;
  aiInvoiceLoading: boolean;
  invoiceItems: InvoiceItem[];
  onCloseInvoice: () => void;
  onCreateInvoice: (amount: number, note: string) => Promise<void>;
  onPayInvoice: (orderId: string) => Promise<void>;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesScrollRef = useRef<ScrollView>(null);
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

  const isConsultActive = consultation?.status === "active";
  const isPetParent = consultation?.client_id === currentUserId;
  const isVeterinarian = consultation?.vet_id === currentUserId;
  const consultationStatus = consultation?.status || null;
  const onCompleteConsultation = isPetParent
    ? onToggleConsultation
    : onEndConsultationByVet;

  if (consultation)
    return (
      <ConsultationChatRoom
        active={active}
        currentUserId={currentUserId}
        userRole={userRole}
        messages={messages}
        message={message}
        setMessage={setMessage}
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
        consultation={consultation}
        onToggleConsultation={onToggleConsultation}
        onEndConsultationByVet={onEndConsultationByVet}
        onOpenPatientFile={onOpenPatientFile}
        patientFileVisible={patientFileVisible}
        patientPets={patientPets}
        patientFileLoading={patientFileLoading}
        onClosePatientFile={onClosePatientFile}
        canCreateInvoice={canCreateInvoice}
        invoiceVisible={invoiceVisible}
        invoiceSubmitting={invoiceSubmitting}
        onOpenInvoice={onOpenInvoice}
        onSummarizeInvoice={onSummarizeInvoice}
        aiInvoiceLoading={aiInvoiceLoading}
        invoiceItems={invoiceItems}
        onCloseInvoice={onCloseInvoice}
        onCreateInvoice={onCreateInvoice}
        onPayInvoice={onPayInvoice}
        uploading={uploading}
      />
    );

  const cancelDeletePress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }

    if (consultation)
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.roomHeader}>
            <TouchableOpacity onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            <View style={styles.flex}>
              <Text style={styles.title}>
                {active.productName || active.participantName}
              </Text>
              <Text style={styles.subtitle}>
                {active.productName
                  ? `${active.participantName} · Marketplace`
                  : active.participantName}
              </Text>
            </View>
            {["vet", "veterinarian"].includes(userRole) &&
            active.participantRole === "client" ? (
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
          </View>
          <View
            style={[
              styles.consultationBanner,
              isConsultActive
                ? styles.consultationActive
                : styles.consultationCompleted,
            ]}
          >
            <Text style={styles.consultationText}>
              {isConsultActive
                ? "Active Consultation"
                : "Consultation Completed"}
            </Text>
            {isPetParent ? (
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
                  {isConsultActive ? "End Consult" : "Start Consult"}
                </Text>
              </TouchableOpacity>
            ) : isVeterinarian && isConsultActive ? (
              <TouchableOpacity
                style={styles.endConsultationButton}
                onPress={onEndConsultationByVet}
              >
                <Text style={styles.consultationButtonText}>
                  Mark Completed
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
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
                    onPressIn={item.location_data ? undefined : () => startDeletePress(item)}
                    onPressOut={item.location_data ? undefined : cancelDeletePress}
                    onLongPress={item.location_data ? () => onDeleteMessage(item) : undefined}
                    delayLongPress={item.location_data ? 300 : undefined}
                    disabled={item.sender_id !== currentUserId}
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
                    {item.content ? (
                      <Text style={styles.primary}>{item.content}</Text>
                    ) : null}
                  </TouchableOpacity>
                  {deleteCandidate?.id === item.id ? (
                    <View style={styles.deleteActions}>
                      <Text style={styles.deletePrompt}>
                        Delete this message?
                      </Text>
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
            <TouchableOpacity
              style={styles.attach}
              onPress={onAttach}
              disabled={uploading}
            >
              <MaterialCommunityIcons
                name="paperclip"
                size={21}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Write a message..."
              placeholderTextColor="#64748B"
              style={[styles.input, styles.flex]}
              multiline
            />
            <TouchableOpacity style={styles.send} onPress={onSend}>
              <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.roomHeader}>
        <TouchableOpacity onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.title}>
            {active.productName || active.participantName}
          </Text>
          <Text style={styles.subtitle}>
            {active.productName
              ? `${active.participantName} · Marketplace`
              : active.participantName}
          </Text>
        </View>
        {["vet", "veterinarian"].includes(userRole) &&
        active.participantRole === "client" ? (
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
        {consultationStatus === "active" ? (
          <TouchableOpacity
            style={styles.completeButton}
            onPress={onCompleteConsultation}
          >
            <Text style={styles.completeButtonText}>Complete</Text>
          </TouchableOpacity>
        ) : null}
        {canCreateInvoice ? (
          <TouchableOpacity style={styles.invoiceAction} onPress={onOpenInvoice}>
            <MaterialCommunityIcons name="file-document-edit" size={17} color="#FFFFFF" />
            <Text style={styles.completeButtonText}>Create Invoice</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {consultationStatus === "completed" ? (
        <View style={styles.completedBanner}>
          <MaterialCommunityIcons
            name="check-circle"
            size={18}
            color="#86EFAC"
          />
          <Text style={styles.completedText}>
            This consultation has been marked as completed.
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
                    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.location_data.latitude},${item.location_data.longitude}`);
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
                ) : item.location_data ? (
                  <LocationMessage item={item} />
                ) : item.content ? (
                  <Text style={styles.primary}>{item.content}</Text>
                ) : null}
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
        <TouchableOpacity
          style={styles.attach}
          onPress={onAttach}
          disabled={uploading}
        >
          <MaterialCommunityIcons name="paperclip" size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Write a message..."
          placeholderTextColor="#64748B"
          style={[styles.input, styles.flex]}
          multiline
        />
        <TouchableOpacity style={styles.send} onPress={onSend}>
          <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
        </TouchableOpacity>
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
      <InvoiceModal visible={invoiceVisible} onClose={onCloseInvoice} onSubmit={onCreateInvoice} submitting={invoiceSubmitting} />
    </SafeAreaView>
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

function PatientFileOverlay({ visible, loading, pets, userRole, onClose }: { visible: boolean; loading: boolean; pets: PatientPet[]; userRole: string; onClose: () => void }) {
  const [historyVersion, setHistoryVersion] = useState(0);
  if (!visible) return null;
  return <View style={styles.patientOverlay}><View style={styles.patientSheet}><TouchableOpacity onPress={onClose} style={styles.patientClose}><Text style={styles.patientCloseText}>Close ✕</Text></TouchableOpacity><Text style={styles.patientTitle}>Patient File</Text>{loading ? <ActivityIndicator color="#10B981" /> : pets.length === 0 ? <Text style={styles.empty}>No patient record found for this client</Text> : <ScrollView>{pets.map((pet) => <View key={`${pet.id}-${historyVersion}`} style={styles.patientPet}>{pet.photos?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientGallery}>{pet.photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.patientPhoto} />)}</ScrollView> : null}<Text style={styles.patientPetName}>{pet.name}</Text><Text style={styles.patientDetail}>{pet.type} · {pet.breed || "Breed unknown"} · {formatPatientAge(pet.dob)}</Text><Text style={styles.patientLabel}>Vaccination</Text><Text style={styles.patientDetail}>{pet.vaccination_status || "Not provided"}</Text><Text style={styles.patientLabel}>Medical Notes & History</Text><Text style={styles.patientDetail}>{pet.medical_notes || "No medical notes provided."}</Text><PetMedicalHistory key={`history-${pet.id}-${historyVersion}`} petId={pet.id} />{userRole === "vet" || userRole === "veterinarian" ? <VetMedicalLogForm petId={pet.id} onSaved={() => setHistoryVersion((version) => version + 1)} /> : null}</View>)}</ScrollView>}</View></View>;
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

  return <View style={styles.invoiceCard}><Text style={styles.invoiceTitle}>Invoice</Text><Text style={styles.invoiceSeller}>Seller: {metadata.seller_name || "Seller"}</Text><Text style={styles.invoiceAmount}>₦{Number(metadata.amount || 0).toLocaleString("en-NG")}</Text>{metadata.note ? <Text style={styles.invoiceNote}>{metadata.note}</Text> : null}<View style={styles.invoiceFooter}><View style={[styles.pendingBadge, metadata.status === "paid" && styles.paidBadge]}><Text style={[styles.pendingBadgeText, metadata.status === "paid" && styles.paidBadgeText]}>{metadata.status === "paid" ? "Paid" : "Pending"}</Text></View>{payButton}</View></View>;
}

const defaultInvoiceItems: InvoiceItem[] = [
  { description: "Consultation", amount: 2000 },
  { description: "Examination", amount: 1000 },
];

function InvoiceModal({ visible, onClose, onSubmit, submitting, initialItems }: InvoiceProps) {
  const draftItems = initialItems && initialItems.length > 0 ? initialItems : defaultInvoiceItems;
  const [items, setItems] = useState<InvoiceItem[]>(draftItems);
  const [note, setNote] = useState(initialItems && initialItems.length > 0 ? initialItems.map((item) => `${item.description}: NGN ${item.amount.toLocaleString("en-NG")}`).join("; ") : "");

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
    const itemNote = validItems.map((item) => `${item.description.trim()}: NGN ${item.amount.toLocaleString("en-NG")}`).join("; ");
    void onSubmit(total, note.trim() || itemNote);
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.invoiceOverlay}><View style={styles.invoiceModal}><View style={styles.invoiceModalHeader}><Text style={styles.invoiceModalTitle}>Create Invoice</Text><TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.invoiceForm}><Text style={styles.invoiceLabel}>Invoice Items</Text>{items.map((item, index) => <View key={`${index}-${item.description}`} style={styles.invoiceItemRow}><TextInput value={item.description} onChangeText={(value) => updateItem(index, "description", value)} placeholder="Service or treatment" placeholderTextColor="#64748B" style={[styles.input, styles.invoiceDescriptionInput]} /><TextInput value={item.amount ? String(item.amount) : ""} onChangeText={(value) => updateItem(index, "amount", value)} keyboardType="decimal-pad" placeholder="Amount" placeholderTextColor="#64748B" style={[styles.input, styles.invoiceAmountInput]} /><TouchableOpacity onPress={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><MaterialCommunityIcons name="delete-outline" size={20} color="#F87171" /></TouchableOpacity></View>)}<TouchableOpacity style={styles.addInvoiceItem} onPress={() => setItems((current) => [...current, { description: "", amount: 0 }])}><MaterialCommunityIcons name="plus" size={17} color="#60A5FA" /><Text style={styles.addInvoiceItemText}>Add item</Text></TouchableOpacity><Text style={styles.invoiceTotal}>Total: NGN {subtotal.toLocaleString("en-NG")}</Text><Text style={styles.invoiceLabel}>Note or description (optional)</Text><TextInput value={note} onChangeText={setNote} placeholder="Additional clinical context..." placeholderTextColor="#64748B" style={[styles.input, styles.invoiceNoteInput]} multiline /><TouchableOpacity style={styles.sendButton} onPress={submit} disabled={submitting}><Text style={styles.sendText}>{submitting ? "Creating..." : "Create Invoice"}</Text></TouchableOpacity></ScrollView></View></View></Modal>;
}

function ConsultationChatRoom({
  active,
  currentUserId,
  userRole,
  messages,
  message,
  setMessage,
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
  onEndConsultationByVet,
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
  onSummarizeInvoice,
  aiInvoiceLoading,
  invoiceItems,
  onCloseInvoice,
  onCreateInvoice,
  onPayInvoice,
}: {
  active: Thread;
  currentUserId: string;
  userRole: string;
  messages: RealtimeMessage[];
  message: string;
  setMessage: (value: string) => void;
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
  onEndConsultationByVet: () => void;
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
  onSummarizeInvoice: () => void;
  aiInvoiceLoading: boolean;
  invoiceItems: InvoiceItem[];
  onCloseInvoice: () => void;
  onCreateInvoice: (amount: number, note: string) => Promise<void>;
  onPayInvoice: (orderId: string) => Promise<void>;
}) {
  const messagesScrollRef = useRef<ScrollView>(null);
  const isConsultActive = consultation.status === "active";
  const isPetParent =
    currentUserId === consultation.client_id || userRole === "client";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.roomHeader}>
        <TouchableOpacity onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.title}>
            {active.productName || active.participantName}
          </Text>
          <Text style={styles.subtitle}>
            {active.productName
              ? `${active.participantName} · Marketplace`
              : active.participantName}
          </Text>
        </View>
        {["vet", "veterinarian"].includes(userRole) &&
        active.participantRole === "client" ? (
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
        {canCreateInvoice ? (
          <TouchableOpacity style={styles.invoiceAction} onPress={onOpenInvoice}>
            <MaterialCommunityIcons name="file-document-edit" size={17} color="#FFFFFF" />
            <Text style={styles.completeButtonText}>Create Invoice</Text>
          </TouchableOpacity>
        ) : null}
        {canCreateInvoice && ["vet", "veterinarian"].includes(userRole) ? (
          <TouchableOpacity style={styles.aiInvoiceAction} onPress={onSummarizeInvoice} disabled={aiInvoiceLoading}>
            {aiInvoiceLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialCommunityIcons name="robot-outline" size={17} color="#FFFFFF" />}
            <Text style={styles.completeButtonText}>{aiInvoiceLoading ? "Drafting..." : "AI Invoice"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
            {isConsultActive ? "Active Consultation" : "Consultation Completed"}
          </Text>
        </View>
        {isPetParent ? (
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
              {isConsultActive ? "End Consult" : "Start Consult"}
            </Text>
          </TouchableOpacity>
        ) : isConsultActive ? (
          <TouchableOpacity
            style={styles.endConsultationButton}
            onPress={onEndConsultationByVet}
          >
            <Text style={styles.consultationButtonText}>Mark Completed</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
                    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.location_data.latitude},${item.location_data.longitude}`);
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
                ) : item.location_data ? (
                  <LocationMessage item={item} />
                ) : item.content ? (
                  <Text style={styles.primary}>{item.content}</Text>
                ) : null}
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
        <TouchableOpacity
          style={styles.attach}
          onPress={onAttach}
          disabled={uploading}
        >
          <MaterialCommunityIcons name="paperclip" size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Write a message..."
          placeholderTextColor="#64748B"
          style={[styles.input, styles.flex]}
          multiline
        />
        <TouchableOpacity style={styles.send} onPress={onSend}>
          <MaterialCommunityIcons name="send" size={19} color="#FFFFFF" />
        </TouchableOpacity>
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
      <InvoiceModal key={invoiceItems.map((item) => `${item.description}:${item.amount}`).join("|")} visible={invoiceVisible} onClose={onCloseInvoice} onSubmit={onCreateInvoice} submitting={invoiceSubmitting} initialItems={invoiceItems} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  chatRoot: { flex: 1, position: "relative" },
  header: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  consultationBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  consultationStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  consultationIndicator: { width: 8, height: 8, borderRadius: 4 },
  consultationIndicatorActive: { backgroundColor: "#10B981" },
  consultationIndicatorCompleted: { backgroundColor: "#9CA3AF" },
  consultationActive: { backgroundColor: "#065F46" },
  consultationCompleted: { backgroundColor: "#1F2937" },
  consultationText: { color: "#FFFFFF", fontWeight: "600", flex: 1 },
  consultationButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  startConsultationButton: { backgroundColor: "#10B981" },
  endConsultationButton: { backgroundColor: "#EF4444" },
  consultationButtonText: { color: "#FFFFFF", fontWeight: "700" },
  invoiceAction: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  aiInvoiceAction: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#7C3AED", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  invoiceCard: { alignSelf: "stretch", backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14, minWidth: 240 },
  invoiceTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  invoiceSeller: { color: "#475569", fontSize: 12, marginTop: 5 },
  invoiceAmount: { color: "#0F172A", fontSize: 22, fontWeight: "700", marginTop: 10 },
  invoiceNote: { color: "#475569", fontSize: 13, marginTop: 6 },
  invoiceFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  pendingBadge: { backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  pendingBadgeText: { color: "#B45309", fontSize: 11, fontWeight: "700" },
  paidBadge: { backgroundColor: "#D1FAE5" },
  paidBadgeText: { color: "#047857" },
  payButton: { backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  payButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  invoiceOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  invoiceModal: { backgroundColor: "#1E293B", padding: 22, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  invoiceModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  invoiceModalTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  closeText: { color: "#94A3B8", fontSize: 13 },
  invoiceLabel: { color: "#94A3B8", fontSize: 12, marginBottom: 6, marginTop: 10 },
  invoiceForm: { paddingBottom: 10 },
  invoiceItemRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  invoiceDescriptionInput: { flex: 1.5 },
  invoiceAmountInput: { flex: 0.8 },
  addInvoiceItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 9 },
  addInvoiceItemText: { color: "#60A5FA", fontSize: 13, fontWeight: "700" },
  invoiceTotal: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 4 },
  invoiceNoteInput: { minHeight: 80, textAlignVertical: "top" },
  sendButton: { backgroundColor: "#10B981", borderRadius: 9, padding: 13, alignItems: "center", marginTop: 18 },
  sendText: { color: "#FFFFFF", fontWeight: "700" },
  completeButton: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  patientButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  completeButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#14532D",
  },
  completedText: { color: "#DCFCE7", fontSize: 12, flex: 1 },
  patientOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    padding: 16,
  },
  patientSheet: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "88%",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 20,
  },
  patientClose: { alignSelf: "flex-end", padding: 8 },
  patientCloseText: { color: "#FFFFFF", fontWeight: "700" },
  patientHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  patientTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  patientPet: {
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingVertical: 14,
  },
  patientGallery: { gap: 8, marginBottom: 10 },
  patientPhoto: { width: 110, height: 90, borderRadius: 8 },
  patientPetName: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  patientLabel: {
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 3,
  },
  patientDetail: { color: "#CBD5E1", fontSize: 13, lineHeight: 20 },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  list: { padding: 16 },
  messages: { padding: 16, flexGrow: 1 },
  messageRow: { marginBottom: 10 },
  thread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  threadNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeConsultBadge: {
    backgroundColor: "#065F46",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeConsultBadgeText: { color: "#10B981", fontSize: 10, fontWeight: "700" },
  primary: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  muted: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  message: { color: "#CBD5E1", fontSize: 12, marginTop: 7 },
  empty: { color: "#94A3B8", textAlign: "center", marginTop: 24 },
  bubble: { maxWidth: "84%", padding: 13, borderRadius: 12, marginBottom: 10 },
  outgoing: { alignSelf: "flex-end", backgroundColor: "#0E7490" },
  incoming: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  attachment: { width: 220, height: 180, borderRadius: 10, marginBottom: 8 },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 220,
    padding: 2,
  },
  locationTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  locationAddress: { color: "#CBD5E1", fontSize: 12, marginTop: 3 },
  locationCoordinates: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
  liveLocationBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#064E3B",
  },
  liveLocationText: { color: "#D1FAE5", fontSize: 12, flex: 1 },
  stopLiveLocationText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  locationSheet: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    gap: 8,
  },
  locationSheetTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginBottom: 6 },
  locationOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  locationOptionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  locationHint: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  locationCancel: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  locationCancelText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
  composer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    flexDirection: "row",
    gap: 8,
  },
  attach: {
    width: 44,
    borderRadius: 8,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    color: "#FFFFFF",
    padding: 11,
  },
  send: {
    width: 44,
    borderRadius: 8,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: {
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  deleteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  deletePrompt: { color: "#FCA5A5", fontSize: 12, marginRight: 4 },
  deleteButton: {
    backgroundColor: "#DC2626",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  cancelButton: {
    backgroundColor: "#475569",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
});
