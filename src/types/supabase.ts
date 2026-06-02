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
        Relationships: [
          {
            foreignKeyName: "account_balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          source_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          source_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          source_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_source_code_fkey"
            columns: ["source_code"]
            isOneToOne: false
            referencedRelation: "payment_sources"
            referencedColumns: ["code"]
          },
        ]
      }
      asset_value_history: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          notes: string | null
          snapshot_date: string
          user_id: string
          value_crc: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_date: string
          user_id: string
          value_crc: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_date?: string
          user_id?: string
          value_crc?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_value_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          as_of_date: string
          asset_type: string
          created_at: string
          id: string
          is_active: boolean
          is_investable: boolean
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
          user_id: string
          value_crc: number
        }
        Insert: {
          as_of_date: string
          asset_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_investable?: boolean
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
          value_crc: number
        }
        Update: {
          as_of_date?: string
          asset_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_investable?: boolean
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
          value_crc?: number
        }
        Relationships: []
      }
      bonus_plan_items: {
        Row: {
          actual_amount: number | null
          bonus_plan_id: string
          category: string
          completion_pct: number | null
          created_at: string
          currency_code: string
          id: string
          is_completed: boolean
          item_name: string
          notes: string | null
          planned_amount: number
        }
        Insert: {
          actual_amount?: number | null
          bonus_plan_id: string
          category: string
          completion_pct?: number | null
          created_at?: string
          currency_code: string
          id?: string
          is_completed?: boolean
          item_name: string
          notes?: string | null
          planned_amount?: number
        }
        Update: {
          actual_amount?: number | null
          bonus_plan_id?: string
          category?: string
          completion_pct?: number | null
          created_at?: string
          currency_code?: string
          id?: string
          is_completed?: boolean
          item_name?: string
          notes?: string | null
          planned_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonus_plan_items_bonus_plan_id_fkey"
            columns: ["bonus_plan_id"]
            isOneToOne: false
            referencedRelation: "bonus_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_plan_items_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      bonus_plans: {
        Row: {
          actual_total: number | null
          bonus_type: string
          created_at: string
          currency_code: string
          exchange_rate_tc: number | null
          id: string
          notes: string | null
          planned_total: number | null
          status: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          actual_total?: number | null
          bonus_type: string
          created_at?: string
          currency_code: string
          exchange_rate_tc?: number | null
          id?: string
          notes?: string | null
          planned_total?: number | null
          status?: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          actual_total?: number | null
          bonus_type?: string
          created_at?: string
          currency_code?: string
          exchange_rate_tc?: number | null
          id?: string
          notes?: string | null
          planned_total?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonus_plans_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      budget_lines: {
        Row: {
          actual_amount: number | null
          actual_currency: string | null
          budget_period_id: string
          category_code: string | null
          created_at: string
          id: string
          is_completed: boolean
          item_name: string | null
          notes: string | null
          planned_amount: number
          planned_currency: string
          q1_amount: number | null
          q2_amount: number | null
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          actual_currency?: string | null
          budget_period_id: string
          category_code?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          item_name?: string | null
          notes?: string | null
          planned_amount?: number
          planned_currency: string
          q1_amount?: number | null
          q2_amount?: number | null
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          actual_currency?: string | null
          budget_period_id?: string
          category_code?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          item_name?: string | null
          notes?: string | null
          planned_amount?: number
          planned_currency?: string
          q1_amount?: number | null
          q2_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_actual_currency_fkey"
            columns: ["actual_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "budget_lines_budget_period_id_fkey"
            columns: ["budget_period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "budget_lines_planned_currency_fkey"
            columns: ["planned_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      budget_periods: {
        Row: {
          created_at: string
          end_date: string
          exchange_rate_tc: number | null
          id: string
          name: string
          notes: string | null
          period_type: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          exchange_rate_tc?: number | null
          id?: string
          name: string
          notes?: string | null
          period_type: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          exchange_rate_tc?: number | null
          id?: string
          name?: string
          notes?: string | null
          period_type?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          category: string
          created_at: string
          effective_from: string
          id: string
          is_active: boolean
          monthly_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          monthly_limit: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          monthly_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      envelope_movements: {
        Row: {
          amount: number
          created_at: string | null
          date: string
          envelope_id: string
          id: string
          movement_type: string
          notes: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          date: string
          envelope_id: string
          id?: string
          movement_type: string
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          date?: string
          envelope_id?: string
          id?: string
          movement_type?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "envelope_movements_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "savings_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          from_currency: string
          id: string
          rate: number
          rate_date: string
          source: string | null
          to_currency: string
        }
        Insert: {
          created_at?: string
          from_currency: string
          id?: string
          rate: number
          rate_date: string
          source?: string | null
          to_currency: string
        }
        Update: {
          created_at?: string
          from_currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string | null
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rates_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_type: string
          bank_name: string | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          bank_name?: string | null
          created_at?: string
          currency_code: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          bank_name?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          expected_return: number | null
          goal_type: string
          id: string
          is_active: boolean
          linked_bucket_id: string | null
          linked_envelope_id: string | null
          name: string
          sort_order: number
          target_amount_crc: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_return?: number | null
          goal_type: string
          id?: string
          is_active?: boolean
          linked_bucket_id?: string | null
          linked_envelope_id?: string | null
          name: string
          sort_order?: number
          target_amount_crc: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expected_return?: number | null
          goal_type?: string
          id?: string
          is_active?: boolean
          linked_bucket_id?: string | null
          linked_envelope_id?: string | null
          name?: string
          sort_order?: number
          target_amount_crc?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_linked_bucket_id_fkey"
            columns: ["linked_bucket_id"]
            isOneToOne: false
            referencedRelation: "user_investment_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_linked_envelope_id_fkey"
            columns: ["linked_envelope_id"]
            isOneToOne: false
            referencedRelation: "savings_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_snapshots: {
        Row: {
          amount: number
          bucket_id: string | null
          created_at: string
          currency_code: string
          gains: number | null
          id: string
          notes: string | null
          snapshot_date: string
          user_id: string | null
        }
        Insert: {
          amount: number
          bucket_id?: string | null
          created_at?: string
          currency_code: string
          gains?: number | null
          id?: string
          notes?: string | null
          snapshot_date: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bucket_id?: string | null
          created_at?: string
          currency_code?: string
          gains?: number | null
          id?: string
          notes?: string | null
          snapshot_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_snapshots_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "savings_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_snapshots_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      investment_yield_history: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          exchange_rate: number
          id: string
          invested_usd: number
          product_name: string
          source: string
          user_id: string
          year_month: string
          yield_pct: number
          yield_usd: number
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          exchange_rate?: number
          id?: string
          invested_usd?: number
          product_name: string
          source?: string
          user_id: string
          year_month: string
          yield_pct?: number
          yield_usd?: number
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          exchange_rate?: number
          id?: string
          invested_usd?: number
          product_name?: string
          source?: string
          user_id?: string
          year_month?: string
          yield_pct?: number
          yield_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_yield_history_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "user_investment_buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          as_of_date: string
          created_at: string
          current_balance: number
          id: string
          interest_rate: number | null
          is_active: boolean
          liability_type: string
          name: string
          original_balance: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          current_balance: number
          id?: string
          interest_rate?: number | null
          is_active?: boolean
          liability_type: string
          name: string
          original_balance?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          current_balance?: number
          id?: string
          interest_rate?: number | null
          is_active?: boolean
          liability_type?: string
          name?: string
          original_balance?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      net_worth_items: {
        Row: {
          category: string
          created_at: string
          id: string
          item_name: string
          snapshot_date: string
          sort_order: number
          user_id: string
          value_crc: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          item_name: string
          snapshot_date: string
          sort_order?: number
          user_id: string
          value_crc?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          item_name?: string
          snapshot_date?: string
          sort_order?: number
          user_id?: string
          value_crc?: number
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          created_at: string | null
          id: string
          iliquid_crc: number
          invested_crc: number
          liabilities_crc: number
          liquid_crc: number
          net_worth_crc: number | null
          notes: string | null
          snapshot_date: string
          source: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          iliquid_crc?: number
          invested_crc?: number
          liabilities_crc?: number
          liquid_crc?: number
          net_worth_crc?: number | null
          notes?: string | null
          snapshot_date: string
          source?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          iliquid_crc?: number
          invested_crc?: number
          liabilities_crc?: number
          liquid_crc?: number
          net_worth_crc?: number | null
          notes?: string | null
          snapshot_date?: string
          source?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      network_entries: {
        Row: {
          amount: number
          amount_paid: number
          counterpart_id_num: string | null
          counterpart_name: string
          created_at: string
          currency_code: string
          direction: string
          due_date: string | null
          id: string
          notes: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_paid?: number
          counterpart_id_num?: string | null
          counterpart_name: string
          created_at?: string
          currency_code: string
          direction: string
          due_date?: string | null
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_paid?: number
          counterpart_id_num?: string | null
          counterpart_name?: string
          created_at?: string
          currency_code?: string
          direction?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      network_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          network_entry_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          network_entry_id: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          network_entry_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_payments_network_entry_id_fkey"
            columns: ["network_entry_id"]
            isOneToOne: false
            referencedRelation: "network_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_sources: {
        Row: {
          bank_name: string | null
          code: string
          created_at: string
          is_active: boolean
          name: string
          source_type: string
        }
        Insert: {
          bank_name?: string | null
          code: string
          created_at?: string
          is_active?: boolean
          name: string
          source_type: string
        }
        Update: {
          bank_name?: string | null
          code?: string
          created_at?: string
          is_active?: boolean
          name?: string
          source_type?: string
        }
        Relationships: []
      }
      savings_buckets: {
        Row: {
          bucket_type: string
          created_at: string
          currency_code: string
          current_amount: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          target_amount: number | null
          target_currency: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket_type: string
          created_at?: string
          currency_code: string
          current_amount?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          target_amount?: number | null
          target_currency?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket_type?: string
          created_at?: string
          currency_code?: string
          current_amount?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          target_amount?: number | null
          target_currency?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_buckets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "savings_buckets_target_currency_fkey"
            columns: ["target_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      savings_contributions: {
        Row: {
          amount: number
          bucket_id: string
          created_at: string
          currency_code: string
          date: string
          id: string
          notes: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          bucket_id: string
          created_at?: string
          currency_code: string
          date: string
          id?: string
          notes?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          bucket_id?: string
          created_at?: string
          currency_code?: string
          date?: string
          id?: string
          notes?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_contributions_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "savings_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_contributions_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "savings_contributions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_envelopes: {
        Row: {
          annual_rate: number | null
          color: string | null
          created_at: string | null
          custodio: string
          id: string
          interest_mode: string | null
          is_active: boolean | null
          name: string
          parent_envelope_id: string | null
          sort_order: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          annual_rate?: number | null
          color?: string | null
          created_at?: string | null
          custodio: string
          id?: string
          interest_mode?: string | null
          is_active?: boolean | null
          name: string
          parent_envelope_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          annual_rate?: number | null
          color?: string | null
          created_at?: string | null
          custodio?: string
          id?: string
          interest_mode?: string | null
          is_active?: boolean | null
          name?: string
          parent_envelope_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_envelopes_parent_envelope_id_fkey"
            columns: ["parent_envelope_id"]
            isOneToOne: false
            referencedRelation: "savings_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      self_loan_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          linked_transaction_id: string | null
          notes: string | null
          payment_date: string
          self_loan_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date: string
          self_loan_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          self_loan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_loan_payments_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_loan_payments_self_loan_id_fkey"
            columns: ["self_loan_id"]
            isOneToOne: false
            referencedRelation: "self_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      self_loans: {
        Row: {
          amount_repaid: number
          balance_remaining: number | null
          created_at: string
          currency_code: string
          description: string
          due_date: string | null
          envelope_split: Json | null
          id: string
          linked_transaction_id: string | null
          loan_date: string
          notes: string | null
          original_amount: number
          source_account_id: string
          source_envelope_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_repaid?: number
          balance_remaining?: number | null
          created_at?: string
          currency_code: string
          description: string
          due_date?: string | null
          envelope_split?: Json | null
          id?: string
          linked_transaction_id?: string | null
          loan_date: string
          notes?: string | null
          original_amount: number
          source_account_id: string
          source_envelope_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_repaid?: number
          balance_remaining?: number | null
          created_at?: string
          currency_code?: string
          description?: string
          due_date?: string | null
          envelope_split?: Json | null
          id?: string
          linked_transaction_id?: string | null
          loan_date?: string
          notes?: string | null
          original_amount?: number
          source_account_id?: string
          source_envelope_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_loans_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "self_loans_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_loans_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_loans_source_envelope_id_fkey"
            columns: ["source_envelope_id"]
            isOneToOne: false
            referencedRelation: "savings_envelopes"
            referencedColumns: ["id"]
          },
        ]
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
      sheets_sync_log: {
        Row: {
          config_id: string
          error_message: string | null
          id: string
          rows_inserted: number
          rows_processed: number
          rows_skipped: number
          rows_updated: number
          status: string
          synced_at: string
        }
        Insert: {
          config_id: string
          error_message?: string | null
          id?: string
          rows_inserted?: number
          rows_processed?: number
          rows_skipped?: number
          rows_updated?: number
          status?: string
          synced_at?: string
        }
        Update: {
          config_id?: string
          error_message?: string | null
          id?: string
          rows_inserted?: number
          rows_processed?: number
          rows_skipped?: number
          rows_updated?: number
          status?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheets_sync_log_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "sheets_sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_categories: {
        Row: {
          category_type: string
          code: string
          created_at: string
          group_gasto: string | null
          is_active: boolean
          is_passive_income: boolean
          is_settlement: boolean
          is_survival_expense: boolean
          name: string
          parent_code: string | null
          sort_order: number | null
        }
        Insert: {
          category_type: string
          code: string
          created_at?: string
          group_gasto?: string | null
          is_active?: boolean
          is_passive_income?: boolean
          is_settlement?: boolean
          is_survival_expense?: boolean
          name: string
          parent_code?: string | null
          sort_order?: number | null
        }
        Update: {
          category_type?: string
          code?: string
          created_at?: string
          group_gasto?: string | null
          is_active?: boolean
          is_passive_income?: boolean
          is_settlement?: boolean
          is_survival_expense?: boolean
          name?: string
          parent_code?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_categories_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["code"]
          },
        ]
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
          investment_bucket_id: string | null
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
          investment_bucket_id?: string | null
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
          investment_bucket_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_investment_bucket_id_fkey"
            columns: ["investment_bucket_id"]
            isOneToOne: false
            referencedRelation: "user_investment_buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_financial_config: {
        Row: {
          allocation_targets: Json | null
          created_at: string
          fcf_target_ratio: number
          fire_date_slip_alert_months: number
          fire_expected_return: number
          fire_inflation_rate: number
          fire_target_monthly_exp: number | null
          fire_withdrawal_rate: number
          goal_funding_alert_ratio: number
          preferred_currency: string | null
          runway_green_months: number
          runway_yellow_months: number
          savings_rate_green: number
          savings_rate_yellow: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_targets?: Json | null
          created_at?: string
          fcf_target_ratio?: number
          fire_date_slip_alert_months?: number
          fire_expected_return?: number
          fire_inflation_rate?: number
          fire_target_monthly_exp?: number | null
          fire_withdrawal_rate?: number
          goal_funding_alert_ratio?: number
          preferred_currency?: string | null
          runway_green_months?: number
          runway_yellow_months?: number
          savings_rate_green?: number
          savings_rate_yellow?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_targets?: Json | null
          created_at?: string
          fcf_target_ratio?: number
          fire_date_slip_alert_months?: number
          fire_expected_return?: number
          fire_inflation_rate?: number
          fire_target_monthly_exp?: number | null
          fire_withdrawal_rate?: number
          goal_funding_alert_ratio?: number
          preferred_currency?: string | null
          runway_green_months?: number
          runway_yellow_months?: number
          savings_rate_green?: number
          savings_rate_yellow?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_investment_buckets: {
        Row: {
          account_id: string | null
          bucket_type: string
          color: string | null
          concept_map: Json | null
          created_at: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
          user_id: string
          vendors: string[] | null
        }
        Insert: {
          account_id?: string | null
          bucket_type: string
          color?: string | null
          concept_map?: Json | null
          created_at?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
          user_id: string
          vendors?: string[] | null
        }
        Update: {
          account_id?: string | null
          bucket_type?: string
          color?: string | null
          concept_map?: Json | null
          created_at?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string
          vendors?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "user_investment_buckets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          main_currency: string
          monthly_income: number | null
          onboarding_done: boolean
          savings_goal_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          main_currency?: string
          monthly_income?: number | null
          onboarding_done?: boolean
          savings_goal_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          main_currency?: string
          monthly_income?: number | null
          onboarding_done?: boolean
          savings_goal_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_transactions:
        | {
            Args: { p_start_date?: string }
            Returns: {
              amount: number
              category_code: string
              concept: string
              date: string
              expense_group: string
              is_passive_income: boolean
              is_settlement: boolean
              is_survival_expense: boolean
              movement_type: string
              vendor: string
            }[]
          }
        | {
            Args: { p_start_date?: string; p_user_id: string }
            Returns: {
              amount: number
              category_code: string
              concept: string
              date: string
              expense_group: string
              is_passive_income: boolean
              is_settlement: boolean
              is_survival_expense: boolean
              movement_type: string
              vendor: string
            }[]
          }
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
