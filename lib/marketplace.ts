import { useEffect, useState } from 'react';
import { supabase } from './supabase';

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
  merchantId: String(product.merchant_id || product.merchantId || product.merchant || 'merchant'),
  icon: product.icon || 'package',
  category: product.category || 'General',
  stock: Number(product.stock || 0),
  imageUrl: product.image_url || product.imageUrl || undefined,
  description: product.description || '',
});

let products: MarketplaceProduct[] = [];
let conversations: ProductConversation[] = [];
let vetConversations: VetConversation[] = [
  { id: 'vet-1', vet: 'Dr. Ade Williams', category: 'Vaccination', messages: [{ id: 'vet-message-1', sender: 'vet', text: 'Please share your pet vaccination record.', createdAt: Date.now() }] },
  { id: 'vet-2', vet: 'Pawsitive Care Veterinary', category: 'Pet Checks', messages: [{ id: 'vet-message-2', sender: 'vet', text: 'Appointment confirmed for tomorrow.', createdAt: Date.now() }] },
];
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
  return { products, conversations, vetConversations };
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

  const nextProducts = (data || []).map(normalizeProduct);
  products = nextProducts;
  notify();
  return products;
};

export const addMarketplaceProduct = (product: Omit<MarketplaceProduct, 'id'>) => {
  const created = { ...product, id: `product-${Date.now()}` };
  return created;
};

export const getProductConversationId = (productId: string) => `product_${productId}`;

export const getProduct = (productId: string) => products.find((product) => product.id === productId);

export const createProductConversation = (productId: string, clientName = 'Pet Parent') => {
  const product = getProduct(productId);
  if (!product) return undefined;
  const conversationId = getProductConversationId(productId);
  const existing = conversations.find((conversation) => conversation.id === conversationId && conversation.clientName === clientName);
  if (existing) return existing;
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
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const merchantThreads: ProductConversation[] = [];

  for (const product of data || []) {
    const conversationId = getProductConversationId(String(product.id));
    const { clientId, clientName } = await resolveProductInquiryClient(conversationId, merchantId);

    merchantThreads.push({
      id: conversationId,
      productId: String(product.id),
      product: normalizeProduct(product),
      clientId,
      clientName,
      paymentStatus: 'unpaid' as const,
      messages: [],
    });
  }

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

export const addVetConversationMessage = (conversationId: string, sender: 'client' | 'vet', text: string) => {
  vetConversations = vetConversations.map((conversation) => conversation.id === conversationId
    ? { ...conversation, messages: [...conversation.messages, { id: `vet-message-${Date.now()}`, sender, text, createdAt: Date.now() }] }
    : conversation);
  notify();
};

export const createVetConversation = (vet: string, category: string, conversationId?: string) => {
  const existing = vetConversations.find((conversation) => conversationId
    ? conversation.id === conversationId
    : conversation.vet === vet && conversation.category === category);
  if (existing) return existing;
  const conversation: VetConversation = {
    id: conversationId || `vet-conversation-${Date.now()}`,
    vet,
    category,
    messages: [{ id: `vet-message-${Date.now()}`, sender: 'vet', text: 'Your consultation request is ready. How can I help?', createdAt: Date.now() }],
  };
  vetConversations = [conversation, ...vetConversations];
  notify();
  return conversation;
};

export const markConversationPaid = (conversationId: string) => {
  conversations = conversations.map((conversation) => conversation.id === conversationId ? { ...conversation, paymentStatus: 'paid' } : conversation);
  notify();
};
