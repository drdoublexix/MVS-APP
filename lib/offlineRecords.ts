import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OfflineRecordKind =
  | 'farm_batch'
  | 'farm_daily_log'
  | 'pet_soap_record'
  | 'farm_soap_record'
  | 'pet_soap_delete'
  | 'farm_soap_delete'
  | 'pet_medical_record'
  | 'farm_medical_record'
  | 'farm_daily_log_delete'
  | 'consultation_status';

export type OfflineRecordOperation = {
  id: string;
  userId: string;
  kind: OfflineRecordKind;
  payload: Record<string, unknown>;
  createdAt: string;
  lastError?: string;
};

type OfflineSnapshot<T> = {
  value: T;
  savedAt: string;
};

const queueKey = (userId: string) => `mvs_offline_records:${userId}`;
const snapshotKey = (userId: string, key: string) => `mvs_offline_snapshot:${userId}:${key}`;
const queueListeners = new Set<(userId: string) => void>();
const syncPromises = new Map<string, Promise<{ synced: number; remaining: number; error?: string }>>();
let storageQueue: Promise<void> = Promise.resolve();

const withStorageLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
};

const notifyQueueChanged = (userId: string) => {
  for (const listener of queueListeners) listener(userId);
};

export const subscribeToOfflineQueue = (listener: (userId: string) => void) => {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
};

export const createOfflineRecordId = () => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Secure random identifiers are unavailable on this device.');
};

const readQueueUnlocked = async (userId: string): Promise<OfflineRecordOperation[]> => {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Offline record queue is invalid and could not be read.');
  return parsed as OfflineRecordOperation[];
};

export const readOfflineRecords = async (userId: string) => withStorageLock(() => readQueueUnlocked(userId));

export const enqueueOfflineRecord = async (
  userId: string,
  kind: OfflineRecordKind,
  payload: Record<string, unknown>,
) => {
  const recordId = typeof payload.id === 'string' ? payload.id : createOfflineRecordId();
  const normalizedPayload = { ...payload, id: recordId };
  await withStorageLock(async () => {
    const queue = await readQueueUnlocked(userId);
    const matchingIndex = queue.findIndex((operation) => (
      operation.kind === kind && operation.payload.id === recordId
    ));
    const operation: OfflineRecordOperation = {
      id: matchingIndex >= 0 ? queue[matchingIndex].id : createOfflineRecordId(),
      userId,
      kind,
      payload: normalizedPayload,
      createdAt: matchingIndex >= 0 ? queue[matchingIndex].createdAt : new Date().toISOString(),
    };
    if (matchingIndex >= 0) queue[matchingIndex] = operation;
    else queue.push(operation);
    queue.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
  });
  notifyQueueChanged(userId);
  return normalizedPayload;
};

export const getOfflineQueueCount = async (userId: string) => (await readOfflineRecords(userId)).length;

export const saveOfflineSnapshot = async <T>(userId: string, key: string, value: T) => {
  await AsyncStorage.setItem(snapshotKey(userId, key), JSON.stringify({
    value,
    savedAt: new Date().toISOString(),
  } satisfies OfflineSnapshot<T>));
};

export const readOfflineSnapshot = async <T>(userId: string, key: string): Promise<OfflineSnapshot<T> | null> => {
  const raw = await AsyncStorage.getItem(snapshotKey(userId, key));
  if (!raw) return null;
  return JSON.parse(raw) as OfflineSnapshot<T>;
};

const sendOperation = async (operation: OfflineRecordOperation) => {
  const payload = operation.payload;
  switch (operation.kind) {
    case 'farm_batch': {
      const { error } = await supabase.from('farm_batches').upsert(payload);
      if (error) throw error;
      return;
    }
    case 'farm_daily_log': {
      const { error } = await supabase.from('farm_daily_logs').upsert(payload, { onConflict: 'batch_id,log_date' });
      if (error) throw error;
      return;
    }
    case 'farm_daily_log_delete': {
      const { error } = await supabase.from('farm_daily_logs').delete().eq('id', String(payload.id));
      if (error) throw error;
      return;
    }
    case 'pet_soap_record': {
      const { error } = await supabase.from('pet_soap_records').upsert(payload);
      if (error) throw error;
      return;
    }
    case 'farm_soap_record': {
      const { error } = await supabase.from('farm_soap_records').upsert(payload);
      if (error) throw error;
      return;
    }
    case 'pet_soap_delete': {
      const { error } = await supabase.from('pet_soap_records').update({ is_deleted: true }).eq('id', String(payload.id));
      if (error) throw error;
      return;
    }
    case 'farm_soap_delete': {
      const { error } = await supabase.from('farm_soap_records').update({ is_deleted: true }).eq('id', String(payload.id));
      if (error) throw error;
      return;
    }
    case 'pet_medical_record': {
      const { error } = await supabase.from('pet_medical_records').upsert(payload);
      if (error) throw error;
      return;
    }
    case 'farm_medical_record': {
      const { error } = await supabase.from('farm_medical_records').upsert(payload);
      if (error) throw error;
      return;
    }
    case 'consultation_status': {
      const { error } = await supabase
        .from('consultations')
        .update({ status: payload.status })
        .eq('id', String(payload.id))
        .eq('conversation_id', String(payload.conversation_id));
      if (error) throw error;
    }
  }
};

export const syncOfflineRecords = (userId: string) => {
  const existing = syncPromises.get(userId);
  if (existing) return existing;

  const syncPromise = (async () => {
    const network = await NetInfo.fetch();
    if (network.isConnected !== true || network.isInternetReachable === false) {
      return { synced: 0, remaining: await getOfflineQueueCount(userId) };
    }

    let synced = 0;
    const operations = await readOfflineRecords(userId);
    for (const operation of operations) {
      if (operation.userId !== userId) continue;
      try {
        await sendOperation(operation);
        await withStorageLock(async () => {
          const current = await readQueueUnlocked(userId);
          await AsyncStorage.setItem(queueKey(userId), JSON.stringify(current.filter((item) => item.id !== operation.id)));
        });
        synced += 1;
        notifyQueueChanged(userId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not sync this saved record.';
        console.error(`[Offline Sync] Could not sync ${operation.kind} (${operation.id}):`, error);
        await withStorageLock(async () => {
          const current = await readQueueUnlocked(userId);
          await AsyncStorage.setItem(queueKey(userId), JSON.stringify(current.map((item) => (
            item.id === operation.id ? { ...item, lastError: message } : item
          ))));
        });
        notifyQueueChanged(userId);
        return { synced, remaining: (await getOfflineQueueCount(userId)), error: message };
      }
    }
    return { synced, remaining: await getOfflineQueueCount(userId) };
  })().finally(() => {
    syncPromises.delete(userId);
  });
  syncPromises.set(userId, syncPromise);
  return syncPromise;
};

export const syncCurrentUserOfflineRecords = async (user: User | null) => {
  if (!user?.id) return { synced: 0, remaining: 0 };
  return syncOfflineRecords(user.id);
};
