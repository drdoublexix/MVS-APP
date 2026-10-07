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
const vaccineReminderCronSecret = Deno.env.get("VACCINE_REMINDER_CRON_SECRET");

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

const getPushFailureStatus = (error: unknown) =>
  typeof error === "object" && error !== null && "statusCode" in error
    ? String(error.statusCode)
    : "unknown";

const deliverReminderToRecipients = async ({
  supabase,
  recipientIds,
  title,
  bodyForRecipient,
  reminderDedupeKey,
  data,
  recordId,
  retryExisting,
}: {
  supabase: ReturnType<typeof createClient>;
  recipientIds: string[];
  title: string;
  bodyForRecipient: (recipientId: string) => string;
  reminderDedupeKey: string;
  data: Record<string, unknown>;
  recordId: string;
  retryExisting: boolean;
}) => {
  const outcomes = [];

  for (const recipientId of new Set(recipientIds)) {
    const body = bodyForRecipient(recipientId);
    const recipientDedupeKey = `${reminderDedupeKey}:${recipientId}`;
    const { data: storedNotification, error: notificationError } = await supabase.from("notifications").upsert({
      user_id: recipientId,
      title,
      body,
      read_status: false,
      reminder_dedupe_key: recipientDedupeKey,
    }, { onConflict: "reminder_dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();

    if (notificationError) {
      console.error("Failed to persist treatment reminder notification:", notificationError);
      outcomes.push({ recordId, recipientId, sent: false, reason: "notification persistence failed" });
      continue;
    }

    let notification = storedNotification;
    const duplicate = !notification;

    if (duplicate && retryExisting) {
      const { data: existingNotification, error: existingNotificationError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", recipientId)
        .eq("reminder_dedupe_key", recipientDedupeKey)
        .maybeSingle();

      if (existingNotificationError || !existingNotification) {
        console.error("Failed to load existing treatment reminder for retry:", existingNotificationError);
        outcomes.push({ recordId, recipientId, sent: false, duplicate: true, reason: "existing notification lookup failed" });
        continue;
      }

      notification = existingNotification;
    } else if (duplicate) {
      outcomes.push({ recordId, recipientId, sent: false, duplicate: true });
      continue;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("expo_push_token, web_push_subscription")
      .eq("id", recipientId)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load treatment reminder recipient data:", profileError);
      outcomes.push({ recordId, recipientId, sent: false, reason: "recipient lookup failed" });
      continue;
    }

    const notificationData = { ...data, notificationId: notification.id };
    const outcome = { recordId, recipientId, sent: false, expo: false, web: false, duplicate, expoErrorStatus: null as string | null, webErrorStatus: null as string | null };

    try {
      if (profile?.expo_push_token) {
        await sendExpoNotification(profile.expo_push_token, {
          to: profile.expo_push_token,
          sound: "default",
          title,
          body,
          data: notificationData,
        });
        outcome.expo = true;
      }
    } catch (error) {
      console.error("Expo push request failed for treatment reminder:", error);
      outcome.expoErrorStatus = getPushFailureStatus(error);
    }

    try {
      if (profile?.web_push_subscription) {
        await sendWebNotification(profile.web_push_subscription, title, body, notificationData);
        outcome.web = true;
      }
    } catch (error) {
      console.error("Web push request failed for treatment reminder:", error);
      outcome.webErrorStatus = getPushFailureStatus(error);
    }

    outcome.sent = outcome.expo || outcome.web;
    outcomes.push(outcome);
  }

  return outcomes;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing.");
    if (!vaccineReminderCronSecret || req.headers.get("x-cron-secret") !== vaccineReminderCronSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const requestBody = await req.json();
    const retryExisting = requestBody?.retry_delivery === true;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: reminders, error: reminderError } = await supabase.rpc("get_due_vaccination_reminders");
    if (reminderError) throw reminderError;

    const results = [];
    for (const reminder of reminders || []) {
      const title = "Treatment Due Reminder 🐾";
      const dueLabel = reminder.reminder_label === "today"
        ? "due today"
        : `due in ${reminder.reminder_label}`;
      const outcomes = await deliverReminderToRecipients({
        supabase,
        recipientIds: [reminder.owner_id, reminder.vet_id],
        title,
        bodyForRecipient: (recipientId) => recipientId === reminder.vet_id
          ? `The ${reminder.treatment_title} you logged for ${reminder.pet_name} (${reminder.dose_info}) is ${dueLabel}.`
          : `${reminder.pet_name}'s ${reminder.treatment_title} (${reminder.dose_info}) is ${dueLabel}. Tap to view details or book a vet.`,
        reminderDedupeKey: `pet:${reminder.record_id}:${new Date(reminder.due_date).toISOString()}:${reminder.reminder_label}`,
        data: { petId: reminder.pet_id, recordId: reminder.record_id, url: "/" },
        recordId: reminder.record_id,
        retryExisting,
      });
      results.push(...outcomes);
    }

    const { data: farmReminders, error: farmReminderError } = await supabase.rpc("get_due_farm_treatment_reminders");
    if (farmReminderError) throw farmReminderError;

    for (const reminder of farmReminders || []) {
      const title = "Livestock Treatment Due Reminder";
      const dueLabel = reminder.reminder_label === "today"
        ? "due today"
        : `due in ${reminder.reminder_label}`;
      const outcomes = await deliverReminderToRecipients({
        supabase,
        recipientIds: [reminder.owner_id, reminder.vet_id],
        title,
        bodyForRecipient: (recipientId) => recipientId === reminder.vet_id
          ? `The ${reminder.treatment_title} you logged for ${reminder.species} is ${dueLabel}.`
          : `${reminder.species}'s ${reminder.treatment_title} is ${dueLabel}. Tap to view the farm medical timeline.`,
        reminderDedupeKey: `farm:${reminder.record_id}:${new Date(reminder.next_due_date).toISOString()}:${reminder.reminder_label}`,
        data: { farmId: reminder.farm_id, recordId: reminder.record_id, url: "/profile" },
        recordId: reminder.record_id,
        retryExisting,
      });
      results.push(...outcomes);
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    console.error("Vaccine reminder function error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
