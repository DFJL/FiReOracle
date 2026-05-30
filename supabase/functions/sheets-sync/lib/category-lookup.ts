// Maps Spanish "Grupo" strings from the sheet to transaction_categories.code values.
// Built from the seed data in 001_initial_schema.sql.
// Unknown values are logged and the row is still inserted with a note.

const CATEGORY_MAP: Record<string, string> = {
  // Alimentación
  'supermercado': 'SUPERMARKET',
  'comida fuera': 'FOOD_OUT',
  'sodas y restaurantes': 'FOOD_OUT',
  'domicilios': 'FOOD_DELIVERY',
  'comida rapida': 'FAST_FOOD',
  'cafeteria': 'CAFE',
  'cafe': 'CAFE',

  // Transporte
  'gasolina': 'GAS',
  'taxi/uber': 'TAXI_UBER',
  'taxi': 'TAXI_UBER',
  'uber': 'TAXI_UBER',
  'bus': 'BUS',
  'peajes': 'TOLLS',
  'parqueo': 'PARKING',
  'mantenimiento carro': 'CAR_MAINTENANCE',
  'marchamo': 'CAR_TAX',
  'riteve': 'RITEVE',

  // Hogar
  'alquiler': 'RENT',
  'electricidad': 'ELECTRICITY',
  'agua': 'WATER',
  'internet': 'INTERNET',
  'telefono': 'PHONE',
  'cable': 'CABLE_TV',
  'condominio': 'HOA',
  'servicios del hogar': 'HOME_SERVICES',
  'mantenimiento hogar': 'HOME_MAINTENANCE',
  'muebles y electrodomesticos': 'HOME_APPLIANCES',

  // Salud
  'medico': 'MEDICAL',
  'farmacia': 'PHARMACY',
  'seguro medico': 'HEALTH_INSURANCE',
  'gym': 'GYM',
  'gimnasio': 'GYM',
  'dental': 'DENTAL',

  // Educacion
  'educacion': 'EDUCATION',
  'cursos': 'COURSES',
  'libros': 'BOOKS',
  'universidad': 'UNIVERSITY',

  // Entretenimiento
  'entretenimiento': 'ENTERTAINMENT',
  'streaming': 'STREAMING',
  'cine': 'CINEMA',
  'viajes': 'TRAVEL',
  'trips': 'TRAVEL',
  'hotel': 'HOTEL',
  'actividades': 'ACTIVITIES',

  // Ropa
  'ropa': 'CLOTHING',
  'calzado': 'CLOTHING',
  'zapatos': 'CLOTHING',

  // Mascotas
  'mascotas': 'PETS',
  'veterinario': 'PETS',

  // Finanzas
  'ahorro': 'SAVINGS',
  'inversion': 'INVESTMENT',
  'inversiones': 'INVESTMENT',
  'crypto': 'CRYPTO',
  'prestamo': 'LOAN_PAYMENT',
  'deuda': 'LOAN_PAYMENT',
  'interes': 'BANK_FEES',
  'comision banco': 'BANK_FEES',
  'comisiones': 'BANK_FEES',
  'seguro': 'INSURANCE',
  'seguro de vida': 'LIFE_INSURANCE',
  'pensiones': 'PENSION',

  // Ingresos
  'salario': 'SALARY',
  'ingreso': 'SALARY',
  'freelance': 'FREELANCE',
  'alquiler ingreso': 'RENTAL_INCOME',
  'dividendos': 'DIVIDENDS',
  'intereses': 'INTEREST_INCOME',
  'aguinaldo': 'BONUS',
  'bono': 'BONUS',
  'liquidacion': 'SEVERANCE',

  // Regalos y donaciones
  'regalo': 'GIFTS',
  'donacion': 'DONATIONS',
  'fiesta': 'CELEBRATIONS',

  // Varios
  'varios': 'MISC',
  'miscelaneos': 'MISC',
  'efectivo': 'CASH_WITHDRAWAL',
  'retiro efectivo': 'CASH_WITHDRAWAL',
  'transferencia': 'TRANSFER',
  'liquidacion sindy': 'NETWORK',
  'network': 'NETWORK',
}

export function resolveCategory(rawGrupo: string): { code: string | null; unmapped: boolean } {
  if (!rawGrupo?.trim()) return { code: null, unmapped: false }

  const key = rawGrupo.toLowerCase().trim()
  const code = CATEGORY_MAP[key] ?? null
  return { code, unmapped: code === null }
}
