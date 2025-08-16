import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      logStep("CRITICAL ERROR: STRIPE_SECRET_KEY not configured");
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    if (!webhookSecret) {
      logStep("CRITICAL ERROR: STRIPE_WEBHOOK_SECRET not configured");
      return new Response("Webhook secret required for security", { 
        status: 401,
        headers: corsHeaders 
      });
    }

    logStep("Stripe keys verified");

    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2023-10-16",
      timeout: 15000, // Standardized timeout
      maxNetworkRetries: 2
    });
    
    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      logStep("ERROR: No stripe signature found");
      throw new Error("No stripe signature found");
    }

    let event;
    
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook signature verified", { type: event.type, id: event.id });
    } catch (err) {
      logStep("Webhook signature verification failed", { error: err.message });
      return new Response(`Webhook signature verification failed: ${err.message}`, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      logStep("CRITICAL ERROR: Supabase configuration missing");
      throw new Error("Supabase configuration missing");
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey, { 
      auth: { persistSession: false },
      db: { schema: 'public' }
    });

    logStep("Processing event", { type: event.type, id: event.id });

    // Handle different event types with better error handling
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionEvent(supabaseService, subscription, event.type);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(supabaseService, session, stripe);
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoiceEvent(supabaseService, invoice, event.type);
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error.name === 'ValidationError' ? 400 : 500;
    
    logStep("ERROR in stripe-webhook", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      type: error.constructor.name
    });
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      code: error instanceof Error ? error.name : 'INTERNAL_ERROR'
    }), {
      status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// Helper functions with better error handling
async function handleSubscriptionEvent(
  supabaseService: any, 
  subscription: Stripe.Subscription, 
  eventType: string
) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      logStep("Processing subscription event", { 
        subscriptionId: subscription.id, 
        customerId: subscription.customer,
        status: subscription.status,
        eventType,
        attempt: attempt + 1
      });

      // Find the user by Stripe customer ID
      const { data: profile, error: profileError } = await supabaseService
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', subscription.customer)
        .single();

      if (profileError || !profile) {
        logStep("Profile not found for customer", { 
          customerId: subscription.customer,
          error: profileError?.message 
        });
        return;
      }

      // Update subscription status with proper error handling
      const updateData = {
        sub_status: subscription.status,
        sub_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabaseService
        .from('profiles')
        .update(updateData)
        .eq('id', profile.id);

      if (updateError) {
        throw updateError;
      }

      logStep("Profile updated successfully", { 
        profileId: profile.id, 
        ...updateData 
      });

      // Also update subscribers table for compatibility
      await supabaseService
        .from('subscribers')
        .upsert({
          user_id: profile.id,
          email: '', // Will be updated by profile trigger
          stripe_customer_id: subscription.customer as string,
          subscribed: ['active', 'trialing'].includes(subscription.status),
          subscription_tier: 'premium',
          subscription_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      // Succès, sortir de la boucle
      break;
      
    } catch (error) {
      attempt++;
      
      if (attempt >= maxRetries) {
        // Échec final, logger et re-throw
        logStep("Final attempt failed for subscription update", {
          subscriptionId: subscription.id,
          attempt,
          error: error.message
        });
        throw error;
      }
      
      // Attendre avant le prochain essai
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function handleCheckoutCompleted(
  supabaseService: any, 
  session: Stripe.Checkout.Session,
  stripe: Stripe
) {
  try {
    logStep("Processing completed checkout session", { 
      sessionId: session.id, 
      customerId: session.customer,
      mode: session.mode
    });

    if (session.mode === 'subscription' && session.subscription) {
      // Handle subscription checkout
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      await handleSubscriptionEvent(supabaseService, subscription, 'checkout.session.completed');
    } else if (session.mode === 'payment') {
      // Handle one-time payment (session enrollment)
      await handleSessionEnrollmentPayment(supabaseService, session);
    }

  } catch (error) {
    logStep("Error in handleCheckoutCompleted", { 
      error: error.message,
      sessionId: session.id 
    });
    throw error;
  }
}

async function handleSessionEnrollmentPayment(
  supabaseService: any,
  session: Stripe.Checkout.Session
) {
  try {
    const sessionId = session.metadata?.session_id;
    const userId = session.metadata?.user_id;

    if (!sessionId || !userId) {
      logStep("Missing metadata in checkout session", { 
        sessionId: session.id,
        metadata: session.metadata 
      });
      return;
    }

    // Update enrollment status
    const { error: updateError } = await supabaseService
      .from('enrollments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: session.payment_intent as string,
        amount_paid_cents: session.amount_total || 0,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_session_id', session.id)
      .eq('user_id', userId);

    if (updateError) {
      logStep("Error updating enrollment", { 
        error: updateError.message,
        stripeSessionId: session.id 
      });
      throw updateError;
    }

    logStep("Enrollment updated to paid status", { 
      stripeSessionId: session.id,
      sessionId,
      userId 
    });

  } catch (error) {
    logStep("Error in handleSessionEnrollmentPayment", { 
      error: error.message,
      sessionId: session.id 
    });
    throw error;
  }
}

async function handleInvoiceEvent(
  supabaseService: any,
  invoice: Stripe.Invoice,
  eventType: string
) {
  try {
    logStep("Processing invoice event", { 
      invoiceId: invoice.id,
      customerId: invoice.customer,
      status: invoice.status,
      eventType
    });

    // Handle invoice events if needed for subscription billing
    // This can be extended based on business requirements

  } catch (error) {
    logStep("Error in handleInvoiceEvent", { 
      error: error.message,
      invoiceId: invoice.id 
    });
    throw error;
  }
}