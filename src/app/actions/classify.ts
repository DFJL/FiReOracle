'use server'

import Anthropic from '@anthropic-ai/sdk'

const VALID_CODES = [
  'SALARY', 'AGUINALDO', 'WORK_PAYMENTS', 'INCOME_MISC',
  'RENTAL_INCOME', 'PASSIVE_INTEREST', 'PASSIVE_FUND', 'PASSIVE_CRYPTO',
  'VALUATION_GAIN', 'VALUATION_LOSS',
  'FOOD_OUT', 'FOOD_SUPER', 'TRANSPORT', 'CAR', 'CAR_PURCHASE',
  'MARIAM', 'EMMA', 'SITA',
  'HOUSEHOLD', 'SERVICES_UTIL', 'SERVICES_HOME', 'SERVICES_MISC',
  'HOME_RENO', 'HOME_FURNITURE', 'HOME_MAINT',
  'HEALTH', 'INSURANCE',
  'ENTERTAINMENT', 'TRAVEL', 'SUBSCRIPTIONS',
  'CLOTHING', 'PERSONAL_CARE', 'EDUCATION', 'WORK_EXPENSES',
  'GIFTS', 'TAXES', 'BANK_FEE', 'INTEREST_EXP', 'TECH',
  'LOAN_PAYMENT',
  'SAVINGS_FUND', 'SAVINGS_CRYPTO', 'SAVINGS_PENSION', 'SAVINGS_GENERAL',
  'INVESTMENT', 'REAL_ESTATE', 'RENTAL_EXPENSE',
  'MISC',
] as const

type CategoryCode = typeof VALID_CODES[number]

export interface TxToClassify {
  id: string
  vendor: string | null
  concept: string | null
  movement_type: string | null
  expense_group: string | null
}

export type ClassifyResult = Record<string, CategoryCode>

const SYSTEM_PROMPT = `Eres un clasificador de transacciones financieras personales para un usuario costarricense.
Tu tarea es asignar a cada transacción un código de categoría de la lista de códigos válidos.

CÓDIGOS VÁLIDOS (usa EXACTAMENTE estos):
${VALID_CODES.join(', ')}

REGLAS:
- Responde SOLO con JSON: {"id": "CODIGO", ...} — un objeto con los IDs como claves y códigos como valores
- Las entradas con movement_type=income son ingresos; las con expense/cash_withdrawal son gastos
- Entradas con expense_group=objetivos_financieros son ahorros/inversiones (SAVINGS_* o INVESTMENT)
- Texto en español costarricense — "sodas", "pulperías" = FOOD_OUT; supermercados = FOOD_SUPER
- MARIAM, EMMA, SITA son personas específicas de la familia — úsalos solo si aparece el nombre
- Si no estás seguro, usa MISC
- No expliques nada, solo el JSON`

export async function classifyTransactions(txs: TxToClassify[]): Promise<ClassifyResult> {
  if (!txs.length) return {}

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return {}

  const client = new Anthropic({ apiKey })

  // Batch in groups of 50 to stay within token limits
  const results: ClassifyResult = {}
  const BATCH = 50

  for (let i = 0; i < txs.length; i += BATCH) {
    const batch = txs.slice(i, i + BATCH)
    const lines = batch.map(tx =>
      `${tx.id}|${tx.movement_type ?? ''}|${tx.expense_group ?? ''}|${tx.vendor ?? ''}|${tx.concept ?? ''}`
    ).join('\n')

    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Clasifica estas transacciones (formato: id|movement_type|expense_group|vendor|concept):\n\n${lines}`,
        }],
      })

      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>
      for (const [id, code] of Object.entries(parsed)) {
        if (VALID_CODES.includes(code as CategoryCode)) {
          results[id] = code as CategoryCode
        }
      }
    } catch {
      // Skip failed batches — MISC fallback stays in place
    }
  }

  return results
}
