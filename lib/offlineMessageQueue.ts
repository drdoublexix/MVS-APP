import AsyncStorage from '@react-native-async-storage/async-storage';

export type OfflineAsset = {
  uri: string;
  type?: 'image' | 'video';
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type OfflineOneToOneMessage = {
  id: string;
  kind: 'one_to_one';
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  assets: OfflineAsset[];
  replyTo?: { id: string; sender_name: string; content: string } | null;
  createdAt: string;
};

export type OfflineCommunityMessage = {
  id: string;
  kind: 'community';
  userId: string;
  content: string;
  assets: OfflineAsset[];
  replyTo?: { id: string; sender_name: string; content: string } | null;
  createdAt: string;
};

export type OfflineMessage = OfflineOneToOneMessage | OfflineCommunityMessage;

const storageKey = 'mvs_offline_message_queue';

export const createOfflineMessageId = () => `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const readOfflineMessages = async (): Promise<OfflineMessage[]> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOfflineMessages = async (messages: OfflineMessage[]) => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(messages));
};

export const enqueueOfflineMessage = async (message: OfflineMessage) => {
  const messages = await readOfflineMessages();
  await writeOfflineMessages([...messages.filter((item) => item.id !== message.id), message]);
  return message;
};

export const removeOfflineMessage = async (id: string) => {
  const messages = await readOfflineMessages();
  await writeOfflineMessages(messages.filter((message) => message.id !== id));
};

export const replaceOfflineMessages = async (messages: OfflineMessage[]) => {
  await writeOfflineMessages(messages);
};
