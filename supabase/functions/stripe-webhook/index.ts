import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature')!;
    const body = await req.text();
    
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );

    console.log(`Webhook event: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
        
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Webhook error', { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  console.log(`Updating subscription: ${subscription.id} for customer: ${subscription.customer}`);
  
  const { error } = await supabase
    .from('profiles')
    .update({
      sub_status: subscription.status,
      sub_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', subscription.customer);

  if (error) {
    console.error('Error updating subscription:', error);
  }
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  console.log(`Subscription canceled: ${subscription.id} for customer: ${subscription.customer}`);
  
  const { error } = await supabase
    .from('profiles')
    .update({
      sub_status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', subscription.customer);

  if (error) {
    console.error('Error canceling subscription:', error);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log(`Checkout completed: ${session.id}, mode: ${session.mode}`);
  
  if (session.mode === 'subscription') {
    // Abonnement créé
    const customer = await stripe.customers.retrieve(session.customer as string);
    
    if (customer && !customer.deleted && 'email' in customer) {
      const { error } = await supabase
        .from('profiles')
        .update({
          stripe_customer_id: session.customer,
          sub_status: 'active'
        })
        .eq('email', customer.email);

      if (error) {
        console.error('Error updating profile after subscription:', error);
      }
    }
  } else if (session.mode === 'payment') {
    // Paiement à la course
    await handleSessionPayment(session);
  }
}

async function handleSessionPayment(session: Stripe.Checkout.Session) {
  const sessionId = session.metadata?.session_id;
  const userId = session.metadata?.user_id;
  
  console.log(`Processing session payment: sessionId=${sessionId}, userId=${userId}`);
  
  if (sessionId && userId) {
    const { error } = await supabase
      .from('enrollments')
      .update({
        status: 'paid',
        stripe_session_id: session.id,
        amount_paid_cents: session.amount_total,
        paid_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating enrollment payment:', error);
    }
  }
}