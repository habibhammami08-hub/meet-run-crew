import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-SUBSCRIPTION-SESSION] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    logStep("Handling CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Load and verify environment variables
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripePriceId = Deno.env.get("STRIPE_PRICE_MONTHLY_EUR");
    const appBaseUrl = Deno.env.get("APP_BASE_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    logStep("Environment variables check", {
      hasStripeKey: !!stripeSecretKey,
      stripeKeyPrefix: stripeSecretKey ? stripeSecretKey.substring(0, 8) + "..." : "missing",
      stripePriceId: stripePriceId,
      appBaseUrl: appBaseUrl,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey
    });

    // Verify required secrets
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured in Supabase secrets");
    }
    if (!stripePriceId) {
      throw new Error("STRIPE_PRICE_MONTHLY_EUR is not configured in Supabase secrets");
    }
    if (!appBaseUrl) {
      throw new Error("APP_BASE_URL is not configured in Supabase secrets");
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    // Verify this is a live key
    if (!stripeSecretKey.startsWith('sk_live_')) {
      logStep("WARNING: Using test Stripe key instead of live key");
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Get user from JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header - user must be authenticated");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Invalid authentication token");
    }

    logStep("User authenticated", { 
      userId: user.id, 
      email: user.email 
    });

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      throw new Error(`Profile not found: ${profileError.message}`);
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, { 
      apiVersion: "2023-10-16"
    });

    logStep("Stripe client initialized with live key");

    // Create or get Stripe customer
    let customerId = profile.stripe_customer_id;
    
    if (!customerId) {
      logStep("Creating new Stripe customer");
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile.full_name || undefined,
        metadata: {
          user_id: user.id,
        }
      });
      customerId = customer.id;

      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);

      logStep("Stripe customer created", { customerId });
    }

    // Create checkout session
    logStep("Creating Stripe checkout session", {
      customerId,
      priceId: stripePriceId,
      successUrl: `${appBaseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appBaseUrl}/subscription/cancel`
    });

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

    logStep("Checkout session created successfully", { 
      sessionId: session.id, 
      url: session.url 
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});