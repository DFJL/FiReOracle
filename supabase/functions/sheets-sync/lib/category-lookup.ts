// Maps Spanish "Grupo" strings from the sheet to transaction_categories.code values.
// Built from the seed data in 001_initial_schema.sql.
// Unknown values are logged and the row is still inserted with a note.

const CATEGORY_MAP: Record<string, string> = {
  // Alimentación
  'supermercado': 'FOOD_SUPER',
  'comida fuera': 'FOOD_OUT',
  'sodas y restaurantes': 'FOOD_OUT',
  'domicilios': 'FOOD_OUT',
  'comida rapida': 'FOOD_OUT',
  'cafeteria': 'ENTERTAINMENT_DINING',
  'cafe': 'ENTERTAINMENT_DINING',

  // Transporte
  'gasolina': 'TRANSPORT_FUEL',
  'taxi/uber': 'TRANSPORT',
  'taxi': 'TRANSPORT',
  'uber': 'TRANSPORT',
  'bus': 'TRANSPORT',
  'peajes': 'TRANSPORT',
  'parqueo': 'TRANSPORT_PARKING',
  'mantenimiento carro': 'TRANSPORT_MAINT',
  'marchamo': 'CAR_EXPENSES',
  'riteve': 'CAR_EXPENSES',

  // Hogar / Servicios
  'alquiler': 'RENT_SERVICE',
  'electricidad': 'SERVICES_ELECTRIC',
  'agua': 'SERVICES_WATER',
  'internet': 'SERVICES_INTERNET',
  'telefono': 'SERVICES_PHONE',
  'cable': 'SERVICES_STREAMING',
  'condominio': 'RENT_SERVICE',
  'servicios del hogar': 'SERVICES',
  'mantenimiento hogar': 'HOME_RENO',
  'muebles y electrodomesticos': 'HOME',

  // Salud
  'medico': 'HEALTH_CONSULT',
  'farmacia': 'HEALTH_MEDS',
  'seguro medico': 'INSURANCE_HEALTH',
  'gym': 'HEALTH_GYM',
  'gimnasio': 'HEALTH_GYM',
  'dental': 'HEALTH_DENTAL',

  // Educación
  'educacion': 'EDUCATION',
  'cursos': 'EDUCATION',
  'libros': 'EDUCATION',
  'universidad': 'EDUCATION',

  // Entretenimiento
  'entretenimiento': 'ENTERTAINMENT',
  'streaming': 'ENTERTAINMENT_SUBS',
  'cine': 'ENTERTAINMENT_EVENTS',
  'viajes': 'SAVINGS_TRAVEL',
  'trips': 'SAVINGS_TRAVEL',
  'hotel': 'ENTERTAINMENT',
  'actividades': 'ENTERTAINMENT_EVENTS',

  // Ropa / Personal
  'ropa': 'CLOTHING',
  'calzado': 'CLOTHING',
  'zapatos': 'CLOTHING',
  'cuidado personal': 'PERSONAL_CARE',

  // Mascotas
  'mascotas': 'HEALTH',
  'veterinario': 'HEALTH',

  // Finanzas / Ahorro
  'ahorro': 'SAVINGS',
  'inversion': 'SAVINGS_INVESTMENT',
  'inversiones': 'SAVINGS_INVESTMENT',
  'crypto': 'SAVINGS_INVESTMENT',
  'prestamo': 'LOAN_PAYMENT',
  'deuda': 'LOAN_PAYMENT',
  'interes': 'INTEREST',
  'comision banco': 'MISC_EXPENSE',
  'comisiones': 'MISC_EXPENSE',
  'seguro': 'INSURANCE',
  'seguro de vida': 'INSURANCE_LIFE',
  'pensiones': 'SAVINGS_PENSION',

  // Ingresos
  'salario': 'SALARY',
  'ingreso': 'MISC_INCOME',
  'freelance': 'WORK_OTHER',
  'alquiler ingreso': 'RENTAL_INCOME',
  'alquiler casa': 'RENTAL_INCOME',
  'dividendos': 'SAVINGS_EXCEDENTES',
  'intereses': 'INTEREST',
  'intereses de ahorros': 'SAVINGS_INTEREST',
  'excedentes de ahorros': 'SAVINGS_EXCEDENTES',
  'aguinaldo': 'AGUINALDO',
  'bono': 'BONO',
  'otros ingresos laborales': 'WORK_OTHER',
  'viaticos': 'WORK_OTHER',
  'fcl': 'WORK_OTHER',
  'reembolso seguro': 'REIMBURSEMENT',
  'reembolso': 'REIMBURSEMENT',
  'venta de bienes muebles': 'ASSET_SALE',
  'venta de bienes inmuebles': 'ASSET_SALE',
  'liquidacion laboral': 'LABOR_SETTLEMENT',
  'liquidacion': 'INVESTMENT_LIQUIDATION',
  'liquidacion ahorro': 'SAVINGS_LIQUIDATION',
  'rendimientos fondo inversion': 'INVESTMENT_RETURN',
  'rendimientos farming crypto monedas': 'INVESTMENT_RETURN_CRYPTO',
  'rendimientos anchor protocol': 'INVESTMENT_RETURN_CRYPTO',
  'rendimientos nodos crypto': 'INVESTMENT_RETURN_CRYPTO',
  'rendimientos hodl criptomonedas': 'INVESTMENT_RETURN_CRYPTO',
  'mineria ethereum': 'INVESTMENT_RETURN_MINING',
  'ingreso pasivo': 'PASSIVE_INCOME',

  // Regalos / Social
  'regalo': 'GIFTS',
  'donacion': 'GIFTS',
  'fiesta': 'ENTERTAINMENT_EVENTS',

  // Varios
  'varios': 'MISC_EXPENSE',
  'miscelaneos': 'MISC_EXPENSE',
  'efectivo': 'CASH_WITHDRAWAL',
  'retiro efectivo': 'CASH_WITHDRAWAL',
  'transferencia': 'TRANSFER',
  'liquidacion sindy': 'LOANS',
  'network': 'LOANS',
  'deposito': 'DEPOSIT_DEBIT',
  'impuestos': 'TAXES',
}

export function resolveCategory(rawGrupo: string): { code: string | null; unmapped: boolean } {
  if (!rawGrupo?.trim()) return { code: null, unmapped: false }

  const key = rawGrupo.toLowerCase().trim()
  const code = CATEGORY_MAP[key] ?? null
  return { code, unmapped: code === null }
}
