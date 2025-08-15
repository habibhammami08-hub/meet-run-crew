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

interface CreatePaymentPayload {
  sessionId: string;
}

interface SessionData {
  id: string;
  title: string;
  host_id: string;
  price_cents: number;
  max_participants: number;
  date: string;
  area_hint?: string;
  current_enrollments: number;
}

serve(async (req) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  let userId: string | undefined;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Validate request method
    if (req.method !== 'POST') {
      throw new AppError(
        'Only POST method allowed',
        ErrorCode.INVALID_REQUEST_METHOD,
        405
      );
    }

    // 2. Authenticate user
    const user = await authenticateUser(req.headers.get('Authorization'), {
      requireProfile: true
    });
    userId = user.id;

    // 3. Validate payload
    const rawPayload = await req.json().catch(() => {
      throw new AppError('Invalid JSON payload', ErrorCode.INVALID_PAYLOAD, 400);
    });

    const { sessionId } = validatePayload<CreatePaymentPayload>(
      rawPayload,
      schemas.createPayment
    );

    // 4. Validate session and check enrollment eligibility
    const session = await validateSessionForEnrollment(sessionId, user.id);

    // 5. Get or create Stripe customer
    const stripe = createStripeClient();
    const customerId = await getOrCreateStripeCustomer(stripe, user);

    // 6. Create Stripe checkout session
    const checkoutSession = await createStripeCheckoutSession(
      stripe,
      session,
      customerId,
      req.headers.get('origin') || 'https://meetrun.app'
    );

    // 7. Create pending enrollment record
    await createPendingEnrollment(sessionId, user.id, checkoutSession.id);

    logEvent({
      level: 'info',
      function_name: 'create-payment',
      user_id: userId,
      action: 'checkout_created',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: {
        session_id: sessionId,
        stripe_session_id: checkoutSession.id,
        amount_cents: session.price_cents
      },
      request_id: requestId
    });

    return new Response(JSON.stringify({
      checkout_url: checkoutSession.url,
      session_id: checkoutSession.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logEvent({
      level: 'error',
      function_name: 'create-payment',
      user_id: userId,
      action: 'checkout_failed',
      success: false,
      error_code: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR,
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
      request_id: requestId
    });

    return createErrorResponse(error, requestId, corsHeaders);
  }
});

function createStripeClient(): Stripe {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    throw new AppError('Stripe configuration missing', ErrorCode.CONFIG_ERROR, 500);
  }

  return new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    timeout: 10000 // 10 second timeout
  });
}

async function validateSessionForEnrollment(
  sessionId: string,
  userId: string
): Promise<SessionData> {
  const supabase = await createSupabaseClient(true);

  // Get session with enrollment count
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select(`
      id,
      title,
      host_id,
      price_cents,
      max_participants,
      date,
      area_hint,
      enrollments!inner(count)
    `)
    .eq('id', sessionId)
    .gte('date', new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session) {
    throw new AppError(
      'Session not found or not available',
      ErrorCode.SESSION_NOT_FOUND,
      404,
      'Cette session n\'existe pas ou n\'est plus disponible'
    );
  }

  // Check if user is the host
  if (session.host_id === userId) {
    throw new AppError(
      'Cannot enroll in own session',
      ErrorCode.INVALID_FIELD_VALUE,
      400,
      'Vous ne pouvez pas vous inscrire à votre propre session'
    );
  }

  // Check if already enrolled
  const { data: existingEnrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .in('status', ['pending', 'paid', 'confirmed'])
    .maybeSingle();

  if (existingEnrollment) {
    throw new AppError(
      'Already enrolled in this session',
      ErrorCode.ALREADY_ENROLLED,
      400,
      'Vous êtes déjà inscrit à cette session'
    );
  }

  // Check if session is full
  const currentEnrollments = session.enrollments?.[0]?.count || 0;
  if (currentEnrollments >= session.max_participants) {
    throw new AppError(
      'Session is full',
      ErrorCode.SESSION_FULL,
      400,
      'Cette session est complète'
    );
  }

  return {
    ...session,
    current_enrollments: currentEnrollments
  };
}

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  user: any
): Promise<string> {
  if (user.profile?.stripe_customer_id) {
    // Verify customer exists in Stripe
    try {
      await stripe.customers.retrieve(user.profile.stripe_customer_id);
      return user.profile.stripe_customer_id;
    } catch (error) {
      // Customer doesn't exist in Stripe, create new one
      console.warn(`Stripe customer ${user.profile.stripe_customer_id} not found, creating new one`);
    }
  }

  // Create new customer
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.profile?.full_name || undefined,
      metadata: {
        user_id: user.id,
        created_by: 'meetrun_create_payment'
      }
    });

    // Update profile with Stripe customer ID
    const supabase = await createSupabaseClient(true);
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', user.id);

    return customer.id;
  } catch (error) {
    throw new AppError(
      'Failed to create customer account',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la création du compte client'
    );
  }
}

async function createStripeCheckoutSession(
  stripe: Stripe,
  session: SessionData,
  customerId: string,
  origin: string
): Promise<Stripe.Checkout.Session> {
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Session: ${session.title}`,
            description: `${session.area_hint || 'Session de course'} - ${new Date(session.date).toLocaleDateString('fr-FR')}`,
            metadata: {
              session_id: session.id,
              type: 'running_session'
            }
          },
          unit_amount: session.price_cents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${origin}/sessions/${session.id}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/sessions/${session.id}/payment/cancel`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      metadata: {
        session_id: session.id,
        user_id: '',
        type: 'session_enrollment'
      },
      automatic_tax: {
        enabled: false
      },
      billing_address_collection: 'required',
      customer_update: {
        name: 'auto',
        address: 'auto'
      }
    });

    return checkoutSession;
  } catch (error) {
    console.error('Stripe checkout creation failed:', error);
    throw new AppError(
      'Failed to create payment session',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la création de la session de paiement'
    );
  }
}

async function createPendingEnrollment(
  sessionId: string,
  userId: string,
  stripeSessionId: string
): Promise<void> {
  const supabase = await createSupabaseClient(true);

  try {
    const { error } = await supabase
      .from('enrollments')
      .insert({
        session_id: sessionId,
        user_id: userId,
        stripe_session_id: stripeSessionId,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Failed to create enrollment record:', error);
    throw new AppError(
      'Failed to create enrollment record',
      ErrorCode.DATABASE_ERROR,
      500,
      'Erreur lors de l\'enregistrement de l\'inscription'
    );
  }
}