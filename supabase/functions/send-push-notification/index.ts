import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { recipientId, title, body, data } = (await req.json()) as PushPayload;

    if (!recipientId || !title || !body) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: recipientId, title, or body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch recipient's token from profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', recipientId)
      .single();

    if (profileError || !profile?.expo_push_token) {
      return new Response(JSON.stringify({ error: 'Push token not found for user.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send payload to Expo Push API
    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: profile.expo_push_token,
        sound: 'default',
        title,
        body,
        data: data || {},
      }),
    });

    const pushResult = await pushResponse.json();

    return new Response(JSON.stringify({ success: true, result: pushResult }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
