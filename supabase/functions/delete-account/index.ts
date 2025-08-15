import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient, authenticateUser } from "../_shared/auth.ts";
import { 
  AppError, 
  ErrorCode, 
  createErrorResponse, 
  corsHeaders, 
  logEvent, 
  generateRequestId 
} from "../_shared/errors.ts";

interface DeletionResult {
  success: boolean;
  user_id: string;
  deleted_data: {
    sessions: number;
    enrollments: number;
    storage_files: number;
  };
  message: string;
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

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'deletion_requested',
      success: true,
      request_id: requestId
    });

    // 3. Check for active sessions in the future
    await checkActiveHostedSessions(userId, requestId);

    // 4. Create admin Supabase client
    const supabaseAdmin = await createSupabaseClient(true);

    // 5. Perform deletion in order
    const deletionStats = await performAccountDeletion(supabaseAdmin, userId, requestId);

    const result: DeletionResult = {
      success: true,
      user_id: userId,
      deleted_data: deletionStats,
      message: 'Account successfully deleted'
    };

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'account_deleted',
      success: true,
      duration_ms: Date.now() - startTime,
      metadata: deletionStats,
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

async function checkActiveHostedSessions(userId: string, requestId: string): Promise<void> {
  const supabase = await createSupabaseClient(true);

  try {
    // Check for future sessions hosted by this user
    const { data: futureSessions, error } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at')
      .eq('host_id', userId)
      .eq('status', 'published')
      .gte('scheduled_at', new Date().toISOString())
      .limit(5);

    if (error) {
      console.error('Failed to check active sessions:', error);
      throw new AppError(
        'Failed to verify account status',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

    if (futureSessions && futureSessions.length > 0) {
      logEvent({
        level: 'warn',
        function_name: 'delete-account',
        user_id: userId,
        action: 'active_sessions_found',
        success: false,
        metadata: {
          session_count: futureSessions.length,
          sessions: futureSessions.map(s => ({
            id: s.id,
            title: s.title,
            date: s.scheduled_at
          }))
        },
        request_id: requestId
      });

      throw new AppError(
        'Cannot delete account with active future sessions',
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        `Vous ne pouvez pas supprimer votre compte car vous organisez ${futureSessions.length} session(s) à venir. Veuillez d'abord annuler ou transférer ces sessions.`
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'Failed to verify account status',
      ErrorCode.DATABASE_ERROR,
      500
    );
  }
}

async function performAccountDeletion(
  supabaseAdmin: any,
  userId: string,
  requestId: string
): Promise<{ sessions: number; enrollments: number; storage_files: number }> {
  const stats = {
    sessions: 0,
    enrollments: 0,
    storage_files: 0
  };

  try {
    // 1. Delete avatar files from storage
    stats.storage_files = await deleteUserStorageFiles(supabaseAdmin, userId, requestId);

    // 2. Cancel user's enrollments in future sessions
    const { data: enrollments, error: enrollmentsSelectError } = await supabaseAdmin
      .from('enrollments')
      .select(`
        id,
        sessions!inner(scheduled_at)
      `)
      .eq('user_id', userId)
      .gte('sessions.scheduled_at', new Date().toISOString());

    if (enrollmentsSelectError) {
      console.error('Failed to get user enrollments:', enrollmentsSelectError);
    } else if (enrollments && enrollments.length > 0) {
      // Update enrollments to cancelled instead of deleting
      const { error: enrollmentsUpdateError } = await supabaseAdmin
        .from('enrollments')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .in('id', enrollments.map(e => e.id));

      if (enrollmentsUpdateError) {
        console.error('Failed to cancel user enrollments:', enrollmentsUpdateError);
      } else {
        stats.enrollments = enrollments.length;
      }
    }

    // 3. Delete or archive user's past sessions
    const { data: pastSessions, error: sessionsSelectError } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('host_id', userId)
      .lt('scheduled_at', new Date().toISOString());

    if (sessionsSelectError) {
      console.error('Failed to get user sessions:', sessionsSelectError);
    } else if (pastSessions && pastSessions.length > 0) {
      // Archive sessions instead of deleting (for data integrity)
      const { error: sessionsUpdateError } = await supabaseAdmin
        .from('sessions')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('host_id', userId)
        .in('id', pastSessions.map(s => s.id));

      if (sessionsUpdateError) {
        console.error('Failed to archive user sessions:', sessionsUpdateError);
      } else {
        stats.sessions = pastSessions.length;
      }
    }

    // 4. Delete subscriber record
    await supabaseAdmin
      .from('subscribers')
      .delete()
      .eq('user_id', userId);

    // 5. Delete profile (cascades to remaining data)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Failed to delete profile:', profileError);
      throw new AppError(
        'Failed to delete user profile',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

    // 6. Delete from auth.users (complete account removal)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Failed to delete auth user:', authError);
      throw new AppError(
        'Failed to delete user account',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'deletion_completed',
      success: true,
      metadata: stats,
      request_id: requestId
    });

    return stats;

  } catch (error) {
    console.error('Account deletion failed:', error);
    throw error;
  }
}

async function deleteUserStorageFiles(
  supabaseAdmin: any,
  userId: string,
  requestId: string
): Promise<number> {
  try {
    // List all files in user's folder
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from('avatars')
      .list(userId);

    if (listError) {
      console.warn('Failed to list user storage files:', listError);
      return 0;
    }

    if (!files || files.length === 0) {
      return 0;
    }

    // Delete all files
    const filePaths = files.map(file => `${userId}/${file.name}`);
    const { error: deleteError } = await supabaseAdmin.storage
      .from('avatars')
      .remove(filePaths);

    if (deleteError) {
      console.warn('Failed to delete some storage files:', deleteError);
      return 0; // Don't fail the entire deletion for storage issues
    }

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'storage_files_deleted',
      success: true,
      metadata: {
        files_deleted: files.length,
        file_paths: filePaths
      },
      request_id: requestId
    });

    return files.length;

  } catch (error) {
    console.warn('Storage deletion failed, continuing with account deletion:', error);
    return 0; // Don't fail the entire process for storage issues
  }
}