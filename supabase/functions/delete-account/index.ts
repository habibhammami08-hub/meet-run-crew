import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    // 2. Get Supabase URL and keys
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new AppError('Missing Supabase configuration', ErrorCode.CONFIG_ERROR, 500);
    }

    // 3. Create clients
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '');

    // 4. Authenticate user using Bearer token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Missing or invalid authorization header', ErrorCode.INVALID_TOKEN, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Get user from token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      throw new AppError('Invalid or expired token', ErrorCode.TOKEN_INVALID, 401);
    }

    userId = user.id;

    logEvent({
      level: 'info',
      function_name: 'delete-account',
      user_id: userId,
      action: 'deletion_requested',
      success: true,
      request_id: requestId
    });

    // 5. Check for active future sessions hosted by this user
    const { data: futureSessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, title, scheduled_at')
      .eq('host_id', userId)
      .eq('status', 'published')
      .gte('scheduled_at', new Date().toISOString())
      .limit(5);

    if (sessionsError) {
      console.error('Failed to check active sessions:', sessionsError);
      throw new AppError('Failed to verify account status', ErrorCode.DATABASE_ERROR, 500);
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
          sessions: futureSessions
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

    // 6. Perform account deletion in correct order
    const deletionStats = await performAccountDeletion(supabaseAdmin, userId, requestId);

    // 7. Delete audit logs (foreign key constraint with auth.users)
    const { error: auditError } = await supabaseAdmin
      .from('audit_log')
      .delete()
      .eq('user_id', userId);
    
    if (auditError) {
      console.warn('Warning: Could not delete audit logs:', auditError);
      // Continue even if audit logs can't be deleted - not critical
    }

    // 8. CRITICAL: Delete user from auth.users (this will prevent re-login)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error('Failed to delete auth user:', deleteUserError);
      throw new AppError(
        'Failed to complete account deletion',
        ErrorCode.DATABASE_ERROR,
        500
      );
    }

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

    // 3. Archive user's past sessions (don't delete to maintain data integrity)
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

    // 5. Delete profile - this will cascade delete related data
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