export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      account_balance_snapshots: {
        Row: { account_id: string; created_at: string; difference: number | null; id: string; notes: string | null; period_label: string | null; real_balance: number; snapshot_date: string; system_balance: number | null; user_id: string | null }
        Insert: { account_id: string; created_at?: string; difference?: number | null; id?: string; notes?: string | null; period_label?: string | null; real_balance: number; snapshot_date: string; system_balance?: number | null; user_id?: string | null }
        Update: { account_id?: string; created_at?: string; difference?: number | null; id?: string; notes?: string | null; period_label?: string | null; real_balance?: number; snapshot_date?: string; system_balance?: number | null; user_id?: string | null }
        Relationships: []
      }
      accounts: {
        Row: { created_at: string; currency_code: string; id: string; is_active: boolean; name: string; notes: string | null; source_code: string | null; updated_at: string; user_id: string }
        Insert: { created_at?: string; currency_code: string; id?: string; is_active?: boolean; name: string; notes?: string | null; source_code?: string | null; updated_at?: string; user_id: string }
        Update: { created_at?: string; currency_code?: string; id?: string; is_active?: boolean; name?: string; notes?: string | null; source_code?: string | null; updated_at?: string; user_id?: string }
        Relationships: []
      }
      bonus_plan_items: {
        Row: { actual_amount: number | null; bonus_plan_id: string; category: string; completion_pct: number | null; created_at: string; currency_code: string; id: string; is_completed: boolean; item_name: string; notes: string | null; planned_amount: number }
        Insert: { actual_amount?: number | null; bonus_plan_id: string; category: string; completion_pct?: number | null; created_at?: string; currency_code: string; id?: string; is_completed?: boolean; item_name: string; notes?: string | null; planned_amount?: number }
        Update: { actual_amount?: number | null; bonus_plan_id?: string; category?: string; completion_pct?: number | null; created_at?: string; currency_code?: string; id?: string; is_completed?: boolean; item_name?: string; notes?: string | null; planned_amount?: number }
        Relationships: []
      }
      bonus_plans: {
        Row: { actual_total: number | null; bonus_type: string; created_at: string; currency_code: string; exchange_rate_tc: number | null; id: string; notes: string | null; planned_total: number | null; status: string; updated_at: string; user_id: string; year: number }
        Insert: { actual_total?: number | null; bonus_type: string; created_at?: string; currency_code: string; exchange_rate_tc?: number | null; id?: string; notes?: string | null; planned_total?: number | null; status?: string; updated_at?: string; user_id: string; year: number }
        Update: { actual_total?: number | null; bonus_type?: string; created_at?: string; currency_code?: string; exchange_rate_tc?: number | null; id?: string; notes?: string | null; planned_total?: number | null; status?: string; updated_at?: string; user_id?: string; year?: number }
        Relationships: []
      }
      budget_lines: {
        Row: { actual_amount: number | null; actual_currency: string | null; budget_period_id: string; category_code: string | null; created_at: string; id: string; is_completed: boolean; item_name: string | null; notes: string | null; planned_amount: number; planned_currency: string; q1_amount: number | null; q2_amount: number | null; updated_at: string }
        Insert: { actual_amount?: number | null; actual_currency?: string | null; budget_period_id: string; category_code?: string | null; created_at?: string; id?: string; is_completed?: boolean; item_name?: string | null; notes?: string | null; planned_amount?: number; planned_currency: string; q1_amount?: number | null; q2_amount?: number | null; updated_at?: string }
        Update: { actual_amount?: number | null; actual_currency?: string | null; budget_period_id?: string; category_code?: string | null; created_at?: string; id?: string; is_completed?: boolean; item_name?: string | null; notes?: string | null; planned_amount?: number; planned_currency?: string; q1_amount?: number | null; q2_amount?: number | null; updated_at?: string }
        Relationships: []
      }
      budget_periods: {
        Row: { created_at: string; end_date: string; exchange_rate_tc: number | null; id: string; name: string; notes: string | null; period_type: string; start_date: string; status: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; end_date: string; exchange_rate_tc?: number | null; id?: string; name: string; notes?: string | null; period_type: string; start_date: string; status?: string; updated_at?: string; user_id: string }
        Update: { created_at?: string; end_date?: string; exchange_rate_tc?: number | null; id?: string; name?: string; notes?: string | null; period_type?: string; start_date?: string; status?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      currencies: {
        Row: { code: string; created_at: string; is_active: boolean; name: string; symbol: string }
        Insert: { code: string; created_at?: string; is_active?: boolean; name: string; symbol: string }
        Update: { code?: string; created_at?: string; is_active?: boolean; name?: string; symbol?: string }
        Relationships: []
      }
      exchange_rates: {
        Row: { created_at: string; from_currency: string; id: string; rate: number; rate_date: string; source: string | null; to_currency: string }
        Insert: { created_at?: string; from_currency: string; id?: string; rate: number; rate_date: string; source?: string | null; to_currency: string }
        Update: { created_at?: string; from_currency?: string; id?: string; rate?: number; rate_date?: string; source?: string | null; to_currency?: string }
        Relationships: []
      }
      financial_accounts: {
        Row: { account_type: string; bank_name: string | null; created_at: string; currency_code: string; id: string; is_active: boolean; name: string; notes: string | null; updated_at: string; user_id: string }
        Insert: { account_type: string; bank_name?: string | null; created_at?: string; currency_code: string; id?: string; is_active?: boolean; name: string; notes?: string | null; updated_at?: string; user_id: string }
        Update: { account_type?: string; bank_name?: string | null; created_at?: string; currency_code?: string; id?: string; is_active?: boolean; name?: string; notes?: string | null; updated_at?: string; user_id?: string }
        Relationships: []
      }
      investment_snapshots: {
        Row: { amount: number; bucket_id: string | null; created_at: string; currency_code: string; gains: number | null; id: string; notes: string | null; snapshot_date: string; user_id: string | null }
        Insert: { amount: number; bucket_id?: string | null; created_at?: string; currency_code: string; gains?: number | null; id?: string; notes?: string | null; snapshot_date: string; user_id?: string | null }
        Update: { amount?: number; bucket_id?: string | null; created_at?: string; currency_code?: string; gains?: number | null; id?: string; notes?: string | null; snapshot_date?: string; user_id?: string | null }
        Relationships: []
      }
      network_entries: {
        Row: { amount: number; amount_paid: number; counterpart_id_num: string | null; counterpart_name: string; created_at: string; currency_code: string; direction: string; due_date: string | null; id: string; notes: string | null; start_date: string; status: string; updated_at: string; user_id: string | null }
        Insert: { amount: number; amount_paid?: number; counterpart_id_num?: string | null; counterpart_name: string; created_at?: string; currency_code: string; direction: string; due_date?: string | null; id?: string; notes?: string | null; start_date: string; status?: string; updated_at?: string; user_id?: string | null }
        Update: { amount?: number; amount_paid?: number; counterpart_id_num?: string | null; counterpart_name?: string; created_at?: string; currency_code?: string; direction?: string; due_date?: string | null; id?: string; notes?: string | null; start_date?: string; status?: string; updated_at?: string; user_id?: string | null }
        Relationships: []
      }
      network_payments: {
        Row: { amount: number; created_at: string; id: string; network_entry_id: string; notes: string | null; payment_date: string; payment_method: string | null }
        Insert: { amount: number; created_at?: string; id?: string; network_entry_id: string; notes?: string | null; payment_date: string; payment_method?: string | null }
        Update: { amount?: number; created_at?: string; id?: string; network_entry_id?: string; notes?: string | null; payment_date?: string; payment_method?: string | null }
        Relationships: []
      }
      payment_sources: {
        Row: { bank_name: string | null; code: string; created_at: string; is_active: boolean; name: string; source_type: string }
        Insert: { bank_name?: string | null; code: string; created_at?: string; is_active?: boolean; name: string; source_type: string }
        Update: { bank_name?: string | null; code?: string; created_at?: string; is_active?: boolean; name?: string; source_type?: string }
        Relationships: []
      }
      savings_buckets: {
        Row: { bucket_type: string; created_at: string; currency_code: string; current_amount: number; id: string; is_active: boolean; name: string; notes: string | null; target_amount: number | null; target_currency: string | null; updated_at: string; user_id: string }
        Insert: { bucket_type: string; created_at?: string; currency_code: string; current_amount?: number; id?: string; is_active?: boolean; name: string; notes?: string | null; target_amount?: number | null; target_currency?: string | null; updated_at?: string; user_id: string }
        Update: { bucket_type?: string; created_at?: string; currency_code?: string; current_amount?: number; id?: string; is_active?: boolean; name?: string; notes?: string | null; target_amount?: number | null; target_currency?: string | null; updated_at?: string; user_id?: string }
        Relationships: []
      }
      savings_contributions: {
        Row: { amount: number; bucket_id: string; created_at: string; currency_code: string; date: string; id: string; notes: string | null; transaction_id: string | null }
        Insert: { amount: number; bucket_id: string; created_at?: string; currency_code: string; date: string; id?: string; notes?: string | null; transaction_id?: string | null }
        Update: { amount?: number; bucket_id?: string; created_at?: string; currency_code?: string; date?: string; id?: string; notes?: string | null; transaction_id?: string | null }
        Relationships: []
      }
      self_loan_payments: {
        Row: { amount: number; created_at: string; id: string; linked_transaction_id: string | null; notes: string | null; payment_date: string; self_loan_id: string }
        Insert: { amount: number; created_at?: string; id?: string; linked_transaction_id?: string | null; notes?: string | null; payment_date: string; self_loan_id: string }
        Update: { amount?: number; created_at?: string; id?: string; linked_transaction_id?: string | null; notes?: string | null; payment_date?: string; self_loan_id?: string }
        Relationships: []
      }
      self_loans: {
        Row: { amount_repaid: number; balance_remaining: number | null; created_at: string; currency_code: string; description: string; due_date: string | null; id: string; linked_transaction_id: string | null; loan_date: string; notes: string | null; original_amount: number; source_account_id: string; status: string; updated_at: string; user_id: string }
        Insert: { amount_repaid?: number; balance_remaining?: number | null; created_at?: string; currency_code: string; description: string; due_date?: string | null; id?: string; linked_transaction_id?: string | null; loan_date: string; notes?: string | null; original_amount: number; source_account_id: string; status?: string; updated_at?: string; user_id: string }
        Update: { amount_repaid?: number; balance_remaining?: number | null; created_at?: string; currency_code?: string; description?: string; due_date?: string | null; id?: string; linked_transaction_id?: string | null; loan_date?: string; notes?: string | null; original_amount?: number; source_account_id?: string; status?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      sheets_sync_config: {
        Row: { created_at: string; data_start_row: number; display_name: string | null; format_type: string; header_row: number; id: string; is_active: boolean; last_row_synced: number | null; last_synced_at: string | null; notes: string | null; sheet_name: string; spreadsheet_id: string; sync_type: string; updated_at: string; user_id: string | null }
        Insert: { created_at?: string; data_start_row?: number; display_name?: string | null; format_type?: string; header_row?: number; id?: string; is_active?: boolean; last_row_synced?: number | null; last_synced_at?: string | null; notes?: string | null; sheet_name: string; spreadsheet_id: string; sync_type: string; updated_at?: string; user_id?: string | null }
        Update: { created_at?: string; data_start_row?: number; display_name?: string | null; format_type?: string; header_row?: number; id?: string; is_active?: boolean; last_row_synced?: number | null; last_synced_at?: string | null; notes?: string | null; sheet_name?: string; spreadsheet_id?: string; sync_type?: string; updated_at?: string; user_id?: string | null }
        Relationships: []
      }
      sheets_sync_log: {
        Row: { config_id: string; error_message: string | null; id: string; rows_inserted: number; rows_processed: number; rows_skipped: number; rows_updated: number; status: string; synced_at: string }
        Insert: { config_id: string; error_message?: string | null; id?: string; rows_inserted?: number; rows_processed?: number; rows_skipped?: number; rows_updated?: number; status?: string; synced_at?: string }
        Update: { config_id?: string; error_message?: string | null; id?: string; rows_inserted?: number; rows_processed?: number; rows_skipped?: number; rows_updated?: number; status?: string; synced_at?: string }
        Relationships: []
      }
      transaction_categories: {
        Row: { category_type: string; code: string; created_at: string; group_gasto: string | null; is_active: boolean; is_passive_income: boolean; is_survival_expense: boolean; name: string; parent_code: string | null; sort_order: number | null }
        Insert: { category_type: string; code: string; created_at?: string; group_gasto?: string | null; is_active?: boolean; is_passive_income?: boolean; is_survival_expense?: boolean; name: string; parent_code?: string | null; sort_order?: number | null }
        Update: { category_type?: string; code?: string; created_at?: string; group_gasto?: string | null; is_active?: boolean; is_passive_income?: boolean; is_survival_expense?: boolean; name?: string; parent_code?: string | null; sort_order?: number | null }
        Relationships: []
      }
      transactions: {
        Row: { account_id: string | null; amount: number | null; amount_usd: number | null; balance_after_cash: number | null; balance_after_debit: number | null; balance_total: number | null; category_code: string | null; concept: string | null; created_at: string; currency_code: string; date: string | null; day: number | null; detail: string | null; exchange_rate_used: number | null; expense_group: string | null; external_id: string | null; id: string; is_passive_income: boolean; is_settlement: boolean; is_survival_expense: boolean; month: number | null; movement_type: string | null; notes: string | null; period_cut: string | null; raw_label: string | null; source: string; updated_at: string; user_id: string | null; vendor: string | null; weekday: number | null; year: number | null }
        Insert: { account_id?: string | null; amount?: number | null; category_code?: string | null; concept?: string | null; created_at?: string; currency_code?: string; date?: string | null; expense_group?: string | null; external_id?: string | null; id?: string; is_passive_income?: boolean; is_settlement?: boolean; is_survival_expense?: boolean; movement_type?: string | null; notes?: string | null; source?: string; updated_at?: string; user_id?: string | null; vendor?: string | null }
        Update: { account_id?: string | null; amount?: number | null; category_code?: string | null; concept?: string | null; created_at?: string; currency_code?: string; date?: string | null; expense_group?: string | null; external_id?: string | null; id?: string; movement_type?: string | null; notes?: string | null; user_id?: string | null; vendor?: string | null }
        Relationships: []
      }
      user_profiles: {
        Row: { created_at: string; display_name: string | null; main_currency: string; monthly_income: number | null; onboarding_done: boolean; savings_goal_pct: number; updated_at: string; user_id: string }
        Insert: { created_at?: string; display_name?: string | null; main_currency?: string; monthly_income?: number | null; onboarding_done?: boolean; savings_goal_pct?: number; updated_at?: string; user_id: string }
        Update: { created_at?: string; display_name?: string | null; main_currency?: string; monthly_income?: number | null; onboarding_done?: boolean; savings_goal_pct?: number; updated_at?: string; user_id?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> =
  (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never

export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]

export const Constants = { public: { Enums: {} } } as const
