import { supabase } from './supabase';

export type AiMessage = {
  role: 'user' | 'assistant' | 'model';
  content: string;
};

const aiAssistantUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-assistant`;

export const requestAiAssistant = async (messages: AiMessage[], role: 'client' | 'vet' | 'merchant') => {
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Sign in to use the MVS Assistant.');
  }

  const response = await fetch(aiAssistantUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ messages: messages.slice(-20), role }),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error('AI Assistant API Error:', data);
    throw new Error(data?.error || 'AI Assistant request failed.');
  }

  const reply = data?.reply || data?.choices?.[0]?.message?.content || '';
  if (!reply) throw new Error('MVS Assistant returned an empty response.');
  return reply as string;
};