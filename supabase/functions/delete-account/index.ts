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
    const authHeader = req.headers.get('authorization')!;
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authentifier avec anon key pour récupérer l'utilisateur
    const anonSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await anonSupabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    console.log(`Starting account deletion for user: ${user.id}`);

    // 1. Sauvegarder dans deleted_users pour compliance
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profile) {
      await serviceSupabase
        .from('deleted_users')
        .insert({
          id: user.id,
          email: profile.email,
          deletion_reason: 'User requested deletion'
        });

      console.log(`Saved deletion record for: ${profile.email}`);

      // 2. Annuler abonnement Stripe si existant
      if (profile.stripe_customer_id) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: profile.stripe_customer_id
          });
          
          for (const sub of subscriptions.data) {
            await stripe.subscriptions.update(sub.id, {
              cancel_at_period_end: true
            });
            console.log(`Canceled subscription: ${sub.id}`);
          }
        } catch (stripeError) {
          console.error('Stripe cancellation error:', stripeError);
        }
      }
    }

    // 3. Supprimer les sessions futures de l'utilisateur
    const { error: sessionsError } = await serviceSupabase
      .from('sessions')
      .delete()
      .eq('host_id', user.id)
      .gte('scheduled_at', new Date().toISOString());

    if (sessionsError) {
      console.error('Error deleting sessions:', sessionsError);
    }

    // 4. Supprimer les inscriptions futures
    const { error: enrollmentsError } = await serviceSupabase
      .from('enrollments')
      .delete()
      .eq('user_id', user.id);

    if (enrollmentsError) {
      console.error('Error deleting enrollments:', enrollmentsError);
    }

    // 5. Supprimer le profil (cascade vers auth.users)
    const { error: profileError } = await serviceSupabase
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
    }

    // 6. Supprimer l'utilisateur auth
    const { error: authError } = await serviceSupabase.auth.admin.deleteUser(user.id);
    
    if (authError) {
      console.error('Error deleting auth user:', authError);
    }

    console.log(`Account deletion completed for user: ${user.id}`);

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Deletion error:', error);
    return new Response(JSON.stringify({ error: 'Deletion failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});