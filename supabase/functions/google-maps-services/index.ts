import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    switch (action) {
      case 'geocode':
        return await handleGeocode(params);
      case 'reverse_geocode':
        return await handleReverseGeocode(params);
      case 'directions':
        return await handleDirections(params);
      default:
        throw new Error('Action non supportée');
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

async function handleGeocode({ address }: { address: string }) {
  const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
  if (!apiKey) throw new Error('Clé API Geocoding manquante');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleReverseGeocode({ lat, lng }: { lat: number; lng: number }) {
  const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
  if (!apiKey) throw new Error('Clé API Geocoding manquante');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleDirections({ origin, destination, waypoints }: { 
  origin: string; 
  destination: string; 
  waypoints?: string[];
}) {
  const apiKey = Deno.env.get('GOOGLE_ROUTES_API_KEY');
  if (!apiKey) throw new Error('Clé API Routes manquante');

  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=walking&key=${apiKey}`;
  
  if (waypoints && waypoints.length > 0) {
    url += `&waypoints=${waypoints.map(w => encodeURIComponent(w)).join('|')}`;
  }

  const response = await fetch(url);
  const data = await response.json();

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}