export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      enrollments: {
        Row: {
          created_at: string
          id: string
          session_id: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          status?: string
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
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          gender: string | null
          id: string
          phone: string | null
          photo_url: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          gender?: string | null
          id: string
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          phone?: string | null
          photo_url?: string | null
          role?: string | null
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
          area_hint: string | null
          blur_radius_m: number
          created_at: string
          date: string
          distance_km: number
          end_lat: number | null
          end_lng: number | null
          host_id: string
          host_payout_cents: number
          id: string
          intensity: string
          location_lat: number
          location_lng: number
          max_participants: number
          price_cents: number
          title: string
          type: string
        }
        Insert: {
          area_hint?: string | null
          blur_radius_m?: number
          created_at?: string
          date: string
          distance_km: number
          end_lat?: number | null
          end_lng?: number | null
          host_id: string
          host_payout_cents?: number
          id?: string
          intensity: string
          location_lat: number
          location_lng: number
          max_participants: number
          price_cents?: number
          title: string
          type: string
        }
        Update: {
          area_hint?: string | null
          blur_radius_m?: number
          created_at?: string
          date?: string
          distance_km?: number
          end_lat?: number | null
          end_lng?: number | null
          host_id?: string
          host_payout_cents?: number
          id?: string
          intensity?: string
          location_lat?: number
          location_lng?: number
          max_participants?: number
          price_cents?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
