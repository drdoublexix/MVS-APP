import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import KnowledgeHubSection from "../../components/KnowledgeHubSection";
import MarketplaceBrowseModal from "../../components/MarketplaceBrowseModal";
import ProductImageCarousel from "../../components/ProductImageCarousel";
import WelcomeModal from "../../components/WelcomeModal";
import {
    addMarketplaceProduct,
    fetchMarketplaceProducts,
    useMarketplace,
} from "../../lib/marketplace";
import { addPlatformFee, parsePriceInput } from "../../lib/price";
import { isProductCategory, PRODUCT_CATEGORIES } from "../../lib/productCategories";
import { sanitizeInput } from "../../lib/sanitize";
import { requestAiAssistant } from "../../lib/aiAssistant";
import { getCurrentUser, supabase } from "../../lib/supabase";
import { useLanguage } from "../../lib/language";

const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;
const getMerchantFirstName = (fullName?: string | null) => {
  const name = (fullName || "").trim().replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, "");
  return name.split(/\s+/).filter(Boolean)[0] || "there";
};

type AiMessage = { id?: string; role: "user" | "assistant"; content: string };
type AiSession = { sessionId: string; userId: string };

export default function MerchantDashboardScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { openMarketplace } = useLocalSearchParams<{ openMarketplace?: string }>();
  const { products } = useMarketplace();
  const [visible, setVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<(typeof products)[number] | null>(null);
  const [marketplaceBrowseVisible, setMarketplaceBrowseVisible] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "",
    price: "",
    stock: "",
  });
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    activeListings: 0,
    pendingOrders: 0,
  });
  const [merchantFirstName, setMerchantFirstName] = useState("there");
  const [productOrderStatuses, setProductOrderStatuses] = useState<
    Record<string, string>
  >({});
  const [supportOffsetY, setSupportOffsetY] = useState(0);
  const [aiVisible, setAiVisible] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSession, setAiSession] = useState<AiSession | null>(null);
  const aiMessagesScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (openMarketplace !== "true") return;
    const frameId = requestAnimationFrame(() => {
      setMarketplaceBrowseVisible(true);
      router.setParams({ openMarketplace: undefined });
    });
    return () => cancelAnimationFrame(frameId);
  }, [openMarketplace, router]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadMerchantGreeting = async () => {
        try {
          const user = await getCurrentUser();
          if (!user) {
            if (mounted) setMerchantFirstName("there");
            return;
          }

          const { data: profile, error } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          if (error) {
            console.error("[Merchant Dashboard] Could not load profile name for greeting:", error);
          }

          const fullName = profile?.full_name
            || user.user_metadata?.full_name
            || user.user_metadata?.name
            || null;
          if (mounted) setMerchantFirstName(getMerchantFirstName(fullName));
        } catch (error) {
          console.error("[Merchant Dashboard] Could not load profile name for greeting:", error);
          if (mounted) setMerchantFirstName("there");
        }
      };

      void loadMerchantGreeting();
      return () => {
        mounted = false;
      };
    }, [])
  );

  const openWhatsAppSupport = async () => {
    const message =
      "Hello MVS Support, I need assistance with my account. Role: merchant";
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `whatsapp://send?phone=2349074874395&text=${encodedMessage}`;
    const webUrl = `https://wa.me/2349074874395?text=${encodedMessage}`;
    try {
      if (await Linking.canOpenURL(whatsappUrl))
        await Linking.openURL(whatsappUrl);
      else await Linking.openURL(webUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  };
  const [supportPanResponder] = useState(() => {
    let currentOffset = 0;
    let startOffset = 0;
    let moved = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startOffset = currentOffset;
        moved = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dy) > 6) moved = true;
        currentOffset = Math.max(-300, Math.min(300, startOffset + gesture.dy));
        setSupportOffsetY(currentOffset);
      },
      onPanResponderRelease: () => {
        if (!moved) void openWhatsAppSupport();
      },
      onPanResponderTerminate: () => {
        moved = true;
      },
    });
  });

  useEffect(() => {
    if (!aiVisible) return;
    let mounted = true;
    const loadAiHistory = async () => {
      try {
        const user = await getCurrentUser();
        if (!user || !mounted) return;
        const sessionId = `merchant-ai-${user.id}`;
        setAiSession({ sessionId, userId: user.id });
        const { data, error } = await supabase
          .from("mvsai_chat_messages")
          .select("id, role, content")
          .eq("user_id", user.id)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (mounted) {
          setAiMessages((data || []).map((message) => ({
            id: message.id,
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
          })));
        }
      } catch (error) {
        console.error("[Merchant AI] Could not load assistant history:", error);
        if (mounted) Alert.alert("Assistant history unavailable", error instanceof Error ? error.message : "Could not load your assistant messages.");
      }
    };
    void loadAiHistory();
    return () => { mounted = false; };
  }, [aiVisible]);

  const askAiAssistant = async () => {
    const prompt = sanitizeInput(userQuery).trim();
    if (!prompt || aiLoading || !aiSession) return;
    const userMessage: AiMessage = { role: "user", content: prompt };
    const conversation = [...aiMessages, userMessage];
    setAiMessages(conversation);
    setUserQuery("");
    setAiLoading(true);
    try {
      const response = await requestAiAssistant(conversation, "merchant");
      const assistantMessage: AiMessage = { role: "assistant", content: response };
      setAiMessages((current) => [...current, assistantMessage]);
      const [userResult, assistantResult] = await Promise.all([
        supabase.from("mvsai_chat_messages").insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: "user", content: prompt }),
        supabase.from("mvsai_chat_messages").insert({ user_id: aiSession.userId, session_id: aiSession.sessionId, role: "assistant", content: response }),
      ]);
      if (userResult.error) console.error("[Merchant AI] Could not save user message:", userResult.error);
      if (assistantResult.error) console.error("[Merchant AI] Could not save assistant response:", assistantResult.error);
      setTimeout(() => aiMessagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error("[Merchant AI] Assistant request failed:", error);
      Alert.alert("Assistant unavailable", error instanceof Error ? error.message : "Unable to connect to MVS Assistant. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const copyAiMessage = async (content: string) => {
    try {
      await Clipboard.setStringAsync(content);
      if (Platform.OS === "web") window.alert("Message copied to clipboard.");
      else Alert.alert("Copied", "Message copied to clipboard.");
    } catch (error) {
      console.error("[Merchant AI] Could not copy message:", error);
      if (Platform.OS === "web") window.alert("Could not copy this message.");
      else Alert.alert("Copy failed", "Could not copy this message.");
    }
  };

  const showAiMessageOptions = (content: string) => {
    if (Platform.OS === "web") {
      if (window.confirm("Copy this message to the clipboard?")) void copyAiMessage(content);
      return;
    }
    Alert.alert("Message options", "Choose an action for this message.", [
      { text: "Cancel", style: "cancel" },
      { text: "Copy message", onPress: () => { void copyAiMessage(content); } },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      void fetchMarketplaceProducts().catch(() => undefined);
    }, [])
  );

  useEffect(() => {
    void fetchMarketplaceProducts().catch(() => undefined);
  }, []);

  const loadOrderStatuses = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("orders")
        .select("product_id, status")
        .eq("merchant_id", user.id);

      if (error) throw error;

      const statusMap: Record<string, string> = {};
      for (const item of data || []) {
        if (item?.product_id) statusMap[String(item.product_id)] = item.status;
      }
      setProductOrderStatuses(statusMap);
    } catch (error) {
      console.warn("[Merchant Dashboard] Failed to load order statuses:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const ordersChannel = supabase
      .channel("merchant-dashboard-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (mounted) void loadOrderStatuses();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(ordersChannel);
    };
  }, [loadOrderStatuses]);

  const getOrderBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case "paid":
        return { label: "Payment sent", color: "#F59E0B" };
      case "completed":
      case "confirmed":
        return { label: "Completed", color: "#10B981" };
      case "pending":
      case "pending_payment":
      case "awaiting_payment":
        return { label: "Awaiting payment", color: "#F59E0B" };
      default:
        return { label: "In progress", color: "#3B82F6" };
    }
  };

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadMetrics = async () => {
        const user = await getCurrentUser();
        if (!user) return;
        const { data, error } = await supabase.rpc("get_merchant_metrics", {
          merchant_uuid: user.id,
        });
        if (error) {
          console.error("[Merchant Dashboard] Failed to load metrics:", error);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (mounted)
          setMetrics({
            totalSales: Number(row?.total_sales || 0),
            activeListings: Number(row?.active_listings || 0),
            pendingOrders: Number(row?.pending_orders || 0),
          });
      };
      void loadMetrics();
      const stateChannel = supabase
        .channel('merchant-dashboard-state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          if (mounted) void loadMetrics();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
          if (mounted) void loadMetrics();
        })
        .subscribe();
      return () => {
        mounted = false;
        void supabase.removeChannel(stateChannel);
      };
    }, [])
  );

  const publish = async () => {
    const cleanTitle = sanitizeInput(form.title);
    const cleanCategory = sanitizeInput(form.category);
    const price = parsePriceInput(form.price);
    const stock = Number(form.stock);
    if (
      !cleanTitle ||
      !isProductCategory(cleanCategory) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    )
      return;

    try {
      const user = await getCurrentUser();
      const merchantId = user?.id || "current-merchant";

      const { error } = await supabase.from("products").insert({
        name: cleanTitle,
        category: cleanCategory,
        price,
        stock,
        merchant_id: merchantId,
      });

      if (error) throw error;

      addMarketplaceProduct({
        name: cleanTitle,
        category: cleanCategory,
        price,
        stock,
        merchant: user?.user_metadata?.full_name || "MVS Merchant Store",
        merchantId,
        icon: cleanCategory === "Animal Feeds" || cleanCategory === "Pet Food" ? "food" : "package",
      });

      await fetchMarketplaceProducts();
      setForm({ title: "", category: "", price: "", stock: "" });
      setVisible(false);
    } catch (error) {
      console.warn("Failed to publish product", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <WelcomeModal />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>{t("home.hello", { name: merchantFirstName })} 👋</Text>
          <Text style={styles.greetingSubtitle}>Welcome back to your store workspace</Text>
        </View>
        <TouchableOpacity style={styles.aiCard} onPress={() => setAiVisible(true)} accessibilityRole="button">
          <View style={styles.aiIcon}><MaterialCommunityIcons name="robot-outline" size={28} color="#FFFFFF" /></View>
          <View style={styles.aiCardCopy}>
            <Text style={styles.assistantCardTitle}>MVS AI Assistant</Text>
            <Text style={styles.assistantCardText}>Ask questions about animal care and livestock.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('dashboard.store')}</Text>
        <Text style={styles.subtitle}>{t('dashboard.manageStore')}</Text>
        <View style={styles.stats}>
          <Stat
            icon="cash"
            label={t('dashboard.totalSales')}
            value={`₦${metrics.totalSales.toLocaleString("en-NG")}`}
            color="#10B981"
          />
          <Stat
            icon="package-variant"
            label={t('dashboard.activeListings')}
            value={String(metrics.activeListings)}
            color="#3B82F6"
            onPress={() => router.push("/inventory")}
          />
          <Stat
            icon="clock"
            label={t('dashboard.pendingOrders')}
            value={String(metrics.pendingOrders)}
            color="#F59E0B"
          />
        </View>
        <KnowledgeHubSection />
        <TouchableOpacity
          style={styles.addProduct}
          onPress={() => router.push("/(merchant)/add-product")}
        >
          <MaterialCommunityIcons name="plus" size={21} color="#FFFFFF" />
          <Text style={styles.addText}>{t('dashboard.addProduct')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.clinicManageCard}
          onPress={() => router.push('/(merchant)/manage-clinic')}
          accessibilityRole="button"
          accessibilityLabel="Manage your veterinary clinic listing"
        >
          <View style={styles.clinicManageIcon}>
            <MaterialCommunityIcons name="hospital-building" size={24} color="#93C5FD" />
          </View>
          <View style={styles.clinicManageCopy}>
            <Text style={styles.clinicManageTitle}>Animal-Care Business Listing</Text>
            <Text style={styles.clinicManageSubtitle}>Add your veterinary or pet-care service so nearby clients can discover, reach out and contact you.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#93C5FD" />
        </TouchableOpacity>
        <View style={styles.marketplaceHeader}>
          <Text style={styles.sectionTitle}>{t('dashboard.storeInventory')}</Text>
          <TouchableOpacity onPress={() => setMarketplaceBrowseVisible(true)}>
            <Text style={styles.browseAction}>{t('home.browseAll')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
        {products.map((product) => {
          const badge = getOrderBadge(productOrderStatuses[String(product.id)]);
          return (
            <TouchableOpacity key={product.id} style={styles.product} onPress={() => setSelectedProduct(product)} activeOpacity={0.85}>
              <View style={styles.productImage}>
                {product.imageUrl ? (
                  <Image
                    source={{ uri: product.imageUrl }}
                    style={styles.productPhoto}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={product.icon as any}
                    size={23}
                    color="#FFFFFF"
                  />
                )}
              </View>
              <Text style={styles.productTitle}>{product.name}</Text>
              <Text style={styles.price}>{naira(product.price)}</Text>
              <Text style={styles.muted}>{product.merchant}</Text>
              {badge ? <View style={[styles.orderBadge, { backgroundColor: badge.color }]}><Text style={styles.orderBadgeText}>{badge.label}</Text></View> : null}
              <View style={styles.viewDetailsButton}><Text style={styles.viewDetailsText}>View Details</Text></View>
            </TouchableOpacity>
          );
        })}
        </View>
      </ScrollView>
      <MarketplaceBrowseModal
        visible={marketplaceBrowseVisible}
        products={products}
        onClose={() => setMarketplaceBrowseVisible(false)}
        onSelectProduct={setSelectedProduct}
      />
      <Modal visible={selectedProduct !== null} transparent animationType="fade" onRequestClose={() => setSelectedProduct(null)}>
        <View style={styles.productModalOverlay}>
          <View style={styles.productModal}>
            <View style={styles.productModalHeader}><Text style={styles.productModalTitle}>Product Details</Text><TouchableOpacity onPress={() => setSelectedProduct(null)} accessibilityLabel="Close product details"><MaterialCommunityIcons name="close" size={24} color="#FFFFFF" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.productModalContent} showsVerticalScrollIndicator>
              <ProductImageCarousel images={selectedProduct?.images} fallbackImage={selectedProduct?.imageUrl} height={180} />
              <Text style={styles.productModalName}>{selectedProduct?.name}</Text>
              <Text style={styles.productModalLabel}>Description</Text>
              <Text style={styles.productModalText}>{selectedProduct?.description || 'No description available.'}</Text>
              <View style={styles.productModalMeta}><View style={styles.flex}><Text style={styles.productModalLabel}>Price</Text><Text style={styles.productModalPrice}>{selectedProduct ? naira(selectedProduct.price) : ''}</Text></View><View style={styles.flex}><Text style={styles.productModalLabel}>Category</Text><Text style={styles.productModalText}>{selectedProduct?.category || 'General'}</Text></View></View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={aiVisible} animationType="slide" transparent onRequestClose={() => setAiVisible(false)}>
        <KeyboardAvoidingView style={styles.aiOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.aiModal}>
            <View style={styles.aiHeader}>
              <View style={styles.flex}>
                <Text style={styles.aiTitle}>MVS AI Assistant</Text>
                <Text style={styles.aiSubtitle}>Hold a message to copy it</Text>
              </View>
              <TouchableOpacity onPress={() => setAiVisible(false)} accessibilityLabel="Close AI assistant">
                <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={aiMessagesScrollRef}
              style={styles.aiConversation}
              contentContainerStyle={styles.aiConversationContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => aiMessagesScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {aiMessages.length === 0 && !aiLoading ? <Text style={styles.aiHint}>Ask about animal care, feeding, symptoms or livestock health.</Text> : null}
              {aiMessages.map((message, index) => (
                <TouchableOpacity
                  key={message.id || `merchant-ai-${index}`}
                  activeOpacity={0.9}
                  onLongPress={() => showAiMessageOptions(message.content)}
                  accessibilityRole="button"
                  accessibilityLabel={`Message options for ${message.role} message`}
                >
                  <View style={[styles.aiMessageBubble, message.role === "user" ? styles.aiUserBubble : styles.aiAssistantBubble]}>
                    <Text style={styles.aiMessageText}>{message.content}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {aiLoading ? <View style={[styles.aiMessageBubble, styles.aiAssistantBubble]}><ActivityIndicator color="#10B981" /><Text style={styles.aiHint}>Thinking...</Text></View> : null}
            </ScrollView>
            <TextInput
              value={userQuery}
              onChangeText={setUserQuery}
              placeholder="What would you like to know?"
              placeholderTextColor="#64748B"
              multiline
              style={styles.aiInput}
              editable={!aiLoading}
            />
            <TouchableOpacity
              style={[styles.aiAskButton, (!userQuery.trim() || aiLoading || !aiSession) && styles.aiAskDisabled]}
              onPress={() => void askAiAssistant()}
              disabled={!userQuery.trim() || aiLoading || !aiSession}
            >
              {aiLoading ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialCommunityIcons name="send" size={18} color="#FFFFFF" /><Text style={styles.aiAskText}>Ask Assistant</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <View
        {...supportPanResponder.panHandlers}
        style={[
          supportFabStyle,
          { transform: [{ translateY: supportOffsetY }] },
        ]}
      >
        <MaterialCommunityIcons name="whatsapp" size={29} color="#FFFFFF" />
      </View>
      <Modal visible={visible} animationType="fade">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add New Product</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.label}>Product Title</Text>
            <TextInput
              value={form.title}
              onChangeText={(title) => setForm({ ...form, title })}
              style={styles.input}
              placeholder="e.g. Premium Dog Collar"
              placeholderTextColor="#64748B"
            />
            <Text style={styles.label}>Category</Text>
            <View style={styles.categories}>
              {PRODUCT_CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => setForm({ ...form, category })}
                  style={[
                    styles.category,
                    form.category === category && styles.selected,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      form.category === category && styles.selectedText,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Your price in NGN</Text>
            <TextInput
              value={form.price}
              onChangeText={(price) => setForm({ ...form, price })}
              style={styles.input}
              placeholder="e.g. 50,000"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
            />
            {form.price.trim() && Number.isFinite(parsePriceInput(form.price)) ? (
              <Text style={styles.label}>
                Marketplace price: {naira(addPlatformFee(parsePriceInput(form.price)))}
              </Text>
            ) : null}
            <Text style={styles.label}>Stock Quantity</Text>
            <TextInput
              value={form.stock}
              onChangeText={(stock) => setForm({ ...form, stock })}
              style={styles.input}
              placeholder="e.g. 50"
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.publish} onPress={publish}>
              <MaterialCommunityIcons name="upload" size={19} color="#FFFFFF" />
              <Text style={styles.publishText}>
                Publish to Global Marketplace
              </Text>
            </TouchableOpacity>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const supportFabStyle = {
  position: "absolute" as const,
  bottom: 16,
  right: 20,
  zIndex: 9999,
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: "#005F53",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  elevation: 8,
  shadowColor: "#000000",
  shadowOpacity: 0.25,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
};

function Stat({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon as any} size={25} color={color} />
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
  return (
    <TouchableOpacity style={styles.statWrapper} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.8 : 1}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  modalKeyboard: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  greeting: { marginBottom: 18 },
  greetingTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  greetingSubtitle: { color: "#94A3B8", fontSize: 13, lineHeight: 19, marginTop: 5 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700" },
  subtitle: { color: "#94A3B8", marginTop: 4, marginBottom: 24 },
  aiCard: { backgroundColor: "#0E7490", borderRadius: 15, padding: 16, flexDirection: "row", alignItems: "center", marginBottom: 24 },
  aiIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: "#FFFFFF24", alignItems: "center", justifyContent: "center" },
  aiCardCopy: { flex: 1, marginHorizontal: 12 },
  assistantCardTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  assistantCardText: { color: "#CFFAFE", fontSize: 12, lineHeight: 18, marginTop: 3 },
  aiOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  aiModal: { maxHeight: "85%", backgroundColor: "#0F172A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  aiHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#334155", paddingBottom: 13 },
  aiTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  aiSubtitle: { color: "#94A3B8", fontSize: 11, marginTop: 3 },
  aiConversation: { minHeight: 150, maxHeight: 360, marginVertical: 14 },
  aiConversationContent: { flexGrow: 1, justifyContent: "flex-end", paddingBottom: 4 },
  aiMessageBubble: { marginBottom: 11, borderRadius: 10, padding: 12, maxWidth: "94%" },
  aiUserBubble: { backgroundColor: "#10B98120", borderLeftWidth: 3, borderLeftColor: "#10B981", alignSelf: "flex-end" },
  aiAssistantBubble: { backgroundColor: "#3B82F620", borderLeftWidth: 3, borderLeftColor: "#3B82F6", alignSelf: "flex-start" },
  aiMessageText: { color: "#E2E8F0", fontSize: 14, lineHeight: 21 },
  aiHint: { color: "#94A3B8", fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  aiInput: { minHeight: 52, maxHeight: 110, backgroundColor: "#1E293B", borderColor: "#334155", borderWidth: 1, borderRadius: 10, color: "#FFFFFF", paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, textAlignVertical: "top" },
  aiAskButton: { backgroundColor: "#10B981", borderRadius: 10, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  aiAskDisabled: { opacity: 0.5 },
  aiAskText: { color: "#FFFFFF", fontWeight: "700" },
  stats: { flexDirection: "row", alignItems: "stretch", gap: 10, marginBottom: 24 },
  statWrapper: { flex: 1, minWidth: 0 },
  stat: {
    flex: 1,
    width: "100%",
    minHeight: 100,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#334155",
    elevation: 3,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  muted: { color: "#94A3B8", fontSize: 12 },
  addProduct: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 28,
  },
  addText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  clinicManageCard: { minHeight: 74, padding: 12, backgroundColor: "#17263B", borderColor: "#2B4A71", borderWidth: 1, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 11, marginTop: -16, marginBottom: 22 },
  clinicManageIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB24", alignItems: "center", justifyContent: "center" },
  clinicManageCopy: { flex: 1 },
  clinicManageTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  clinicManageSubtitle: { color: "#BFDBFE", fontSize: 11, lineHeight: 16, marginTop: 3 },
  marketplaceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  browseAction: {
    color: "#3B82F6",
    fontWeight: "600",
    fontSize: 13,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  product: {
    width: "48%",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 0,
    elevation: 3,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  productImage: {
    height: 96,
    backgroundColor: "#0F172A",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  productPhoto: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    resizeMode: "cover",
  },
  productIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  productTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 3,
  },
  price: { color: "#10B981", fontWeight: "700", fontSize: 13 },
  stock: { color: "#10B981", fontSize: 11 },
  lowStock: { color: "#F87171" },
  orderBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  orderBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  viewDetailsButton: { backgroundColor: "#10B981", borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 10 },
  viewDetailsText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  flex: { flex: 1 },
  productModalOverlay: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: 20 },
  productModal: { width: "100%", maxWidth: 440, maxHeight: "85%", backgroundColor: "#1E293B", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#334155" },
  productModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  productModalContent: { paddingBottom: 4 },
  productModalTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  productModalName: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginTop: 14 },
  productModalLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 4 },
  productModalText: { color: "#CBD5E1", fontSize: 14, lineHeight: 20 },
  productModalMeta: { flexDirection: "row", gap: 20 },
  productModalPrice: { color: "#10B981", fontSize: 18, fontWeight: "700" },
  modal: { flex: 1, backgroundColor: "#0F172A" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  modalTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  form: { padding: 16 },
  label: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 13,
  },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 9,
    color: "#FFFFFF",
    padding: 13,
    fontSize: 14,
  },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
  },
  selected: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  categoryText: { color: "#94A3B8", fontSize: 13 },
  selectedText: { color: "#FFFFFF", fontWeight: "700" },
  publish: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  publishText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
});
