import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Créer le client Supabase avec la clé SERVICE (pas anon)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Créer le client pour l'utilisateur authentifié
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Récupérer le token d'autorisation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Token d\'autorisation manquant')
    }

    // Valider le token et récupérer l'utilisateur
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token)

    if (authError || !user) {
      throw new Error('Token invalide ou utilisateur non trouvé')
    }

    console.log(`[delete-user-account] Début suppression pour utilisateur: ${user.id}`)

    // 1. Supprimer les inscriptions aux sessions
    console.log('[delete-user-account] Suppression des enrollments...')
    const { error: enrollmentsError } = await supabaseAdmin
      .from('enrollments')
      .delete()
      .eq('user_id', user.id)

    if (enrollmentsError) {
      console.error('Erreur suppression enrollments:', enrollmentsError)
    } else {
      console.log('[delete-user-account] Enrollments supprimés')
    }

    // 2. Supprimer les sessions organisées par l'utilisateur
    console.log('[delete-user-account] Suppression des sessions créées...')
    const { error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('host_id', user.id)

    if (sessionsError) {
      console.error('Erreur suppression sessions:', sessionsError)
    } else {
      console.log('[delete-user-account] Sessions supprimées')
    }

    // 3. Récupérer l'avatar avant suppression du profil
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    // 4. Supprimer l'avatar du storage s'il existe
    if (profileData?.avatar_url) {
      console.log('[delete-user-account] Suppression de l\'avatar...')
      try {
        // Extraire le nom du fichier de l'URL
        const avatarPath = profileData.avatar_url.split('/').slice(-2).join('/')
        
        const { error: storageError } = await supabaseAdmin.storage
          .from('avatars')
          .remove([avatarPath])

        if (storageError) {
          console.error('Erreur suppression avatar:', storageError)
        } else {
          console.log('[delete-user-account] Avatar supprimé')
        }
      } catch (storageErr) {
        console.error('Erreur lors de la suppression de l\'avatar:', storageErr)
      }
    }

    // 5. Supprimer le profil utilisateur
    console.log('[delete-user-account] Suppression du profil...')
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user.id)

    if (profileError) {
      console.error('Erreur suppression profil:', profileError)
      throw new Error(`Impossible de supprimer le profil: ${profileError.message}`)
    } else {
      console.log('[delete-user-account] Profil supprimé')
    }

    // 6. Supprimer d'abord les logs d'audit qui référencent l'utilisateur
    console.log('[delete-user-account] Suppression des logs d\'audit...')
    const { error: auditError } = await supabaseAdmin
      .from('audit_log')
      .delete()
      .eq('user_id', user.id)

    if (auditError) {
      console.error('Erreur suppression audit_log:', auditError)
    } else {
      console.log('[delete-user-account] Logs d\'audit supprimés')
    }

    // 7. Supprimer le compte d'authentification (avec la clé service)
    console.log('[delete-user-account] Suppression du compte auth...')
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteUserError) {
      console.error('Erreur suppression compte auth:', deleteUserError)
      
      // Tentative de suppression forcée via SQL direct si possible
      try {
        console.log('[delete-user-account] Tentative de suppression forcée...')
        const { error: sqlDeleteError } = await supabaseAdmin
          .from('auth.users')
          .delete()
          .eq('id', user.id)
        
        if (sqlDeleteError) {
          console.error('Erreur suppression SQL forcée:', sqlDeleteError)
          throw new Error(`Impossible de supprimer le compte auth: ${deleteUserError.message}`)
        } else {
          console.log('[delete-user-account] Suppression forcée réussie')
        }
      } catch (forcedDeleteError) {
        console.error('Suppression forcée échouée:', forcedDeleteError)
        throw new Error(`Suppression auth impossible: ${deleteUserError.message}`)
      }
    } else {
      console.log('[delete-user-account] Compte auth supprimé')
    }

    console.log(`[delete-user-account] Suppression terminée pour utilisateur: ${user.id}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Compte utilisateur supprimé avec succès',
        user_id: user.id,
        deleted_at: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('[delete-user-account] Erreur:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur interne du serveur',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})