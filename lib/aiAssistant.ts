export type AiMessage = {
  role: 'user' | 'assistant' | 'model';
  content: string;
};

const aiAssistantUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-assistant`;

export const requestAiAssistant = async (messages: AiMessage[], role: 'client' | 'vet') => {
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  const response = await fetch(aiAssistantUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ messages, role }),
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