export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      enrollments: {
        Row: {
          amount_paid_cents: number | null
          created_at: string
          id: string
          paid_at: string | null
          session_id: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_paid_cents?: number | null
          created_at?: string
          id?: string
          paid_at?: string | null
          session_id: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_paid_cents?: number | null
          created_at?: string
          id?: string
          paid_at?: string | null
          session_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          phone: string | null
          photo_url: string | null
          role: string | null
          stripe_customer_id: string | null
          sub_current_period_end: string | null
          sub_status: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          stripe_customer_id?: string | null
          sub_current_period_end?: string | null
          sub_status?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          stripe_customer_id?: string | null
          sub_current_period_end?: string | null
          sub_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registrations: {
        Row: {
          id: string
          payment_status: string
          registered_at: string
          run_id: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          payment_status?: string
          registered_at?: string
          run_id: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          payment_status?: string
          registered_at?: string
          run_id?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          created_at: string
          date: string
          description: string | null
          distance: string
          host_id: string
          id: string
          intensity: string
          latitude: number
          location_name: string
          longitude: number
          max_participants: number
          price_cents: number
          time: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          distance: string
          host_id: string
          id?: string
          intensity: string
          latitude: number
          location_name: string
          longitude: number
          max_participants: number
          price_cents?: number
          time: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          distance?: string
          host_id?: string
          id?: string
          intensity?: string
          latitude?: number
          location_name?: string
          longitude?: number
          max_participants?: number
          price_cents?: number
          time?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          blur_radius_m: number
          created_at: string
          current_enrollments: number | null
          date: string
          description: string | null
          distance_km: number
          duration_minutes: number | null
          end_lat: number | null
          end_lng: number | null
          host_avatar: string | null
          host_fee_cents: number | null
          host_id: string
          host_name: string | null
          id: string
          intensity: string
          location_hint: string | null
          max_participants: number
          min_participants: number | null
          price_cents: number
          scheduled_at: string | null
          session_type: string | null
          start_lat: number
          start_lng: number
          status: string | null
          title: string
          type: string
        }
        Insert: {
          blur_radius_m?: number
          created_at?: string
          current_enrollments?: number | null
          date: string
          description?: string | null
          distance_km: number
          duration_minutes?: number | null
          end_lat?: number | null
          end_lng?: number | null
          host_avatar?: string | null
          host_fee_cents?: number | null
          host_id: string
          host_name?: string | null
          id?: string
          intensity: string
          location_hint?: string | null
          max_participants: number
          min_participants?: number | null
          price_cents?: number
          scheduled_at?: string | null
          session_type?: string | null
          start_lat: number
          start_lng: number
          status?: string | null
          title: string
          type: string
        }
        Update: {
          blur_radius_m?: number
          created_at?: string
          current_enrollments?: number | null
          date?: string
          description?: string | null
          distance_km?: number
          duration_minutes?: number | null
          end_lat?: number | null
          end_lng?: number | null
          host_avatar?: string | null
          host_fee_cents?: number | null
          host_id?: string
          host_name?: string | null
          id?: string
          intensity?: string
          location_hint?: string | null
          max_participants?: number
          min_participants?: number | null
          price_cents?: number
          scheduled_at?: string | null
          session_type?: string | null
          start_lat?: number
          start_lng?: number
          status?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      sessions_complete: {
        Row: {
          available_spots: number | null
          created_at: string | null
          current_enrollments: number | null
          description: string | null
          distance_km: number | null
          duration_minutes: number | null
          end_lat: number | null
          end_lng: number | null
          host_avatar: string | null
          host_fee_cents: number | null
          host_name: string | null
          id: string | null
          intensity: string | null
          location_hint: string | null
          max_participants: number | null
          min_participants: number | null
          price_cents: number | null
          scheduled_at: string | null
          session_type: string | null
          start_lat: number | null
          start_lng: number | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      backfill_missing_profiles: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      can_enroll_in_session: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      delete_user_completely: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_basic_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_session_status: {
        Args: { p_session_id: string }
        Returns: string
      }
      get_user_enrollments: {
        Args: { user_id: string }
        Returns: {
          amount_paid_cents: number
          enrollment_id: string
          enrollment_status: string
          host_name: string
          paid_at: string
          session_date: string
          session_id: string
          session_title: string
        }[]
      }
      get_user_sessions: {
        Args: { user_id: string }
        Returns: {
          available_spots: number
          created_at: string
          current_enrollments: number
          description: string
          distance_km: number
          duration_minutes: number
          end_lat: number
          end_lng: number
          host_avatar: string
          host_fee_cents: number
          host_name: string
          intensity: string
          location_hint: string
          max_participants: number
          min_participants: number
          price_cents: number
          scheduled_at: string
          session_id: string
          session_type: string
          start_lat: number
          start_lng: number
          status: string
          title: string
        }[]
      }
      has_active_subscription: {
        Args: { user_profile: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      is_session_open: {
        Args: { session_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
