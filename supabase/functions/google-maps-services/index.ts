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
      case 'distance_matrix':
        return await handleDistanceMatrix(params);
      case 'autocomplete':
        return await handleAutocomplete(params);
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

async function handleDistanceMatrix({ 
  origins, 
  destinations, 
  mode = 'walking',
  units = 'metric' 
}: { 
  origins: string[]; 
  destinations: string[]; 
  mode?: string;
  units?: string;
}) {
  const apiKey = Deno.env.get('GOOGLE_DISTANCE_MATRIX_API_KEY');
  if (!apiKey) throw new Error('Clé API Distance Matrix manquante');

  const originsParam = origins.map(o => encodeURIComponent(o)).join('|');
  const destinationsParam = destinations.map(d => encodeURIComponent(d)).join('|');
  
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destinationsParam}&mode=${mode}&units=${units}&key=${apiKey}`;
  
  const response = await fetch(url);
  const data = await response.json();

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleAutocomplete({ input }: { input: string }) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) throw new Error('Clé API Places manquante');

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}&language=fr&types=address`;
  const response = await fetch(url);
  const data = await response.json();

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}