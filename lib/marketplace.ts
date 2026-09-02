import { useEffect, useState } from 'react';
import { normalizeUuid, supabase } from './supabase';

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
