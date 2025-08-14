import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    
    if (!user?.email) {
      throw new Error("User not authenticated");
    }

    const { runId } = await req.json();
    
    if (!runId) {
      throw new Error("Run ID is required");
    }

    // Get run details
    const { data: run, error: runError } = await supabaseClient
      .from('runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      throw new Error("Run not found");
    }

    // Check if user is already registered
    const { data: existingRegistration } = await supabaseClient
      .from('registrations')
      .select('*')
      .eq('run_id', runId)
      .eq('user_id', user.id)
      .single();

    if (existingRegistration) {
      throw new Error("Already registered for this run");
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { 
              name: `Course: ${run.title}`,
              description: `${run.location_name} - ${run.date} à ${run.time}`
            },
            unit_amount: run.price_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/run/${runId}?payment=success`,
      cancel_url: `${req.headers.get("origin")}/run/${runId}?payment=canceled`,
      metadata: {
        run_id: runId,
        user_id: user.id,
      },
    });

    // Create registration record with pending payment
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabaseService.from("registrations").insert({
      run_id: runId,
      user_id: user.id,
      stripe_session_id: session.id,
      payment_status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});