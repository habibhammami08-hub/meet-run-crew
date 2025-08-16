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

    const supabase = await createSupabaseClient(true);

    // Check for future sessions as host
    const { data: futureSessions, error: futureSessionsError } = await supabase
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

    // Start deletion process
    let deletedSessions = 0;
    let deletedEnrollments = 0;

    // Cancel future enrollments
    const { error: enrollmentCancelError } = await supabase
      .from('enrollments')
      .update({ 
        status: 'cancelled', 
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', userId)
      .in('session_id', 
        supabase
          .from('sessions')
          .select('id')
          .gte('scheduled_at', new Date().toISOString())
      );

    if (enrollmentCancelError) {
      console.error('Error cancelling enrollments:', enrollmentCancelError);
    }

    // Archive past sessions (don't delete for data integrity)
    const { error: sessionArchiveError } = await supabase
      .from('sessions')
      .update({ 
        status: 'cancelled', 
        updated_at: new Date().toISOString() 
      })
      .eq('host_id', userId)
      .lt('scheduled_at', new Date().toISOString());

    if (sessionArchiveError) {
      console.error('Error archiving sessions:', sessionArchiveError);
    }

    // Delete subscriber records
    await supabase
      .from('subscribers')
      .delete()
      .eq('user_id', userId);

    // Try to delete auth user (this will cascade to profile via FK)
    try {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
      
      if (deleteUserError) {
        console.error('Error deleting auth user:', deleteUserError);
        
        // Fallback: delete profile manually
        const { error: profileDeleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);
          
        if (profileDeleteError) {
          throw new AppError(
            'Failed to delete user profile',
            ErrorCode.DATABASE_ERROR,
            500
          );
        }
      }
    } catch (error) {
      console.error('Error in user deletion:', error);
      
      // Fallback: delete profile manually
      const { error: profileDeleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
        
      if (profileDeleteError) {
        throw new AppError(
          'Failed to delete user profile',
          ErrorCode.DATABASE_ERROR,
          500
        );
      }
    }

    const response: DeleteAccountResponse = {
      success: true,
      message: 'Account deleted successfully',
      deleted_data: {
        sessions: deletedSessions,
        enrollments: deletedEnrollments,
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