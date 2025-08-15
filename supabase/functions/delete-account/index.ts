import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface ValidationResult {
  canDelete: boolean
  blockers: string[]
  details: {
    upcomingSessions: number
    upcomingRuns: number
    enrolledRuns: number
    registeredSessions: number
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("🚀 Starting account deletion process...")

    // 1. Environment validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ Missing environment configuration")
      return errorResponse("Server configuration error", 500)
    }

    // 2. Extract and validate token
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ Missing authorization header")
      return errorResponse("Authentication required", 401)
    }

    const token = authHeader.replace("Bearer ", "")
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 3. Verify user
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !userData.user) {
      console.error("❌ Invalid user token:", userError?.message)
      return errorResponse("Invalid authentication", 401)
    }

    const userId = userData.user.id
    const userEmail = userData.user.email
    console.log(`✅ User authenticated: ${userEmail}`)

    // 4. CRITICAL: Validate user can delete account
    console.log("🔍 Checking account deletion eligibility...")
    const validation = await validateDeletionEligibility(supabase, userId)

    if (!validation.canDelete) {
      console.log("❌ Account deletion blocked:", validation.blockers)
      return errorResponse("Account cannot be deleted", 400, {
        blockers: validation.blockers,
        details: validation.details,
        message: "You must cancel or complete your active sessions and runs before deleting your account"
      })
    }

    console.log("✅ Account eligible for deletion")

    // 5. Execute complete account deletion
    console.log("🗑️ Starting data deletion process...")
    const deletionResult = await executeAccountDeletion(supabase, userId)

    if (!deletionResult.success) {
      console.error("❌ Deletion failed:", deletionResult.error)
      return errorResponse("Account deletion failed", 500, {
        error: deletionResult.error,
        partialResults: deletionResult.results
      })
    }

    console.log("🎉 Account successfully deleted!")
    
    return successResponse("Account successfully deleted", {
      userId,
      userEmail,
      deletedAt: new Date().toISOString(),
      deletionSummary: deletionResult.results
    })

  } catch (error) {
    console.error("💥 Fatal error:", error.message)
    return errorResponse(`Fatal error: ${error.message}`, 500)
  }
})

// Validate if user can delete their account
async function validateDeletionEligibility(supabase: any, userId: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    canDelete: true,
    blockers: [],
    details: {
      upcomingSessions: 0,
      upcomingRuns: 0,
      enrolledRuns: 0,
      registeredSessions: 0
    }
  }

  try {
    const now = new Date().toISOString()

    // Check for upcoming sessions where user is host
    const { data: upcomingSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, title, date')
      .eq('host_id', userId)
      .gte('date', now)

    if (sessionsError) {
      console.error("Error checking sessions:", sessionsError.message)
    } else if (upcomingSessions && upcomingSessions.length > 0) {
      result.canDelete = false
      result.blockers.push(`You have ${upcomingSessions.length} upcoming session(s) you're hosting`)
      result.details.upcomingSessions = upcomingSessions.length
      console.log("📅 Found upcoming sessions:", upcomingSessions.map(s => s.title))
    }

    // Check for upcoming runs where user is host
    const { data: upcomingRuns, error: runsError } = await supabase
      .from('runs')
      .select('id, title, date')
      .eq('host_id', userId)
      .gte('date', now)

    if (runsError) {
      console.error("Error checking runs:", runsError.message)
    } else if (upcomingRuns && upcomingRuns.length > 0) {
      result.canDelete = false
      result.blockers.push(`You have ${upcomingRuns.length} upcoming run(s) you're hosting`)
      result.details.upcomingRuns = upcomingRuns.length
      console.log("🏃 Found upcoming runs:", upcomingRuns.map(r => r.title))
    }

    // Check for active enrollments in upcoming runs
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('enrollments')
      .select(`
        id,
        runs!inner(id, title, date, host_id)
      `)
      .eq('user_id', userId)
      .gte('runs.date', now)

    if (enrollmentsError) {
      console.error("Error checking enrollments:", enrollmentsError.message)
    } else if (enrollments && enrollments.length > 0) {
      result.canDelete = false
      result.blockers.push(`You're enrolled in ${enrollments.length} upcoming run(s)`)
      result.details.enrolledRuns = enrollments.length
      console.log("🎽 Found active enrollments:", enrollments.map(e => e.runs.title))
    }

    // Check for active registrations in upcoming sessions
    const { data: registrations, error: registrationsError } = await supabase
      .from('registrations')
      .select(`
        id,
        sessions!inner(id, title, date, host_id)
      `)
      .eq('user_id', userId)
      .gte('sessions.date', now)

    if (registrationsError) {
      console.error("Error checking registrations:", registrationsError.message)
    } else if (registrations && registrations.length > 0) {
      result.canDelete = false
      result.blockers.push(`You're registered for ${registrations.length} upcoming session(s)`)
      result.details.registeredSessions = registrations.length
      console.log("📝 Found active registrations:", registrations.map(r => r.sessions.title))
    }

  } catch (error) {
    console.error("Error during validation:", error.message)
    result.canDelete = false
    result.blockers.push("Unable to validate account status")
  }

  return result
}

// Execute complete account deletion
async function executeAccountDeletion(supabase: any, userId: string) {
  const results: any[] = []
  
  try {
    // Step 1: Sign out user from all sessions
    console.log("🔐 Signing out user from all sessions...")
    try {
      await supabase.auth.admin.signOut(userId)
      results.push({ step: "signout", success: true })
    } catch (e) {
      results.push({ step: "signout", success: false, error: e.message })
    }

    // Step 2: Delete user data in correct order (respecting foreign keys)
    const deletionOrder = [
      { table: 'audit_log', column: 'user_id', description: 'audit logs' },
      { table: 'enrollments', column: 'user_id', description: 'run enrollments' },
      { table: 'registrations', column: 'user_id', description: 'session registrations' },
      { table: 'subscribers', column: 'user_id', description: 'subscriptions' },
      { table: 'sessions', column: 'host_id', description: 'hosted sessions' },
      { table: 'runs', column: 'host_id', description: 'hosted runs' },
      { table: 'profiles', column: 'id', description: 'profile' } // profiles.id = user.id
    ]

    for (const { table, column, description } of deletionOrder) {
      console.log(`🗑️ Deleting ${description}...`)
      
      try {
        const { error, count } = await supabase
          .from(table)
          .delete({ count: 'exact' })
          .eq(column, userId)

        if (error) {
          console.error(`❌ Failed to delete ${description}:`, error.message)
          results.push({ 
            step: `delete_${table}`, 
            success: false, 
            error: error.message 
          })
        } else {
          console.log(`✅ Deleted ${count || 0} ${description}`)
          results.push({ 
            step: `delete_${table}`, 
            success: true, 
            count: count || 0 
          })
        }
      } catch (e) {
        console.error(`❌ Exception deleting ${description}:`, e.message)
        results.push({ 
          step: `delete_${table}`, 
          success: false, 
          error: e.message 
        })
      }
    }

    // Step 3: Clean up storage
    console.log("🗂️ Cleaning up file storage...")
    try {
      const { data: files } = await supabase.storage.from('avatars').list(userId)
      
      if (files && files.length > 0) {
        const filePaths = files.map(file => `${userId}/${file.name}`)
        const { error } = await supabase.storage.from('avatars').remove(filePaths)
        
        if (error) {
          results.push({ step: 'storage_cleanup', success: false, error: error.message })
        } else {
          results.push({ step: 'storage_cleanup', success: true, count: files.length })
        }
      } else {
        results.push({ step: 'storage_cleanup', success: true, count: 0 })
      }
    } catch (e) {
      results.push({ step: 'storage_cleanup', success: false, error: e.message })
    }

    // Step 4: Delete auth user (final step)
    console.log("🔥 Deleting authentication user...")
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      
      if (error) {
        console.error("❌ Failed to delete auth user:", error.message)
        results.push({ step: 'delete_auth_user', success: false, error: error.message })
        return { success: false, error: error.message, results }
      } else {
        console.log("✅ Auth user deleted successfully")
        results.push({ step: 'delete_auth_user', success: true })
        return { success: true, results }
      }
    } catch (e) {
      console.error("❌ Exception deleting auth user:", e.message)
      results.push({ step: 'delete_auth_user', success: false, error: e.message })
      return { success: false, error: e.message, results }
    }

  } catch (error) {
    console.error("❌ Fatal error during deletion:", error.message)
    return { success: false, error: error.message, results }
  }
}

// Helper functions
function successResponse(message: string, data?: any) {
  return new Response(JSON.stringify({
    success: true,
    message,
    data
  }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    },
    status: 200
  })
}

function errorResponse(message: string, status: number, details?: any) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    details
  }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    },
    status
  })
}