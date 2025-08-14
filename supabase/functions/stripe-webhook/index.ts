import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function for debugging
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

    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) throw new Error("No stripe signature found");

    let event;
    
    // Verify webhook signature if secret is provided
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        logStep("Webhook signature verification failed", { error: err.message });
        return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
      }
    } else {
      // Parse without verification if no secret is provided
      event = JSON.parse(body);
      logStep("Webhook parsed without signature verification");
    }

    logStep("Processing event", { type: event.type, id: event.id });

    // Initialize Supabase client with service role key
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Processing completed checkout session", { 
          sessionId: session.id, 
          customerId: session.customer,
          customerEmail: session.customer_details?.email,
          mode: session.mode
        });

        if (session.mode === 'subscription' && session.subscription && session.customer_details?.email) {
          // Get the subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          logStep("Retrieved subscription", { 
            subscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end
          });
          
          // Find user by email in profiles table
          const { data: profile, error: profileError } = await supabaseService
            .from('profiles')
            .select('id, email')
            .eq('email', session.customer_details.email)
            .single();

          if (profileError) {
            logStep("Profile not found for email", { email: session.customer_details.email, error: profileError });
            break;
          }

          // Update subscription status in profiles
          const updateData = {
            stripe_customer_id: session.customer as string,
            sub_status: subscription.status,
            sub_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          };

          const { error: updateError } = await supabaseService
            .from('profiles')
            .update(updateData)
            .eq('id', profile.id);

          if (updateError) {
            logStep("Error updating profile", { error: updateError.message });
          } else {
            logStep("Profile updated successfully", { profileId: profile.id, ...updateData });
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Processing subscription event", { 
          subscriptionId: subscription.id, 
          customerId: subscription.customer,
          status: subscription.status 
        });

        // Get customer email from Stripe
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (!customer || customer.deleted || !customer.email) {
          logStep("Customer not found or no email", { customerId: subscription.customer });
          break;
        }

        // Find user by email in profiles table
        const { data: profile, error: profileError } = await supabaseService
          .from('profiles')
          .select('id, email')
          .eq('email', customer.email)
          .single();

        if (profileError) {
          logStep("Profile not found for customer email", { email: customer.email });
          break;
        }

        // Update subscription status
        const updateData = {
          stripe_customer_id: subscription.customer as string,
          sub_status: subscription.status,
          sub_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        };

        const { error: updateError } = await supabaseService
          .from('profiles')
          .update(updateData)
          .eq('id', profile.id);

        if (updateError) {
          logStep("Error updating profile", { error: updateError.message });
        } else {
          logStep("Profile updated successfully", { profileId: profile.id, ...updateData });
        }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in stripe-webhook", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});