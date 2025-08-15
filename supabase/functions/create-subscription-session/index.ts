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

interface SubscriptionRequestPayload {
  priceId?: string; // Optional override for specific price
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

    // 2. Validate environment variables
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const defaultPriceId = Deno.env.get('STRIPE_PRICE_MONTHLY_EUR');
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 
                      req.headers.get('origin') || 
                      'https://meetrun.app';

    if (!stripeKey) {
      throw new AppError(
        'Stripe secret key not configured',
        ErrorCode.CONFIG_ERROR,
        500
      );
    }

    if (!defaultPriceId) {
      throw new AppError(
        'Stripe price ID not configured',
        ErrorCode.CONFIG_ERROR,
        500
      );
    }

    // 3. Parse request payload (optional)
    let payload: SubscriptionRequestPayload = {};
    try {
      const body = await req.text();
      if (body.trim()) {
        payload = JSON.parse(body);
      }
    } catch (error) {
      throw new AppError(
        'Invalid JSON payload',
        ErrorCode.INVALID_PAYLOAD,
        400
      );
    }

    // 4. Authenticate user
    const user = await authenticateUser(req.headers.get('Authorization'), {
      requireProfile: true
    });
    userId = user.id;

    // Validate user has required profile data
    if (!user.email) {
      throw new AppError(
        'User email is required for subscription',
        ErrorCode.MISSING_REQUIRED_FIELD,
        400,
        'Une adresse email valide est requise'
      );
    }

    logEvent({
      level: 'info',
      function_name: 'create-subscription-session',
      user_id: userId,
      action: 'subscription_request',
      success: true,
      metadata: {
        existing_customer: !!user.profile?.stripe_customer_id,
        has_active_subscription: user.profile?.sub_status === 'active'
      },
      request_id: requestId
    });

    // 5. Check if user already has active subscription
    if (user.profile?.sub_status === 'active' && 
        user.profile?.sub_current_period_end && 
        new Date(user.profile.sub_current_period_end) > new Date()) {
      throw new AppError(
        'User already has an active subscription',
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        'Vous avez déjà un abonnement actif'
      );
    }

    // 6. Initialize Stripe
    const stripe = new Stripe(stripeKey, { 
      apiVersion: '2023-10-16',
      timeout: 15000, // Increased timeout
      maxNetworkRetries: 2
    });

    // 7. Determine price ID to use
    const priceId = payload.priceId || defaultPriceId;

    // 8. Validate price exists
    await validatePrice(stripe, priceId, requestId);

    // 9. Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(stripe, user, requestId);

    // 10. Double-check for existing active subscriptions in Stripe
    await checkExistingSubscription(stripe, customerId, userId, requestId);

    // 11. Create Stripe checkout session
    const checkoutSession = await createSubscriptionCheckout(
      stripe,
      customerId,
      priceId,
      appBaseUrl,
      user,
      requestId
    );

    logEvent({
      level: 'info',
      function_name: 'create-subscription-session',
      user_id: userId,
      action: 'checkout_created',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: {
        stripe_session_id: checkoutSession.id,
        customer_id: customerId,
        price_id: priceId,
        checkout_url: checkoutSession.url
      },
      request_id: requestId
    });

    return new Response(JSON.stringify({
      checkout_url: checkoutSession.url,
      session_id: checkoutSession.id,
      expires_at: checkoutSession.expires_at
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logEvent({
      level: 'error',
      function_name: 'create-subscription-session',
      user_id: userId,
      action: 'subscription_failed',
      success: false,
      error_code: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR,
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
      request_id: requestId
    });

    return createErrorResponse(error, requestId, corsHeaders);
  }
});

async function validatePrice(
  stripe: Stripe,
  priceId: string,
  requestId: string
): Promise<void> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    
    if (!price.active) {
      throw new AppError(
        'Selected price is not active',
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        'Le tarif sélectionné n\'est plus disponible'
      );
    }

    if (price.type !== 'recurring') {
      throw new AppError(
        'Price must be recurring for subscriptions',
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        'Ce tarif n\'est pas valide pour un abonnement'
      );
    }

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logEvent({
      level: 'error',
      function_name: 'create-subscription-session',
      action: 'price_validation_failed',
      success: false,
      metadata: {
        price_id: priceId,
        error_message: error instanceof Error ? error.message : String(error)
      },
      request_id: requestId
    });

    throw new AppError(
      'Invalid price configuration',
      ErrorCode.STRIPE_ERROR,
      400,
      'Configuration de tarif invalide'
    );
  }
}

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  user: any,
  requestId: string
): Promise<string> {
  // If user already has a customer ID, verify it exists and is valid
  if (user.profile?.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(user.profile.stripe_customer_id);
      
      if (!customer.deleted) {
        // Ensure customer email matches current user email
        if (customer.email !== user.email) {
          await stripe.customers.update(customer.id, {
            email: user.email,
            name: user.profile?.full_name || undefined
          });
        }
        return customer.id;
      }
    } catch (error) {
      logEvent({
        level: 'warn',
        function_name: 'create-subscription-session',
        user_id: user.id,
        action: 'customer_not_found',
        success: false,
        metadata: {
          stripe_customer_id: user.profile.stripe_customer_id,
          error_message: error instanceof Error ? error.message : String(error)
        },
        request_id: requestId
      });
    }
  }

  // Create new Stripe customer
  try {
    const customerData: Stripe.CustomerCreateParams = {
      email: user.email,
      metadata: {
        user_id: user.id,
        created_by: 'meetrun_subscription',
        created_at: new Date().toISOString()
      }
    };

    // Add name if available
    if (user.profile?.full_name?.trim()) {
      customerData.name = user.profile.full_name.trim();
    }

    const customer = await stripe.customers.create(customerData);

    // Update user profile with Stripe customer ID
    const supabase = await createSupabaseClient(true);
    const { error } = await supabase
      .from('profiles')
      .update({ 
        stripe_customer_id: customer.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to update profile with customer ID:', error);
      // Don't throw here, the customer was created successfully
      logEvent({
        level: 'warn',
        function_name: 'create-subscription-session',
        user_id: user.id,
        action: 'profile_update_failed',
        success: false,
        metadata: {
          stripe_customer_id: customer.id,
          error_message: error.message
        },
        request_id: requestId
      });
    }

    logEvent({
      level: 'info',
      function_name: 'create-subscription-session',
      user_id: user.id,
      action: 'customer_created',
      success: true,
      metadata: {
        stripe_customer_id: customer.id
      },
      request_id: requestId
    });

    return customer.id;

  } catch (error) {
    console.error('Failed to create Stripe customer:', error);
    throw new AppError(
      'Failed to create customer account',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la création du compte client'
    );
  }
}

async function checkExistingSubscription(
  stripe: Stripe,
  customerId: string,
  userId: string,
  requestId: string
): Promise<void> {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 3 // Check a few in case there are multiple
    });

    if (subscriptions.data.length > 0) {
      const activeSubscription = subscriptions.data[0];
      
      logEvent({
        level: 'info',
        function_name: 'create-subscription-session',
        user_id: userId,
        action: 'existing_subscription_found',
        success: false,
        metadata: {
          subscription_id: activeSubscription.id,
          status: activeSubscription.status,
          current_period_end: activeSubscription.current_period_end,
          total_active_subscriptions: subscriptions.data.length
        },
        request_id: requestId
      });

      throw new AppError(
        'User already has an active subscription',
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        'Vous avez déjà un abonnement actif'
      );
    }

    // Also check for trialing subscriptions
    const trialingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'trialing',
      limit: 1
    });

    if (trialingSubscriptions.data.length > 0) {
      throw new AppError(
        'User already has a trialing subscription',
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        'Vous avez déjà un abonnement en période d\'essai'
      );
    }

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    // Log but don't fail on Stripe API errors - better to allow the checkout
    logEvent({
      level: 'warn',
      function_name: 'create-subscription-session',
      user_id: userId,
      action: 'subscription_check_failed',
      success: false,
      error_message: error instanceof Error ? error.message : String(error),
      request_id: requestId
    });
  }
}

async function createSubscriptionCheckout(
  stripe: Stripe,
  customerId: string,
  priceId: string,
  baseUrl: string,
  user: any,
  requestId: string
): Promise<Stripe.Checkout.Session> {
  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscription/cancel`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      metadata: {
        user_id: user.id,
        type: 'subscription',
        created_at: new Date().toISOString()
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          created_by: 'meetrun_checkout',
          user_email: user.email
        }
      },
      automatic_tax: {
        enabled: false
      },
      billing_address_collection: 'required',
      customer_update: {
        name: 'auto',
        address: 'auto'
      },
      allow_promotion_codes: true,
      consent_collection: {
        terms_of_service: 'required'
      },
      payment_method_collection: 'always'
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new AppError(
        'Failed to generate checkout URL',
        ErrorCode.STRIPE_ERROR,
        500,
        'Erreur lors de la génération du lien de paiement'
      );
    }

    return session;

  } catch (error) {
    console.error('Failed to create subscription checkout:', error);
    
    // Enhanced error logging for Stripe errors
    if (error instanceof Error && 'type' in error) {
      logEvent({
        level: 'error',
        function_name: 'create-subscription-session',
        user_id: user.id,
        action: 'stripe_checkout_failed',
        success: false,
        metadata: {
          stripe_error_type: (error as any).type,
          stripe_error_code: (error as any).code,
          price_id: priceId,
          customer_id: customerId
        },
        request_id: requestId
      });
    }

    throw new AppError(
      'Failed to create subscription checkout',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de la création de la session d\'abonnement'
    );
  }
}