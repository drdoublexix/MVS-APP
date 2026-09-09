import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Standard Lagos Area Geocoding Fallback Map
const LAGOS_TOWNS: Record<string, { latitude: number; longitude: number }> = {
  "satellite town": { latitude: 6.4531, longitude: 3.2684 },
  "victoria island": { latitude: 6.4281, longitude: 3.4219 },
  "ajah": { latitude: 6.4698, longitude: 3.5852 },
  "festac": { latitude: 6.4673, longitude: 3.2808 },
  "ikeja": { latitude: 6.6018, longitude: 3.3515 },
  "surulere": { latitude: 6.4998, longitude: 3.3581 },
  "yaba": { latitude: 6.5095, longitude: 3.3711 },
  "lekki": { latitude: 6.4654, longitude: 3.4064 },
  "jibowu": { latitude: 6.5158, longitude: 3.3686 }
};

serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const sender = body.from || body.phone;
    const rawMessage = (body.text || body.message || "").trim();

    // Syntax check: "BOOK VET [Town Name] [Issue]"
    const match = rawMessage.match(/^BOOK\s+VET\s+([A-Za-z\s]+)\s+(.+)$/i);

    let lat = 6.4531; // Default fallback coordinates
    let lng = 3.3958;
    let townName = "Lagos";

    if (match) {
      townName = match[1].trim();
      const lookupKey = townName.toLowerCase();

      if (LAGOS_TOWNS[lookupKey]) {
        lat = LAGOS_TOWNS[lookupKey].latitude;
        lng = LAGOS_TOWNS[lookupKey].longitude;
      }
    }

    // Query 20km radius vets via Supabase RPC
    const { data: nearbyVets } = await supabase.rpc("find_nearby_vets_20km", {
      client_lat: lat,
      client_lng: lng,
    });

    // Save offline booking log
    await supabase.from("offline_sms_bookings").insert({
      sender_phone: sender,
      raw_message: rawMessage,
      parsed_intent: "BOOK_VET",
      status: "processed",
    });

    const vetCount = nearbyVets ? nearbyVets.length : 0;
    const responseMsg = vetCount > 0 
      ? `MVS: Booking request received for ${townName}! We alerted ${vetCount} doctor(s) within 20km. A vet will call you shortly.`
      : `MVS: Booking request received for ${townName}. No active vets within 20km right now; central dispatch has been alerted.`;

    // Dispatch outbound SMS via Termii
    const termiiApiKey = Deno.env.get("TERMII_API_KEY");
    if (termiiApiKey && sender) {
      await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sender,
          from: "N-ALERT",
          sms: responseMsg,
          type: "plain",
          channel: "generic",
          api_key: termiiApiKey,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, vetsAlerted: vetCount }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
  }
});