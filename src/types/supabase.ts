export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_balance_snapshots: {
        Row: {
          account_id: string
          created_at: string
          difference: number | null
          id: string
          notes: string | null
          period_label: string | null
          real_balance: number
          snapshot_date: string
          system_balance: number | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          period_label?: string | null
          real_balance: number
          snapshot_date: string
          system_balance?: number | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          period_label?: string | null
          real_balance?: number
          snapshot_date?: string
          system_balance?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number | null
          amount_usd: number | null
          balance_after_cash: number | null
          balance_after_debit: number | null
          balance_total: number | null
          category_code: string | null
          concept: string | null
          created_at: string
          currency_code: string
          date: string | null
          day: number | null
          detail: string | null
          exchange_rate_used: number | null
          expense_group: string | null
          external_id: string | null
          id: string
          is_passive_income: boolean
          is_settlement: boolean
          is_survival_expense: boolean
          month: number | null
          movement_type: string | null
          notes: string | null
          period_cut: string | null
          raw_label: string | null
          source: string
          updated_at: string
          user_id: string | null
          vendor: string | null
          weekday: number | null
          year: number | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          amount_usd?: number | null
          balance_after_cash?: number | null
          balance_after_debit?: number | null
          balance_total?: number | null
          category_code?: string | null
          concept?: string | null
          created_at?: string
          currency_code?: string
          date?: string | null
          day?: number | null
          detail?: string | null
          exchange_rate_used?: number | null
          expense_group?: string | null
          external_id?: string | null
          id?: string
          is_passive_income?: boolean
          is_settlement?: boolean
          is_survival_expense?: boolean
          month?: number | null
          movement_type?: string | null
          notes?: string | null
          period_cut?: string | null
          raw_label?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
          vendor?: string | null
          weekday?: number | null
          year?: number | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          amount_usd?: number | null
          balance_after_cash?: number | null
          balance_after_debit?: number | null
          balance_total?: number | null
          category_code?: string | null
          concept?: string | null
          created_at?: string
          currency_code?: string
          date?: string | null
          day?: number | null
          detail?: string | null
          exchange_rate_used?: number | null
          expense_group?: string | null
          external_id?: string | null
          id?: string
          is_passive_income?: boolean
          is_settlement?: boolean
          is_survival_expense?: boolean
          month?: number | null
          movement_type?: string | null
          notes?: string | null
          period_cut?: string | null
          raw_label?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
          vendor?: string | null
          weekday?: number | null
          year?: number | null
        }
        Relationships: []
      }
      sheets_sync_config: {
        Row: {
          created_at: string
          data_start_row: number
          display_name: string | null
          format_type: string
          header_row: number
          id: string
          is_active: boolean
          last_row_synced: number | null
          last_synced_at: string | null
          notes: string | null
          sheet_name: string
          spreadsheet_id: string
          sync_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data_start_row?: number
          display_name?: string | null
          format_type?: string
          header_row?: number
          id?: string
          is_active?: boolean
          last_row_synced?: number | null
          last_synced_at?: string | null
          notes?: string | null
          sheet_name: string
          spreadsheet_id: string
          sync_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data_start_row?: number
          display_name?: string | null
          format_type?: string
          header_row?: number
          id?: string
          is_active?: boolean
          last_row_synced?: number | null
          last_synced_at?: string | null
          notes?: string | null
          sheet_name?: string
          spreadsheet_id?: string
          sync_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
