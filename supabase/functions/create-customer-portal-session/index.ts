import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

interface CustomerPortalResult {
  portal_url: string;
  session_id: string;
  expires_at: string;
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

    // 2. Authenticate user and require profile
    const user = await authenticateUser(req.headers.get('Authorization'), {
      requireProfile: true
    });
    userId = user.id;

    logEvent({
      level: 'info',
      function_name: 'create-customer-portal-session',
      user_id: userId,
      action: 'portal_requested',
      success: true,
      metadata: {
        has_stripe_customer: !!user.profile?.stripe_customer_id
      },
      request_id: requestId
    });

    // 3. Validate Stripe customer exists
    if (!user.profile?.stripe_customer_id) {
      throw new AppError(
        'No Stripe customer associated with account',
        ErrorCode.CUSTOMER_NOT_FOUND,
        400,
        'Aucun compte de facturation associé à votre profil. Veuillez d\'abord souscrire à un abonnement.'
      );
    }

    // 4. Initialize Stripe
    const stripe = createStripeClient();

    // 5. Verify customer exists in Stripe
    await verifyStripeCustomer(stripe, user.profile.stripe_customer_id, userId, requestId);

    // 6. Create customer portal session
    const portalSession = await createCustomerPortalSession(
      stripe,
      user.profile.stripe_customer_id,
      req.headers.get('origin') || 'https://meetrun.app',
      requestId
    );

    const result: CustomerPortalResult = {
      portal_url: portalSession.url,
      session_id: portalSession.id,
      expires_at: new Date(portalSession.expires_at * 1000).toISOString()
    };

    logEvent({
      level: 'info',
      function_name: 'create-customer-portal-session',
      user_id: userId,
      action: 'portal_created',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: {
        portal_session_id: portalSession.id,
        customer_id: user.profile.stripe_customer_id
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
      function_name: 'create-customer-portal-session',
      user_id: userId,
      action: 'portal_failed',
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

async function verifyStripeCustomer(
  stripe: Stripe,
  customerId: string,
  userId: string,
  requestId: string
): Promise<void> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if (!customer || customer.deleted) {
      throw new AppError(
        'Stripe customer not found or deleted',
        ErrorCode.CUSTOMER_NOT_FOUND,
        404,
        'Votre compte de facturation n\'existe plus. Veuillez contacter le support.'
      );
    }

    logEvent({
      level: 'info',
      function_name: 'create-customer-portal-session',
      user_id: userId,
      action: 'customer_verified',
      success: true,
      metadata: {
        customer_id: customerId,
        customer_email: customer.email
      },
      request_id: requestId
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Failed to verify Stripe customer:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      if (error.code === 'resource_missing') {
        throw new AppError(
          'Customer account not found',
          ErrorCode.CUSTOMER_NOT_FOUND,
          404,
          'Votre compte de facturation est introuvable'
        );
      }
    }

    throw new AppError(
      'Failed to verify customer account',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la vérification du compte'
    );
  }
}

async function createCustomerPortalSession(
  stripe: Stripe,
  customerId: string,
  origin: string,
  requestId: string
): Promise<Stripe.BillingPortal.Session> {
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/subscription/manage`,
      locale: 'fr', // French locale for better UX
      configuration: await getPortalConfiguration(stripe, requestId)
    });

    return portalSession;

  } catch (error) {
    console.error('Failed to create customer portal session:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      // Handle specific Stripe errors
      switch (error.code) {
        case 'resource_missing':
          throw new AppError(
            'Customer not found',
            ErrorCode.CUSTOMER_NOT_FOUND,
            404,
            'Compte client introuvable'
          );
        case 'customer_portal_customer_not_found':
          throw new AppError(
            'Customer portal access denied',
            ErrorCode.CUSTOMER_NOT_FOUND,
            404,
            'Accès au portail client refusé'
          );
        default:
          throw new AppError(
            'Failed to create customer portal session',
            ErrorCode.STRIPE_ERROR,
            500,
            'Erreur lors de la création de la session portail'
          );
      }
    }

    throw new AppError(
      'Failed to create customer portal session',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la création de la session portail'
    );
  }
}

async function getPortalConfiguration(
  stripe: Stripe,
  requestId: string
): Promise<string | undefined> {
  try {
    // Try to get existing configuration or create a default one
    const configurations = await stripe.billingPortal.configurations.list({
      limit: 1,
      active: true
    });

    if (configurations.data.length > 0) {
      return configurations.data[0].id;
    }

    // Create a basic configuration if none exists
    const config = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'Gérer votre abonnement MeetRun',
      },
      features: {
        payment_method_update: {
          enabled: true
        },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other']
          }
        },
        subscription_pause: {
          enabled: false
        },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price', 'quantity', 'promotion_code'],
          proration_behavior: 'create_prorations'
        },
        invoice_history: {
          enabled: true
        }
      }
    });

    logEvent({
      level: 'info',
      function_name: 'create-customer-portal-session',
      action: 'portal_config_created',
      success: true,
      metadata: {
        configuration_id: config.id
      },
      request_id: requestId
    });

    return config.id;

  } catch (error) {
    console.warn('Failed to get/create portal configuration, using default:', error);
    return undefined; // Use Stripe's default configuration
  }
}