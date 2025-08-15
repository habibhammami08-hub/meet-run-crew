import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface CreatePaymentRequest {
  sessionId: string;
}

interface CreatePaymentResponse {
  checkout_url: string;
  session_id: string;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

const logStep = (step: string, details?: any) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[${timestamp}] [CREATE-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    logStep('CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep('Starting payment creation process');

    // Validate method
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Authenticate user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Authorization required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logStep('Authentication failed', { authError });
      throw new Error('Invalid authentication');
    }

    logStep('User authenticated', { userId: user.id, email: user.email });

    // Parse and validate payload
    const requestBody = await req.json();
    const { sessionId }: CreatePaymentRequest = requestBody;
    
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Valid session ID required');
    }

    logStep('Request validated', { sessionId });

    // Get session details with enrollment check
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        *,
        profiles!sessions_host_id_fkey (full_name, email)
      `)
      .eq('id', sessionId)
      .eq('status', 'published')
      .gte('scheduled_at', new Date().toISOString())
      .single();

    if (sessionError || !session) {
      logStep('Session fetch failed', { sessionError, sessionId });
      throw new Error('Session not found or not available');
    }

    logStep('Session found', { 
      sessionId: session.id, 
      title: session.title,
      hostId: session.host_id,
      scheduledAt: session.scheduled_at 
    });

    // Validate enrollment eligibility
    if (session.host_id === user.id) {
      logStep('Enrollment blocked - user is host');
      throw new Error('Cannot enroll in own session');
    }

    // Check existing enrollments
    const { data: existingEnrollments, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id, user_id, status')
      .eq('session_id', sessionId);

    if (enrollmentError) {
      logStep('Failed to check enrollments', { enrollmentError });
      throw new Error('Failed to verify enrollment status');
    }

    const existingEnrollment = existingEnrollments?.find(
      (e: any) => e.user_id === user.id && ['pending', 'paid', 'confirmed'].includes(e.status)
    );
    
    if (existingEnrollment) {
      logStep('Enrollment blocked - already enrolled', { existingStatus: existingEnrollment.status });
      throw new Error('Already enrolled in this session');
    }

    const confirmedEnrollments = existingEnrollments?.filter(
      (e: any) => ['paid', 'confirmed', 'present'].includes(e.status)
    ).length || 0;

    if (confirmedEnrollments >= session.max_participants) {
      logStep('Enrollment blocked - session full', { 
        confirmedEnrollments, 
        maxParticipants: session.max_participants 
      });
      throw new Error('Session is full');
    }

    logStep('Enrollment validation passed', { 
      confirmedEnrollments, 
      maxParticipants: session.max_participants 
    });

    // Initialize Stripe
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('Stripe configuration missing');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    logStep('Stripe initialized');

    // Get or create customer
    let customerId: string | undefined;
    
    // Check if customer exists in user metadata
    if (user.user_metadata?.stripe_customer_id) {
      customerId = user.user_metadata.stripe_customer_id;
      logStep('Using existing customer ID from metadata', { customerId });
    } else {
      // Check in profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();
        
      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id;
        logStep('Using existing customer ID from profile', { customerId });
      }
    }
    
    if (!customerId) {
      // Create new customer
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      
      logStep('Created new Stripe customer', { customerId });
      
      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
        
      logStep('Updated profile with customer ID');
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Session: ${session.title}`,
            description: `${session.location_hint || 'Session de course'} - ${new Date(session.scheduled_at).toLocaleDateString('fr-FR')}`,
            metadata: {
              session_id: sessionId,
              host_id: session.host_id
            }
          },
          unit_amount: session.price_cents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/sessions/${sessionId}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/sessions/${sessionId}`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      metadata: {
        session_id: sessionId,
        user_id: user.id,
        app_name: 'meetrun'
      },
      payment_intent_data: {
        metadata: {
          session_id: sessionId,
          user_id: user.id
        }
      }
    });

    logStep('Stripe checkout session created', { 
      checkoutSessionId: checkoutSession.id,
      expiresAt: checkoutSession.expires_at 
    });

    // Create pending enrollment
    const { error: enrollmentInsertError } = await supabase
      .from('enrollments')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        stripe_session_id: checkoutSession.id,
        status: 'pending'
      });

    if (enrollmentInsertError) {
      logStep('Failed to create enrollment record', { enrollmentInsertError });
      
      // Cancel the Stripe session if enrollment creation failed
      try {
        await stripe.checkout.sessions.expire(checkoutSession.id);
        logStep('Cancelled Stripe session due to enrollment failure');
      } catch (cancelError) {
        logStep('Failed to cancel Stripe session', { cancelError });
      }
      
      throw new Error('Failed to create enrollment record');
    }

    logStep('Enrollment record created successfully');

    const response: CreatePaymentResponse = {
      checkout_url: checkoutSession.url!,
      session_id: checkoutSession.id
    };

    logStep('Payment creation completed successfully', response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Payment creation failed';
    logStep('ERROR in create-payment', { error: errorMessage });
    
    const errorResponse: ErrorResponse = {
      error: errorMessage,
      code: 'PAYMENT_CREATION_FAILED'
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Edge function is now complete and simplified