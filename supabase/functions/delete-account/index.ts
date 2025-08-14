import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Vérifier que c'est une requête POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Méthode non autorisée' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Récupérer le token d'autorisation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token d\'autorisation manquant' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Créer le client Supabase avec le token utilisateur
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Vérifier l'utilisateur authentifié
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('Erreur authentification:', userError)
      return new Response(
        JSON.stringify({ error: 'Utilisateur non authentifié' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`[delete-account] Suppression demandée pour l'utilisateur: ${user.id}`)

    // Créer le client admin avec Service Role Key
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 1. Supprimer l'avatar du storage s'il existe
    try {
      const { data: files } = await supabaseAdmin.storage
        .from('avatars')
        .list(user.id)
      
      if (files && files.length > 0) {
        const filePaths = files.map(file => `${user.id}/${file.name}`)
        const { error: storageError } = await supabaseAdmin.storage
          .from('avatars')
          .remove(filePaths)
        
        if (storageError) {
          console.warn('Erreur suppression avatar:', storageError)
        } else {
          console.log('[delete-account] Avatar supprimé du storage')
        }
      }
    } catch (storageError) {
      console.warn('Erreur lors de la suppression du storage:', storageError)
    }

    // 2. Supprimer les courses organisées par l'utilisateur
    try {
      const { data: userCourses, error: coursesQueryError } = await supabaseAdmin
        .from('courses')
        .select('id')
        .eq('organizer_id', user.id)

      if (coursesQueryError) {
        console.warn('Erreur lors de la récupération des courses:', coursesQueryError)
      } else if (userCourses && userCourses.length > 0) {
        const courseIds = userCourses.map(course => course.id)
        console.log(`[delete-account] ${courseIds.length} course(s) à supprimer`)

        const { error: coursesDeleteError } = await supabaseAdmin
          .from('courses')
          .delete()
          .eq('organizer_id', user.id)

        if (coursesDeleteError) {
          console.error('Erreur suppression courses:', coursesDeleteError)
          return new Response(
            JSON.stringify({ error: 'Erreur lors de la suppression des courses organisées' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        console.log('[delete-account] Courses organisées supprimées')
      } else {
        console.log('[delete-account] Aucune course organisée à supprimer')
      }
    } catch (coursesError) {
      console.error('Erreur lors de la suppression des courses:', coursesError)
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la suppression des courses' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 3. Supprimer les données utilisateur de la base (CASCADE fera le reste)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user.id)

    if (profileError) {
      console.error('Erreur suppression profil:', profileError)
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la suppression du profil' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('[delete-account] Profil et données associées supprimés')

    // 4. Supprimer l'utilisateur de auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (authError) {
      console.error('Erreur suppression utilisateur auth:', authError)
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la suppression du compte' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('[delete-account] Utilisateur supprimé de auth.users')

    // Succès
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Compte supprimé avec succès',
        user_id: user.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[delete-account] Erreur générale:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Erreur interne du serveur',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})