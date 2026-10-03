// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get('authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!accessToken) return jsonResponse({ error: 'Sign in to use the MVS Assistant.' }, 401);
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase auth configuration is missing.');
      return jsonResponse({ error: 'The MVS Assistant is temporarily unavailable.' }, 503);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return jsonResponse({ error: 'Sign in to use the MVS Assistant.' }, 401);

    const requestBody = await req.text();
    if (new TextEncoder().encode(requestBody).byteLength > 262_144) {
      return jsonResponse({ error: 'Conversation is too large.' }, 413);
    }

    let payload: { messages?: unknown };
    try {
      payload = JSON.parse(requestBody);
    } catch {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }
    if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 20) {
      return jsonResponse({ error: 'Conversation must contain between 1 and 20 messages.' }, 400);
    }
    const messages = payload.messages as { role?: unknown; content?: unknown; text?: unknown }[];
    let totalLength = 0;
    for (const message of messages) {
      const content = message?.content ?? message?.text;
      if (typeof content !== 'string' || content.length > 4_000) {
        return jsonResponse({ error: 'Each message must be text under 4,000 characters.' }, 400);
      }
      totalLength += content.length;
      if (totalLength > 30_000) return jsonResponse({ error: 'Conversation is too large.' }, 413);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("GEMINI_API_KEY missing in secrets");
      return jsonResponse({ error: 'The MVS Assistant is temporarily unavailable.' }, 503);
    }

    const formattedContents = (messages || []).map((msg: any) => ({
      role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
      parts: [{ text: msg.content || msg.text || '' }]
    }));

    // Direct Gemini REST Call
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: formattedContents,
        systemInstruction: {
          parts: [{ text: "You are the MVS AI Assistant. Provide helpful, concise, and expert veterinary guidance." }]
        }
      })
    }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini API Error:", geminiData);
      return jsonResponse({ error: 'The MVS Assistant could not complete the request.' }, 502);
    }

    const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

    return jsonResponse({ reply: replyText });

  } catch (err: any) {
    console.error("Edge Function Unhandled Error:", err);
    return jsonResponse({ error: 'The MVS Assistant could not complete the request.' }, 500);
  }
});
