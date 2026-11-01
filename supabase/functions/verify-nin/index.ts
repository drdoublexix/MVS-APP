// @ts-nocheck Supabase Edge Functions run in Deno, not the Expo TypeScript runtime.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let nin: string;
  let hasConsent: boolean;
  let mode: "signup" | "profile" | "attach";
  let verificationId: string;
  try {
    const body = await req.json();
    nin = typeof body?.nin === "string" ? body.nin : "";
    hasConsent = body?.consent === true;
    mode = body?.mode === "profile" || body?.mode === "attach" ? body.mode : "signup";
    verificationId = typeof body?.verificationId === "string" ? body.verificationId : "";
  } catch {
    return jsonResponse({ error: "A valid request body is required." }, 400);
  }

  const premblySecretKey = Deno.env.get("PREMBLY_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "NIN verification is not configured. Please contact support." }, 503);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const authorization = req.headers.get("Authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "").trim();
  let authenticatedUser: { id: string } | null = null;
  if (mode === "profile" || mode === "attach") {
    if (!accessToken) return jsonResponse({ error: "Sign in before adding a NIN to your profile." }, 401);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) return jsonResponse({ error: "Your session is invalid. Please sign in again." }, 401);
    authenticatedUser = user;
  }

  if (mode === "attach") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(verificationId)) {
      return jsonResponse({ error: "Verify your NIN again before saving." }, 400);
    }
    const { data, error: attachError } = await supabaseAdmin.rpc("attach_verified_nin_to_profile", {
      p_user_id: authenticatedUser!.id,
      p_verification_id: verificationId,
    });
    if (attachError) {
      console.error("[NIN Verification] Could not attach verified NIN:", attachError.message);
      return jsonResponse({ error: attachError.message || "Could not save your verified NIN." }, 422);
    }
    const result = Array.isArray(data) ? data[0] : null;
    if (!result) return jsonResponse({ error: "Could not save your verified NIN." }, 500);
    return jsonResponse(result);
  }

  if (!premblySecretKey) {
    return jsonResponse({ error: "NIN verification is not configured. Please contact support." }, 503);
  }

  if (!hasConsent) {
    return jsonResponse({ error: "Consent is required for NIN verification." }, 400);
  }
  if (!/^\d{11}$/.test(nin)) {
    return jsonResponse({ error: "Enter a valid 11-digit NIN." }, 400);
  }

  if (mode === "profile") {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("nin_verified")
      .eq("id", authenticatedUser!.id)
      .maybeSingle();
    if (profileError) {
      console.error("[NIN Verification] Could not check existing NIN status:", profileError.message);
      return jsonResponse({ error: "Could not check your NIN status. Please try again." }, 503);
    }
    if (!profile || profile.nin_verified) {
      return jsonResponse({ error: "This account already has a verified NIN." }, 409);
    }
  }

  try {
    const ipAddress = req.headers.get("cf-connecting-ip") || "unknown";
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(premblySecretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const ipDigest = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(ipAddress));
    const ipHash = Array.from(new Uint8Array(ipDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const { data: rateAllowed, error: rateLimitError } = await supabaseAdmin.rpc("consume_nin_lookup_rate_limit", {
      p_ip_hash: ipHash,
    });
    if (rateLimitError) {
      console.error("[NIN Verification] Rate-limit check failed:", rateLimitError.message);
      return jsonResponse({ error: "NIN verification is temporarily unavailable. Please try again." }, 503);
    }
    if (!rateAllowed) {
      return jsonResponse({ error: "Too many NIN checks. Please wait 15 minutes and try again." }, 429);
    }

    let providerResponse: Response;
    try {
      providerResponse = await fetch("https://api.prembly.com/verification/vnin-basic", {
        method: "POST",
        headers: {
          "x-api-key": premblySecretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: nin }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (providerError) {
      console.error(
        "[NIN Verification] Prembly request failed:",
        providerError instanceof Error ? providerError.message : "unknown network failure",
      );
      return jsonResponse({ error: "NIN verification is temporarily unavailable. Please try again." }, 502);
    }

    let providerData;
    try {
      providerData = await providerResponse.json();
    } catch {
      return jsonResponse({ error: "The identity verification service returned an invalid response." }, 502);
    }

    const record = providerData?.data;
    const firstName = typeof record?.firstname === "string" ? record.firstname.trim() : "";
    const middleName = typeof record?.middlename === "string" ? record.middlename.trim() : "";
    const lastName = typeof record?.surname === "string" ? record.surname.trim() : "";
    const returnedNin = typeof record?.nin === "string" ? record.nin.trim() : "";
    if (
      !providerResponse.ok ||
      providerData?.response_code !== "00" ||
      !firstName ||
      !lastName ||
      (returnedNin && returnedNin !== nin)
    ) {
      return jsonResponse({ error: "We could not verify that NIN. Check the number and try again." }, 422);
    }

    const { error: cleanupError } = await supabaseAdmin
      .from("signup_nin_verifications")
      .delete()
      .lt("expires_at", new Date().toISOString());
    if (cleanupError) {
      console.error("[NIN Verification] Expired verification cleanup failed:", cleanupError.message);
      return jsonResponse({ error: "NIN verification is temporarily unavailable. Please try again." }, 503);
    }

    const verificationId = crypto.randomUUID();
    const { error: insertError } = await supabaseAdmin.from("signup_nin_verifications").insert({
      id: verificationId,
      nin,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      consent_at: new Date().toISOString(),
      purpose: mode,
      user_id: mode === "profile" ? authenticatedUser!.id : null,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    if (insertError) {
      console.error("[NIN Verification] Could not store pending verification:", insertError.message);
      return jsonResponse({ error: "NIN verification is temporarily unavailable. Please try again." }, 503);
    }

    return jsonResponse({ verificationId, firstName, middleName, lastName, ninSuffix: nin.slice(-4) });
  } catch (unexpectedError) {
    console.error(
      "[NIN Verification] Unexpected failure:",
      unexpectedError instanceof Error ? unexpectedError.message : "unknown server failure",
    );
    return jsonResponse({ error: "NIN verification is temporarily unavailable. Please try again." }, 502);
  }
});
