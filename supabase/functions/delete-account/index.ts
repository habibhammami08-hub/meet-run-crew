import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createSupabaseClient, authenticateUser } from "../_shared/auth.ts";
import { 
  AppError, 
  ErrorCode, 
  createErrorResponse, 
  corsHeaders, 
  logEvent, 
  generateRequestId,
  STRIPE_TIMEOUT
} from "../_shared/errors.ts";

interface DeleteAccountResult {
  success: boolean;
  message: string;
  deleted_data?: {
    sessions: number;
    enrollments: number;
    profile: boolean;
  };
  subscription_info?: {
    had_active_subscription: boolean;
    renewal_cancelled: boolean;
    expires_at?: string;
  };
  error?: string;
}

interface CanDeleteResponse {
  can_delete: boolean;
  reason?: string;
  message?: string;
  future_sessions_with_participants?: number;
  active_enrollments_count?: number;
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

    // 2. Authenticate user
    const authHeader = req.headers.get('authorization');
    const user = await authenticateUser(authHeader, { requireProfile: true });

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      action: 'deletion_requested',
      success: true,
      metadata: {
        user_id: user.id,
        email: user.email
      },
      request_id: requestId
    });

    // 3. Check if user can delete account
    const eligibilityResult = await checkDeletionEligibility(user.id, authHeader, requestId);
    
    if (!eligibilityResult.can_delete) {
      logEvent({
        level: 'warn',
        function_name: 'delete-account',
        action: 'deletion_blocked',
        success: false,
        metadata: {
          user_id: user.id,
          reason: eligibilityResult.reason,
          future_sessions: eligibilityResult.future_sessions_with_participants
        },
        request_id: requestId
      });

      throw new AppError(
        eligibilityResult.message || 'Account deletion not allowed',
        ErrorCode.BUSINESS_RULE_VIOLATION,
        400,
        eligibilityResult.message
      );
    }

    // 4. Process account deletion
    const result = await processAccountDeletion(user, authHeader, requestId);

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      action: 'deletion_completed',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: {
        user_id: user.id,
        email: user.email,
        deleted_sessions: result.deleted_data?.sessions,
        deleted_enrollments: result.deleted_data?.enrollments,
        had_subscription: result.subscription_info?.had_active_subscription
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
      function_name: 'delete-account',
      action: 'deletion_failed',
      success: false,
      error_code: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR,
      error_message: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
      request_id: requestId
    });

    return createErrorResponse(error, requestId, corsHeaders);
  }
});

async function checkDeletionEligibility(
  userId: string,
  authHeader: string | null,
  requestId: string
): Promise<CanDeleteResponse> {
  const supabase = await createSupabaseClient(false, authHeader);

  try {
    const { data, error } = await supabase.rpc('can_delete_account');

    if (error) {
      console.error('Error checking deletion eligibility:', error);
      throw new AppError(
        'Failed to check deletion eligibility',
        ErrorCode.DATABASE_ERROR,
        500,
        'Impossible de vérifier l\'éligibilité à la suppression'
      );
    }

    return data as CanDeleteResponse;

  } catch (error) {
    console.error('Failed to check deletion eligibility:', error);
    throw error;
  }
}

async function processAccountDeletion(
  user: any,
  authHeader: string | null,
  requestId: string
): Promise<DeleteAccountResult> {
  const supabase = await createSupabaseClient(false, authHeader);

  try {
    // 1. Execute database deletion using RPC
    const { data: deletionResult, error: deletionError } = await supabase.rpc('app_delete_account');

    if (deletionError || !deletionResult?.success) {
      console.error('Database deletion failed:', deletionError);
      throw new AppError(
        'Failed to delete account data',
        ErrorCode.DATABASE_ERROR,
        500,
        deletionResult?.error || 'Erreur lors de la suppression des données'
      );
    }

    // 2. Handle Stripe subscription if exists
    let subscriptionInfo = {
      had_active_subscription: false,
      renewal_cancelled: false
    };

    if (deletionResult.subscription_info?.stripe_subscription_id) {
      try {
        subscriptionInfo = await handleStripeSubscription(
          deletionResult.subscription_info.stripe_subscription_id,
          requestId
        );
      } catch (stripeError) {
        console.error('Stripe subscription handling failed:', stripeError);
        // Don't fail the entire deletion for Stripe errors
        logEvent({
          level: 'warn',
          function_name: 'delete-account',
          action: 'stripe_cancellation_failed',
          success: false,
          error_message: stripeError instanceof Error ? stripeError.message : String(stripeError),
          metadata: {
            user_id: user.id,
            subscription_id: deletionResult.subscription_info.stripe_subscription_id
          },
          request_id: requestId
        });
      }
    }

    // 3. Clean up user storage (avatars)
    await cleanupUserStorage(user.id, requestId);

    // 4. Delete user from auth system
    await deleteAuthUser(user.id, requestId);

    return {
      success: true,
      message: 'Compte supprimé avec succès',
      deleted_data: {
        sessions: deletionResult.deleted_sessions || 0,
        enrollments: deletionResult.cancelled_enrollments || 0,
        profile: true
      },
      subscription_info: {
        had_active_subscription: subscriptionInfo.had_active_subscription,
        renewal_cancelled: subscriptionInfo.renewal_cancelled,
        expires_at: deletionResult.subscription_info?.current_period_end
      }
    };

  } catch (error) {
    console.error('Failed to process account deletion:', error);
    throw error;
  }
}

async function handleStripeSubscription(
  subscriptionId: string,
  requestId: string
): Promise<{ had_active_subscription: boolean; renewal_cancelled: boolean }> {
  const stripe = createStripeClient();

  try {
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      timeout: STRIPE_TIMEOUT
    });

    const wasActive = subscription.status === 'active';

    if (wasActive && !subscription.cancel_at_period_end) {
      // Cancel at period end instead of immediately
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      }, {
        timeout: STRIPE_TIMEOUT
      });

      logEvent({
        level: 'info',
        function_name: 'delete-account',
        action: 'subscription_cancelled',
        success: true,
        metadata: {
          subscription_id: subscriptionId,
          current_period_end: subscription.current_period_end
        },
        request_id: requestId
      });

      return {
        had_active_subscription: true,
        renewal_cancelled: true
      };
    }

    return {
      had_active_subscription: wasActive,
      renewal_cancelled: subscription.cancel_at_period_end || false
    };

  } catch (error) {
    console.error('Failed to handle Stripe subscription:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      if (error.code === 'resource_missing') {
        // Subscription doesn't exist, that's fine
        return {
          had_active_subscription: false,
          renewal_cancelled: false
        };
      }
    }

    throw new AppError(
      'Failed to cancel subscription',
      ErrorCode.STRIPE_ERROR,
      500,
      'Erreur lors de l\'annulation de l\'abonnement'
    );
  }
}

async function cleanupUserStorage(userId: string, requestId: string): Promise<void> {
  const supabase = await createSupabaseClient(true);

  try {
    // List all files in user's avatar folder
    const { data: files, error: listError } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (listError) {
      console.error('Failed to list user files:', listError);
      // Don't fail the entire deletion for storage cleanup errors
      return;
    }

    if (files && files.length > 0) {
      // Delete all files in user's folder
      const filePaths = files.map(file => `${userId}/${file.name}`);
      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove(filePaths);

      if (deleteError) {
        console.error('Failed to delete user files:', deleteError);
        // Don't fail the entire deletion for storage cleanup errors
      } else {
        logEvent({
          level: 'info',
          function_name: 'delete-account',
          action: 'storage_cleaned',
          success: true,
          metadata: {
            user_id: userId,
            files_deleted: files.length
          },
          request_id: requestId
        });
      }
    }

  } catch (error) {
    console.error('Failed to cleanup user storage:', error);
    // Don't fail the entire deletion for storage cleanup errors
  }
}

async function deleteAuthUser(userId: string, requestId: string): Promise<void> {
  const supabase = await createSupabaseClient(true);

  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Failed to delete auth user:', error);
      throw new AppError(
        'Failed to delete user authentication',
        ErrorCode.AUTH_ERROR,
        500,
        'Erreur lors de la suppression de l\'authentification'
      );
    }

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      action: 'auth_user_deleted',
      success: true,
      metadata: {
        user_id: userId
      },
      request_id: requestId
    });

  } catch (error) {
    console.error('Failed to delete auth user:', error);
    throw error;
  }
}

function createStripeClient(): Stripe {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    throw new AppError('Stripe configuration missing', ErrorCode.CONFIG_ERROR, 500);
  }

  return new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    timeout: STRIPE_TIMEOUT
  });
}