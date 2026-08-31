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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_summary: Json | null
          before_summary: Json | null
          company_id: string
          created_at: string
          id: number
          request_id: string
          resource_id: string
          resource_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_summary?: Json | null
          before_summary?: Json | null
          company_id: string
          created_at?: string
          id?: never
          request_id: string
          resource_id: string
          resource_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_summary?: Json | null
          before_summary?: Json | null
          company_id?: string
          created_at?: string
          id?: never
          request_id?: string
          resource_id?: string
          resource_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_company_id_tenant_id_fkey"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          is_active: boolean
          roles: string[]
          tenant_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          is_active?: boolean
          roles: string[]
          tenant_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          is_active?: boolean
          roles?: string[]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_tenant_id_fkey"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "company_memberships_user_id_tenant_id_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["user_id", "tenant_id"]
          },
        ]
      }
      company_role_assignments: {
        Row: {
          company_id: string
          grant_reason: string
          granted_at: string
          granted_by: string
          id: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          grant_reason: string
          granted_at?: string
          granted_by: string
          id?: never
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          grant_reason?: string
          granted_at?: string
          granted_by?: string
          id?: never
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_assignments_membership_fk"
            columns: ["tenant_id", "company_id", "user_id"]
            isOneToOne: false
            referencedRelation: "company_memberships"
            referencedColumns: ["tenant_id", "company_id", "user_id"]
          },
          {
            foreignKeyName: "company_role_assignments_role_fk"
            columns: ["tenant_id", "company_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["tenant_id", "company_id", "id"]
          },
        ]
      }
      contact_methods: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          id: string
          is_usable: boolean
          method_type: string
          reliability_state: string | null
          tenant_id: string
          updated_at: string
          value: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          is_usable?: boolean
          method_type: string
          reliability_state?: string | null
          tenant_id: string
          updated_at?: string
          value: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_usable?: boolean
          method_type?: string
          reliability_state?: string | null
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_methods_contact_fk"
            columns: ["contact_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          display_name: string
          id: string
          notes: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          display_name: string
          id?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          display_name?: string
          id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      employee_private_details: {
        Row: {
          company_id: string
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_id: string
          gender: string | null
          permanent_address: string | null
          personal_email: string | null
          personal_phone: string | null
          social_insurance_number: string | null
          tax_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id: string
          gender?: string | null
          permanent_address?: string | null
          personal_email?: string | null
          personal_phone?: string | null
          social_insurance_number?: string | null
          tax_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id?: string
          gender?: string | null
          permanent_address?: string | null
          personal_email?: string | null
          personal_phone?: string | null
          social_insurance_number?: string | null
          tax_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_private_details_employee_fk"
            columns: ["tenant_id", "company_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "company_id", "id"]
          },
        ]
      }
      employees: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          department_id: string
          employee_code: string
          employment_status: string
          full_name: string
          hire_date: string | null
          id: string
          manager_employee_id: string | null
          position_id: string | null
          probation_end_date: string | null
          tenant_id: string
          termination_date: string | null
          termination_reason: string | null
          updated_at: string
          user_id: string
          work_email: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          department_id: string
          employee_code: string
          employment_status?: string
          full_name: string
          hire_date?: string | null
          id?: string
          manager_employee_id?: string | null
          position_id?: string | null
          probation_end_date?: string | null
          tenant_id: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          user_id: string
          work_email: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          department_id?: string
          employee_code?: string
          employment_status?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          manager_employee_id?: string | null
          position_id?: string | null
          probation_end_date?: string | null
          tenant_id?: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          user_id?: string
          work_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "employees_department_fk"
            columns: ["tenant_id", "company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "company_id", "id"]
          },
          {
            foreignKeyName: "employees_manager_fk"
            columns: ["tenant_id", "company_id", "manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "company_id", "id"]
          },
          {
            foreignKeyName: "employees_membership_fk"
            columns: ["tenant_id", "company_id", "user_id"]
            isOneToOne: false
            referencedRelation: "company_memberships"
            referencedColumns: ["tenant_id", "company_id", "user_id"]
          },
          {
            foreignKeyName: "employees_position_fk"
            columns: ["tenant_id", "company_id", "position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["tenant_id", "company_id", "id"]
          },
        ]
      }
      opportunities: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          budget_note: string | null
          budget_status_code: string | null
          canonical_opportunity_id: string | null
          company_id: string
          created_at: string
          created_by: string
          currency_code: string | null
          current_invalid_reason_code: string | null
          current_invalid_reason_semantic_key: string | null
          current_invalidation_reason: string | null
          customer_type_code: string | null
          engagement_status_code: string | null
          id: string
          invalidated_at: string | null
          invalidated_by: string | null
          location_status: string
          location_text: string | null
          need_description: string | null
          primary_customer_name: string | null
          primary_lead_source_code: string | null
          priority_code: string | null
          tenant_id: string
          timeline_end_date: string | null
          timeline_note: string | null
          timeline_start_date: string | null
          timeline_status_code: string | null
          updated_at: string
          validity_state: string
          version: number
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          budget_note?: string | null
          budget_status_code?: string | null
          canonical_opportunity_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          currency_code?: string | null
          current_invalid_reason_code?: string | null
          current_invalid_reason_semantic_key?: string | null
          current_invalidation_reason?: string | null
          customer_type_code?: string | null
          engagement_status_code?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          location_status?: string
          location_text?: string | null
          need_description?: string | null
          primary_customer_name?: string | null
          primary_lead_source_code?: string | null
          priority_code?: string | null
          tenant_id: string
          timeline_end_date?: string | null
          timeline_note?: string | null
          timeline_start_date?: string | null
          timeline_status_code?: string | null
          updated_at?: string
          validity_state?: string
          version?: number
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          budget_note?: string | null
          budget_status_code?: string | null
          canonical_opportunity_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          currency_code?: string | null
          current_invalid_reason_code?: string | null
          current_invalid_reason_semantic_key?: string | null
          current_invalidation_reason?: string | null
          customer_type_code?: string | null
          engagement_status_code?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          location_status?: string
          location_text?: string | null
          need_description?: string | null
          primary_customer_name?: string | null
          primary_lead_source_code?: string | null
          priority_code?: string | null
          tenant_id?: string
          timeline_end_date?: string | null
          timeline_note?: string | null
          timeline_start_date?: string | null
          timeline_status_code?: string | null
          updated_at?: string
          validity_state?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_canonical_fk"
            columns: ["canonical_opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "opportunities_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      opportunity_contacts: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          created_by: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          is_primary: boolean
          opportunity_id: string
          relationship_code: string
          reliability_state: string | null
          tenant_id: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          created_by: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_primary?: boolean
          opportunity_id: string
          relationship_code: string
          reliability_state?: string | null
          tenant_id: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_primary?: boolean
          opportunity_id?: string
          relationship_code?: string
          reliability_state?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_contacts_contact_fk"
            columns: ["contact_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "opportunity_contacts_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      opportunity_duplicate_concerns: {
        Row: {
          canonical_opportunity_id: string | null
          company_id: string
          description: string
          id: string
          opportunity_id: string
          raised_at: string
          raised_by: string
          resolution: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          suspected_duplicate_opportunity_id: string | null
          tenant_id: string
        }
        Insert: {
          canonical_opportunity_id?: string | null
          company_id: string
          description: string
          id?: string
          opportunity_id: string
          raised_at?: string
          raised_by: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          suspected_duplicate_opportunity_id?: string | null
          tenant_id: string
        }
        Update: {
          canonical_opportunity_id?: string | null
          company_id?: string
          description?: string
          id?: string
          opportunity_id?: string
          raised_at?: string
          raised_by?: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          suspected_duplicate_opportunity_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_duplicate_concerns_canonical_fk"
            columns: ["canonical_opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "opportunity_duplicate_concerns_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "opportunity_duplicate_concerns_suspected_fk"
            columns: [
              "suspected_duplicate_opportunity_id",
              "tenant_id",
              "company_id",
            ]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      opportunity_intake_records: {
        Row: {
          channel_code: string
          company_id: string
          correction_of_record_id: string | null
          correction_reason: string | null
          created_at: string
          created_by: string
          id: string
          opportunity_id: string
          summary: string
          tenant_id: string
        }
        Insert: {
          channel_code: string
          company_id: string
          correction_of_record_id?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by: string
          id?: string
          opportunity_id: string
          summary: string
          tenant_id: string
        }
        Update: {
          channel_code?: string
          company_id?: string
          correction_of_record_id?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by?: string
          id?: string
          opportunity_id?: string
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_intake_records_correction_fk"
            columns: ["correction_of_record_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunity_intake_records"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "opportunity_intake_records_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      opportunity_referrers: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string
          display_name: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          is_primary: boolean
          note: string | null
          opportunity_id: string
          referrer_type_code: string
          reliability_state: string | null
          tenant_id: string
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          display_name: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_primary?: boolean
          note?: string | null
          opportunity_id: string
          referrer_type_code: string
          reliability_state?: string | null
          tenant_id: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          display_name?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_primary?: boolean
          note?: string | null
          opportunity_id?: string
          referrer_type_code?: string
          reliability_state?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_referrers_contact_fk"
            columns: ["contact_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "opportunity_referrers_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      opportunity_scopes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          note: string | null
          opportunity_id: string
          reliability_state: string | null
          retire_reason: string | null
          retired_at: string | null
          retired_by: string | null
          scope_code: string
          tenant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          opportunity_id: string
          reliability_state?: string | null
          retire_reason?: string | null
          retired_at?: string | null
          retired_by?: string | null
          scope_code: string
          tenant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          opportunity_id?: string
          reliability_state?: string | null
          retire_reason?: string | null
          retired_at?: string | null
          retired_by?: string | null
          scope_code?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scopes_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          module: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          module: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          level: number | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_code: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_code: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fk"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_fk"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_privileged: boolean
          is_system: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          is_privileged?: boolean
          is_system?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_privileged?: boolean
          is_system?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      stage01_clarification_returns: {
        Row: {
          company_id: string
          decision_cycle_id: string
          id: string
          reason: string
          recommendation_id: string
          returned_at: string
          returned_by: string
          tenant_id: string
        }
        Insert: {
          company_id: string
          decision_cycle_id: string
          id?: string
          reason: string
          recommendation_id: string
          returned_at?: string
          returned_by: string
          tenant_id: string
        }
        Update: {
          company_id?: string
          decision_cycle_id?: string
          id?: string
          reason?: string
          recommendation_id?: string
          returned_at?: string
          returned_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage01_clarification_returns_cycle_fk"
            columns: ["decision_cycle_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "stage01_decision_cycles"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "stage01_clarification_returns_recommendation_fk"
            columns: ["recommendation_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "stage01_recommendations"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      stage01_criterion_evaluations: {
        Row: {
          applicability: string
          company_id: string
          criterion_key: string
          decision_cycle_id: string
          evaluated_at: string
          evaluated_by: string
          evidence: Json
          id: string
          rationale: string | null
          result: string | null
          revision: number
          tenant_id: string
        }
        Insert: {
          applicability: string
          company_id: string
          criterion_key: string
          decision_cycle_id: string
          evaluated_at?: string
          evaluated_by: string
          evidence?: Json
          id?: string
          rationale?: string | null
          result?: string | null
          revision: number
          tenant_id: string
        }
        Update: {
          applicability?: string
          company_id?: string
          criterion_key?: string
          decision_cycle_id?: string
          evaluated_at?: string
          evaluated_by?: string
          evidence?: Json
          id?: string
          rationale?: string | null
          result?: string | null
          revision?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage01_criterion_evaluations_cycle_fk"
            columns: ["decision_cycle_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "stage01_decision_cycles"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      stage01_decision_cycles: {
        Row: {
          authority_resolution_reference: string | null
          company_id: string
          created_at: string
          created_by: string
          cycle_no: number
          decision_authority_user_id: string | null
          final_decision_at: string | null
          final_decision_by: string | null
          final_outcome: string | null
          final_rationale: string | null
          final_recommendation_id: string | null
          id: string
          node_execution_id: string
          opportunity_id: string
          override_rationale: string | null
          reactivation_reason: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          authority_resolution_reference?: string | null
          company_id: string
          created_at?: string
          created_by: string
          cycle_no: number
          decision_authority_user_id?: string | null
          final_decision_at?: string | null
          final_decision_by?: string | null
          final_outcome?: string | null
          final_rationale?: string | null
          final_recommendation_id?: string | null
          id?: string
          node_execution_id: string
          opportunity_id: string
          override_rationale?: string | null
          reactivation_reason?: string | null
          tenant_id: string
          version?: number
        }
        Update: {
          authority_resolution_reference?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          cycle_no?: number
          decision_authority_user_id?: string | null
          final_decision_at?: string | null
          final_decision_by?: string | null
          final_outcome?: string | null
          final_rationale?: string | null
          final_recommendation_id?: string | null
          id?: string
          node_execution_id?: string
          opportunity_id?: string
          override_rationale?: string | null
          reactivation_reason?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage01_decision_cycles_execution_fk"
            columns: ["node_execution_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_executions"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "stage01_decision_cycles_final_recommendation_fk"
            columns: ["final_recommendation_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "stage01_recommendations"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "stage01_decision_cycles_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      stage01_intake_completion_baselines: {
        Row: {
          baseline_version: number
          company_id: string
          completion_event_id: number
          created_at: string
          created_by: string
          id: string
          node_execution_id: string
          opportunity_id: string
          snapshot: Json
          snapshot_hash: string
          tenant_id: string
        }
        Insert: {
          baseline_version: number
          company_id: string
          completion_event_id: number
          created_at?: string
          created_by: string
          id?: string
          node_execution_id: string
          opportunity_id: string
          snapshot: Json
          snapshot_hash: string
          tenant_id: string
        }
        Update: {
          baseline_version?: number
          company_id?: string
          completion_event_id?: number
          created_at?: string
          created_by?: string
          id?: string
          node_execution_id?: string
          opportunity_id?: string
          snapshot?: Json
          snapshot_hash?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage01_intake_baselines_event_fk"
            columns: ["completion_event_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_events"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "stage01_intake_baselines_execution_fk"
            columns: ["node_execution_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_executions"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "stage01_intake_baselines_opportunity_fk"
            columns: ["opportunity_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      stage01_recommendations: {
        Row: {
          company_id: string
          decision_cycle_id: string
          evidence: Json
          id: string
          rationale: string
          recommendation: string
          submitted_at: string
          submitted_by: string
          tenant_id: string
          version: number
        }
        Insert: {
          company_id: string
          decision_cycle_id: string
          evidence?: Json
          id?: string
          rationale: string
          recommendation: string
          submitted_at?: string
          submitted_by: string
          tenant_id: string
          version: number
        }
        Update: {
          company_id?: string
          decision_cycle_id?: string
          evidence?: Json
          id?: string
          rationale?: string
          recommendation?: string
          submitted_at?: string
          submitted_by?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage01_recommendations_cycle_fk"
            columns: ["decision_cycle_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "stage01_decision_cycles"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      stage01_taxonomy_values: {
        Row: {
          behavior: Json
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          semantic_key: string | null
          taxonomy_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          behavior?: Json
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          semantic_key?: string | null
          taxonomy_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          behavior?: Json
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          semantic_key?: string | null
          taxonomy_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage01_taxonomy_values_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          roles: string[]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          roles: string[]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          roles?: string[]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          code: string
          created_at: string
          deployment_mode: Database["public"]["Enums"]["deployment_mode"]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deployment_mode?: Database["public"]["Enums"]["deployment_mode"]
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deployment_mode?: Database["public"]["Enums"]["deployment_mode"]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflow_blockers: {
        Row: {
          category_code: string
          company_id: string
          description: string
          effect: string
          id: string
          node_execution_id: string
          raised_at: string
          raised_by: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          responsible_user_id: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          category_code: string
          company_id: string
          description: string
          effect: string
          id?: string
          node_execution_id: string
          raised_at?: string
          raised_by: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_user_id?: string | null
          tenant_id: string
          version?: number
        }
        Update: {
          category_code?: string
          company_id?: string
          description?: string
          effect?: string
          id?: string
          node_execution_id?: string
          raised_at?: string
          raised_by?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_user_id?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_blockers_execution_fk"
            columns: ["node_execution_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_executions"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      workflow_definition_drafts: {
        Row: {
          base_snapshot_id: string
          company_id: string
          created_at: string
          created_by: string
          definition: Json
          id: string
          tenant_id: string
          updated_at: string
          updated_by: string
          version: number
          workflow_key: string
        }
        Insert: {
          base_snapshot_id: string
          company_id: string
          created_at?: string
          created_by: string
          definition: Json
          id?: string
          tenant_id: string
          updated_at?: string
          updated_by: string
          version?: number
          workflow_key: string
        }
        Update: {
          base_snapshot_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          definition?: Json
          id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definition_drafts_base_snapshot_fk"
            columns: ["base_snapshot_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition_snapshots"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
          {
            foreignKeyName: "workflow_definition_drafts_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      workflow_definition_snapshots: {
        Row: {
          company_id: string
          created_at: string
          definition: Json
          definition_hash: string
          id: string
          schema_version: number
          template_version: number
          tenant_id: string
          workflow_key: string
        }
        Insert: {
          company_id: string
          created_at?: string
          definition: Json
          definition_hash: string
          id?: string
          schema_version: number
          template_version: number
          tenant_id: string
          workflow_key: string
        }
        Update: {
          company_id?: string
          created_at?: string
          definition?: Json
          definition_hash?: string
          id?: string
          schema_version?: number
          template_version?: number
          tenant_id?: string
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definition_snapshots_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          definition_snapshot_id: string
          id: string
          subject_id: string
          subject_type: string
          tenant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          definition_snapshot_id: string
          id?: string
          subject_id: string
          subject_type: string
          tenant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          definition_snapshot_id?: string
          id?: string
          subject_id?: string
          subject_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_company_fk"
            columns: ["company_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "workflow_instances_definition_fk"
            columns: ["definition_snapshot_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition_snapshots"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      workflow_node_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          assignee_user_id: string
          assignment_kind: string
          assignment_reason: string | null
          company_id: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          node_execution_id: string
          tenant_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          assignee_user_id: string
          assignment_kind: string
          assignment_reason?: string | null
          company_id: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          node_execution_id: string
          tenant_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          assignee_user_id?: string
          assignment_kind?: string
          assignment_reason?: string | null
          company_id?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          node_execution_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_assignments_execution_fk"
            columns: ["node_execution_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_executions"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      workflow_node_events: {
        Row: {
          actor_id: string
          company_id: string
          created_at: string
          event_type: string
          id: number
          node_execution_id: string
          payload: Json
          reason: string | null
          request_id: string
          tenant_id: string
        }
        Insert: {
          actor_id: string
          company_id: string
          created_at?: string
          event_type: string
          id?: never
          node_execution_id: string
          payload?: Json
          reason?: string | null
          request_id: string
          tenant_id: string
        }
        Update: {
          actor_id?: string
          company_id?: string
          created_at?: string
          event_type?: string
          id?: never
          node_execution_id?: string
          payload?: Json
          reason?: string | null
          request_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_events_execution_fk"
            columns: ["node_execution_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_executions"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      workflow_node_executions: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          execution_no: number
          id: string
          needs_revalidation: boolean
          node_instance_id: string
          phase: string
          started_at: string | null
          started_by: string | null
          superseded_at: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          execution_no: number
          id?: string
          needs_revalidation?: boolean
          node_instance_id: string
          phase?: string
          started_at?: string | null
          started_by?: string | null
          superseded_at?: string | null
          tenant_id: string
          version?: number
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          execution_no?: number
          id?: string
          needs_revalidation?: boolean
          node_instance_id?: string
          phase?: string
          started_at?: string | null
          started_by?: string | null
          superseded_at?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_executions_node_fk"
            columns: ["node_instance_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_instances"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
      workflow_node_instances: {
        Row: {
          company_id: string
          created_at: string
          id: string
          node_key: string
          node_type: string
          parent_node_key: string | null
          tenant_id: string
          workflow_instance_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          node_key: string
          node_type: string
          parent_node_key?: string | null
          tenant_id: string
          workflow_instance_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          node_key?: string
          node_type?: string
          parent_node_key?: string | null
          tenant_id?: string
          workflow_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_instances_workflow_fk"
            columns: ["workflow_instance_id", "tenant_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id", "tenant_id", "company_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_contact_method: {
        Args: {
          target_company_id: string
          target_contact_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      add_opportunity_referrer: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      add_opportunity_scope: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      append_opportunity_intake_record: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      assign_workflow_node: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      complete_employee_onboarding: {
        Args: {
          target_company_id: string
          target_department_id: string
          target_employee_code: string
          target_full_name: string
          target_hire_date?: string
          target_position_id?: string
          target_user_id: string
          target_work_email: string
        }
        Returns: string
      }
      complete_stage01_evaluation: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      complete_stage01_intake: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      correct_opportunity_intake_record: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_record_id: string
          target_request_id: string
        }
        Returns: Json
      }
      create_contact: {
        Args: {
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      create_stage01_config_draft: {
        Args: {
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      create_stage01_opportunity: {
        Args: {
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      discard_stage01_config_draft: {
        Args: {
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      end_opportunity_contact: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_relationship_id: string
          target_request_id: string
        }
        Returns: Json
      }
      end_opportunity_referrer: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_referrer_id: string
          target_request_id: string
        }
        Returns: Json
      }
      end_workflow_assignment: {
        Args: {
          target_assignment_id: string
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      get_company_employee_access_links: {
        Args: { target_company_id: string; target_employee_ids: string[] }
        Returns: {
          employee_id: string
          role_codes: string[]
          user_id: string
        }[]
      }
      get_my_company_access: {
        Args: { target_company_id: string }
        Returns: {
          permissions: string[]
          roles: string[]
        }[]
      }
      grant_company_role_assignment: {
        Args: {
          target_company_id: string
          target_grant_reason: string
          target_role_id: string
          target_user_id: string
        }
        Returns: {
          company_id: string
          grant_reason: string
          granted_at: string
          granted_by: string
          id: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "company_role_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invalidate_opportunity: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      is_company_member: {
        Args: { target_company_id: string; target_tenant_id: string }
        Returns: boolean
      }
      is_tenant_member: { Args: { target_tenant_id: string }; Returns: boolean }
      link_opportunity_contact: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      offboard_employee: {
        Args: {
          target_company_id: string
          target_employee_id: string
          target_reason: string
        }
        Returns: {
          employee_id: string
          user_id: string
        }[]
      }
      publish_stage01_config_draft: {
        Args: {
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      raise_opportunity_duplicate_concern: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      raise_workflow_blocker: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      reactivate_stage01: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      record_employee_offboarding_auth_failure: {
        Args: { target_company_id: string; target_employee_id: string }
        Returns: undefined
      }
      record_stage01_criterion_evaluation: {
        Args: {
          target_company_id: string
          target_criterion_key: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      record_stage01_final_decision: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      reopen_workflow_node: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      resolve_opportunity_duplicate: {
        Args: {
          target_company_id: string
          target_concern_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      resolve_workflow_blocker: {
        Args: {
          target_blocker_id: string
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      restore_opportunity: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      retire_opportunity_scope: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
          target_scope_id: string
        }
        Returns: Json
      }
      return_stage01_for_clarification: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      revalidate_workflow_node: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      revoke_company_role_assignment: {
        Args: { target_assignment_id: number; target_revoke_reason: string }
        Returns: {
          company_id: string
          grant_reason: string
          granted_at: string
          granted_by: string
          id: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "company_role_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_company_role_assignment_scoped: {
        Args: {
          target_assignment_id: number
          target_company_id: string
          target_revoke_reason: string
        }
        Returns: {
          company_id: string
          grant_reason: string
          granted_at: string
          granted_by: string
          id: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          tenant_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "company_role_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_opportunity_primary_contact: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      set_opportunity_primary_referrer: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      start_workflow_node: {
        Args: {
          target_company_id: string
          target_execution_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      submit_stage01_recommendation: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      update_contact: {
        Args: {
          target_company_id: string
          target_contact_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
      update_contact_method: {
        Args: {
          target_company_id: string
          target_contact_id: string
          target_input: Json
          target_method_id: string
          target_request_id: string
        }
        Returns: Json
      }
      update_employee_profile: {
        Args: {
          target_company_id: string
          target_employee_id: string
          target_update: Json
        }
        Returns: string
      }
      update_opportunity_current_data: {
        Args: {
          target_company_id: string
          target_input: Json
          target_opportunity_id: string
          target_request_id: string
        }
        Returns: Json
      }
      update_stage01_config_draft: {
        Args: {
          target_company_id: string
          target_input: Json
          target_request_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      deployment_mode: "shared" | "dedicated"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      deployment_mode: ["shared", "dedicated"],
    },
  },
} as const
