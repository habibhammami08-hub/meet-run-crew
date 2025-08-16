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
    // Validate request method
    if (req.method !== 'POST') {
      throw new AppError(
        'Only POST method allowed',
        ErrorCode.INVALID_REQUEST_METHOD,
        405
      );
    }

    // Authenticate user
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

    // Créer le client Supabase avec le token utilisateur pour RPC
    const userSupabase = await createSupabaseClient(false, req.headers.get('Authorization'));
    const supabase = await createSupabaseClient(true); // Service role pour storage et auth

    // Check for future sessions as host
    const { data: futureSessions, error: futureSessionsError } = await userSupabase
      .from('sessions')
      .select('id, title, scheduled_at')
      .eq('host_id', userId)
      .eq('status', 'published')
      .gte('scheduled_at', new Date().toISOString());

    if (futureSessionsError) {
      throw new AppError(
        'Failed to check future sessions',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

    if (futureSessions && futureSessions.length > 0) {
      throw new AppError(
        `Cannot delete account. You have ${futureSessions.length} upcoming session(s).`,
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        `Impossible de supprimer le compte. Vous organisez ${futureSessions.length} session(s) à venir.`
      );
    }

    // Appeler la RPC sécurisée pour nettoyer la DB
    const { data: rpcResult, error: rpcError } = await userSupabase.rpc('app_delete_account');
    
    if (rpcError) {
      console.error('RPC delete account error:', rpcError);
      throw new AppError(
        'Failed to execute account deletion',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

    // Nettoyer le Storage (avatars de l'utilisateur)
    try {
      const { data: files, error: listError } = await supabase.storage
        .from('avatars')
        .list(`avatars/${userId}`, { limit: 100 });

      if (!listError && files && files.length > 0) {
        const filePaths = files.map(file => `avatars/${userId}/${file.name}`);
        const { error: removeError } = await supabase.storage
          .from('avatars')
          .remove(filePaths);
        
        if (removeError) {
          console.error('Storage cleanup error:', removeError);
          // Ne pas faire échouer la suppression pour ça
        }
      }
    } catch (storageError) {
      console.error('Storage cleanup failed:', storageError);
      // Ne pas faire échouer la suppression pour ça
    }

    // Supprimer l'utilisateur Auth (admin)
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error('Auth user deletion failed:', deleteUserError);
      throw new AppError(
        'Failed to delete auth user',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

    const response: DeleteAccountResponse = {
      success: true,
      message: 'Account deleted successfully',
      deleted_data: {
        sessions: (rpcResult?.deleted_sessions || 0) + (rpcResult?.cancelled_sessions || 0),
        enrollments: rpcResult?.deleted_enrollments || 0,
        profile: true
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
