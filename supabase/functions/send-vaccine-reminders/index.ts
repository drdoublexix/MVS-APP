// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const expoPushUrl = "https://exp.host/--/api/v2/push/send";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("EXPO_PUBLIC_VAPID_KEY");
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const sendExpoNotification = async (token: string, payload: Record<string, unknown>) => {
  const response = await fetch(expoPushUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json().catch(() => null);
  if (!response.ok || responseData?.data?.status === "error") {
    throw new Error(responseData?.message || "Expo push request failed");
  }

  return responseData;
};

const sendWebNotification = async (subscriptionString: string, title: string, body: string, data: Record<string, unknown>) => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("Web push VAPID keys are not configured for this Edge Function.");
  }

  const parsedSubscription = JSON.parse(subscriptionString);
  webPush.setVapidDetails("mailto:admin@mvsapp.com.ng", vapidPublicKey, vapidPrivateKey);
  await webPush.sendNotification(parsedSubscription, JSON.stringify({ title, body, data }));
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing.");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: reminders, error: reminderError } = await supabase.rpc("get_due_vaccination_reminders");
    if (reminderError) throw reminderError;

    const results = [];
    for (const reminder of reminders || []) {
      const [{ data: profile, error: profileError }, { data: record, error: recordError }] = await Promise.all([
        supabase.from("profiles").select("expo_push_token, web_push_subscription").eq("id", reminder.owner_id).maybeSingle(),
        supabase.from("pet_medical_records").select("pet_id").eq("id", reminder.record_id).maybeSingle(),
      ]);

      if (profileError || recordError) {
        console.error("Failed to load reminder recipient data:", profileError || recordError);
        results.push({ recordId: reminder.record_id, sent: false, reason: "recipient lookup failed" });
        continue;
      }

      const daysRemaining = Number(reminder.days_remaining);
      const title = "Vaccination Due Reminder 🐾";
      const body = `${reminder.pet_name}'s ${reminder.treatment_title} (${reminder.dose_info}) is due in ${daysRemaining} day(s)! Tap to view details or book a vet.`;
      const data = { petId: record?.pet_id || null, recordId: reminder.record_id, url: "/" };

      const outcome = { recordId: reminder.record_id, sent: false, expo: false, web: false };

      try {
        if (profile?.expo_push_token) {
          await sendExpoNotification(profile.expo_push_token, { to: profile.expo_push_token, sound: "default", title, body, data });
          outcome.expo = true;
        }
      } catch (error) {
        console.error("Expo push request failed for vaccine reminder:", error);
      }

      try {
        if (profile?.web_push_subscription) {
          await sendWebNotification(profile.web_push_subscription, title, body, data);
          outcome.web = true;
        }
      } catch (error) {
        console.error("Web push request failed for vaccine reminder:", error);
      }

      outcome.sent = outcome.expo || outcome.web;
      results.push(outcome);
    }

    const { data: farmReminders, error: farmReminderError } = await supabase.rpc("get_due_farm_treatment_reminders");
    if (farmReminderError) throw farmReminderError;

    for (const reminder of farmReminders || []) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("expo_push_token, web_push_subscription")
        .eq("id", reminder.owner_id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to load farm reminder recipient data:", profileError);
        results.push({ recordId: reminder.record_id, sent: false, reason: "recipient lookup failed" });
        continue;
      }

      const daysRemaining = Number(reminder.days_remaining);
      const title = "Livestock Treatment Due Reminder";
      const body = `${reminder.species}'s ${reminder.treatment_title} is due in ${daysRemaining} day(s). Tap to view the farm medical timeline.`;
      const data = { farmId: reminder.farm_id, recordId: reminder.record_id, url: "/profile" };
      const outcome = { recordId: reminder.record_id, sent: false, expo: false, web: false };

      try {
        if (profile?.expo_push_token) {
          await sendExpoNotification(profile.expo_push_token, { to: profile.expo_push_token, sound: "default", title, body, data });
          outcome.expo = true;
        }
      } catch (error) {
        console.error("Expo push request failed for farm treatment reminder:", error);
      }

      try {
        if (profile?.web_push_subscription) {
          await sendWebNotification(profile.web_push_subscription, title, body, data);
          outcome.web = true;
        }
      } catch (error) {
        console.error("Web push request failed for farm treatment reminder:", error);
      }

      outcome.sent = outcome.expo || outcome.web;
      results.push(outcome);
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    console.error("Vaccine reminder function error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
