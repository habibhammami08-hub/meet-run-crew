import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function for enhanced debugging
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-SUBSCRIPTION-SESSION] ${step}${detailsStr}`);
};

serve(async (req) => {
  logStep("Request received", { method: req.method, url: req.url });
  
  if (req.method === "OPTIONS") {
    logStep("Handling CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Check environment variables
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripePriceId = Deno.env.get("STRIPE_PRICE_MONTHLY_EUR");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    logStep("Environment check", { 
      hasStripeKey: !!stripeKey,
      hasStripePriceId: !!stripePriceId,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      stripePriceId: stripePriceId
    });

    if (!stripeKey) {
      logStep("ERROR: STRIPE_SECRET_KEY is not set");
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    if (!stripePriceId) {
      logStep("ERROR: STRIPE_PRICE_MONTHLY_EUR is not set");
      throw new Error("STRIPE_PRICE_MONTHLY_EUR is not set");
    }
    if (!supabaseUrl) {
      logStep("ERROR: SUPABASE_URL is not set");
      throw new Error("SUPABASE_URL is not set");
    }
    if (!supabaseServiceKey) {
      logStep("ERROR: SUPABASE_SERVICE_ROLE_KEY is not set");
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }

    const appBaseUrl = "https://meet-run-crew.lovable.app";
    logStep("Configuration verified", { stripePriceId, appBaseUrl });

    // Initialize Supabase client
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
    logStep("Supabase client initialized");

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("ERROR: No authorization header provided");
      throw new Error("No authorization header provided");
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    // Authenticate user
    const { data: userData, error: userError } = await supabaseService.auth.getUser(token);
    if (userError) {
      logStep("ERROR: Authentication failed", { error: userError.message });
      throw new Error(`Authentication error: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user?.email) {
      logStep("ERROR: User not authenticated or email not available");
      throw new Error("User not authenticated or email not available");
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user profile
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      logStep("ERROR: Profile not found", { error: profileError.message });
      throw new Error(`Profile error: ${profileError.message}`);
    }
    logStep("Profile found", { profileId: profile.id, stripeCustomerId: profile.stripe_customer_id });

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    logStep("Stripe client initialized");
    
    let customerId = profile.stripe_customer_id;
    
    // Create Stripe customer if doesn't exist
    if (!customerId) {
      logStep("Creating new Stripe customer");
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: profile.full_name || undefined,
          metadata: {
            user_id: user.id,
          }
        });
        customerId = customer.id;
        
        // Update profile with Stripe customer ID
        await supabaseService
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
        
        logStep("Stripe customer created and profile updated", { customerId });
      } catch (stripeError: any) {
        logStep("ERROR: Failed to create Stripe customer", { error: stripeError.message });
        throw new Error(`Failed to create Stripe customer: ${stripeError.message}`);
      }
    }

    // Create Stripe checkout session
    logStep("Creating checkout session", { customerId, stripePriceId });
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${appBaseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBaseUrl}/subscription/cancel`,
        metadata: {
          user_id: user.id,
        },
      });

      logStep("Checkout session created successfully", { sessionId: session.id, url: session.url });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (stripeError: any) {
      logStep("ERROR: Failed to create checkout session", { error: stripeError.message });
      throw new Error(`Failed to create checkout session: ${stripeError.message}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-subscription-session", { message: errorMessage });
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: "Check function logs for more details"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});