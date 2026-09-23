import { useEffect, useState } from 'react';
import { normalizeUuid, supabase } from './supabase';

export type MarketplaceProduct = {
  id: string;
  name: string;
  price: number;
  merchant: string;
  businessName?: string;
  merchantId: string;
  icon: string;
  category: string;
  stock: number;
  imageUrl?: string;
  images?: string[];
  description?: string;
};

const normalizeProduct = (product: any): MarketplaceProduct => ({
  id: String(product.id),
  name: product.name || 'Pet Product',
  price: Number(product.price || 0),
  merchant: product.profiles?.business_name || product.business_name || 'Nil',
  businessName: product.profiles?.business_name || product.business_name || 'Nil',
  merchantId: normalizeUuid(String(product.merchant_id || product.merchantId || '')) || '',
  icon: product.icon || 'package',
  category: product.category || 'General',
  stock: Number(product.stock || 0),
  imageUrl: product.image_url || product.imageUrl || product.image || product.photo_url || undefined,
  images: Array.isArray(product.images) ? product.images.filter((image: unknown): image is string => typeof image === 'string' && image.length > 0) : [],
  description: product.description || '',
});

let products: MarketplaceProduct[] = [];
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
  return { products };
};

export const fetchMarketplaceProducts = async () => {
  let data: any[] | null = null;
  let error: any = null;
  try {
    const result = await supabase
      .from('products')
      .select('*')
      .gt('stock', 0)
      .order('created_at', { ascending: false });
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    console.warn('[Marketplace] Product fetch unavailable:', fetchError);
    return products;
  }

  if (error) {
    console.warn('[Marketplace] Failed to fetch products:', error.message || error);
    return products;
  }

  const rows = data || [];
  const merchantIds = [...new Set(rows.map((product) => String(product.merchant_id || '')).filter(Boolean))];
  const { data: profiles, error: profilesError } = merchantIds.length > 0
    ? await supabase.from('profiles').select('id, business_name').in('id', merchantIds)
    : { data: [], error: null };
  if (profilesError) console.warn('[Marketplace] Failed to fetch merchant names:', profilesError);
  const merchantBusinessNames = new Map((profiles || []).map((profile) => [profile.id, profile.business_name || 'Nil']));
  const nextProducts = rows.map((product) => normalizeProduct({
    ...product,
    business_name: merchantBusinessNames.get(String(product.merchant_id)) || product.business_name,
  }));
  products = nextProducts;
  notify();
  return products;
};

export const addMarketplaceProduct = (product: Omit<MarketplaceProduct, 'id'>) => {
  const created = { ...product, id: `product-${Date.now()}` };
  return created;
};
