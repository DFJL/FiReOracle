// Category inference for transactions with null category_code.
// Applied client-side so no DB round-trip needed.

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
  return /pago\s*(extraordinario\s*)?pr[eé]stamo|cuota\s*(de\s*)?pr[eé]stamo|pr[eé]stamo\s*hipotecari|abono\s*pr[eé]stamo|pago\s*hipotecari|amortizaci[oó]n/i.test(t)
}

/** Returns a display category for a transaction. */
export function inferCategory(
  vendor: string | null,
  concept: string | null,
  categoryCode: string | null,
): string {
  if (categoryCode) return categoryCode

  const t = `${vendor ?? ''} ${concept ?? ''}`.toLowerCase()

  if (/walmart|pali|palí|mas\s*x\s*menos|masxmenos|auto\s*mercado|automercado|supermercado|hipermercado|maxi\s*pali|buen\s*precio|perimercado|fresh\s*market|pricesmart/i.test(t)) return 'Supermercado'
  if (/restaurante|soda\s|pizza|burger|kfc|mcdonalds|subway|wendys|pollo\s*camp|taco|denny|cafetería|cafeteria|almuerzo|cena\s|desayuno|fritanga|comida\s/i.test(t)) return 'Restaurantes'
  if (/uber|didi|taxi|autobus|buses|tren\s*eléctr|transporte\s*público|jepe|aeropuerto\s*transp/i.test(t)) return 'Transporte'
  if (/gasolinera|combustible|gasolina|diesel|recarga\s*combustible/i.test(t)) return 'Combustible'
  if (/netflix|spotify|amazon\s*prime|disney\+|apple\s*one|youtube\s*premium|hbo|paramount|suscripci/i.test(t)) return 'Suscripciones'
  if (/farmacia|clínica|clinica|médico|medico|hospital|laboratorio|dental|óptica|optica|fisioterapi|cita\s*médic|seguro\s*médic/i.test(t)) return 'Salud'
  if (/electricidad|cne\s|ice\s|aya\s|acueducto|agua\s|internet\s|claro\s|movistar|kolbi|teléfono|telefono|cable\s|recibo\s|servicios\s*públic|fibra\s*óptic/i.test(t)) return 'Servicios públicos'
  if (/ropa|zapatos|calzado|zara|h&m|primark|forever\s*21|tienda\s*de\s*ropa|moda\s/i.test(t)) return 'Ropa'
  if (/cine|teatro|concierto|boliche|parque\s*acuátic|entretenimiento|evento\s|boleta|entrada\s/i.test(t)) return 'Entretenimiento'
  if (/gym|gimnasio|crossfit|deporte|fitness|yoga|sport\s/i.test(t)) return 'Deporte'
  if (/curso|universidad|colegio\s|escuela|librería|libros|educación|educacion|matrícula|carné\s*estu/i.test(t)) return 'Educación'
  if (/hotel|airbnb|hospedaje|vuelo\s|aerolínea|aerolinea|viaje|booking\.|expedia/i.test(t)) return 'Viajes'
  if (/seguro\s|insurance|aseguradora|\bins\b|nacional\s*de\s*seguros/i.test(t)) return 'Seguros'
  if (/ferretería|ferreteria|home\s*depot|materiales|construcci|muebles|electrodom/i.test(t)) return 'Hogar'
  if (/amazon\.com|alibaba|ebay|mercado\s*libre|compra\s*en\s*línea|aliexpress|shein/i.test(t)) return 'Compras online'
  if (/mascota|veterinari|petco|petland|alimento\s*perr|alimento\s*gat/i.test(t)) return 'Mascotas'
  if (/peluquería|peluqueria|barbería|barberia|belleza|salón|salon|manicure|pedicure|spa\s/i.test(t)) return 'Belleza'
  if (/préstamo|prestamo|hipotecario|cuota\s*prést|pago\s*prést|crédito\s*hipot/i.test(t)) return 'Préstamos'
  if (/sinpe\s*móvil|sinpe\s*movil|transfer|traspaso/i.test(t)) return 'Transferencias'
  if (/retiro\s*efectivo|cajero|atm\s|efectivo\s*bac|efectivo\s*bncr/i.test(t)) return 'Efectivo'
  if (/fondo\s*de\s*inversión|fondo\s*inversion|inversión|inversion|cripto|bitcoin|staking|defi/i.test(t)) return 'Inversiones'
  if (/ahorr/i.test(t)) return 'Ahorros'

  return 'Otros'
}

/** Maps a top-level inferred/coded category to a friendly display name. */
export function displayCategory(raw: string): string {
  const MAP: Record<string, string> = {
    SALARY: 'Salario', RENTAL_INCOME: 'Alquiler', SAVINGS: 'Ahorros',
    FOOD_OUT: 'Restaurantes', FOOD_IN: 'Supermercado', TRANSPORT: 'Transporte',
    HEALTH: 'Salud', UTILITIES: 'Servicios públicos', ENTERTAINMENT: 'Entretenimiento',
    CLOTHING: 'Ropa', EDUCATION: 'Educación', TRAVEL: 'Viajes',
    INSURANCE: 'Seguros', FUEL: 'Combustible', SUBSCRIPTIONS: 'Suscripciones',
    LOAN_PAYMENT: 'Préstamos', TRANSFER: 'Transferencias', CASH_WITHDRAWAL: 'Efectivo',
    INVESTMENT: 'Inversiones', HOME: 'Hogar', PETS: 'Mascotas',
    BEAUTY: 'Belleza', ONLINE_SHOPPING: 'Compras online', SPORTS: 'Deporte',
  }
  return MAP[raw] ?? raw
}
