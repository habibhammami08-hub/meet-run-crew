import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createSupabaseClient, authenticateUser } from "../_shared/auth.ts";
import { 
  AppError, 
  ErrorCode, 
  createErrorResponse, 
  corsHeaders, 
  logEvent, 
  generateRequestId 
} from "../_shared/errors.ts";
import { validatePayload, schemas } from "../_shared/validation.ts";

interface CreatePaymentRequest {
  sessionId: string;
}

interface CreatePaymentResponse {
  checkout_url: string;
  session_id: string;
}

const logStep = (step: string, details?: any) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[${timestamp}] [CREATE-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  let userId: string | undefined;

  // Handle CORS
  if (req.method === 'OPTIONS') {
    logStep('CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    logStep('Starting payment creation process');

    // Validate method
    if (req.method !== 'POST') {
      throw new AppError('Method not allowed', ErrorCode.INVALID_REQUEST_METHOD, 405);
    }

    // Authenticate user with timeout
    const authPromise = authenticateUser(req.headers.get('Authorization'), {
      requireProfile: true
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Authentication timeout')), 10000)
    );
    
    const user = await Promise.race([authPromise, timeoutPromise]) as any;
    userId = user.id;

    logStep('User authenticated', { userId: user.id, email: user.email });

    // Parse and validate payload with error handling
    let requestBody;
    try {
      const bodyText = await req.text();
      requestBody = JSON.parse(bodyText);
    } catch (parseError) {
      throw new AppError('Invalid JSON payload', ErrorCode.INVALID_PAYLOAD, 400);
    }

    const { sessionId } = validatePayload<CreatePaymentRequest>(
      requestBody, 
      schemas.createPayment
    );
    
    logStep('Request validated', { sessionId });

    // Initialize Supabase with proper error handling
    const supabase = await createSupabaseClient(true);

    // Get session details with enrollment check (optimized query)
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        *,
        profiles!sessions_host_id_fkey (full_name, email),
        enrollments!inner(count)
      `)
      .eq('id', sessionId)
      .eq('status', 'published')
      .gte('scheduled_at', new Date().toISOString())
      .single();

    if (sessionError || !session) {
      logStep('Session fetch failed', { sessionError, sessionId });
      throw new AppError('Session not found or not available', ErrorCode.SESSION_NOT_FOUND, 404);
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
      throw new AppError('Cannot enroll in own session', ErrorCode.INVALID_FIELD_VALUE, 400);
    }

    // Check existing enrollments (optimized)
    const { data: existingEnrollments, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id, user_id, status')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .in('status', ['pending', 'paid', 'confirmed']);

    if (enrollmentError) {
      logStep('Failed to check enrollments', { enrollmentError });
      throw new AppError('Failed to verify enrollment status', ErrorCode.DATABASE_ERROR, 500);
    }

    if (existingEnrollments && existingEnrollments.length > 0) {
      logStep('Enrollment blocked - already enrolled', { existingStatus: existingEnrollments[0].status });
      throw new AppError('Already enrolled in this session', ErrorCode.ALREADY_ENROLLED, 400);
    }

    // Check session capacity
    const { count: confirmedEnrollments } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .in('status', ['paid', 'confirmed', 'present']);

    if (confirmedEnrollments >= session.max_participants) {
      logStep('Enrollment blocked - session full', { 
        confirmedEnrollments, 
        maxParticipants: session.max_participants 
      });
      throw new AppError('Session is full', ErrorCode.SESSION_FULL, 400);
    }

    logStep('Enrollment validation passed', { 
      confirmedEnrollments, 
      maxParticipants: session.max_participants 
    });

    // Initialize Stripe with error handling
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new AppError('Stripe configuration missing', ErrorCode.CONFIG_ERROR, 500);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      timeout: 15000, // 15 second timeout
      maxNetworkRetries: 2
    });

    logStep('Stripe initialized');

    // Get or create customer with better error handling
    let customerId: string;
    
    try {
      if (user.profile?.stripe_customer_id) {
        // Verify existing customer
        const customer = await stripe.customers.retrieve(user.profile.stripe_customer_id);
        if (!customer.deleted) {
          customerId = customer.id;
          logStep('Using existing customer ID', { customerId });
        } else {
          throw new Error('Customer deleted');
        }
      } else {
        throw new Error('No customer ID');
      }
    } catch (error) {
      // Create new customer
      const customer = await stripe.customers.create({
        email: user.email!,
        name: user.profile?.full_name || undefined,
        metadata: { 
          user_id: user.id,
          created_by: 'meetrun_payment'
        }
      });
      customerId = customer.id;
      
      logStep('Created new Stripe customer', { customerId });
      
      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ 
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
        
      logStep('Updated profile with customer ID');
    }

    // Create checkout session with proper error handling
    const origin = req.headers.get('origin') || 'https://meetrun.app';
    
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
      success_url: `${origin}/session/${sessionId}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/session/${sessionId}`,
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
      },
      billing_address_collection: 'auto',
      customer_update: {
        address: 'auto',
        name: 'auto'
      }
    });

    logStep('Stripe checkout session created', { 
      checkoutSessionId: checkoutSession.id,
      expiresAt: checkoutSession.expires_at 
    });

    // Create pending enrollment with transaction
    const { error: enrollmentInsertError } = await supabase
      .from('enrollments')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        stripe_session_id: checkoutSession.id,
        status: 'pending',
        created_at: new Date().toISOString()
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
      
      throw new AppError('Failed to create enrollment record', ErrorCode.DATABASE_ERROR, 500);
    }

    logStep('Enrollment record created successfully');

    const response: CreatePaymentResponse = {
      checkout_url: checkoutSession.url!,
      session_id: checkoutSession.id
    };

    logEvent({
      level: 'info',
      function_name: 'create-payment',
      user_id: userId,
      action: 'payment_created',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: response,
      request_id: requestId
    });

    logStep('Payment creation completed successfully', response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logEvent({
      level: 'error',
      function_name: 'create-payment',
      user_id: userId,
      action: 'payment_failed',
      success: false,
      error_code: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR,
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
      request_id: requestId
    });

    logStep('ERROR in create-payment', { error: error instanceof Error ? error.message : String(error) });
    
    return createErrorResponse(error, requestId, corsHeaders);
  }
});