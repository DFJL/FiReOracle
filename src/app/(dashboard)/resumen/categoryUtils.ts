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

/**
 * Returns a canonical category code for a transaction.
 * Priority: categoryCode from DB → concept/vendor patterns.
 * Covers all items in the official catalogue.
 */
export function inferCategory(
  vendor: string | null,
  concept: string | null,
  categoryCode: string | null,
): string {
  if (categoryCode) return categoryCode

  const v = (vendor ?? '').toLowerCase().trim()
  const c = (concept ?? '').toLowerCase().trim()
  const t = `${v} ${c}`

  // ── Valuation ─────────────────────────────────────────────────────────────
  if (/p[eé]rdida\s*valor/i.test(c)) return 'VALUATION_LOSS'
  if (/aumento\s*de?\s*valor|valorizaci[oó]n\s*(positiva)?/i.test(c)) return 'VALUATION_GAIN'

  // ── Passive crypto income ─────────────────────────────────────────────────
  if (/miner[ií]a\s*ethereum|mining\s*eth/i.test(c)) return 'PASSIVE_CRYPTO'
  if (/nodos?\s*crypt|farming\s*crypt|rendimientos?\s*(farming|anchor|juicy|royal|shmining|meatex|nodos?|cript)/i.test(c)) return 'PASSIVE_CRYPTO'
  if (/hodl\s*cript|rendimientos?\s*(hodl|bitcoin|ethereum)/i.test(c)) return 'PASSIVE_CRYPTO'

  // ── Passive fund income ───────────────────────────────────────────────────
  if (/rendimientos?\s*(fondo|transcomer|dominion|multimoney|scotiabank|inversi[oó]n)/i.test(c)) return 'PASSIVE_FUND'
  if (/rendimiento|farming|multimoney|dominion|transcomer/i.test(v)) return 'PASSIVE_FUND'

  // ── Passive interest / savings returns ────────────────────────────────────
  if (/intereses?\s*(de\s*)?(ahorros?|cdp|fondo|coop|asociaci[oó]n|d[oó]lar)/i.test(c)) return 'PASSIVE_INTEREST'
  if (/intereses?\s*(recibido|ganado|pr[eé]stamos?\s*usdt)/i.test(c)) return 'PASSIVE_INTEREST'
  if (/excedentes?\s*(de\s*)?ahorr/i.test(c)) return 'PASSIVE_INTEREST'
  if (/ingreso\s*(netflix|spotify)|alquiler\s*servicio\b/i.test(c)) return 'PASSIVE_INTEREST'

  // ── Rental income ─────────────────────────────────────────────────────────
  if (/alquiler\s*(casa|ingreso|propiedad|mensual)|ingreso\s*alquiler|renta\s*mensual/i.test(c)) return 'RENTAL_INCOME'
  if (/venta\s*de\s*bienes?\s*inmuebles/i.test(c)) return 'RENTAL_INCOME'

  // ── Active income ─────────────────────────────────────────────────────────
  if (/retiro\s*(fcl|fondo\s*capitalizaci)/i.test(c)) return 'WORK_PAYMENTS'
  if (/liquidaci[oó]n\s*laboral/i.test(c)) return 'WORK_PAYMENTS'
  if (/vi[aá]ticos\b|pago\s*vi[aá]ticos/i.test(c)) return 'WORK_PAYMENTS'
  if (/pago\s*de\s*clases?|ingresos?\s*(de\s*)?clases?/i.test(c)) return 'WORK_PAYMENTS'
  if (/pago\s*(de\s*)?excedentes/i.test(c)) return 'WORK_PAYMENTS'
  if (/otros?\s*(pagos?\s*)?laborales/i.test(c)) return 'WORK_PAYMENTS'
  if (/salario|sueldo/i.test(c)) return 'SALARY'
  if (/aguinaldo/i.test(c)) return 'AGUINALDO'
  if (/millas|cashback|bonificaci[oó]n\s*banco/i.test(c)) return 'INCOME_MISC'
  if (/reembolso\s*seguro/i.test(c)) return 'INCOME_MISC'
  if (/subsidio|regalo\s*(de|recibido)/i.test(c)) return 'INCOME_MISC'
  if (/ingreso\s*no\s*identificado/i.test(c)) return 'INCOME_MISC'

  // ── Savings / investment (objetivos_financieros) ──────────────────────────
  if (/apertura\s*fondo|fondo\s*de\s*inversi[oó]n|inversi[oó]n\s*(fondo|transcomer|dominion|scotiabank|d[oó]lar)/i.test(c)) return 'SAVINGS_FUND'
  if (/compra\s*(de\s*)?bitcoins?|compra\s*cripto|compra\s*ethereum/i.test(c)) return 'SAVINGS_CRYPTO'
  if (/inversi[oó]n\s*(anchor|juicy|royal|shmining|meatex|nodos?)/i.test(c)) return 'SAVINGS_CRYPTO'
  if (/inversi[oó]n\s*(emprendimiento|startup|empresa)/i.test(c)) return 'INVESTMENT'
  if (/compra\s*bienes?\s*inmuebles/i.test(c)) return 'REAL_ESTATE'
  if (/gastos?\s*(de\s*)?casa\s*(de\s*)?alquiler|gastos?\s*propiedad/i.test(c)) return 'RENTAL_EXPENSE'
  if (/r[eé]gimen\s*de\s*pensi[oó]n|pensi[oó]n\s*voluntaria|opv\b/i.test(c)) return 'SAVINGS_PENSION'
  if (/ahorro\s*(bac|personal|coopeande|asociaci[oó]n)|ahorre\s*su\s*vuelto|apertura\s*(cdp|ahorros?)/i.test(c)) return 'SAVINGS_GENERAL'
  if (/^ahorro\b/i.test(c)) return 'SAVINGS_GENERAL'

  // ── Education (before generic patterns) ───────────────────────────────────
  if (/pago\s*(de\s*)?libros?|pago\s*mensualidad\s*clases?|mensualidad\s*clases?/i.test(c)) return 'EDUCATION'
  if (/^libro\b/i.test(c)) return 'EDUCATION'

  // ── Food ──────────────────────────────────────────────────────────────────
  if (/^abarrotes/i.test(c)) return 'FOOD_SUPER'
  if (/automercado|auto\s*mercado|pricesmart|walmart|pali\b|mas\s*x\s*menos|maxi\s*pali|buen\s*precio|perimercado|fresh\s*market|super\s*mas|jumbo|hipermercado|passyflory/i.test(v)) return 'FOOD_SUPER'
  if (/restaurante|soda\b|pizza|burger|kfc|mcdonalds|subway|wendys|pollo\s*camp|taco|denny|cafeter[ií]a|almuerzo|cena\b|desayuno|fritanga|domicilio|rappi|pedidos\s*ya/i.test(t)) return 'FOOD_OUT'
  if (/\bcaf[eé]\b/i.test(c)) return 'FOOD_OUT'
  if (/am\s*pm\b/i.test(v)) return 'FOOD_OUT'

  // ── Transport ─────────────────────────────────────────────────────────────
  if (/uber\b/i.test(v) || /\buber\b/i.test(c)) return 'TRANSPORT'
  if (/didi|taxi|autobus|buses|tren\s*el[eé]ctr|transporte\s*p[uú]blico|buseta/i.test(t)) return 'TRANSPORT'
  if (/gasolina|combustible|diesel/i.test(c) || /servicentro|gasolinera|delta\b/i.test(v)) return 'CAR'
  if (/parqueo|estacionamiento|parking/i.test(c)) return 'CAR'
  if (/lavado\s*de\s*carro|marchamo|revisi[oó]n\s*carro|mantenimiento\s*carro|otros?\s*gastos?\s*(de\s*)?carro|alquiler\s*de\s*carro/i.test(c)) return 'CAR'
  if (/compra\s*de\s*autom[oó]vil|compra\s*carro/i.test(c)) return 'CAR_PURCHASE'

  // ── Family ────────────────────────────────────────────────────────────────
  if (/mariam|pa[ñn]ales|pañales|toallas\s*mariam|pediatra|vacunas?|leche\s*mariam|ropa\s*mariam|cuido\s*mariam|dentista\s*mariam|kinder|buseta\s*mariam|danza\s*mariam/i.test(c)) return 'MARIAM'
  if (/manutenci[oó]n\s*emma|pensi[oó]n.*emma|\bemma\b/i.test(c) || /poder\s*judicial/i.test(v)) return 'EMMA'
  if (/pago\s*sita|\bsita\b|ginec[oó]logo|dentista\s*sita/i.test(c)) return 'SITA'

  // ── Household ─────────────────────────────────────────────────────────────
  if (/art[ií]culos?\s*(de\s*)?(limpieza|casa|cuidado\s*personal)|jab[oó]n\s*de\s*ropa|pasta\s*de\s*dientes|útiles?\s*varios/i.test(c)) return 'HOUSEHOLD'

  // ── Services ─────────────────────────────────────────────────────────────
  if (/electricidad|cne\b|ice\b|pago\s*electricidad/i.test(t)) return 'SERVICES_UTIL'
  if (/aya\b|acueducto|pago\s*agua/i.test(t)) return 'SERVICES_UTIL'
  if (/kolbi\b/i.test(v) || /pago\s*(de?\s*)?celular|pago\s*tel[eé]fono|celular\s*kolbi/i.test(c)) return 'SERVICES_UTIL'
  if (/internet\b|claro\b|movistar|fibra\s*[oó]ptic|pago\s*internet/i.test(t)) return 'SERVICES_UTIL'
  if (/cable\b|pago\s*cable/i.test(c)) return 'SERVICES_UTIL'
  if (/limpieza\s*de\s*casa|servicio\s*dom[eé]stico|empleada|jardiner[ií]a/i.test(c)) return 'SERVICES_HOME'
  if (/pago\s*(julia|daniel)\b/i.test(c)) return 'SERVICES_HOME'
  if (/electricista|plomero/i.test(c)) return 'SERVICES_HOME'
  if (/flete|env[ií]o\s*documentos|certificaci[oó]n|servicios?\s*legales|tr[aá]mite\s*(general|carro|documento)/i.test(c)) return 'SERVICES_MISC'
  if (/cobros?\s*bancarios/i.test(c) || (/comisi[oó]n/i.test(c) && /bac|bncr|bcr|banco|popular/i.test(v))) return 'BANK_FEE'
  if (/pago\s*tarjeta|seguro\s*tarjeta/i.test(c)) return 'BANK_FEE'

  // ── Health ────────────────────────────────────────────────────────────────
  if (/blue\s*medical|cl[ií]nica|orthodental|laboratorio|dental/i.test(v)) return 'HEALTH'
  if (/gnc\b/i.test(v) || /medicamento|farmacia|m[eé]dico|receta|doctor|ciruj|optometr|pastill|vitamina|lentes\s*de\s*contacto|suplemento|consulta\s*(m[eé]dica)?|salud\b/i.test(c)) return 'HEALTH'
  if (/gym\b|gimnasio|crossfit|crossbox|fitness|yoga/i.test(t)) return 'HEALTH'

  // ── Insurance ─────────────────────────────────────────────────────────────
  if (/panamerican\b/i.test(v) || /seguro\s*(de\s*)?(vida|m[eé]dic|tarjeta|hogar|auto|veh[ií]culo|gastos\s*m[eé]dic)|nacional\s*de\s*seguros|seguridad\s*casa|seguro\s*auto/i.test(t)) return 'INSURANCE'

  // ── Subscriptions ─────────────────────────────────────────────────────────
  if (/netflix|spotify|hbo\b|paramount|disney\+|apple\s*one|youtube\s*premium|pago\s*(netflix|spotify|hbo|google\s*one|office\s*365|amazon\s*prime)/i.test(t)) return 'SUBSCRIPTIONS'
  if (/microsoft/i.test(v)) return 'SUBSCRIPTIONS'

  // ── Travel ────────────────────────────────────────────────────────────────
  if (/hotel|airbnb|hospedaje/i.test(t)) return 'TRAVEL'
  if (/vuelo\b|aerol[ií]nea|booking\.|expedia|tiquetes?\s*a[eé]reos|entrevista\s*visa|tr[aá]mite\s*(de\s*)?viaje/i.test(t)) return 'TRAVEL'

  // ── Entertainment ─────────────────────────────────────────────────────────
  if (/cine|teatro|concierto|boliche|parque\s*acu[aá]tic|evento\b|boleta|entrada\b|alcohol\b|cantina\b|\bbar\b/i.test(t)) return 'ENTERTAINMENT'
  if (/videojuego|otros?\s*entretenimiento|alquiler.*pel[ií]cula/i.test(c)) return 'ENTERTAINMENT'

  // ── Clothing & personal care ──────────────────────────────────────────────
  if (/ropa\b|zapatos|calzado|zara|h&m|primark|moda\b|accesorios?\s*personales/i.test(t)) return 'CLOTHING'
  if (/peluquer[ií]a|barber[ií]a|corte\s*(de\s*)?pelo|corte\s*barba|tatuaje|manicure|pedicure|spa\b|cuidado\s*personal/i.test(t)) return 'PERSONAL_CARE'

  // ── Education ─────────────────────────────────────────────────────────────
  if (/caspari|samagu|cpcecr|boreal/i.test(v)) return 'EDUCATION'
  if (/mensualidad\s*(kinder|colegio|escuela)|matr[ií]cula|pago\s*colegio|universidad|curso\b|libros?\b/i.test(c)) return 'EDUCATION'

  // ── Work expenses ─────────────────────────────────────────────────────────
  if (/cuota\s*(de\s*)?caf[eé]|pago\s*(de\s*)?ocasiones\s*especiales|cuota\s*(de\s*)?trabajo/i.test(c)) return 'WORK_EXPENSES'
  if (/pago\s*colegio\s*c\.e\./i.test(c)) return 'WORK_EXPENSES'

  // ── Gifts, taxes ──────────────────────────────────────────────────────────
  if (/regalo\s*a\b|donaci[oó]n|donativo/i.test(c)) return 'GIFTS'
  if (/impuesto\s*(municipal|territorial|bienes)|tributaci[oó]n|hacienda/i.test(c)) return 'TAXES'
  if (/multa\s*intereses?|intereses?\s*mora/i.test(c)) return 'INTEREST_EXP'

  // ── Home ──────────────────────────────────────────────────────────────────
  if (/remodelaci[oó]n|mano\s*de\s*obra|materiales\s*construcci[oó]n/i.test(c)) return 'HOME_RENO'
  if (/ferreteri[ao]|home\s*depot|materiales\b/i.test(t)) return 'HOME_RENO'
  if (/mueble\b|electrodom[eé]stico/i.test(t)) return 'HOME_FURNITURE'
  if (/mantenimiento\s*casa|art[ií]culos?\s*para\s*casa/i.test(c)) return 'HOME_MAINT'

  // ── Tech ──────────────────────────────────────────────────────────────────
  if (/art[ií]culos?\s*de\s*tecnolog[ií]a|accesorios?\s*(de\s*)?tecnolog[ií]a/i.test(c)) return 'TECH'
  if (/amazon\.com|alibaba|mercado\s*libre|aliexpress|shein/i.test(t)) return 'TECH'

  // ── Loan payments ─────────────────────────────────────────────────────────
  if (/pr[eé]stamo|hipotecario|prendario|cuota\s*pr[eé]st|amortizaci[oó]n/i.test(c)) return 'LOAN_PAYMENT'

  return 'MISC'
}

/** Maps a canonical code → L1 display group (non-overlapping). */
const GROUP_LABELS: Record<string, string> = {
  // ── Income ──────────────────────────────────────────────────────────────
  SALARY:              'Salario y trabajo',
  AGUINALDO:           'Salario y trabajo',
  WORK_PAYMENTS:       'Salario y trabajo',
  INCOME_MISC:         'Otros ingresos',
  RENTAL_INCOME:       'Ingreso pasivo',
  PASSIVE_INTEREST:    'Ingreso pasivo',
  PASSIVE_FUND:        'Ingreso pasivo',
  PASSIVE_CRYPTO:      'Ingreso pasivo',
  VALUATION_GAIN:      'Valorización',
  // ── Expenses ────────────────────────────────────────────────────────────
  FOOD_OUT:            'Comida y restaurantes',
  FOOD_SUPER:          'Supermercado',
  TRANSPORT:           'Transporte',
  CAR:                 'Gastos de carro',
  CAR_PURCHASE:        'Gastos de carro',
  MARIAM:              'Mariam',
  EMMA:                'Emma · Manutención',
  SITA:                'Familia',
  HOUSEHOLD:           'Hogar',
  SERVICES_UTIL:       'Servicios básicos',
  SERVICES_HOME:       'Servicios del hogar',
  SERVICES_MISC:       'Servicios varios',
  HOME_RENO:           'Hogar',
  HOME_FURNITURE:      'Hogar',
  HOME_MAINT:          'Hogar',
  HEALTH:              'Salud',
  INSURANCE:           'Seguros',
  ENTERTAINMENT:       'Entretenimiento',
  TRAVEL:              'Viajes',
  SUBSCRIPTIONS:       'Suscripciones',
  CLOTHING:            'Vestimenta',
  PERSONAL_CARE:       'Vestimenta',
  EDUCATION:           'Educación',
  WORK_EXPENSES:       'Gastos laborales',
  GIFTS:               'Regalos y donaciones',
  TAXES:               'Impuestos',
  BANK_FEE:            'Comisiones y cargos',
  INTEREST_EXP:        'Comisiones y cargos',
  TECH:                'Tecnología',
  LOAN_PAYMENT:        'Préstamos',
  MISC:                'Otros',
  // ── Savings / investment ─────────────────────────────────────────────────
  SAVINGS_FUND:        'Fondos de inversión',
  SAVINGS_CRYPTO:      'Cripto',
  SAVINGS_PENSION:     'Pensión voluntaria',
  SAVINGS_GENERAL:     'Ahorro',
  INVESTMENT:          'Inversiones',
  REAL_ESTATE:         'Inmuebles',
  RENTAL_EXPENSE:      'Inmuebles',
  VALUATION_LOSS:      'Pérdidas de valor',
  // ── Legacy DB codes ──────────────────────────────────────────────────────
  INVESTMENT_RETURN:   'Ingreso pasivo',
  PASSIVE_INCOME:      'Ingreso pasivo',
  CRYPTO:              'Ingreso pasivo',
  SAVINGS_INVESTMENT:  'Fondos de inversión',
  SAVINGS:             'Ahorro',
  SAVINGS_TRAVEL:      'Viajes',
  LOANS:               'Préstamos',
  LOAN_PAYMENTS:       'Préstamos',
  INTEREST:            'Comisiones y cargos',
  BONO:                'Salario y trabajo',
  FOOD_ABARROTES:      'Supermercado',
  ENTERTAINMENT_SUBS:  'Suscripciones',
  ENTERTAINMENT_EVENTS:'Entretenimiento',
  ENTERTAINMENT_DINING:'Comida y restaurantes',
  TRANSPORT_FUEL:      'Gastos de carro',
  TRANSPORT_PARKING:   'Gastos de carro',
  TRANSPORT_MAINT:     'Gastos de carro',
  CAR_EXPENSES:        'Gastos de carro',
  HEALTH_GYM:          'Salud',
  HEALTH_CONSULT:      'Salud',
  HEALTH_MEDS:         'Salud',
  HEALTH_DENTAL:       'Salud',
  INSURANCE_HEALTH:    'Seguros',
  INSURANCE_LIFE:      'Seguros',
  RENT_SERVICE:        'Servicios básicos',
  SERVICES:            'Servicios básicos',
  SERVICES_ELECTRIC:   'Servicios básicos',
  SERVICES_WATER:      'Servicios básicos',
  SERVICES_INTERNET:   'Servicios básicos',
  SERVICES_PHONE:      'Servicios básicos',
  SERVICES_STREAMING:  'Suscripciones',
  HOME:                'Hogar',
  HOME_SERVICE:        'Servicios del hogar',
  PETS:                'Otros',
  ONLINE_SHOPPING:     'Tecnología',
  CHILD_SUPPORT:       'Emma · Manutención',
  TRANSFER:            'Otros',
  CASH_WITHDRAWAL:     'Otros',
  DEPOSIT_DEBIT:       'Otros',
  MISC_EXPENSE:        'Otros',
  BANK_FEE_LEGACY:     'Comisiones y cargos',
  CLOTHING_LEGACY:     'Vestimenta',
  PERSONAL_CARE_LEGACY:'Vestimenta',
  WORK:                'Salario y trabajo',
  WORK_OVERTIME:       'Salario y trabajo',
}

export function getGroupLabel(code: string): string {
  return GROUP_LABELS[code] ?? 'Otros'
}

/** Fine-grained display name for L2/tooltip. */
export function displayCategory(code: string): string {
  const MAP: Record<string, string> = {
    SALARY:              'Salario',
    AGUINALDO:           'Aguinaldo',
    WORK_PAYMENTS:       'Otros ingresos laborales',
    INCOME_MISC:         'Ingresos varios',
    RENTAL_INCOME:       'Alquiler inmueble',
    PASSIVE_INTEREST:    'Intereses y excedentes',
    PASSIVE_FUND:        'Rendimientos fondos',
    PASSIVE_CRYPTO:      'Rendimientos cripto',
    VALUATION_GAIN:      'Aumento de valor',
    VALUATION_LOSS:      'Pérdida de valor',
    FOOD_OUT:            'Comida fuera',
    FOOD_SUPER:          'Supermercado / Abarrotes',
    TRANSPORT:           'Transporte',
    CAR:                 'Gastos de carro',
    CAR_PURCHASE:        'Compra de carro',
    MARIAM:              'Mariam',
    EMMA:                'Emma / Manutención',
    SITA:                'Sita',
    HOUSEHOLD:           'Artículos del hogar',
    SERVICES_UTIL:       'Servicios básicos',
    SERVICES_HOME:       'Limpieza y jardín',
    SERVICES_MISC:       'Servicios varios',
    HOME_RENO:           'Remodelación',
    HOME_FURNITURE:      'Muebles y enseres',
    HOME_MAINT:          'Mantenimiento casa',
    HEALTH:              'Salud',
    INSURANCE:           'Seguros',
    ENTERTAINMENT:       'Entretenimiento',
    TRAVEL:              'Viajes',
    SUBSCRIPTIONS:       'Suscripciones',
    CLOTHING:            'Ropa y calzado',
    PERSONAL_CARE:       'Cuidado personal',
    EDUCATION:           'Educación',
    WORK_EXPENSES:       'Gastos laborales',
    GIFTS:               'Regalos y donaciones',
    TAXES:               'Impuestos',
    BANK_FEE:            'Comisiones bancarias',
    INTEREST_EXP:        'Intereses y multas',
    TECH:                'Tecnología',
    LOAN_PAYMENT:        'Préstamos',
    MISC:                'Otros',
    SAVINGS_FUND:        'Fondos de inversión',
    SAVINGS_CRYPTO:      'Cripto',
    SAVINGS_PENSION:     'Pensión voluntaria',
    SAVINGS_GENERAL:     'Ahorro',
    INVESTMENT:          'Inversiones',
    REAL_ESTATE:         'Bienes inmuebles',
    RENTAL_EXPENSE:      'Gastos propiedad alquiler',
    // Legacy DB codes
    INVESTMENT_RETURN:   'Rendimientos fondos',
    PASSIVE_INCOME:      'Ingreso pasivo',
    CRYPTO:              'Cripto',
    SAVINGS:             'Ahorro',
    SAVINGS_INVESTMENT:  'Fondos de inversión',
    SAVINGS_TRAVEL:      'Viajes',
    LOANS:               'Préstamos',
    LOAN_PAYMENTS:       'Préstamos',
    INTEREST:            'Intereses',
    BONO:                'Bono',
    WORK:                'Trabajo',
    FOOD_ABARROTES:      'Abarrotes',
    ENTERTAINMENT_SUBS:  'Suscripciones',
    ENTERTAINMENT_EVENTS:'Entretenimiento',
    ENTERTAINMENT_DINING:'Café / social',
    TRANSPORT_FUEL:      'Combustible',
    TRANSPORT_PARKING:   'Parqueo',
    TRANSPORT_MAINT:     'Mantenimiento vehículo',
    CAR_EXPENSES:        'Gastos de carro',
    HEALTH_GYM:          'Gym / deporte',
    HEALTH_CONSULT:      'Consulta médica',
    HEALTH_MEDS:         'Farmacia',
    HEALTH_DENTAL:       'Dental',
    INSURANCE_HEALTH:    'Seguro médico',
    INSURANCE_LIFE:      'Seguro de vida',
    RENT_SERVICE:        'Alquiler / condominio',
    SERVICES:            'Servicios públicos',
    SERVICES_ELECTRIC:   'Electricidad',
    SERVICES_WATER:      'Agua',
    SERVICES_INTERNET:   'Internet',
    SERVICES_PHONE:      'Teléfono / celular',
    SERVICES_STREAMING:  'Streaming / cable',
    HOME:                'Hogar',
    HOME_SERVICE:        'Limpieza / doméstico',
    PETS:                'Mascotas',
    ONLINE_SHOPPING:     'Compras online',
    CHILD_SUPPORT:       'Manutención',
    TRANSFER:            'Transferencias',
    CASH_WITHDRAWAL:     'Efectivo',
    DEPOSIT_DEBIT:       'Depósito',
    MISC_EXPENSE:        'Varios',
  }
  return MAP[code] ?? code
}

/**
 * Full accounting classification (contable vs conceptual).
 * Used for reporting and categorization decisions.
 */
export type AccountingType =
  | 'active_income'
  | 'passive_income'
  | 'settlement_inflow'
  | 'survival_expense'
  | 'liquidity_expense'
  | 'loan_payment'
  | 'savings_outflow'
  | 'crypto_valuation'
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
  const { movement_type, expense_group, is_settlement, is_passive_income } = tx

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
    if (tx.is_survival_expense) return 'survival_expense'
    return 'liquidity_expense'
  }

  return 'other'
}
