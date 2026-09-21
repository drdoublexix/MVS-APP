// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestBody = (await req.json()) as Partial<PushPayload> & { user_id?: string };
    const recipientId = requestBody.recipientId || requestBody.user_id;
    const { title, body, data: payloadData } = requestBody;

    if (!recipientId || !title || !body) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: recipientId/user_id, title, or body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: storedNotification, error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: recipientId,
        title,
        body,
        read_status: false,
      })
      .select('id')
      .single();

    if (notificationError) {
      console.error('Failed to persist notification before push delivery:', notificationError);
      return new Response(JSON.stringify({ error: 'Notification could not be saved.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('expo_push_token, web_push_subscription')
      .eq('id', recipientId)
      .limit(1);

    const profile = Array.isArray(profileRows) ? profileRows[0] ?? null : null;

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found for user.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deliveryResult: Record<string, unknown> = {
      expo: null,
      web: null,
    };

    const notificationData = {
      ...(payloadData || {}),
      notificationId: storedNotification.id,
      url: payloadData?.url || '/',
    };

    if (profile.expo_push_token) {
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
          data: notificationData,
        }),
      });

      deliveryResult.expo = await pushResponse.json();
    }

    if (profile.web_push_subscription) {
      const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('EXPO_PUBLIC_VAPID_KEY');
      const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

      if (vapidPublicKey && vapidPrivateKey) {
        try {
          const parsedSubscription = JSON.parse(profile.web_push_subscription);
          webPush.setVapidDetails(
            'mailto:admin@mvsapp.com.ng',
            vapidPublicKey,
            vapidPrivateKey
          );

          const browserPayload = JSON.stringify({
            title,
            body,
            data: notificationData,
          });

          await webPush.sendNotification(parsedSubscription, browserPayload);
          deliveryResult.web = { sent: true };
        } catch (webPushError) {
          deliveryResult.web = {
            sent: false,
            error: webPushError instanceof Error ? webPushError.message : String(webPushError),
          };
        }
      } else {
        deliveryResult.web = {
          sent: false,
          error: 'VAPID_PRIVATE_KEY is not configured on the Edge Function.',
        };
      }
    }

    return new Response(JSON.stringify({ success: true, result: deliveryResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
