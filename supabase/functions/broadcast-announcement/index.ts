// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedAudiences = new Set(["all", "vet", "merchant", "client"]);
const resendUrl = "https://api.resend.com/emails";
const defaultAppUrl = "https://mvsapp.com.ng";

type AnnouncementPayload = {
  targetAudience?: string;
  title?: string;
  body?: string;
  sendEmail?: boolean;
};

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const constantTimeEqual = (actual: string, expected: string) => {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const buildAnnouncementEmailHtml = (title: string, body: string, appUrl: string) => {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replaceAll("\n", "<br>");
  const safeAppUrl = escapeHtml(appUrl);

  return `
    <div style="margin:0;padding:32px 16px;background:#0b1224;color:#d7e0ee;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
      <div style="width:100%;max-width:560px;margin:0 auto;background:#0f172a;border-radius:18px;overflow:hidden;">
        <div style="padding:34px 28px 28px;text-align:center;background:#0f172a;">
          <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;">${safeTitle}</h1>
          <p style="margin:12px 0 0;color:#94a3b8;font-size:16px;">Mobile Veterinary Services</p>
        </div>
        <div style="margin:0 24px 24px;padding:30px 28px;background:#1b2a3d;border:1px solid #334155;border-radius:12px;">
          <div style="color:#d7e0ee;font-size:16px;">${safeBody}</div>
          <div style="margin-top:28px;text-align:center;">
            <a href="${safeAppUrl}" style="display:inline-block;padding:13px 24px;background:#00c389;color:#ffffff;border-radius:7px;font-size:16px;font-weight:700;text-decoration:none;">View Dashboard</a>
          </div>
          <p style="margin:28px 0 0;color:#94a3b8;font-size:14px;">This is an automated notification. Please do not reply to this email; this inbox is not monitored.</p>
        </div>
        <div style="margin:0 24px;padding:22px 0 28px;border-top:1px solid #26364c;text-align:center;color:#64748b;font-size:13px;">
          &copy; Mobile Veterinary Services. All rights reserved.
        </div>
      </div>
    </div>
  `;
};

const sendEmail = async (profile: Profile, title: string, body: string, apiKey: string, fromEmail: string) => {
  const response = await fetch(resendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [profile.email],
      subject: title,
      text: body,
      html: buildAnnouncementEmailHtml(title, body, Deno.env.get("ANNOUNCEMENT_APP_URL") || defaultAppUrl),
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${responseBody}`);
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const expectedSecret = Deno.env.get("BROADCAST_ADMIN_SECRET");
    const suppliedSecret = req.headers.get("x-broadcast-secret") || "";
    if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16_384) return jsonResponse({ error: "Request body is too large." }, 413);

    const payload = await req.json() as AnnouncementPayload;
    const targetAudience = payload.targetAudience || "all";
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const sendEmailRequested = payload.sendEmail === true;

    if (!allowedAudiences.has(targetAudience)) {
      return jsonResponse({ error: "targetAudience must be all, vet, merchant, or client." }, 400);
    }
    if (!title || !body) {
      return jsonResponse({ error: "title and body are required." }, 400);
    }
    if (title.length > 160 || body.length > 8_000) {
      return jsonResponse({ error: "title or body exceeds the allowed length." }, 400);
    }
    if (payload.sendEmail !== undefined && typeof payload.sendEmail !== "boolean") {
      return jsonResponse({ error: "sendEmail must be a boolean." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing.");
    const resendApiKey = sendEmailRequested ? Deno.env.get("RESEND_API_KEY") : null;
    const fromEmail = sendEmailRequested ? Deno.env.get("RESEND_FROM_EMAIL") : null;
    if (sendEmailRequested && (!resendApiKey || !fromEmail)) {
      throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are required when sendEmail is true.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let profilesQuery = supabase
      .from("profiles")
      .select("id, email, full_name, role");
    if (targetAudience !== "all") profilesQuery = profilesQuery.eq("role", targetAudience);

    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) throw profilesError;

    const recipients = (profiles || []) as Profile[];
    const metadata = {
      source: "broadcast-announcement",
      targetAudience,
      sendEmail: sendEmailRequested,
    };
    const notificationRows = recipients.map((profile) => ({
      user_id: profile.id,
      title,
      body,
      metadata,
    }));

    if (notificationRows.length > 0) {
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert(notificationRows);
      if (notificationError) throw notificationError;
    }

    const emailResults = { attempted: 0, sent: 0, skipped: 0, failed: 0 };
    if (sendEmailRequested) {
      for (const profile of recipients) {
        if (!profile.email?.trim()) {
          emailResults.skipped += 1;
          continue;
        }

        emailResults.attempted += 1;
        try {
          await sendEmail(profile, title, body, resendApiKey!, fromEmail!);
          emailResults.sent += 1;
        } catch (error) {
          emailResults.failed += 1;
          console.error(`Announcement email failed for ${profile.id}:`, error);
        }
      }
    }

    return jsonResponse({
      success: true,
      reachedUsers: recipients.length,
      emailResults,
    });
  } catch (error) {
    console.error("Broadcast announcement function error:", error);
    return jsonResponse({ error: "Unable to send announcement." }, 500);
  }
});
