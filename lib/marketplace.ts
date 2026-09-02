import { useEffect, useState } from 'react';
import { isUuid, normalizeUuid, supabase, type RealtimeMessage } from './supabase';

export type MarketplaceProduct = {
  id: string;
  name: string;
  price: number;
  merchant: string;
  merchantId: string;
  icon: string;
  category: string;
  stock: number;
  imageUrl?: string;
  description?: string;
};

export type MarketplaceMessage = {
  id: string;
  sender: 'client' | 'merchant' | 'vet';
  text: string;
  createdAt: number;
};

export type ProductConversation = {
  id: string;
  productId: string;
  product: MarketplaceProduct;
  clientId?: string;
  clientName: string;
  messages: MarketplaceMessage[];
  paymentStatus: 'unpaid' | 'paid';
};

export type VetConversation = {
  id: string;
  vet: string;
  category: string;
  clientId?: string;
  participantId?: string;
  messages: MarketplaceMessage[];
};

const normalizeProduct = (product: any): MarketplaceProduct => ({
  id: String(product.id),
  name: product.name || 'Pet Product',
  price: Number(product.price || 0),
  merchant: product.profiles?.full_name || product.merchant || 'MVS Merchant',
  merchantId: normalizeUuid(String(product.merchant_id || product.merchantId || '')) || '',
  icon: product.icon || 'package',
  category: product.category || 'General',
  stock: Number(product.stock || 0),
  imageUrl: product.image_url || product.imageUrl || undefined,
  description: product.description || '',
});

let products: MarketplaceProduct[] = [];
let conversations: ProductConversation[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const subscribeMarketplace = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useMarketplace = () => {
  const [, refresh] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeMarketplace(() => refresh((value) => value + 1));
    return () => { unsubscribe(); };
  }, []);
  return { products, conversations };
};

export const fetchMarketplaceProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .gt('stock', 0)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Marketplace] Failed to fetch products:', error);
    return products;
  }

  const rows = data || [];
  const merchantIds = [...new Set(rows.map((product) => String(product.merchant_id || '')).filter(Boolean))];
  const { data: profiles, error: profilesError } = merchantIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, email').in('id', merchantIds)
    : { data: [], error: null };
  if (profilesError) console.warn('[Marketplace] Failed to fetch merchant names:', profilesError);
  const merchantNames = new Map((profiles || []).map((profile) => [profile.id, profile.full_name || profile.email || 'MVS Merchant']));
  const nextProducts = rows.map((product) => normalizeProduct({
    ...product,
    merchant: merchantNames.get(String(product.merchant_id)) || product.merchant,
  }));
  products = nextProducts;
  notify();
  return products;
};

export const addMarketplaceProduct = (product: Omit<MarketplaceProduct, 'id'>) => {
  const created = { ...product, id: `product-${Date.now()}` };
  return created;
};

export const getProductConversationId = (clientId: string, merchantId: string) => `merchant_${clientId}_${merchantId}`;

export const getProduct = (productId: string) => products.find((product) => product.id === productId);

export const createProductConversation = (productId: string, clientId: string, clientName = 'Pet Parent') => {
  const product = getProduct(productId);
  if (!product) return undefined;
  const conversationId = getProductConversationId(clientId, product.merchantId);
  const existing = conversations.find((conversation) => conversation.id === conversationId);
  if (existing) {
    const updated = { ...existing, product };
    conversations = conversations.map((conversation) => conversation.id === conversationId ? updated : conversation);
    notify();
    return updated;
  }
  const conversation: ProductConversation = {
    id: conversationId,
    productId,
    product,
    clientName,
    paymentStatus: 'unpaid',
    messages: [{ id: `message-${Date.now()}`, sender: 'client', text: `Hi, I am interested in the ${product.name}.`, createdAt: Date.now() }],
  };
  conversations = [conversation, ...conversations];
  notify();
  return conversation;
};

export const resolveProductInquiryClient = async (conversationId: string, merchantId: string) => {
  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (messagesError) throw messagesError;

  const lastMessage = messageRows?.[messageRows.length - 1];
  const clientId = lastMessage ? (lastMessage.sender_id === merchantId ? lastMessage.receiver_id : lastMessage.sender_id) : '';

  if (!clientId) {
    return { clientId: '', clientName: 'Pet Parent' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', clientId)
    .maybeSingle();

  if (profileError) throw profileError;

  return {
    clientId,
    clientName: profile?.full_name || 'Pet Parent',
  };
};

export const fetchMerchantProductThreads = async (merchantId: string): Promise<ProductConversation[]> => {
  if (!isUuid(merchantId)) return [];
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const productsForMerchant = (data || []).map(normalizeProduct);
  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('receiver_id', merchantId)
    .order('created_at', { ascending: true });
  if (messagesError) throw messagesError;

  const grouped = new Map<string, RealtimeMessage[]>();
  for (const item of (messageRows || []) as RealtimeMessage[]) {
    const thread = grouped.get(item.sender_id) || [];
    thread.push(item);
    grouped.set(item.sender_id, thread);
  }

  const merchantThreads: ProductConversation[] = Array.from(grouped.entries()).map(([clientId, messages]) => {
    const product = productsForMerchant[0] || {
      id: 'product', name: 'Product inquiry', price: 0, merchant: 'MVS Merchant', merchantId, icon: 'package', category: 'General', stock: 0,
    };
    return {
      id: getProductConversationId(clientId, merchantId),
      productId: product.id,
      product,
      clientId,
      clientName: String(messages[0]?.metadata?.sender_name || 'Pet Parent'),
      paymentStatus: 'unpaid' as const,
      messages: messages.map((item) => ({ id: item.id, sender: item.sender_id === merchantId ? 'merchant' : 'client', text: item.content, createdAt: Date.parse(item.created_at) })),
    };
  });

  conversations = merchantThreads.length > 0 ? merchantThreads : conversations;
  notify();
  return merchantThreads;
};

export const addConversationMessage = (conversationId: string, sender: MarketplaceMessage['sender'], text: string) => {
  conversations = conversations.map((conversation) => conversation.id === conversationId
    ? { ...conversation, messages: [...conversation.messages, { id: `message-${Date.now()}`, sender, text, createdAt: Date.now() }] }
    : conversation);
  notify();
};

export const markConversationPaid = (conversationId: string) => {
  conversations = conversations.map((conversation) => conversation.id === conversationId ? { ...conversation, paymentStatus: 'paid' } : conversation);
  notify();
};
