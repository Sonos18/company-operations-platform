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
    PostgrestVersion: "14.17"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      is_company_member: {
        Args: { target_company_id: string; target_tenant_id: string }
        Returns: boolean
      }
      is_tenant_member: { Args: { target_tenant_id: string }; Returns: boolean }
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
      record_employee_offboarding_auth_failure: {
        Args: { target_company_id: string; target_employee_id: string }
        Returns: undefined
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
      update_employee_profile: {
        Args: {
          target_company_id: string
          target_employee_id: string
          target_update: Json
        }
        Returns: string
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
