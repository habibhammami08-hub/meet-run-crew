// Types complets et cohérents pour MeetRun
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          photo_url: string | null;
          age: number | null;
          gender: 'homme' | 'femme' | 'autre' | null;
          role: 'participant' | 'host' | 'admin';
          stripe_customer_id: string | null;
          sub_status: 'inactive' | 'active' | 'trialing' | 'canceled' | 'past_due';
          sub_current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      sessions: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          description: string | null;
          scheduled_at: string;
          duration_minutes: number;
          start_lat: number;
          start_lng: number;
          end_lat: number | null;
          end_lng: number | null;
          location_hint: string | null;
          distance_km: number;
          intensity: 'low' | 'medium' | 'high';
          session_type: 'mixed' | 'women_only' | 'men_only';
          max_participants: number;
          min_participants: number;
          price_cents: number;
          host_fee_cents: number;
          status: 'draft' | 'published' | 'cancelled' | 'completed';
          created_at: string;
          updated_at?: string;
        };
        Insert: Omit<Database['public']['Tables']['sessions']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>;
      };
      enrollments: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          status: 'pending' | 'paid' | 'confirmed' | 'cancelled' | 'noshow' | 'present';
          stripe_session_id: string | null;
          stripe_payment_intent_id: string | null;
          paid_at: string | null;
          amount_paid_cents: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['enrollments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['enrollments']['Insert']>;
      };
      runs: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          description: string | null;
          location_name: string;
          latitude: number;
          longitude: number;
          date: string;
          time: string;
          distance: string;
          intensity: string;
          type: string;
          max_participants: number;
          price_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['runs']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['runs']['Insert']>;
      };
      registrations: {
        Row: {
          id: string;
          run_id: string;
          user_id: string;
          payment_status: 'pending' | 'paid' | 'failed';
          stripe_session_id: string | null;
          registered_at: string;
        };
        Insert: Omit<Database['public']['Tables']['registrations']['Row'], 'id' | 'registered_at'>;
        Update: Partial<Database['public']['Tables']['registrations']['Insert']>;
      };
      subscribers: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          stripe_customer_id: string | null;
          subscribed: boolean;
          subscription_tier: string | null;
          subscription_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['subscribers']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['subscribers']['Insert']>;
      };
    };
    Views: {
      sessions_view: {
        Row: Database['public']['Tables']['sessions']['Row'] & {
          host_name: string | null;
          host_avatar: string | null;
          current_enrollments: number;
          available_spots: number;
        };
      };
    };
    Functions: {
      can_enroll_in_session: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      get_session_status: {
        Args: { p_session_id: string };
        Returns: string;
      };
      cleanup_old_pending_enrollments: {
        Args: {};
        Returns: void;
      };
    };
  };
};

// Types utilitaires
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// Types spécifiques pour l'application
export type Profile = Tables<'profiles'>;
export type Session = Tables<'sessions'>;
export type SessionWithDetails = Database['public']['Views']['sessions_view']['Row'];
export type Enrollment = Tables<'enrollments'>;
export type Run = Tables<'runs'>;
export type Registration = Tables<'registrations'>;
export type Subscriber = Tables<'subscribers'>;

// Types pour les statuts
export type SessionStatus = Session['status'];
export type EnrollmentStatus = Enrollment['status'];
export type PaymentStatus = Registration['payment_status'];
export type Intensity = Session['intensity'];
export type SessionType = Session['session_type'];
export type Gender = Profile['gender'];
export type Role = Profile['role'];

// Types pour les réponses API
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  hasMore: boolean;
  page: number;
}

// Types pour les formulaires
export interface CreateSessionForm {
  title: string;
  description?: string;
  scheduled_at: Date;
  duration_minutes: number;
  start_lat: number;
  start_lng: number;
  end_lat?: number;
  end_lng?: number;
  location_hint?: string;
  distance_km: number;
  intensity: Intensity;
  session_type: SessionType;
  max_participants: number;
  min_participants: number;
  price_cents: number;
}

export interface UpdateProfileForm {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  age?: number;
  gender?: Gender;
}

// Types pour les erreurs
export interface DatabaseError {
  message: string;
  code?: string;
  details?: unknown;
  hint?: string;
}

// Types pour les filtres et recherche
export interface SessionFilters {
  intensity?: Intensity[];
  session_type?: SessionType[];
  date_from?: string;
  date_to?: string;
  distance_max?: number;
  price_max?: number;
  location?: {
    lat: number;
    lng: number;
    radius: number;
  };
}

export interface SearchParams {
  query?: string;
  filters?: SessionFilters;
  sort?: 'date' | 'price' | 'distance' | 'created_at';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}