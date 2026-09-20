// @ts-nocheck Supabase Edge Functions run in Deno, not the Expo TypeScript runtime.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, bankCode, accountNumber, accountName, businessName, email, phone } = await req.json();
    if (!userId || !bankCode || !accountNumber || !accountName) {
      return new Response(JSON.stringify({ success: false, error: "User, bank, account number, and account name are required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization");
    const accessToken = authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken || !supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: "Authentication or Supabase service configuration is missing." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
    if (!user || user.id !== userId) {
      return new Response(JSON.stringify({ success: false, error: "You can only create a subaccount for your own profile." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const flwSecretKey = Deno.env.get("FLW_SECRET_KEY");
    if (!flwSecretKey) {
      return new Response(
        JSON.stringify({ success: false, error: "FLW_SECRET_KEY is missing in Supabase Edge Function secrets." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const flwResponse = await fetch("https://api.flutterwave.com/v3/subaccounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flwSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_bank: bankCode,
        account_number: accountNumber,
        business_name: businessName || accountName || "MVS Partner",
        business_email: email || "partner@mvsc.com.ng",
        business_mobile: phone || "08000000000",
        country: "NG",
        split_type: "percentage",
        split_value: 0.10,
      }),
    });

    const flwData = await flwResponse.json();

    if (flwData.status !== "success") {
      console.error("Flutterwave API Error:", flwData);
      return new Response(
        JSON.stringify({ success: false, error: flwData.message || "Flutterwave subaccount creation failed." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subaccountId = flwData.data?.subaccount_id;
    if (typeof subaccountId !== "string" || !/^RS_[A-Za-z0-9_-]+$/.test(subaccountId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave returned an invalid subaccount ID." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: dbError } = await supabaseAdmin
      .from("profiles")
      .update({ flutterwave_subaccount_id: subaccountId })
      .eq("id", userId);

    if (dbError) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to persist subaccount ID: " + dbError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, subaccount_id: subaccountId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Internal server error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
