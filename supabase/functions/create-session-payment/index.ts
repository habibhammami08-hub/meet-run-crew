import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    
    const authHeader = req.headers.get('authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Vérifier que la session existe et est payable
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('status', 'published')
      .single();

    if (sessionError || !session) {
      return new Response('Session not found', { status: 404, headers: corsHeaders });
    }

    // Vérifier si l'utilisateur a un abonnement actif
    const { data: profile } = await supabase
      .from('profiles')
      .select('sub_status, sub_current_period_end')
      .eq('id', user.id)
      .single();

    const hasActiveSubscription = profile?.sub_status === 'active' && 
      new Date(profile.sub_current_period_end) > new Date();

    if (hasActiveSubscription) {
      // Inscription gratuite avec abonnement
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: 'included_by_subscription'
        });

      if (enrollError) {
        return new Response(JSON.stringify({ error: 'Enrollment failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ status: 'enrolled', type: 'subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Créer l'enrollment en attente
    const { error: enrollError } = await supabase
      .from('enrollments')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        status: 'pending'
      });

    if (enrollError) {
      return new Response(JSON.stringify({ error: 'Enrollment creation failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Créer la session Stripe
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: session.title,
            description: `Session running - ${session.distance_km}km`
          },
          unit_amount: session.price_cents
        },
        quantity: 1
      }],
      metadata: {
        session_id: sessionId,
        user_id: user.id
      },
      success_url: `${Deno.env.get('APP_BASE_URL')}/session/${sessionId}?payment=success`,
      cancel_url: `${Deno.env.get('APP_BASE_URL')}/session/${sessionId}?payment=canceled`
    });

    return new Response(JSON.stringify({ url: stripeSession.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});