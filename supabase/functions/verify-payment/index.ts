import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createSupabaseClient } from "../_shared/auth.ts";
import { 
  AppError, 
  ErrorCode, 
  createErrorResponse, 
  corsHeaders, 
  logEvent, 
  generateRequestId 
} from "../_shared/errors.ts";
import { validatePayload, schemas } from "../_shared/validation.ts";

interface VerifyPaymentPayload {
  sessionId: string;
}

interface PaymentVerificationResult {
  status: 'completed' | 'pending' | 'failed' | 'expired';
  enrollment_id?: string;
  session_info?: {
    id: string;
    title: string;
    scheduled_at: string;
  };
  amount_paid?: number;
  error_message?: string;
}

serve(async (req) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

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

    // 2. Validate payload
    const rawPayload = await req.json().catch(() => {
      throw new AppError('Invalid JSON payload', ErrorCode.INVALID_PAYLOAD, 400);
    });

    const { sessionId } = validatePayload<VerifyPaymentPayload>(
      rawPayload,
      schemas.verifyPayment
    );

    logEvent({
      level: 'info',
      function_name: 'verify-payment',
      action: 'verification_requested',
      success: true,
      metadata: {
        stripe_session_id: sessionId
      },
      request_id: requestId
    });

    // 3. Verify payment with Stripe
    const stripe = createStripeClient();
    const stripeSession = await getStripeSession(stripe, sessionId);

    // 4. Update enrollment status if payment successful
    const result = await processPaymentVerification(stripeSession, requestId);

    logEvent({
      level: 'info',
      function_name: 'verify-payment',
      action: 'verification_completed',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: {
        stripe_session_id: sessionId,
        payment_status: result.status,
        enrollment_id: result.enrollment_id
      },
      request_id: requestId
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logEvent({
      level: 'error',
      function_name: 'verify-payment',
      action: 'verification_failed',
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
    timeout: 10000
  });
}

async function getStripeSession(
  stripe: Stripe,
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'subscription']
    });

    return session;
  } catch (error) {
    console.error('Failed to retrieve Stripe session:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      if (error.code === 'resource_missing') {
        throw new AppError(
          'Payment session not found',
          ErrorCode.SESSION_NOT_FOUND,
          404,
          'Session de paiement introuvable'
        );
      }
    }

    throw new AppError(
      'Failed to verify payment status',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la vérification du paiement'
    );
  }
}

async function processPaymentVerification(
  stripeSession: Stripe.Checkout.Session,
  requestId: string
): Promise<PaymentVerificationResult> {
  const supabase = await createSupabaseClient(true);

  try {
    // Get enrollment record
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select(`
        id,
        user_id,
        session_id,
        status,
        sessions!inner(
          id,
          title,
          scheduled_at,
          price_cents
        )
      `)
      .eq('stripe_session_id', stripeSession.id)
      .single();

    if (enrollmentError || !enrollment) {
      logEvent({
        level: 'warn',
        function_name: 'verify-payment',
        action: 'enrollment_not_found',
        success: false,
        metadata: {
          stripe_session_id: stripeSession.id
        },
        request_id: requestId
      });

      return {
        status: 'failed',
        error_message: 'Enrollment record not found'
      };
    }

    // Check session status and expiration
    if (stripeSession.status === 'expired') {
      await updateEnrollmentStatus(supabase, enrollment.id, 'cancelled', requestId);
      return {
        status: 'expired',
        enrollment_id: enrollment.id,
        error_message: 'Payment session expired'
      };
    }

    // Process based on payment status
    if (stripeSession.payment_status === 'paid') {
      // Update enrollment to paid status
      const { error: updateError } = await supabase
        .from('enrollments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: stripeSession.payment_intent as string,
          amount_paid_cents: stripeSession.amount_total || enrollment.sessions.price_cents,
          updated_at: new Date().toISOString()
        })
        .eq('id', enrollment.id);

      if (updateError) {
        console.error('Failed to update enrollment status:', updateError);
        throw new AppError(
          'Failed to update enrollment status',
          ErrorCode.DATABASE_ERROR,
          500
        );
      }

      logEvent({
        level: 'info',
        function_name: 'verify-payment',
        action: 'enrollment_confirmed',
        success: true,
        metadata: {
          enrollment_id: enrollment.id,
          session_id: enrollment.session_id,
          amount_paid: stripeSession.amount_total
        },
        request_id: requestId
      });

      return {
        status: 'completed',
        enrollment_id: enrollment.id,
        session_info: {
          id: enrollment.sessions.id,
          title: enrollment.sessions.title,
          scheduled_at: enrollment.sessions.scheduled_at
        },
        amount_paid: stripeSession.amount_total || enrollment.sessions.price_cents
      };
    }

    // Handle other payment statuses
    switch (stripeSession.payment_status) {
      case 'unpaid':
        return {
          status: 'pending',
          enrollment_id: enrollment.id,
          session_info: {
            id: enrollment.sessions.id,
            title: enrollment.sessions.title,
            scheduled_at: enrollment.sessions.scheduled_at
          }
        };

      case 'no_payment_required':
        // Free session or promotional enrollment
        await updateEnrollmentStatus(supabase, enrollment.id, 'confirmed', requestId);
        return {
          status: 'completed',
          enrollment_id: enrollment.id,
          session_info: {
            id: enrollment.sessions.id,
            title: enrollment.sessions.title,
            scheduled_at: enrollment.sessions.scheduled_at
          },
          amount_paid: 0
        };

      default:
        await updateEnrollmentStatus(supabase, enrollment.id, 'failed', requestId);
        return {
          status: 'failed',
          enrollment_id: enrollment.id,
          error_message: `Payment failed with status: ${stripeSession.payment_status}`
        };
    }

  } catch (error) {
    console.error('Failed to process payment verification:', error);
    throw error;
  }
}

async function updateEnrollmentStatus(
  supabase: any,
  enrollmentId: string,
  status: string,
  requestId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('enrollments')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId);

    if (error) {
      throw error;
    }

    logEvent({
      level: 'info',
      function_name: 'verify-payment',
      action: 'enrollment_status_updated',
      success: true,
      metadata: {
        enrollment_id: enrollmentId,
        new_status: status
      },
      request_id: requestId
    });

  } catch (error) {
    console.error('Failed to update enrollment status:', error);
    throw new AppError(
      'Failed to update enrollment status',
      ErrorCode.DATABASE_ERROR,
      500
    );
  }
}