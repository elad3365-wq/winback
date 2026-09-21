/**
 * Hand-written to match supabase/migrations. Once the project is live you can
 * regenerate this file with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */
export type LeadStatus =
  | "new"
  | "follow_up_needed"
  | "contacted"
  | "interested"
  | "recovered"
  | "lost";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      business_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: "owner" | "member";
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role?: "owner" | "member";
        };
        Update: {
          role?: "owner" | "member";
        };
        Relationships: [];
      };
      beta_signups: {
        Row: {
          id: string;
          name: string;
          business_name: string;
          email: string;
          business_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          business_name: string;
          email: string;
          business_type: string;
        };
        Update: {
          name?: string;
          business_name?: string;
          email?: string;
          business_type?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          business_id: string;
          customer_name: string;
          phone: string;
          service: string;
          estimate_amount: number;
          status: LeadStatus;
          follow_up_date: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_name: string;
          phone: string;
          service: string;
          estimate_amount?: number;
          status?: LeadStatus;
          follow_up_date?: string | null;
          created_by?: string | null;
        };
        Update: {
          customer_name?: string;
          phone?: string;
          service?: string;
          estimate_amount?: number;
          status?: LeadStatus;
          follow_up_date?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_business_member: {
        Args: { p_business_id: string };
        Returns: boolean;
      };
      is_business_owner: {
        Args: { p_business_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      lead_status: LeadStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
