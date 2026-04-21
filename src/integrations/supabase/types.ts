export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      // =====================================================================
      // NEW TABLES (bridge rebuild)
      // =====================================================================
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Relationships: []
      }
      dealerships: {
        Row: {
          id: string
          name: string
          phone: string | null
          address: string | null
          province: string | null
          license_number: string | null
          admin_code: string
          compliance_info: Json | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_plan_key: string | null
          subscription_price_id: string | null
          subscription_trial_end: string | null
          subscription_current_period_end: string | null
          subscription_cancel_at_period_end: boolean
          subscription_seats_limit: number | null
          contract_fee_cents: number | null
          legacy_dealer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          address?: string | null
          province?: string | null
          license_number?: string | null
          admin_code?: string
          compliance_info?: Json | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_plan_key?: string | null
          subscription_price_id?: string | null
          subscription_trial_end?: string | null
          subscription_current_period_end?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_seats_limit?: number | null
          contract_fee_cents?: number | null
          legacy_dealer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string | null
          address?: string | null
          province?: string | null
          license_number?: string | null
          admin_code?: string
          compliance_info?: Json | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_plan_key?: string | null
          subscription_price_id?: string | null
          subscription_trial_end?: string | null
          subscription_current_period_end?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_seats_limit?: number | null
          contract_fee_cents?: number | null
          legacy_dealer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      dealership_members: {
        Row: {
          id: string
          user_id: string
          dealership_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          dealership_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          dealership_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_members_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          id: string
          company_name: string
          contact_email: string | null
          contact_phone: string | null
          address: string | null
          regions_served: string[] | null
          description: string | null
          logo_url: string | null
          status: string
          legacy_profile_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_name: string
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          regions_served?: string[] | null
          description?: string | null
          logo_url?: string | null
          status?: string
          legacy_profile_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          regions_served?: string[] | null
          description?: string | null
          logo_url?: string | null
          status?: string
          legacy_profile_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_members: {
        Row: {
          id: string
          user_id: string
          provider_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_members_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_remittances: {
        Row: {
          id: string
          contract_id: string
          amount: number
          status: string
          due_date: string
          paid_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          amount: number
          status?: string
          due_date: string
          paid_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          contract_id?: string
          amount?: number
          status?: string
          due_date?: string
          paid_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_remittances_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      dealership_product_pricing: {
        Row: {
          id: string
          dealership_id: string
          product_id: string
          retail_price: Json
          confidentiality_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          dealership_id: string
          product_id: string
          retail_price?: Json
          confidentiality_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          dealership_id?: string
          product_id?: string
          retail_price?: Json
          confidentiality_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_product_pricing_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealership_product_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_dealership_member: {
        Args: { _user_id: string; _dealership_id: string }
        Returns: boolean
      }
      is_provider_member: {
        Args: { _user_id: string; _provider_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "dealership_admin" | "dealership_employee" | "provider"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
