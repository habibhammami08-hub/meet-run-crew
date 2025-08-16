import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthenticatedUser extends User {
  profile?: {
    id: string;
    full_name: string;
    stripe_customer_id?: string;
  }
}

export class AuthError extends Error {
  constructor(message: string, public code: string, public status: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function createSupabaseClient(serviceRole = false, userToken?: string | null): Promise<SupabaseClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let supabaseKey: string | undefined;
  
  if (serviceRole) {
    supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  } else if (userToken) {
    // Pour les requêtes avec token utilisateur, on utilise l'anon key
    supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  } else {
    supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new AuthError('Supabase configuration missing', 'CONFIG_ERROR', 500);
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Si on a un token utilisateur, l'utiliser pour authentifier le client
  if (userToken && !serviceRole) {
    const token = userToken.startsWith('Bearer ') ? userToken.replace('Bearer ', '') : userToken;
    await client.auth.setSession({
      access_token: token,
      refresh_token: '' // Pas besoin pour les edge functions
    });
  }

  return client;
}

export async function authenticateUser(
  authHeader: string | null,
  options: { requireProfile?: boolean } = {}
): Promise<AuthenticatedUser> {
  if (!authHeader) {
    throw new AuthError('Authorization header missing', 'MISSING_AUTH_HEADER');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError('Invalid authorization header format', 'INVALID_AUTH_FORMAT');
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token || token.length < 20) {
    throw new AuthError('Invalid access token', 'INVALID_TOKEN');
  }

  const supabase = await createSupabaseClient(true);
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('Token validation error:', error);
      throw new AuthError('Token validation failed', 'TOKEN_INVALID');
    }
    
    if (!user) {
      throw new AuthError('User not found', 'USER_NOT_FOUND');
    }

    if (!user.email || !user.email_confirmed_at) {
      throw new AuthError('Email not verified', 'EMAIL_NOT_VERIFIED');
    }

    const authenticatedUser = user as AuthenticatedUser;

    // Optionally fetch profile
    if (options.requireProfile) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        throw new AuthError('User profile not found', 'PROFILE_NOT_FOUND');
      }

      if (!profile) {
        throw new AuthError('User profile not found', 'PROFILE_NOT_FOUND');
      }

      authenticatedUser.profile = profile;
    }

    return authenticatedUser;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    console.error('Authentication error:', error);
    throw new AuthError('Authentication failed', 'AUTH_FAILED');
  }
}