// Category inference for transactions with null category_code.
// Applied client-side so no DB round-trip needed.
// Patterns derived from real transaction data analysis.

export const SAVINGS_EXPENSE_GROUP = 'objetivos_financieros'

/**
 * Identifies loan/mortgage payments within objetivos_financieros.
 * Loan payments ARE liquidity outflows (they reduce a debt balance),
 * unlike savings deposits which just move money between buckets.
 */
export function isLoanPayment(
  vendor: string | null,
  concept: string | null,
  categoryCode: string | null,
): boolean {
  if (categoryCode && /LOAN|PRESTAM/i.test(categoryCode)) return true
  const t = `${vendor ?? ''} ${concept ?? ''}`.toLowerCase()
  return /pago\s*(extraordinario\s*)?pr[eé]stamo|cuota\s*(de\s*)?pr[eé]stamo|pr[eé]stamo\s*hipotecari|pr[eé]stamo\s*prendari|abono\s*pr[eé]stamo|pago\s*hipotecari|amortizaci[oó]n/i.test(t)
}

/** Returns a raw category key for a transaction. */
export function inferCategory(
  vendor: string | null,
  concept: string | null,
  categoryCode: string | null,
): string {
  if (categoryCode) return categoryCode

  const v = (vendor ?? '').toLowerCase().trim()
  const c = (concept ?? '').toLowerCase().trim()
  const t = `${v} ${c}`

  // ── Ingresos ────────────────────────────────────────────────────────────────
  if (/rendimiento|dividend|inter[eé]s\s*(recibido|ganado|de\s*fondo)|farming|staking/i.test(c)
    || /rendimiento|farming|meteora|multimoney|dominion|transcomer/i.test(v)) return 'INVESTMENT_RETURN'
  if (/liquidaci[oó]n\s*(rendimiento|fondo|crypto|farming)/i.test(c)) return 'INVESTMENT_RETURN'
  if (/excedente[s]?\s*(de\s*)?ahorr|pago\s*de\s*excedente/i.test(c)) return 'INVESTMENT_RETURN'
  if (/retiro\s*(fcl|fondo\s*capitalizaci)/i.test(c)) return 'WORK_PAYMENTS'
  if (/millas|puntos\s*(de\s*)?banco|cashback|bonificaci[oó]n\s*banco/i.test(c)) return 'BANK_FEE'
  if (/salario|sueldo/i.test(c)) return 'SALARY'
  if (/aguinaldo/i.test(c)) return 'AGUINALDO'
  if (/alquiler\s*ingreso|ingreso\s*alquiler|renta\s*mensual/i.test(c)) return 'RENTAL_INCOME'

  // ── Abarrotes (tiendas locales, mercado) — concepto-level, solo cuando category_code es null
  if (/^abarrotes/i.test(c)) return 'FOOD_ABARROTES'

  // ── Supermercado (cadenas grandes) ────────────────────────────────────────────
  if (/automercado|auto\s*mercado|pricesmart|price\s*smart|walmart|pali\b|palí|mas\s*x\s*menos|masxmenos|maxi\s*pali|buen\s*precio|perimercado|fresh\s*market|passyflory|am\s*pm|vila\s*market|carnicer[ií]a\s*la\s*tica|super\s*mas|hipermercado|jumbo/i.test(v)) return 'FOOD_SUPER'

  // ── Restaurantes ─────────────────────────────────────────────────────────────
  if (/restaurante|soda\b|pizza|burger|kfc|mcdonalds|subway|wendys|pollo\s*camp|taco|denny|cafeter[ií]a|almuerzo|cena\b|desayuno|fritanga|comida\s*fuera|domicilio|delivery\s*comida|rappi|pedidos\s*ya/i.test(t)) return 'FOOD_OUT'

  // ── Manutención / Pensión alimenticia ────────────────────────────────────────
  if (/poder\s*judicial/i.test(v) || /manutenci[oó]n|pensi[oó]n\s*alimenticia/i.test(c)) return 'CHILD_SUPPORT'

  // ── Educación ─────────────────────────────────────────────────────────────────
  if (/caspari|samagu|cpcecr|boreal/i.test(v)
    || /mensualidad\s*kinder|mensualidad\s*colegio|mensualidad\s*escuela|matr[ií]cula|colegio\s*c\.e\.|pago\s*colegio|danza/i.test(c)) return 'EDUCATION'
  if (/universidad|curso|libros|educaci[oó]n|carn[eé]\s*estu/i.test(c)) return 'EDUCATION'

  // ── Combustible ───────────────────────────────────────────────────────────────
  if (/servicentro|gasolinera|delta\b/i.test(v) || /gasolina|combustible|diesel/i.test(c)) return 'TRANSPORT_FUEL'

  // ── Parqueo ───────────────────────────────────────────────────────────────────
  if (/parqueo|estacionamiento|parking/i.test(c)) return 'TRANSPORT_PARKING'

  // ── Transporte ───────────────────────────────────────────────────────────────
  if (/uber\b/i.test(v) || /\buber\b/i.test(c)) return 'TRANSPORT'
  if (/didi|taxi|autobus|buses|tren\s*el[eé]ctr|transporte\s*p[uú]blico|jepe/i.test(t)) return 'TRANSPORT'

  // ── Suscripciones ────────────────────────────────────────────────────────────
  if (/netflix|spotify|microsoft|office\s*365|amazon\s*prime|disney\+|apple\s*one|youtube\s*premium|hbo|paramount|suscripci/i.test(t)) return 'ENTERTAINMENT_SUBS'

  // ── Gym / Deporte ─────────────────────────────────────────────────────────────
  if (/crossbox|crossfit|gym\b|gimnasio|fitness|yoga/i.test(v)
    || /mensualidad\s*gimnasio|gym\b|gimnasio/i.test(c)) return 'HEALTH_GYM'

  // ── Salud ─────────────────────────────────────────────────────────────────────
  if (/blue\s*medical|cl[ií]nica|orthodental|opticas?\s*vision|laboratorio|dental/i.test(v)) return 'HEALTH'
  if (/gnc\b/i.test(v) || /suplemento|vitamina/i.test(c)) return 'HEALTH'
  if (/farmacia|m[eé]dico|salud|receta|seguro\s*m[eé]dic|doctor|ciruj|optometr/i.test(c)) return 'HEALTH'

  // ── Seguros ───────────────────────────────────────────────────────────────────
  if (/panamerican\b/i.test(v) || /seguro\s*(de\s*)?(vida|m[eé]dic|tarjeta|hogar|auto|veh[ií]culo)|nacional\s*de\s*seguros/i.test(t)) return 'INSURANCE'

  // ── Comisiones bancarias ──────────────────────────────────────────────────────
  if (/comisi[oó]n|comisiones/i.test(c) && /bac|bncr|bcr|banco|popular/i.test(v)) return 'BANK_FEE'

  // ── Servicios públicos ────────────────────────────────────────────────────────
  if (/kolbi\b/i.test(v) || /pago\s*de?\s*celular|celular\s*kolbi/i.test(c)) return 'SERVICES_PHONE'
  if (/electricidad|cne\b|ice\b|aya\b|acueducto|agua\b|internet\b|claro\b|movistar|tel[eé]fono|cable\b|fibra\s*[oó]ptic/i.test(t)) return 'SERVICES'

  // ── Hogar ────────────────────────────────────────────────────────────────────
  if (/limpieza\s*de\s*casa|servicio\s*dom[eé]stico|empleada|sita\b/i.test(c)) return 'HOME_SERVICE'
  if (/ferreteri[ao]|home\s*depot|materiales|construcci|muebles|electrodom/i.test(t)) return 'HOME'

  // ── Pensión voluntaria ────────────────────────────────────────────────────────
  if (/pensi[oó]n\s*voluntaria|fondo\s*de\s*pensiones|r[eé]gimen\s*de\s*pensi[oó]n|opv\b/i.test(c)) return 'SAVINGS_PENSION'

  // ── Préstamos (para los que caen fuera de objetivos_financieros) ─────────────
  if (/pr[eé]stamo|hipotecario|prendario|cuota\s*pr[eé]st|cr[eé]dito\s*hipot/i.test(c)) return 'LOAN_PAYMENT'

  // ── Criptomonedas ─────────────────────────────────────────────────────────────
  if (/binance|crypto\.com|coinbase/i.test(v) || /cripto|bitcoin|ethereum|blockchain|defi|token\b/i.test(c)) return 'CRYPTO'
  if (/p[eé]rdida\s*valor\s*cript|aumento\s*valor\s*cript/i.test(c)) return 'CRYPTO'

  // ── Inversiones / Fondos ─────────────────────────────────────────────────────
  if (/fondo\s*de\s*inversi[oó]n|fondo\s*inversion|inversi[oó]n|multimoney|dominion|transcomer/i.test(t)) return 'SAVINGS_INVESTMENT'
  if (/ahorr/i.test(c)) return 'SAVINGS'

  // ── Entretenimiento / Viajes ──────────────────────────────────────────────────
  if (/hotel|airbnb|hospedaje|vuelo\b|aerol[ií]nea|booking\.|expedia/i.test(t)) return 'SAVINGS_TRAVEL'
  if (/cine|teatro|concierto|boliche|parque\s*acu[aá]tic|evento\b|boleta|entrada\b/i.test(t)) return 'ENTERTAINMENT_EVENTS'

  // ── Ropa ─────────────────────────────────────────────────────────────────────
  if (/ropa|zapatos|calzado|zara|h&m|primark|forever\s*21|moda\b/i.test(t)) return 'CLOTHING'

  // ── Compras online ────────────────────────────────────────────────────────────
  if (/amazon\.com|alibaba|ebay|mercado\s*libre|aliexpress|shein/i.test(t)) return 'ONLINE_SHOPPING'

  // ── Mascotas ──────────────────────────────────────────────────────────────────
  if (/mascota|veterinari|petco|petland|alimento\s*perr|alimento\s*gat/i.test(t)) return 'PETS'

  // ── Belleza / Cuidado personal ────────────────────────────────────────────────
  if (/peluquer[ií]a|barber[ií]a|belleza|sal[oó]n|manicure|pedicure|spa\b/i.test(t)) return 'PERSONAL_CARE'

  // ── Donaciones / Regalos ──────────────────────────────────────────────────────
  if (/donaci[oó]n|donativo|regalo\s*a\b/i.test(c)) return 'GIFTS'

  // ── Impuestos ─────────────────────────────────────────────────────────────────
  if (/impuesto|tributaci[oó]n\s*directa|hacienda/i.test(c)) return 'TAXES'

  // ── Transferencias / Efectivo ─────────────────────────────────────────────────
  if (/sinpe\s*m[oó]vil|sinpe\s*movil|transfer|traspaso/i.test(t)) return 'TRANSFER'
  if (/retiro\s*de?\s*efectivo|cajero|atm\b/i.test(t)) return 'CASH_WITHDRAWAL'

  return 'Otros'
}

/** Maps a category code to a friendly display name. */
export function displayCategory(raw: string): string {
  const MAP: Record<string, string> = {
    // Income
    SALARY:               'Salario',
    AGUINALDO:            'Aguinaldo',
    RENTAL_INCOME:        'Alquiler ingreso',
    INCOME:               'Ingresos varios',
    PASSIVE_INCOME:       'Ingreso pasivo',
    INVESTMENT_RETURN:    'Rendimientos',
    WORK_PAYMENTS:        'Trabajo independiente',
    BONO:                 'Bono',
    // Savings / investment
    SAVINGS:              'Ahorros',
    SAVINGS_INVESTMENT:   'Fondos de inversión',
    SAVINGS_TRAVEL:       'Viajes / vacaciones',
    SAVINGS_PENSION:      'Pensión voluntaria',
    CRYPTO:               'Criptomonedas',
    LOAN_PAYMENT:         'Préstamos',
    LOANS:                'Préstamos',
    INTEREST:             'Intereses',
    // Food
    FOOD_SUPER:           'Supermercado',
    FOOD_ABARROTES:       'Abarrotes',
    FOOD_OUT:             'Restaurantes',
    ENTERTAINMENT_DINING: 'Café / social',
    // Transport
    TRANSPORT:            'Transporte',
    TRANSPORT_FUEL:       'Combustible',
    TRANSPORT_PARKING:    'Parqueo',
    TRANSPORT_MAINT:      'Mantenimiento vehículo',
    CAR_EXPENSES:         'Gastos de vehículo',
    // Health
    HEALTH:               'Salud',
    HEALTH_CONSULT:       'Consulta médica',
    HEALTH_MEDS:          'Farmacia',
    HEALTH_GYM:           'Gym / deporte',
    HEALTH_DENTAL:        'Dental',
    // Housing
    HOME:                 'Hogar',
    HOME_SERVICE:         'Limpieza / doméstico',
    HOME_RENO:            'Remodelación',
    RENT_SERVICE:         'Alquiler / condominio',
    SERVICES:             'Servicios públicos',
    SERVICES_ELECTRIC:    'Electricidad',
    SERVICES_WATER:       'Agua',
    SERVICES_INTERNET:    'Internet',
    SERVICES_PHONE:       'Teléfono / celular',
    SERVICES_STREAMING:   'Cable / streaming',
    // Entertainment
    ENTERTAINMENT_SUBS:   'Suscripciones',
    ENTERTAINMENT_EVENTS: 'Entretenimiento',
    ENTERTAINMENT:        'Entretenimiento',
    // Education / family
    EDUCATION:            'Educación',
    CHILD_SUPPORT:        'Manutención',
    // Financial
    INSURANCE:            'Seguros',
    INSURANCE_HEALTH:     'Seguro médico',
    INSURANCE_LIFE:       'Seguro de vida',
    BANK_FEE:             'Comisiones bancarias',
    TAXES:                'Impuestos',
    DEPOSIT_DEBIT:        'Depósito/débito',
    // Personal
    CLOTHING:             'Ropa y calzado',
    PERSONAL_CARE:        'Cuidado personal',
    PETS:                 'Mascotas',
    GIFTS:                'Donaciones y regalos',
    ONLINE_SHOPPING:      'Compras online',
    MISC_EXPENSE:         'Varios',
    // Movements
    TRANSFER:             'Transferencias',
    CASH_WITHDRAWAL:      'Efectivo',
  }
  return MAP[raw] ?? raw
}

/**
 * Accounting layer: contable vs conceptual classification.
 *
 * Contable  = what actually flows through the bank account
 * Conceptual = what it means economically
 *
 * Examples:
 *   Liquidación (is_settlement=true):  contable=ingreso a liquidez, conceptual=NO es ingreso
 *   Rendimientos (is_passive_income):  contable=ingreso, conceptual=ingreso pasivo (no activo)
 *   Depósito a fondo:                  contable=egreso, conceptual=movimiento entre buckets
 *   Pago préstamo:                     contable=egreso, conceptual=reducción de pasivo
 */
export type AccountingType =
  | 'active_income'      // salary, freelance, rental — real earned income
  | 'passive_income'     // investment returns, dividends — real but passive
  | 'settlement_inflow'  // liquidación: accounting inflow only, NOT conceptual income
  | 'survival_expense'   // non-negotiable fixed costs (housing, food, utilities)
  | 'liquidity_expense'  // discretionary real spending
  | 'loan_payment'       // reduces a debt balance — real outflow
  | 'savings_outflow'    // money entering savings/investment buckets (not a "gasto")
  | 'crypto_valuation'   // unrealized gain/loss — not a cash movement
  | 'other'

export function classifyAccounting(tx: {
  movement_type: string | null
  expense_group: string | null
  category_code: string | null
  vendor: string | null
  concept: string | null
  is_settlement: boolean
  is_passive_income?: boolean
  is_survival_expense?: boolean
}): AccountingType {
  const { movement_type, expense_group, is_settlement, is_passive_income, is_survival_expense } = tx

  // Crypto valuation entries (no movement_type) — conceptual only
  if (!movement_type) {
    const c = (tx.concept ?? '').toLowerCase()
    if (/p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/.test(c)) return 'crypto_valuation'
    return 'other'
  }

  if (movement_type === 'income') {
    if (is_settlement) return 'settlement_inflow'
    if (is_passive_income) return 'passive_income'
    return 'active_income'
  }

  if (movement_type === 'expense' || movement_type === 'cash_withdrawal') {
    if (expense_group === SAVINGS_EXPENSE_GROUP) {
      if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return 'loan_payment'
      return 'savings_outflow'
    }
    if (is_survival_expense) return 'survival_expense'
    return 'liquidity_expense'
  }

  return 'other'
}
