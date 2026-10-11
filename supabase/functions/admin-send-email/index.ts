/* eslint-disable import/no-unresolved */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailRequest = {
  recipient_user_id?: unknown;
  subject?: unknown;
  body?: unknown;
};

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const buildMessageEmailHtml = (subject: string, body: string) => {
  const paragraphs = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 16px;color:#cbd5e1;line-height:1.6;font-size:15px;">${escapeHtml(line)}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#000A14;font-family:Arial,Helvetica,sans-serif;">
    <div style="width:100%;box-sizing:border-box;background:#000A14;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#000A14;padding:20px;">
        <div style="text-align:center;padding:20px 0 30px;">
          <h1 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:bold;">Mobile Veterinary Services</h1>
          <p style="margin:0;color:#8a9ba8;font-size:14px;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(subject)}</p>
        </div>
        <div style="background:#0f1c2e;border:1px solid #1e293b;border-radius:8px;padding:32px 24px;">
          ${paragraphs}
        </div>
        <div style="margin-top:20px;padding:20px 0;border-top:1px solid #1e293b;text-align:center;color:#64748b;font-size:13px;">
          &copy; ${new Date().getFullYear()} Mobile Veterinary Services (MVS). All rights reserved.
        </div>
      </div>
    </div>
  </body>
</html>`;
};

serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Mobile Veterinary Services <no-reply@mail.mvsc.com.ng>";
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("Admin email function is missing Supabase or Resend configuration.");
    return jsonResponse({ error: "Email service is not configured." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(authorization.slice(7));
  if (authError || !user?.email_confirmed_at || user.email?.trim().toLowerCase() !== "emmykul89@gmail.com") {
    return jsonResponse({ error: "Not authorized." }, 403);
  }
  const { data: owner, error: ownerError } = await supabase
    .from("admin_users")
    .select("email, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (ownerError) {
    console.error("Could not verify the owner admin record:", ownerError);
    return jsonResponse({ error: "Could not verify administrator access." }, 500);
  }
  if (!owner?.is_super_admin || owner.email?.trim().toLowerCase() !== "emmykul89@gmail.com") {
    return jsonResponse({ error: "Not authorized." }, 403);
  }

  let payload: EmailRequest;
  try {
    const requestBody = await request.text();
    if (new TextEncoder().encode(requestBody).byteLength > 12_000) {
      return jsonResponse({ error: "Request body is too large." }, 413);
    }
    payload = JSON.parse(requestBody) as EmailRequest;
  } catch {
    return jsonResponse({ error: "A valid JSON request is required." }, 400);
  }

  const recipientUserId = typeof payload.recipient_user_id === "string" ? payload.recipient_user_id : "";
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipientUserId)) {
    return jsonResponse({ error: "Select a valid app user as the recipient." }, 400);
  }
  if (!subject || !body) return jsonResponse({ error: "Email title and body are required." }, 400);
  if (subject.length > 160 || body.length > 8_000) {
    return jsonResponse({ error: "Email title or body exceeds the allowed length." }, 400);
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", recipientUserId)
    .maybeSingle();
  if (recipientError) {
    console.error("Admin email recipient lookup failed:", recipientError);
    return jsonResponse({ error: "Could not verify the selected recipient." }, 500);
  }
  if (!recipient?.email) return jsonResponse({ error: "The selected user has no email address." }, 404);

  let sendError: string | null = null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient.email],
        subject,
        text: body,
        html: buildMessageEmailHtml(subject, body),
      }),
    });
    if (!response.ok) {
      console.error("Resend rejected an admin email:", response.status, await response.text());
      sendError = `Email provider returned status ${response.status}.`;
    }
  } catch (error) {
    console.error("Admin email delivery request failed:", error);
    sendError = "Could not reach the email provider.";
  }

  const { error: auditError } = await supabase.from("admin_email_logs").insert({
    sent_by: user.id,
    recipient_email: recipient.email,
    recipient_user_id: recipient.id,
    subject,
    status: sendError ? "failed" : "sent",
    error_message: sendError,
  });
  if (auditError) {
    console.error("Could not record the admin email audit entry:", auditError);
    return jsonResponse({
      success: !sendError,
      error: sendError || undefined,
      sent: !sendError,
      auditWarning: sendError ? undefined : "The email was accepted, but its audit entry could not be saved.",
    });
  }

  if (sendError) return jsonResponse({ error: sendError }, 502);
  return jsonResponse({ success: true, recipient: recipient.email });
});
