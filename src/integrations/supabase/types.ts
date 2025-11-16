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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cancellation_requests: {
        Row: {
          barcode: string
          created_at: string
          id: string
          product_name: string
          quantity: number
          reason: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          product_name: string
          quantity: number
          reason: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          product_name?: string
          quantity?: number
          reason?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          can_save_queue: boolean
          can_save_single: boolean
          created_at: string
          device_name: string
          id: string
          last_active: string
          user_id: string
          user_name: string
        }
        Insert: {
          can_save_queue?: boolean
          can_save_single?: boolean
          created_at?: string
          device_name: string
          id?: string
          last_active?: string
          user_id: string
          user_name: string
        }
        Update: {
          can_save_queue?: boolean
          can_save_single?: boolean
          created_at?: string
          device_name?: string
          id?: string
          last_active?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          created_by: string | null
          hourly_rate: number | null
          id: string
          login: string | null
          name: string
          position: string
          schedule: string | null
          updated_at: string
          user_id: string | null
          work_conditions: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hourly_rate?: number | null
          id?: string
          login?: string | null
          name: string
          position: string
          schedule?: string | null
          updated_at?: string
          user_id?: string | null
          work_conditions?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hourly_rate?: number | null
          id?: string
          login?: string | null
          name?: string
          position?: string
          schedule?: string | null
          updated_at?: string
          user_id?: string | null
          work_conditions?: string | null
        }
        Relationships: []
      }
      product_form_state: {
        Row: {
          barcode: string | null
          category: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          last_updated: string | null
          name: string | null
          purchase_price: number | null
          quantity: number | null
          retail_price: number | null
          supplier: string | null
          unit: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          last_updated?: string | null
          name?: string | null
          purchase_price?: number | null
          quantity?: number | null
          retail_price?: number | null
          supplier?: string | null
          unit?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          barcode?: string | null
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          last_updated?: string | null
          name?: string | null
          purchase_price?: number | null
          quantity?: number | null
          retail_price?: number | null
          supplier?: string | null
          unit?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          barcode: string
          created_at: string | null
          created_by: string | null
          id: string
          image_url: string
          product_name: string
          storage_path: string
        }
        Insert: {
          barcode: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url: string
          product_name: string
          storage_path: string
        }
        Update: {
          barcode?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string
          product_name?: string
          storage_path?: string
        }
        Relationships: []
      }
      product_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          product_name: string
          purchase_price: number
          quantity: number
          supplier: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_name: string
          purchase_price: number
          quantity: number
          supplier?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_name?: string
          purchase_price?: number
          quantity?: number
          supplier?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string
          category: string
          created_at: string
          created_by: string | null
          debt_amount: number
          expiry_date: string | null
          id: string
          name: string
          paid_amount: number
          payment_type: string
          price_history: Json | null
          purchase_price: number
          quantity: number
          sale_price: number
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode: string
          category: string
          created_at?: string
          created_by?: string | null
          debt_amount?: number
          expiry_date?: string | null
          id?: string
          name: string
          paid_amount?: number
          payment_type?: string
          price_history?: Json | null
          purchase_price: number
          quantity?: number
          sale_price: number
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          category?: string
          created_at?: string
          created_by?: string | null
          debt_amount?: number
          expiry_date?: string | null
          id?: string
          name?: string
          paid_amount?: number
          payment_type?: string
          price_history?: Json | null
          purchase_price?: number
          quantity?: number
          sale_price?: number
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          cashier_name: string
          cashier_role: string
          created_at: string
          created_by: string | null
          id: string
          items: Json
          offline_id: string | null
          payment_method: string
          synced: boolean | null
          total: number
        }
        Insert: {
          cashier_name: string
          cashier_role: string
          created_at?: string
          created_by?: string | null
          id?: string
          items: Json
          offline_id?: string | null
          payment_method: string
          synced?: boolean | null
          total: number
        }
        Update: {
          cashier_name?: string
          cashier_role?: string
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          offline_id?: string | null
          payment_method?: string
          synced?: boolean | null
          total?: number
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          debt: number | null
          id: string
          name: string
          payment_history: Json | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          debt?: number | null
          id?: string
          name: string
          payment_history?: Json | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          debt?: number | null
          id?: string
          name?: string
          payment_history?: Json | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          login: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          login?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          login?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_activity: string
          login: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_activity?: string
          login: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_activity?: string
          login?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vremenno_product_foto: {
        Row: {
          barcode: string
          barcode_photo: string | null
          barcode_photo_storage_path: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          debt_amount: number | null
          expiry_date: string | null
          front_photo: string | null
          front_photo_storage_path: string | null
          id: string
          image_url: string
          paid_amount: number | null
          payment_type: string | null
          product_name: string
          purchase_price: number | null
          quantity: number | null
          retail_price: number | null
          storage_path: string
          supplier: string | null
          unit: string | null
        }
        Insert: {
          barcode: string
          barcode_photo?: string | null
          barcode_photo_storage_path?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          debt_amount?: number | null
          expiry_date?: string | null
          front_photo?: string | null
          front_photo_storage_path?: string | null
          id?: string
          image_url: string
          paid_amount?: number | null
          payment_type?: string | null
          product_name: string
          purchase_price?: number | null
          quantity?: number | null
          retail_price?: number | null
          storage_path: string
          supplier?: string | null
          unit?: string | null
        }
        Update: {
          barcode?: string
          barcode_photo?: string | null
          barcode_photo_storage_path?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          debt_amount?: number | null
          expiry_date?: string | null
          front_photo?: string | null
          front_photo_storage_path?: string | null
          id?: string
          image_url?: string
          paid_amount?: number | null
          payment_type?: string | null
          product_name?: string
          purchase_price?: number | null
          quantity?: number | null
          retail_price?: number | null
          storage_path?: string
          supplier?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      wb_analytics_tasks: {
        Row: {
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          parameters: Json
          result: Json | null
          status: string
          task_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          parameters: Json
          result?: Json | null
          status?: string
          task_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          parameters?: Json
          result?: Json | null
          status?: string
          task_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_form_states: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      verify_login_credentials: {
        Args: { _login: string; _password?: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          success: boolean
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "cashier" | "inventory" | "employee" | "cashier2"
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
    Enums: {
      app_role: ["admin", "cashier", "inventory", "employee", "cashier2"],
    },
  },
} as const
