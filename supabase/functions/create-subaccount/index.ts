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
    const { userId, bankCode, accountNumber, businessName, email, phone } = await req.json();

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
        business_name: businessName || "MVS Partner",
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

    const subaccountId = flwData.data.subaccount_id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

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
