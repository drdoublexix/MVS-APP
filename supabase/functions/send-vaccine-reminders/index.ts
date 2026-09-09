// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const expoPushUrl = "https://exp.host/--/api/v2/push/send";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

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
        supabase.from("profiles").select("expo_push_token").eq("id", reminder.owner_id).maybeSingle(),
        supabase.from("pet_medical_records").select("pet_id").eq("id", reminder.record_id).maybeSingle(),
      ]);

      if (profileError || recordError) {
        console.error("Failed to load reminder recipient data:", profileError || recordError);
        results.push({ recordId: reminder.record_id, sent: false, reason: "recipient lookup failed" });
        continue;
      }
      if (!profile?.expo_push_token) {
        results.push({ recordId: reminder.record_id, sent: false, reason: "missing expo push token" });
        continue;
      }

      const daysRemaining = Number(reminder.days_remaining);
      const payload = {
        to: profile.expo_push_token,
        sound: "default",
        title: "Vaccination Due Reminder 🐾",
        body: `${reminder.pet_name}'s ${reminder.treatment_title} (${reminder.dose_info}) is due in ${daysRemaining} day(s)! Tap to view details or book a vet.`,
        data: { petId: record?.pet_id || null, recordId: reminder.record_id },
      };
      const response = await fetch(expoPushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok || responseData?.data?.status === "error") {
        console.error("Expo push API error:", responseData);
        results.push({ recordId: reminder.record_id, sent: false, reason: "Expo push request failed" });
        continue;
      }
      results.push({ recordId: reminder.record_id, sent: true });
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    console.error("Vaccine reminder function error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
