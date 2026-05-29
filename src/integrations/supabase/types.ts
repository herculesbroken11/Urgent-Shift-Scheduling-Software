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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          address: string | null
          agency_status: string
          approved_at: string | null
          approved_by: string | null
          billing_model: string
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          email: string | null
          feature_flags: Json
          id: string
          logo_url: string | null
          name: string
          payment_terms: string
          phone: string | null
          plan_type: string
          platform_notes: string | null
          platform_qbo_customer_id: string | null
          settings: Json | null
          slug: string
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          agency_status?: string
          approved_at?: string | null
          approved_by?: string | null
          billing_model?: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          email?: string | null
          feature_flags?: Json
          id?: string
          logo_url?: string | null
          name: string
          payment_terms?: string
          phone?: string | null
          plan_type?: string
          platform_notes?: string | null
          platform_qbo_customer_id?: string | null
          settings?: Json | null
          slug: string
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          agency_status?: string
          approved_at?: string | null
          approved_by?: string | null
          billing_model?: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          email?: string | null
          feature_flags?: Json
          id?: string
          logo_url?: string | null
          name?: string
          payment_terms?: string
          phone?: string | null
          plan_type?: string
          platform_notes?: string | null
          platform_qbo_customer_id?: string | null
          settings?: Json | null
          slug?: string
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      appointment_history: {
        Row: {
          action: string
          agency_id: string
          appointment_id: string | null
          changed_by: string | null
          changed_fields: string[] | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          agency_id: string
          appointment_id?: string | null
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          agency_id?: string
          appointment_id?: string | null
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          agency_id: string
          agency_notes: string | null
          assignment_method:
            | Database["public"]["Enums"]["assignment_method"]
            | null
          billed_amount: number | null
          billing_breakdown: Json | null
          cancellation_reason: string | null
          cancelled_at: string | null
          category: string | null
          client_reference: string | null
          created_at: string
          custom_fields: Json | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          gcal_event_id: string | null
          gcal_last_synced_at: string | null
          gcal_sync_error: string | null
          gcal_sync_status: string | null
          id: string
          import_batch_id: string | null
          interpreter_id: string | null
          interpreter_notes: string | null
          interpreter_notes_history: Json | null
          interpreter_pay_amount: number | null
          is_deleted: boolean
          is_import_staged: boolean
          is_self_claimable: boolean | null
          language_id: string | null
          last_imported_at: string | null
          late_cancel_detected_at: string | null
          location_id: string | null
          modality: Database["public"]["Enums"]["service_modality"] | null
          notes: string | null
          parent_recurring_id: string | null
          parking_cost: number | null
          patient_client_name: string | null
          payment_status: string | null
          qbo_bill_id: string | null
          qbo_customer_id: string | null
          qbo_invoice_id: string | null
          qbo_last_synced_at: string | null
          qbo_sync_status: string | null
          qbo_vendor_id: string | null
          recurrence_rule: Json | null
          requester_id: string | null
          requester_notes: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          signature_data: string | null
          signature_lat: number | null
          signature_lng: number | null
          signature_timestamp: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          agency_id: string
          agency_notes?: string | null
          assignment_method?:
            | Database["public"]["Enums"]["assignment_method"]
            | null
          billed_amount?: number | null
          billing_breakdown?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          client_reference?: string | null
          created_at?: string
          custom_fields?: Json | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gcal_event_id?: string | null
          gcal_last_synced_at?: string | null
          gcal_sync_error?: string | null
          gcal_sync_status?: string | null
          id?: string
          import_batch_id?: string | null
          interpreter_id?: string | null
          interpreter_notes?: string | null
          interpreter_notes_history?: Json | null
          interpreter_pay_amount?: number | null
          is_deleted?: boolean
          is_import_staged?: boolean
          is_self_claimable?: boolean | null
          language_id?: string | null
          last_imported_at?: string | null
          late_cancel_detected_at?: string | null
          location_id?: string | null
          modality?: Database["public"]["Enums"]["service_modality"] | null
          notes?: string | null
          parent_recurring_id?: string | null
          parking_cost?: number | null
          patient_client_name?: string | null
          payment_status?: string | null
          qbo_bill_id?: string | null
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_last_synced_at?: string | null
          qbo_sync_status?: string | null
          qbo_vendor_id?: string | null
          recurrence_rule?: Json | null
          requester_id?: string | null
          requester_notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          signature_data?: string | null
          signature_lat?: number | null
          signature_lng?: number | null
          signature_timestamp?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          agency_id?: string
          agency_notes?: string | null
          assignment_method?:
            | Database["public"]["Enums"]["assignment_method"]
            | null
          billed_amount?: number | null
          billing_breakdown?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          client_reference?: string | null
          created_at?: string
          custom_fields?: Json | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gcal_event_id?: string | null
          gcal_last_synced_at?: string | null
          gcal_sync_error?: string | null
          gcal_sync_status?: string | null
          id?: string
          import_batch_id?: string | null
          interpreter_id?: string | null
          interpreter_notes?: string | null
          interpreter_notes_history?: Json | null
          interpreter_pay_amount?: number | null
          is_deleted?: boolean
          is_import_staged?: boolean
          is_self_claimable?: boolean | null
          language_id?: string | null
          last_imported_at?: string | null
          late_cancel_detected_at?: string | null
          location_id?: string | null
          modality?: Database["public"]["Enums"]["service_modality"] | null
          notes?: string | null
          parent_recurring_id?: string | null
          parking_cost?: number | null
          patient_client_name?: string | null
          payment_status?: string | null
          qbo_bill_id?: string | null
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_last_synced_at?: string | null
          qbo_sync_status?: string | null
          qbo_vendor_id?: string | null
          recurrence_rule?: Json | null
          requester_id?: string | null
          requester_notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          signature_data?: string | null
          signature_lat?: number | null
          signature_lng?: number | null
          signature_timestamp?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_parent_recurring_id_fkey"
            columns: ["parent_recurring_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_parent_recurring_id_fkey"
            columns: ["parent_recurring_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_rates: {
        Row: {
          after_hours_end: string
          after_hours_multiplier: number
          after_hours_start: string
          agency_id: string
          apply_lastminute_to_travel: boolean
          base_rate: number
          billing_model: string
          cancellation_fee_percent: number
          cancellation_window_hours: number
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          effective_end_date: string | null
          effective_start_date: string | null
          holiday_multiplier: number
          hourly_rate: number
          id: string
          ignore_requested_duration: boolean
          is_default: boolean
          is_deleted: boolean
          minimum_charge: number
          minimum_hours: number
          monthly_minimum: number
          name: string
          overtime_after_hours: number
          overtime_multiplier: number
          rounding_direction: string
          rounding_interval_minutes: number
          same_day_fee: number
          same_day_multiplier: number
          same_day_threshold_hours: number
          stack_premiums: boolean
          tier_config: Json | null
          travel_rate_per_mile: number
          travel_time_rate: number
          updated_at: string
          weekend_multiplier: number
        }
        Insert: {
          after_hours_end?: string
          after_hours_multiplier?: number
          after_hours_start?: string
          agency_id: string
          apply_lastminute_to_travel?: boolean
          base_rate?: number
          billing_model?: string
          cancellation_fee_percent?: number
          cancellation_window_hours?: number
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          effective_end_date?: string | null
          effective_start_date?: string | null
          holiday_multiplier?: number
          hourly_rate?: number
          id?: string
          ignore_requested_duration?: boolean
          is_default?: boolean
          is_deleted?: boolean
          minimum_charge?: number
          minimum_hours?: number
          monthly_minimum?: number
          name: string
          overtime_after_hours?: number
          overtime_multiplier?: number
          rounding_direction?: string
          rounding_interval_minutes?: number
          same_day_fee?: number
          same_day_multiplier?: number
          same_day_threshold_hours?: number
          stack_premiums?: boolean
          tier_config?: Json | null
          travel_rate_per_mile?: number
          travel_time_rate?: number
          updated_at?: string
          weekend_multiplier?: number
        }
        Update: {
          after_hours_end?: string
          after_hours_multiplier?: number
          after_hours_start?: string
          agency_id?: string
          apply_lastminute_to_travel?: boolean
          base_rate?: number
          billing_model?: string
          cancellation_fee_percent?: number
          cancellation_window_hours?: number
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          effective_end_date?: string | null
          effective_start_date?: string | null
          holiday_multiplier?: number
          hourly_rate?: number
          id?: string
          ignore_requested_duration?: boolean
          is_default?: boolean
          is_deleted?: boolean
          minimum_charge?: number
          minimum_hours?: number
          monthly_minimum?: number
          name?: string
          overtime_after_hours?: number
          overtime_multiplier?: number
          rounding_direction?: string
          rounding_interval_minutes?: number
          same_day_fee?: number
          same_day_multiplier?: number
          same_day_threshold_hours?: number
          stack_premiums?: boolean
          tier_config?: Json | null
          travel_rate_per_mile?: number
          travel_time_rate?: number
          updated_at?: string
          weekend_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_rates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_rates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_rates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_rules: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          is_active: boolean
          language_id: string | null
          modifier_type: string
          modifier_value: number
          name: string
          priority: number
          rule_type: string
          trigger_config: Json
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          language_id?: string | null
          modifier_type?: string
          modifier_value?: number
          name: string
          priority?: number
          rule_type: string
          trigger_config?: Json
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          language_id?: string | null
          modifier_type?: string
          modifier_value?: number
          name?: string
          priority?: number
          rule_type?: string
          trigger_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_rules_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_rules_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          hidden_at: string | null
          id: string
          is_hidden: boolean
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          hidden_at?: string | null
          id?: string
          is_hidden?: boolean
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          hidden_at?: string | null
          id?: string
          is_hidden?: boolean
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agency_id: string
          appointment_id: string | null
          created_at: string
          created_by: string
          id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          appointment_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          appointment_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_requestors: {
        Row: {
          access_all_locations: boolean
          agency_id: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_all_locations?: boolean
          agency_id: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_all_locations?: boolean
          agency_id?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_requestors_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requestors_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requestors_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requestors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requestors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          agency_id: string
          billing_email: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          is_deleted: boolean
          is_import_staged: boolean
          last_imported_at: string | null
          name: string
          notes: string | null
          qbo_customer_id: string | null
          qbo_last_synced_at: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_import_staged?: boolean
          last_imported_at?: string | null
          name: string
          notes?: string | null
          qbo_customer_id?: string | null
          qbo_last_synced_at?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_import_staged?: boolean
          last_imported_at?: string | null
          name?: string
          notes?: string | null
          qbo_customer_id?: string | null
          qbo_last_synced_at?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token: string | null
          agency_id: string
          calendar_id: string
          created_at: string
          google_email: string | null
          id: string
          last_sync_error: string | null
          last_sync_status: string
          last_synced_at: string | null
          refresh_token: string
          sync_enabled: boolean
          timezone: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          agency_id: string
          calendar_id?: string
          created_at?: string
          google_email?: string | null
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string
          last_synced_at?: string | null
          refresh_token: string
          sync_enabled?: boolean
          timezone?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          agency_id?: string
          calendar_id?: string
          created_at?: string
          google_email?: string | null
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string
          last_synced_at?: string | null
          refresh_token?: string
          sync_enabled?: boolean
          timezone?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch_rows: {
        Row: {
          action_taken: string | null
          batch_id: string
          chunk_number: number | null
          conflict_resolution: string | null
          conflict_resolved_at: string | null
          conflict_resolved_by: string | null
          conflict_type: string | null
          created_at: string
          id: string
          previous_data: Json | null
          raw_data: Json
          row_number: number
          status: string
          target_record_id: string | null
          transformed_data: Json | null
          validation_messages: Json | null
        }
        Insert: {
          action_taken?: string | null
          batch_id: string
          chunk_number?: number | null
          conflict_resolution?: string | null
          conflict_resolved_at?: string | null
          conflict_resolved_by?: string | null
          conflict_type?: string | null
          created_at?: string
          id?: string
          previous_data?: Json | null
          raw_data: Json
          row_number: number
          status?: string
          target_record_id?: string | null
          transformed_data?: Json | null
          validation_messages?: Json | null
        }
        Update: {
          action_taken?: string | null
          batch_id?: string
          chunk_number?: number | null
          conflict_resolution?: string | null
          conflict_resolved_at?: string | null
          conflict_resolved_by?: string | null
          conflict_type?: string | null
          created_at?: string
          id?: string
          previous_data?: Json | null
          raw_data?: Json
          row_number?: number
          status?: string
          target_record_id?: string | null
          transformed_data?: Json | null
          validation_messages?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          agency_id: string
          completed_at: string | null
          created_at: string
          current_chunk: number | null
          dry_run_summary: Json | null
          entity_type: string
          error_log: Json | null
          execution_summary: Json | null
          id: string
          is_rollbackable: boolean
          is_staged: boolean
          mapping_decisions: Json | null
          processed_rows: number | null
          protected_fields: Json | null
          quality_details: Json | null
          quality_score: number | null
          reconciliation_report_url: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_system: string
          status: string
          total_chunks: number | null
          total_rows: number | null
          updated_at: string
          uploaded_by: string
          uploaded_filename: string
        }
        Insert: {
          agency_id: string
          completed_at?: string | null
          created_at?: string
          current_chunk?: number | null
          dry_run_summary?: Json | null
          entity_type: string
          error_log?: Json | null
          execution_summary?: Json | null
          id?: string
          is_rollbackable?: boolean
          is_staged?: boolean
          mapping_decisions?: Json | null
          processed_rows?: number | null
          protected_fields?: Json | null
          quality_details?: Json | null
          quality_score?: number | null
          reconciliation_report_url?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          source_system?: string
          status?: string
          total_chunks?: number | null
          total_rows?: number | null
          updated_at?: string
          uploaded_by: string
          uploaded_filename: string
        }
        Update: {
          agency_id?: string
          completed_at?: string | null
          created_at?: string
          current_chunk?: number | null
          dry_run_summary?: Json | null
          entity_type?: string
          error_log?: Json | null
          execution_summary?: Json | null
          id?: string
          is_rollbackable?: boolean
          is_staged?: boolean
          mapping_decisions?: Json | null
          processed_rows?: number | null
          protected_fields?: Json | null
          quality_details?: Json | null
          quality_score?: number | null
          reconciliation_report_url?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          source_system?: string
          status?: string
          total_chunks?: number | null
          total_rows?: number | null
          updated_at?: string
          uploaded_by?: string
          uploaded_filename?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mapping_rules: {
        Row: {
          agency_id: string
          created_at: string
          created_by: string
          entity_type: string
          id: string
          is_reusable: boolean
          mapped_field: string
          mapped_value: string
          source_field: string
          source_system: string
          source_value: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          created_by: string
          entity_type: string
          id?: string
          is_reusable?: boolean
          mapped_field: string
          mapped_value: string
          source_field: string
          source_system?: string
          source_value: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          created_by?: string
          entity_type?: string
          id?: string
          is_reusable?: boolean
          mapped_field?: string
          mapped_value?: string
          source_field?: string
          source_system?: string
          source_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_mapping_rules_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mapping_templates: {
        Row: {
          agency_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          field_defaults: Json | null
          header_signatures: Json | null
          id: string
          is_system: boolean
          name: string
          rules: Json
          source_system: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          field_defaults?: Json | null
          header_signatures?: Json | null
          id?: string
          is_system?: boolean
          name: string
          rules?: Json
          source_system: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          field_defaults?: Json | null
          header_signatures?: Json | null
          id?: string
          is_system?: boolean
          name?: string
          rules?: Json
          source_system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_mapping_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_quality_thresholds: {
        Row: {
          agency_id: string
          allow_skip_staging: boolean
          created_at: string
          id: string
          max_error_percent: number
          max_warning_percent: number
          min_quality_score: number
          require_wizard_complete: boolean
          require_zero_blocking_errors: boolean
          updated_at: string
        }
        Insert: {
          agency_id: string
          allow_skip_staging?: boolean
          created_at?: string
          id?: string
          max_error_percent?: number
          max_warning_percent?: number
          min_quality_score?: number
          require_wizard_complete?: boolean
          require_zero_blocking_errors?: boolean
          updated_at?: string
        }
        Update: {
          agency_id?: string
          allow_skip_staging?: boolean
          created_at?: string
          id?: string
          max_error_percent?: number
          max_warning_percent?: number
          min_quality_score?: number
          require_wizard_complete?: boolean
          require_zero_blocking_errors?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_quality_thresholds_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      interpreter_availability: {
        Row: {
          agency_id: string
          created_at: string
          day_of_week: number | null
          end_date: string | null
          end_time: string
          id: string
          interpreter_id: string
          is_all_day: boolean
          is_recurring: boolean
          notes: string | null
          specific_date: string | null
          start_time: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          day_of_week?: number | null
          end_date?: string | null
          end_time: string
          id?: string
          interpreter_id: string
          is_all_day?: boolean
          is_recurring?: boolean
          notes?: string | null
          specific_date?: string | null
          start_time: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          day_of_week?: number | null
          end_date?: string | null
          end_time?: string
          id?: string
          interpreter_id?: string
          is_all_day?: boolean
          is_recurring?: boolean
          notes?: string | null
          specific_date?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "interpreter_availability_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_availability_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_availability_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      interpreter_languages: {
        Row: {
          certification_details: string | null
          id: string
          interpreter_id: string
          is_certified: boolean | null
          language_id: string
        }
        Insert: {
          certification_details?: string | null
          id?: string
          interpreter_id: string
          is_certified?: boolean | null
          language_id: string
        }
        Update: {
          certification_details?: string | null
          id?: string
          interpreter_id?: string
          is_certified?: boolean | null
          language_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interpreter_languages_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_languages_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_languages_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      interpreter_notes: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          interpreter_id: string
          notes: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          interpreter_id: string
          notes?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          interpreter_id?: string
          notes?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interpreter_notes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_notes_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_notes_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      interpreter_notification_prefs: {
        Row: {
          agency_id: string
          created_at: string
          enable_email_notifications: boolean
          enable_sms_notifications: boolean
          id: string
          preferred_notification_channel: string
          reminder_15m_enabled: boolean
          reminder_24h_enabled: boolean
          reminder_2h_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          enable_email_notifications?: boolean
          enable_sms_notifications?: boolean
          id?: string
          preferred_notification_channel?: string
          reminder_15m_enabled?: boolean
          reminder_24h_enabled?: boolean
          reminder_2h_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          enable_email_notifications?: boolean
          enable_sms_notifications?: boolean
          id?: string
          preferred_notification_channel?: string
          reminder_15m_enabled?: boolean
          reminder_24h_enabled?: boolean
          reminder_2h_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interpreter_notification_prefs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      interpreter_pay_rates: {
        Row: {
          after_hours_end: string
          after_hours_multiplier: number
          after_hours_start: string
          agency_id: string
          cancellation_fee_percent: number
          cancellation_window_hours: number
          created_at: string
          effective_end_date: string | null
          effective_start_date: string | null
          holiday_multiplier: number
          hourly_rate: number
          id: string
          interpreter_id: string | null
          is_default: boolean
          minimum_hours: number
          minimum_pay: number
          name: string
          overtime_after_hours: number
          overtime_rate: number
          pay_model: string
          rounding_direction: string
          rounding_interval_minutes: number
          same_day_multiplier: number
          travel_rate_per_mile: number
          travel_time_rate: number
          updated_at: string
          weekend_multiplier: number
        }
        Insert: {
          after_hours_end?: string
          after_hours_multiplier?: number
          after_hours_start?: string
          agency_id: string
          cancellation_fee_percent?: number
          cancellation_window_hours?: number
          created_at?: string
          effective_end_date?: string | null
          effective_start_date?: string | null
          holiday_multiplier?: number
          hourly_rate?: number
          id?: string
          interpreter_id?: string | null
          is_default?: boolean
          minimum_hours?: number
          minimum_pay?: number
          name: string
          overtime_after_hours?: number
          overtime_rate?: number
          pay_model?: string
          rounding_direction?: string
          rounding_interval_minutes?: number
          same_day_multiplier?: number
          travel_rate_per_mile?: number
          travel_time_rate?: number
          updated_at?: string
          weekend_multiplier?: number
        }
        Update: {
          after_hours_end?: string
          after_hours_multiplier?: number
          after_hours_start?: string
          agency_id?: string
          cancellation_fee_percent?: number
          cancellation_window_hours?: number
          created_at?: string
          effective_end_date?: string | null
          effective_start_date?: string | null
          holiday_multiplier?: number
          hourly_rate?: number
          id?: string
          interpreter_id?: string | null
          is_default?: boolean
          minimum_hours?: number
          minimum_pay?: number
          name?: string
          overtime_after_hours?: number
          overtime_rate?: number
          pay_model?: string
          rounding_direction?: string
          rounding_interval_minutes?: number
          same_day_multiplier?: number
          travel_rate_per_mile?: number
          travel_time_rate?: number
          updated_at?: string
          weekend_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "interpreter_pay_rates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_pay_rates_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_pay_rates_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      interpreter_regions: {
        Row: {
          id: string
          interpreter_id: string
          region_id: string
        }
        Insert: {
          id?: string
          interpreter_id: string
          region_id: string
        }
        Update: {
          id?: string
          interpreter_id?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interpreter_regions_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_regions_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpreter_regions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          created_at: string
          customer_id: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invited_by: string
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          setup_link: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          created_at?: string
          customer_id?: string | null
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          setup_link?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          created_at?: string
          customer_id?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          setup_link?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_type: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_type?: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_type?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          agency_id: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          deleted_by: string | null
          due_date: string | null
          id: string
          invoice_number: string
          is_deleted: boolean
          issued_date: string | null
          notes: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          is_deleted?: boolean
          issued_date?: string | null
          notes?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          is_deleted?: boolean
          issued_date?: string | null
          notes?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          agency_id: string
          created_at: string
          customer_id: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          rejection_reason: string | null
          requested_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          customer_id?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          rejection_reason?: string | null
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          customer_id?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          rejection_reason?: string | null
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          code: string
          id: string
          name: string
        }
        Insert: {
          code: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_parse_warnings: string | null
          agency_id: string
          city: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          is_deleted: boolean
          is_import_staged: boolean
          last_imported_at: string | null
          name: string
          navigation_instructions: string | null
          phone: string | null
          raw_address: string | null
          region_id: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          state: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_parse_warnings?: string | null
          agency_id: string
          city?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_import_staged?: boolean
          last_imported_at?: string | null
          name: string
          navigation_instructions?: string | null
          phone?: string | null
          raw_address?: string | null
          region_id?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          state?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_parse_warnings?: string | null
          agency_id?: string
          city?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_import_staged?: boolean
          last_imported_at?: string | null
          name?: string
          navigation_instructions?: string | null
          phone?: string | null
          raw_address?: string | null
          region_id?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          state?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          agency_id: string
          appointment_id: string | null
          body: string
          channel: string
          created_at: string
          error_message: string | null
          id: string
          last_retry_at: string | null
          next_retry_at: string | null
          provider_message_id: string | null
          recipient: string
          related_entity_id: string | null
          related_entity_type: string | null
          reminder_type: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          agency_id: string
          appointment_id?: string | null
          body: string
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          next_retry_at?: string | null
          provider_message_id?: string | null
          recipient: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          reminder_type?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          agency_id?: string
          appointment_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          next_retry_at?: string | null
          provider_message_id?: string | null
          recipient?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          reminder_type?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          agency_id: string
          body_template: string
          channel: string
          created_at: string
          event_type: string
          id: string
          is_active: boolean
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          body_template: string
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          is_active?: boolean
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          body_template?: string
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      platform_billing_config: {
        Row: {
          agency_id: string
          billing_model: string
          created_at: string
          effective_end_date: string | null
          effective_start_date: string
          id: string
          included_appointments: number
          is_active: boolean | null
          max_monthly_fee: number | null
          min_monthly_fee: number | null
          monthly_base_fee: number
          notes: string | null
          overage_rate: number
          per_appointment_fee: number
          plan_name: string | null
          setup_fee: number | null
          updated_at: string
          usage_billing_trigger: string
        }
        Insert: {
          agency_id: string
          billing_model?: string
          created_at?: string
          effective_end_date?: string | null
          effective_start_date?: string
          id?: string
          included_appointments?: number
          is_active?: boolean | null
          max_monthly_fee?: number | null
          min_monthly_fee?: number | null
          monthly_base_fee?: number
          notes?: string | null
          overage_rate?: number
          per_appointment_fee?: number
          plan_name?: string | null
          setup_fee?: number | null
          updated_at?: string
          usage_billing_trigger?: string
        }
        Update: {
          agency_id?: string
          billing_model?: string
          created_at?: string
          effective_end_date?: string | null
          effective_start_date?: string
          id?: string
          included_appointments?: number
          is_active?: boolean | null
          max_monthly_fee?: number | null
          min_monthly_fee?: number | null
          monthly_base_fee?: number
          notes?: string | null
          overage_rate?: number
          per_appointment_fee?: number
          plan_name?: string | null
          setup_fee?: number | null
          updated_at?: string
          usage_billing_trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_config_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoice_line_items: {
        Row: {
          amount: number
          config_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_type: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          config_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_type: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          config_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_type?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoice_line_items_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          agency_id: string
          billing_month: string
          config_id: string | null
          config_snapshot: Json | null
          created_at: string
          due_date: string | null
          generation_details: Json | null
          id: string
          invoice_number: string
          issued_date: string | null
          notes: string | null
          qbo_invoice_id: string | null
          qbo_last_synced_at: string | null
          qbo_sync_token: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          billing_month: string
          config_id?: string | null
          config_snapshot?: Json | null
          created_at?: string
          due_date?: string | null
          generation_details?: Json | null
          id?: string
          invoice_number: string
          issued_date?: string | null
          notes?: string | null
          qbo_invoice_id?: string | null
          qbo_last_synced_at?: string | null
          qbo_sync_token?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          billing_month?: string
          config_id?: string | null
          config_snapshot?: Json | null
          created_at?: string
          due_date?: string | null
          generation_details?: Json | null
          id?: string
          invoice_number?: string
          issued_date?: string | null
          notes?: string | null
          qbo_invoice_id?: string | null
          qbo_last_synced_at?: string | null
          qbo_sync_token?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_invoices_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_config"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_qbo_connection: {
        Row: {
          access_token: string | null
          company_name: string | null
          connected_by: string | null
          connection_status: string
          created_at: string
          id: string
          last_sync_at: string | null
          realm_id: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          company_name?: string | null
          connected_by?: string | null
          connection_status?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          realm_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          company_name?: string | null
          connected_by?: string | null
          connection_status?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          realm_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_qbo_sync_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          error_details: string | null
          id: string
          qbo_entity_id: string | null
          status: string
          synced_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error_details?: string | null
          id?: string
          qbo_entity_id?: string | null
          status?: string
          synced_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error_details?: string | null
          id?: string
          qbo_entity_id?: string | null
          status?: string
          synced_by?: string | null
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_usage_log: {
        Row: {
          agency_id: string
          appointment_id: string
          billing_month: string
          created_at: string
          fee_amount: number
          id: string
          trigger_type: string
          triggered_status: string
        }
        Insert: {
          agency_id: string
          appointment_id: string
          billing_month: string
          created_at?: string
          fee_amount?: number
          id?: string
          trigger_type: string
          triggered_status: string
        }
        Update: {
          agency_id?: string
          appointment_id?: string
          billing_month?: string
          created_at?: string
          fee_amount?: number
          id?: string
          trigger_type?: string
          triggered_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_usage_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_usage_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_usage_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_confirms: boolean
          agency_id: string | null
          avatar_url: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_name: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          is_deleted: boolean
          is_import_staged: boolean
          last_imported_at: string | null
          last_name: string | null
          phone: string | null
          qbo_last_synced_at: string | null
          qbo_vendor_id: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          admin_confirms?: boolean
          agency_id?: string | null
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_import_staged?: boolean
          last_imported_at?: string | null
          last_name?: string | null
          phone?: string | null
          qbo_last_synced_at?: string | null
          qbo_vendor_id?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          admin_confirms?: boolean
          agency_id?: string | null
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_import_staged?: boolean
          last_imported_at?: string | null
          last_name?: string | null
          phone?: string | null
          qbo_last_synced_at?: string | null
          qbo_vendor_id?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_connections: {
        Row: {
          access_token: string | null
          agency_id: string
          auto_sync_on_completed: boolean
          auto_sync_on_validated: boolean
          company_name: string | null
          connection_status: string
          created_at: string
          default_customer_naming: string
          default_vendor_naming: string
          id: string
          integration_mode: string
          last_sync_at: string | null
          realm_id: string | null
          refresh_token: string | null
          require_manual_approval: boolean
          sync_enabled: boolean
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          agency_id: string
          auto_sync_on_completed?: boolean
          auto_sync_on_validated?: boolean
          company_name?: string | null
          connection_status?: string
          created_at?: string
          default_customer_naming?: string
          default_vendor_naming?: string
          id?: string
          integration_mode?: string
          last_sync_at?: string | null
          realm_id?: string | null
          refresh_token?: string | null
          require_manual_approval?: boolean
          sync_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          agency_id?: string
          auto_sync_on_completed?: boolean
          auto_sync_on_validated?: boolean
          company_name?: string | null
          connection_status?: string
          created_at?: string
          default_customer_naming?: string
          default_vendor_naming?: string
          id?: string
          integration_mode?: string
          last_sync_at?: string | null
          realm_id?: string | null
          refresh_token?: string | null
          require_manual_approval?: boolean
          sync_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_connections_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_item_mappings: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          is_active: boolean
          line_item_type: string
          qbo_expense_account_id: string | null
          qbo_expense_account_name: string | null
          qbo_income_account_id: string | null
          qbo_income_account_name: string | null
          qbo_service_item_id: string | null
          qbo_service_item_name: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          line_item_type: string
          qbo_expense_account_id?: string | null
          qbo_expense_account_name?: string | null
          qbo_income_account_id?: string | null
          qbo_income_account_name?: string | null
          qbo_service_item_id?: string | null
          qbo_service_item_name?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          line_item_type?: string
          qbo_expense_account_id?: string | null
          qbo_expense_account_name?: string | null
          qbo_income_account_id?: string | null
          qbo_income_account_name?: string | null
          qbo_service_item_id?: string | null
          qbo_service_item_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_item_mappings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_jobs: {
        Row: {
          agency_id: string
          batch_size: number
          completed_at: string | null
          created_at: string
          cursor_position: string | null
          date_from: string | null
          date_to: string | null
          errors: Json | null
          failed_count: number
          id: string
          mapping_warnings: Json | null
          processed_records: number
          skipped_count: number
          started_at: string | null
          status: string
          synced_count: number
          total_records: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          cursor_position?: string | null
          date_from?: string | null
          date_to?: string | null
          errors?: Json | null
          failed_count?: number
          id?: string
          mapping_warnings?: Json | null
          processed_records?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          synced_count?: number
          total_records?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          cursor_position?: string | null
          date_from?: string | null
          date_to?: string | null
          errors?: Json | null
          failed_count?: number
          id?: string
          mapping_warnings?: Json | null
          processed_records?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          synced_count?: number
          total_records?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_sync_jobs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_log: {
        Row: {
          action: string
          agency_id: string
          appointment_id: string | null
          completed_at: string | null
          created_at: string
          entity_type: string
          error_details: string | null
          id: string
          max_retries: number
          next_retry_at: string | null
          qbo_bill_id: string | null
          qbo_customer_id: string | null
          qbo_invoice_id: string | null
          qbo_object_type: string
          qbo_vendor_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          retry_count: number
          status: string
        }
        Insert: {
          action: string
          agency_id: string
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          entity_type: string
          error_details?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          qbo_bill_id?: string | null
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_object_type: string
          qbo_vendor_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number
          status?: string
        }
        Update: {
          action?: string
          agency_id?: string
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          entity_type?: string
          error_details?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          qbo_bill_id?: string | null
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_object_type?: string
          qbo_vendor_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_sync_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_sync_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_sync_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_webhook_events: {
        Row: {
          agency_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          realm_id: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          realm_id: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          realm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_webhook_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          agency_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_deleted: boolean
          name: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          name: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      requestor_locations: {
        Row: {
          customer_requestor_id: string
          id: string
          location_id: string
        }
        Insert: {
          customer_requestor_id: string
          id?: string
          location_id: string
        }
        Update: {
          customer_requestor_id?: string
          id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requestor_locations_customer_requestor_id_fkey"
            columns: ["customer_requestor_id"]
            isOneToOne: false
            referencedRelation: "customer_requestors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requestor_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requestor_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_live"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          actions_log: Json | null
          agency_id: string
          ended_at: string | null
          id: string
          platform_user_id: string
          reason: string
          started_at: string
        }
        Insert: {
          actions_log?: Json | null
          agency_id: string
          ended_at?: string | null
          id?: string
          platform_user_id: string
          reason: string
          started_at?: string
        }
        Update: {
          actions_log?: Json | null
          agency_id?: string
          ended_at?: string | null
          id?: string
          platform_user_id?: string
          reason?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          agency_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          agency_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          agency_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      appointments_live: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          agency_id: string | null
          agency_notes: string | null
          assignment_method:
            | Database["public"]["Enums"]["assignment_method"]
            | null
          billed_amount: number | null
          billing_breakdown: Json | null
          cancellation_reason: string | null
          cancelled_at: string | null
          category: string | null
          client_reference: string | null
          created_at: string | null
          custom_fields: Json | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          gcal_event_id: string | null
          gcal_last_synced_at: string | null
          gcal_sync_error: string | null
          gcal_sync_status: string | null
          id: string | null
          import_batch_id: string | null
          interpreter_id: string | null
          interpreter_notes: string | null
          interpreter_notes_history: Json | null
          interpreter_pay_amount: number | null
          is_deleted: boolean | null
          is_import_staged: boolean | null
          is_self_claimable: boolean | null
          language_id: string | null
          last_imported_at: string | null
          late_cancel_detected_at: string | null
          location_id: string | null
          modality: Database["public"]["Enums"]["service_modality"] | null
          notes: string | null
          parent_recurring_id: string | null
          parking_cost: number | null
          patient_client_name: string | null
          payment_status: string | null
          qbo_bill_id: string | null
          qbo_customer_id: string | null
          qbo_invoice_id: string | null
          qbo_last_synced_at: string | null
          qbo_sync_status: string | null
          qbo_vendor_id: string | null
          recurrence_rule: Json | null
          requester_id: string | null
          requester_notes: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          signature_data: string | null
          signature_lat: number | null
          signature_lng: number | null
          signature_timestamp: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          agency_id?: string | null
          agency_notes?: string | null
          assignment_method?:
            | Database["public"]["Enums"]["assignment_method"]
            | null
          billed_amount?: number | null
          billing_breakdown?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          client_reference?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gcal_event_id?: string | null
          gcal_last_synced_at?: string | null
          gcal_sync_error?: string | null
          gcal_sync_status?: string | null
          id?: string | null
          import_batch_id?: string | null
          interpreter_id?: string | null
          interpreter_notes?: string | null
          interpreter_notes_history?: Json | null
          interpreter_pay_amount?: number | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          is_self_claimable?: boolean | null
          language_id?: string | null
          last_imported_at?: string | null
          late_cancel_detected_at?: string | null
          location_id?: string | null
          modality?: Database["public"]["Enums"]["service_modality"] | null
          notes?: string | null
          parent_recurring_id?: string | null
          parking_cost?: number | null
          patient_client_name?: string | null
          payment_status?: string | null
          qbo_bill_id?: string | null
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_last_synced_at?: string | null
          qbo_sync_status?: string | null
          qbo_vendor_id?: string | null
          recurrence_rule?: Json | null
          requester_id?: string | null
          requester_notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          signature_data?: string | null
          signature_lat?: number | null
          signature_lng?: number | null
          signature_timestamp?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          agency_id?: string | null
          agency_notes?: string | null
          assignment_method?:
            | Database["public"]["Enums"]["assignment_method"]
            | null
          billed_amount?: number | null
          billing_breakdown?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          client_reference?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gcal_event_id?: string | null
          gcal_last_synced_at?: string | null
          gcal_sync_error?: string | null
          gcal_sync_status?: string | null
          id?: string | null
          import_batch_id?: string | null
          interpreter_id?: string | null
          interpreter_notes?: string | null
          interpreter_notes_history?: Json | null
          interpreter_pay_amount?: number | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          is_self_claimable?: boolean | null
          language_id?: string | null
          last_imported_at?: string | null
          late_cancel_detected_at?: string | null
          location_id?: string | null
          modality?: Database["public"]["Enums"]["service_modality"] | null
          notes?: string | null
          parent_recurring_id?: string | null
          parking_cost?: number | null
          patient_client_name?: string | null
          payment_status?: string | null
          qbo_bill_id?: string | null
          qbo_customer_id?: string | null
          qbo_invoice_id?: string | null
          qbo_last_synced_at?: string | null
          qbo_sync_status?: string | null
          qbo_vendor_id?: string | null
          recurrence_rule?: Json | null
          requester_id?: string | null
          requester_notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          signature_data?: string | null
          signature_lat?: number | null
          signature_lng?: number | null
          signature_timestamp?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_interpreter_id_fkey"
            columns: ["interpreter_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_parent_recurring_id_fkey"
            columns: ["parent_recurring_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_parent_recurring_id_fkey"
            columns: ["parent_recurring_id"]
            isOneToOne: false
            referencedRelation: "appointments_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_live"
            referencedColumns: ["id"]
          },
        ]
      }
      customers_live: {
        Row: {
          agency_id: string | null
          billing_email: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string | null
          import_batch_id: string | null
          is_active: boolean | null
          is_deleted: boolean | null
          is_import_staged: boolean | null
          last_imported_at: string | null
          name: string | null
          notes: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id?: string | null
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          import_batch_id?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          last_imported_at?: string | null
          name?: string | null
          notes?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string | null
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          import_batch_id?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          last_imported_at?: string | null
          name?: string | null
          notes?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      locations_live: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_parse_warnings: string | null
          agency_id: string | null
          city: string | null
          created_at: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string | null
          import_batch_id: string | null
          is_active: boolean | null
          is_deleted: boolean | null
          is_import_staged: boolean | null
          last_imported_at: string | null
          name: string | null
          navigation_instructions: string | null
          phone: string | null
          raw_address: string | null
          region_id: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          state: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_parse_warnings?: string | null
          agency_id?: string | null
          city?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          import_batch_id?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          last_imported_at?: string | null
          name?: string | null
          navigation_instructions?: string | null
          phone?: string | null
          raw_address?: string | null
          region_id?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          state?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_parse_warnings?: string | null
          agency_id?: string | null
          city?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          import_batch_id?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          last_imported_at?: string | null
          name?: string | null
          navigation_instructions?: string | null
          phone?: string | null
          raw_address?: string | null
          region_id?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          state?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_live: {
        Row: {
          agency_id: string | null
          avatar_url: string | null
          created_at: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_name: string | null
          id: string | null
          import_batch_id: string | null
          is_active: boolean | null
          is_deleted: boolean | null
          is_import_staged: boolean | null
          last_imported_at: string | null
          last_name: string | null
          phone: string | null
          source_hash: string | null
          source_record_id: string | null
          source_system: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          import_batch_id?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          last_imported_at?: string | null
          last_name?: string | null
          phone?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          import_batch_id?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_import_staged?: boolean | null
          last_imported_at?: string | null
          last_name?: string | null
          phone?: string | null
          source_hash?: string | null
          source_record_id?: string | null
          source_system?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_live"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bootstrap_agency_admin:
        | {
            Args: {
              _agency_name: string
              _agency_slug: string
              _first_name: string
              _last_name: string
            }
            Returns: {
              address: string | null
              agency_status: string
              approved_at: string | null
              approved_by: string | null
              billing_model: string
              contract_end_date: string | null
              contract_start_date: string | null
              created_at: string
              email: string | null
              feature_flags: Json
              id: string
              logo_url: string | null
              name: string
              payment_terms: string
              phone: string | null
              plan_type: string
              platform_notes: string | null
              platform_qbo_customer_id: string | null
              settings: Json | null
              slug: string
              timezone: string
              updated_at: string
              website: string | null
            }
            SetofOptions: {
              from: "*"
              to: "agencies"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _agency_name: string
              _agency_slug: string
              _agency_status?: string
              _first_name: string
              _last_name: string
              _plan_type?: string
            }
            Returns: {
              address: string | null
              agency_status: string
              approved_at: string | null
              approved_by: string | null
              billing_model: string
              contract_end_date: string | null
              contract_start_date: string | null
              created_at: string
              email: string | null
              feature_flags: Json
              id: string
              logo_url: string | null
              name: string
              payment_terms: string
              phone: string | null
              plan_type: string
              platform_notes: string | null
              platform_qbo_customer_id: string | null
              settings: Json | null
              slug: string
              timezone: string
              updated_at: string
              website: string | null
            }
            SetofOptions: {
              from: "*"
              to: "agencies"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      cancel_stale_reminders: { Args: never; Returns: undefined }
      check_import_concurrency: {
        Args: {
          _agency_id: string
          _entity_type: string
          _source_system?: string
        }
        Returns: boolean
      }
      check_rollback_dependencies: {
        Args: { _batch_id: string }
        Returns: Json
      }
      get_dashboard_counts:
        | {
            Args: {
              _agency_id: string
              _customer_id?: string
              _interpreter_id?: string
              _statuses: string[]
            }
            Returns: Json
          }
        | {
            Args: {
              _agency_id: string
              _customer_id?: string
              _date_from?: string
              _date_to?: string
              _interpreter_id?: string
              _statuses: string[]
            }
            Returns: Json
          }
      get_platform_agencies: { Args: never; Returns: Json }
      get_platform_agency_detail: {
        Args: { _agency_id: string }
        Returns: Json
      }
      get_platform_audit_log: {
        Args: {
          _action_filter?: string
          _page?: number
          _page_size?: number
          _target_type_filter?: string
        }
        Returns: Json
      }
      get_platform_diagnostics: { Args: never; Returns: Json }
      get_platform_revenue: {
        Args: { _date_from?: string; _date_to?: string; _months?: number }
        Returns: Json
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_report_data: { Args: never; Returns: Json }
      get_user_agency_id: { Args: { _user_id: string }; Returns: string }
      get_user_customer_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_owner: { Args: { _user_id: string }; Returns: boolean }
      log_platform_action: {
        Args: {
          _action: string
          _details?: Json
          _target_id?: string
          _target_type: string
        }
        Returns: undefined
      }
      rollback_import_batch: {
        Args: { _batch_id: string; _user_id: string }
        Returns: Json
      }
      search_appointments:
        | {
            Args: {
              _assignment?: string
              _date_from?: string
              _date_to?: string
              _page?: number
              _page_size?: number
              _search?: string
              _status?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _assignment?: string
              _date_from?: string
              _date_to?: string
              _page?: number
              _page_size?: number
              _search?: string
              _status?: string
              _statuses?: string[]
            }
            Returns: Json
          }
      search_platform_users: {
        Args: {
          _agency_id?: string
          _page?: number
          _page_size?: number
          _role?: string
          _search?: string
        }
        Returns: Json
      }
      transition_import_batch: {
        Args: { _batch_id: string; _new_status: string; _user_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "agency_admin" | "scheduler" | "requester" | "interpreter"
      appointment_status:
        | "requested"
        | "requested_last_minute"
        | "interpreter_assigned"
        | "interpreter_assigned_last_minute"
        | "interpreter_confirmed"
        | "reassignment_needed"
        | "in_progress"
        | "completed"
        | "completed_last_minute"
        | "cancelled"
        | "late_cancel_no_show_client"
        | "no_show_interpreter"
      assignment_method:
        | "self_claim"
        | "availability"
        | "offer"
        | "manual"
        | "admin_confirmed"
      service_modality: "on_site" | "opi" | "vri"
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
      app_role: ["agency_admin", "scheduler", "requester", "interpreter"],
      appointment_status: [
        "requested",
        "requested_last_minute",
        "interpreter_assigned",
        "interpreter_assigned_last_minute",
        "interpreter_confirmed",
        "reassignment_needed",
        "in_progress",
        "completed",
        "completed_last_minute",
        "cancelled",
        "late_cancel_no_show_client",
        "no_show_interpreter",
      ],
      assignment_method: [
        "self_claim",
        "availability",
        "offer",
        "manual",
        "admin_confirmed",
      ],
      service_modality: ["on_site", "opi", "vri"],
    },
  },
} as const
