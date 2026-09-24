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
  | "lost"
  // Autopilot follow-up progression.
  | "followup_1"
  | "followup_2"
  | "followup_3"
  | "cold"
  // Interrupt states.
  | "call_requested"
  | "paused"
  | "unsubscribed";

export type AiMessageStatus =
  | "draft"
  | "edited"
  | "approved"
  | "sent"
  | "cancelled"
  | "discarded";

export type AutopilotMode = "manual" | "assisted" | "full";
export type AiTone = "professional" | "friendly" | "direct" | "premium";
export type UnsubscribeStatus = "subscribed" | "unsubscribed";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          onboarding_completed?: boolean;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          onboarding_completed?: boolean;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          business_type: string | null;
          custom_business_type: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          country: string | null;
          state: string | null;
          city: string | null;
          monthly_estimates: number | null;
          average_estimate_value: number | null;
          currency: string;
          employee_count: number | null;
          current_follow_up_method: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          business_type?: string | null;
          custom_business_type?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          country?: string | null;
          state?: string | null;
          city?: string | null;
          monthly_estimates?: number | null;
          average_estimate_value?: number | null;
          currency?: string;
          employee_count?: number | null;
          current_follow_up_method?: string | null;
        };
        Update: {
          name?: string;
          business_type?: string | null;
          custom_business_type?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          country?: string | null;
          state?: string | null;
          city?: string | null;
          monthly_estimates?: number | null;
          average_estimate_value?: number | null;
          currency?: string;
          employee_count?: number | null;
          current_follow_up_method?: string | null;
        };
        Relationships: [];
      };
      business_ai_settings: {
        Row: {
          business_id: string;
          financing_available: boolean;
          payment_plans_available: boolean;
          maximum_discount_percent: number;
          ai_can_offer_discounts: boolean;
          business_hours: string | null;
          additional_rules: string | null;
          autopilot_enabled: boolean;
          autopilot_mode: AutopilotMode;
          first_followup_delay_minutes: number;
          second_followup_delay_minutes: number;
          third_followup_delay_minutes: number;
          maximum_followups: number;
          approval_required_for_discounts: boolean;
          approval_required_for_custom_answers: boolean;
          tone: AiTone;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          financing_available?: boolean;
          payment_plans_available?: boolean;
          maximum_discount_percent?: number;
          ai_can_offer_discounts?: boolean;
          business_hours?: string | null;
          additional_rules?: string | null;
          autopilot_enabled?: boolean;
          autopilot_mode?: AutopilotMode;
          first_followup_delay_minutes?: number;
          second_followup_delay_minutes?: number;
          third_followup_delay_minutes?: number;
          maximum_followups?: number;
          approval_required_for_discounts?: boolean;
          approval_required_for_custom_answers?: boolean;
          tone?: AiTone;
        };
        Update: {
          financing_available?: boolean;
          payment_plans_available?: boolean;
          maximum_discount_percent?: number;
          ai_can_offer_discounts?: boolean;
          business_hours?: string | null;
          additional_rules?: string | null;
          autopilot_enabled?: boolean;
          autopilot_mode?: AutopilotMode;
          first_followup_delay_minutes?: number;
          second_followup_delay_minutes?: number;
          third_followup_delay_minutes?: number;
          maximum_followups?: number;
          approval_required_for_discounts?: boolean;
          approval_required_for_custom_answers?: boolean;
          tone?: AiTone;
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
      ai_messages: {
        Row: {
          id: string;
          business_id: string;
          lead_id: string;
          channel: "sms" | "email";
          status: AiMessageStatus;
          message: string;
          ai_model: string | null;
          source: "manual" | "autopilot";
          followup_number: number | null;
          prompt_inputs: Json | null;
          discount_offered: boolean;
          created_by: string | null;
          approved_at: string | null;
          approved_by: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          lead_id: string;
          channel?: "sms" | "email";
          status?: AiMessageStatus;
          message: string;
          ai_model?: string | null;
          source?: "manual" | "autopilot";
          followup_number?: number | null;
          prompt_inputs?: Json | null;
          discount_offered?: boolean;
          created_by?: string | null;
        };
        Update: {
          channel?: "sms" | "email";
          status?: AiMessageStatus;
          message?: string;
          discount_offered?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      ai_audit_log: {
        Row: {
          id: string;
          business_id: string;
          lead_id: string | null;
          ai_message_id: string | null;
          event: string;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          lead_id?: string | null;
          ai_message_id?: string | null;
          event: string;
          detail?: Json | null;
        };
        Update: {
          detail?: Json | null;
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
          next_follow_up_at: string | null;
          follow_up_count: number;
          last_follow_up_at: string | null;
          autopilot_paused: boolean;
          unsubscribe_status: UnsubscribeStatus;
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
          next_follow_up_at?: string | null;
          follow_up_count?: number;
          last_follow_up_at?: string | null;
          autopilot_paused?: boolean;
          unsubscribe_status?: UnsubscribeStatus;
          created_by?: string | null;
        };
        Update: {
          customer_name?: string;
          phone?: string;
          service?: string;
          estimate_amount?: number;
          status?: LeadStatus;
          follow_up_date?: string | null;
          next_follow_up_at?: string | null;
          follow_up_count?: number;
          last_follow_up_at?: string | null;
          autopilot_paused?: boolean;
          unsubscribe_status?: UnsubscribeStatus;
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
export type BusinessAiSettings = Database["public"]["Tables"]["business_ai_settings"]["Row"];
export type AiMessage = Database["public"]["Tables"]["ai_messages"]["Row"];
export type AiAuditLog = Database["public"]["Tables"]["ai_audit_log"]["Row"];
