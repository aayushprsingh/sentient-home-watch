// Guardian AI - Geolocation edge function
// Uses ip-api.com to detect the user's approximate city/country from their IP.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Best-effort client IP (Supabase edge runtime forwards via x-forwarded-for)
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0].trim();

    const url = ip ? `https://ip-api.com/json/${ip}` : `https://ip-api.com/json/`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status !== "success") {
      return new Response(JSON.stringify({ unavailable: true, reason: data.message ?? "geolocation failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      city: data.city,
      region: data.regionName,
      country: data.country,
      countryCode: data.countryCode,
      lat: data.lat,
      lon: data.lon,
      timezone: data.timezone,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("geolocate error:", e);
    return new Response(JSON.stringify({
      unavailable: true,
      reason: e instanceof Error ? e.message : "Unknown error",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
