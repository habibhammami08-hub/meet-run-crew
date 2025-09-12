import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseClient, authenticateUser } from "../_shared/auth.ts";
import { 
  AppError, 
  ErrorCode, 
  createErrorResponse, 
  corsHeaders, 
  logEvent, 
  generateRequestId 
} from "../_shared/errors.ts";

interface DeleteAccountResponse {
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
}

serve(async (req) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  let userId: string | undefined;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new AppError('Only POST method allowed', ErrorCode.INVALID_REQUEST_METHOD, 405);
    }

    const user = await authenticateUser(req.headers.get('Authorization'));
    userId = user.id;

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'deletion_requested',
      success: true,
      request_id: requestId
    });

    const userSupabase = await createSupabaseClient(false, req.headers.get('Authorization'));
    const adminSupabase = await createSupabaseClient(true);

    // 1. Vérifier l'éligibilité
    console.log(`Checking if user ${userId} can delete account`);
    const { data: canDeleteData, error: canDeleteError } = await userSupabase.rpc('can_delete_account');

    if (canDeleteError) {
      console.error('Error checking deletion eligibility:', canDeleteError);
      throw new AppError('Failed to check deletion eligibility: ' + canDeleteError.message, ErrorCode.DATABASE_ERROR, 500);
    }

    if (!canDeleteData?.can_delete) {
      throw new AppError(canDeleteData?.message || 'Account deletion not allowed', ErrorCode.INVALID_FIELD_VALUE, 400);
    }

    // 2. Nettoyer les données
    console.log(`Starting database cleanup for user ${userId}`);
    const { data: rpcResult, error: rpcError } = await userSupabase.rpc('app_delete_account');
    
    if (rpcError) {
      console.error('RPC delete account error:', rpcError);
      throw new AppError('Failed to execute account deletion: ' + rpcError.message, ErrorCode.DATABASE_ERROR, 500);
    }

    if (!rpcResult?.success) {
      throw new AppError(rpcResult?.error || 'Database cleanup failed', ErrorCode.DATABASE_ERROR, 500);
    }

    console.log('Database cleanup completed:', rpcResult);

    // 2.5. GESTION INTELLIGENTE DE L'ABONNEMENT STRIPE
    if (rpcResult.subscription_info?.has_active_subscription) {
      try {
        const subscriptionInfo = rpcResult.subscription_info;
        console.log(`Managing Stripe subscription: ${subscriptionInfo.stripe_customer_id}`);
        
        const stripeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/manage-stripe-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            action: 'cancel_at_period_end',
            subscription_id: subscriptionInfo.stripe_customer_id,
            customer_id: subscriptionInfo.stripe_customer_id,
            reason: 'account_deletion'
          })
        });

        if (!stripeResponse.ok) {
          console.error('Failed to cancel Stripe subscription renewal:', await stripeResponse.text());
        } else {
          const stripeResult = await stripeResponse.json();
          console.log('Stripe subscription renewal cancelled successfully:', stripeResult);
          
          rpcResult.subscription_info.renewal_cancelled = true;
          rpcResult.subscription_info.will_expire_at = new Date(stripeResult.current_period_end * 1000);
        }

      } catch (stripeError) {
        console.error('Error managing Stripe subscription:', stripeError);
      }
    } else {
      console.log('No active Stripe subscription to manage');
    }

    // 3. Nettoyer le Storage
    try {
      console.log(`Cleaning up storage for user ${userId}`);
      
      const { data: files, error: listError } = await adminSupabase.storage
        .from('avatars')
        .list(`avatars/${userId}`, { limit: 100 });

      if (!listError && files && files.length > 0) {
        const filePaths = files.map(file => `avatars/${userId}/${file.name}`);
        console.log(`Found ${filePaths.length} files to delete`);
        
        const { error: removeError } = await adminSupabase.storage
          .from('avatars')
          .remove(filePaths);
        
        if (removeError) {
          console.error('Storage cleanup error:', removeError);
        } else {
          console.log(`Successfully cleaned up ${filePaths.length} storage files`);
        }
      } else {
        console.log(`No storage files found for user ${userId}`);
      }
    } catch (storageError) {
      console.error('Storage cleanup failed:', storageError);
    }

    // 4. Supprimer l'utilisateur Auth
    console.log(`Deleting auth user ${userId}`);
    const { error: deleteUserError } = await adminSupabase.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error('Auth user deletion failed:', deleteUserError);
      throw new AppError('Failed to delete auth user: ' + deleteUserError.message, ErrorCode.DATABASE_ERROR, 500);
    }

    console.log(`Auth user ${userId} successfully deleted`);

    const response: DeleteAccountResponse = {
      success: true,
      message: 'Account deleted successfully',
      deleted_data: {
        sessions: rpcResult.deleted_sessions || 0,
        enrollments: rpcResult.cancelled_enrollments || 0,
        profile: true
      },
      subscription_info: {
        had_active_subscription: rpcResult.subscription_info?.has_active_subscription || false,
        renewal_cancelled: rpcResult.subscription_info?.renewal_cancelled || false,
        expires_at: rpcResult.subscription_info?.will_expire_at || null
      }
    };

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'deletion_completed',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: response.deleted_data,
      request_id: requestId
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logEvent({
      level: 'error',
      function_name: 'delete-account',
      user_id: userId,
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
