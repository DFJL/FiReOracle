// Full transaction catalog derived from Google Sheets (I-1..I-65, E-1..E-158).
// Each entry maps a canonical concept name to a category code and movement type.

export type CatalogEntry = {
  concepto: string
  categoryCode: string
  type: 'income' | 'expense'
}

export const CONCEPT_CATALOG: CatalogEntry[] = [
  // ── INCOME ─────────────────────────────────────────────────────────────────
  // Salario
  { concepto: 'Salario',                                         categoryCode: 'SALARY',                  type: 'income' },
  { concepto: 'Salario Escolar',                                 categoryCode: 'SALARY_ESCOLAR',          type: 'income' },
  { concepto: 'Salario UNED',                                    categoryCode: 'SALARY',                  type: 'income' },
  { concepto: 'Aguinaldo',                                       categoryCode: 'AGUINALDO',               type: 'income' },
  { concepto: 'Bono',                                            categoryCode: 'BONO',                    type: 'income' },
  // Labor / work
  { concepto: 'Otros pagos laborales',                           categoryCode: 'WORK_OTHER',              type: 'income' },
  { concepto: 'Retiro FCL',                                      categoryCode: 'WORK_OTHER',              type: 'income' },
  { concepto: 'Pago viáticos',                                   categoryCode: 'WORK_OTHER',              type: 'income' },
  { concepto: 'Clase',                                           categoryCode: 'WORK_OTHER',              type: 'income' },
  { concepto: 'Pago de excedentes',                              categoryCode: 'WORK_OTHER',              type: 'income' },
  { concepto: 'Liquidación Laboral',                             categoryCode: 'LABOR_SETTLEMENT',        type: 'income' },
  // Misc income
  { concepto: 'Entrada extra efectivo',                          categoryCode: 'MISC_INCOME',             type: 'income' },
  { concepto: 'Ingreso no identificado',                         categoryCode: 'MISC_INCOME',             type: 'income' },
  { concepto: 'Pago de millas / puntos',                         categoryCode: 'MISC_INCOME',             type: 'income' },
  { concepto: 'Subsidio',                                        categoryCode: 'MISC_INCOME',             type: 'income' },
  { concepto: 'Regalo de',                                       categoryCode: 'GIFT_INCOME',             type: 'income' },
  { concepto: 'Depósito Cuenta Débito',                          categoryCode: 'DEPOSIT_DEBIT',           type: 'income' },
  { concepto: 'Reembolso Seguro',                                categoryCode: 'REIMBURSEMENT',           type: 'income' },
  { concepto: 'Préstamo recibido',                               categoryCode: 'LOAN_RECEIVED',           type: 'income' },
  // Asset sales
  { concepto: 'Venta de bienes muebles',                         categoryCode: 'ASSET_SALE',              type: 'income' },
  { concepto: 'Venta de bienes inmuebles',                       categoryCode: 'ASSET_SALE',              type: 'income' },
  // Alquiler
  { concepto: 'Alquiler casa',                                   categoryCode: 'RENTAL_INCOME',           type: 'income' },
  { concepto: 'Ingreso Netflix / Spotify',                       categoryCode: 'RENTAL_INCOME',           type: 'income' },
  // Interest / savings passive
  { concepto: 'Intereses',                                       categoryCode: 'INTEREST',                type: 'income' },
  { concepto: 'Intereses de Ahorros',                            categoryCode: 'SAVINGS_INTEREST',        type: 'income' },
  { concepto: 'Liquidación Intereses CDP',                       categoryCode: 'SAVINGS_INTEREST',        type: 'income' },
  { concepto: 'Intereses préstamos USDT',                        categoryCode: 'SAVINGS_INTEREST',        type: 'income' },
  { concepto: 'Rendimientos Scotiabank',                         categoryCode: 'SAVINGS_INTEREST',        type: 'income' },
  { concepto: 'Excedentes de ahorros',                           categoryCode: 'SAVINGS_EXCEDENTES',      type: 'income' },
  { concepto: 'Liquidación de Excedentes de ahorros',            categoryCode: 'SAVINGS_EXCEDENTES',      type: 'income' },
  // Savings liquidations
  { concepto: 'Ahorro',                                          categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación ahorre su vuelto',                    categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación de ahorros',                          categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación BAC Objetivos',                       categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación CDP',                                 categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación Ahorro personal Asociación',          categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación Ahorro Asociación',                   categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  { concepto: 'Liquidación Ahorro Coopeande',                    categoryCode: 'SAVINGS_LIQUIDATION',     type: 'income' },
  // Investment returns (fund-based)
  { concepto: 'Rendimientos Fondo Inversión',                    categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  { concepto: 'Rendimientos Fondo Inversión Dominion',           categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  { concepto: 'Rendimientos Fondo Inversión TRANSCOMER',         categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  { concepto: 'Rendimientos Juicy Fields',                       categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  { concepto: 'Rendimientos SH Mining',                          categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  { concepto: 'Rendimientos Meatex',                             categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  { concepto: 'Rendimientos Multimoney',                         categoryCode: 'INVESTMENT_RETURN',       type: 'income' },
  // Investment return liquidations (cashing out yields, not capital)
  { concepto: 'Liquidación Rendimientos Fondo Inversión',        categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },
  { concepto: 'Liquidación Rendimientos Fondo Inversión TRANSCOMER', categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },
  { concepto: 'Liquidación Rendimientos Meatex',                 categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },
  { concepto: 'Liquidación Rendimientos Farming Crypto Monedas', categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },
  { concepto: 'Liquidación Rendimientos nodos Crypto',           categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },
  // Investment capital liquidations
  { concepto: 'Liquidación Fondo de Inversión',                  categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Fondo de Inversión Dominion',         categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Fondo de Inversión TRANSCOMER',       categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Juicy Fields',                        categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación SH Mining',                           categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Royal Q',                             categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Criptomoneda',                        categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Fondo de Inversión Dólares',          categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  { concepto: 'Liquidación Anchor Protocol',                     categoryCode: 'INVESTMENT_LIQUIDATION',  type: 'income' },
  // Crypto returns
  { concepto: 'Rendimientos Farming Crypto Monedas',             categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },
  { concepto: 'Rendimientos Anchor Protocol',                    categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },
  { concepto: 'Rendimientos nodos Crypto',                       categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },
  { concepto: 'Rendimientos Hodl criptomonedas',                 categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },
  { concepto: 'Rendimientos Royal Q',                            categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },
  { concepto: 'Minería Ethereum Tarjetas gráficas',              categoryCode: 'INVESTMENT_RETURN_MINING', type: 'income' },
  { concepto: 'Aumento de valor Criptomonedas',                  categoryCode: 'APPRECIATION',            type: 'income' },
  { concepto: 'Aumento de valor Dominion',                       categoryCode: 'APPRECIATION',            type: 'income' },

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  // Transporte
  { concepto: 'Autobus',                   categoryCode: 'TRANSPORT',         type: 'expense' },
  { concepto: 'Taxi',                      categoryCode: 'TRANSPORT',         type: 'expense' },
  { concepto: 'Uber',                      categoryCode: 'TRANSPORT',         type: 'expense' },
  { concepto: 'Tren',                      categoryCode: 'TRANSPORT',         type: 'expense' },
  { concepto: 'Gasolina',                  categoryCode: 'TRANSPORT_FUEL',    type: 'expense' },
  { concepto: 'Mantenimiento carro',       categoryCode: 'TRANSPORT_MAINT',   type: 'expense' },
  { concepto: 'Revisión carro',            categoryCode: 'TRANSPORT_MAINT',   type: 'expense' },
  { concepto: 'Marchamo',                  categoryCode: 'CAR_EXPENSES',      type: 'expense' },
  { concepto: 'Otros gastos de carro',     categoryCode: 'CAR_EXPENSES',      type: 'expense' },
  { concepto: 'Parqueo',                   categoryCode: 'TRANSPORT_PARKING', type: 'expense' },
  { concepto: 'Alquiler de carro',         categoryCode: 'TRANSPORT',         type: 'expense' },
  // Alimentación
  { concepto: 'Desayuno',                  categoryCode: 'FOOD_OUT',          type: 'expense' },
  { concepto: 'Almuerzo',                  categoryCode: 'FOOD_OUT',          type: 'expense' },
  { concepto: 'Cena',                      categoryCode: 'FOOD_OUT',          type: 'expense' },
  { concepto: 'Otro alimentación',         categoryCode: 'FOOD_OUT',          type: 'expense' },
  { concepto: 'Café',                      categoryCode: 'FOOD_OUT',          type: 'expense' },
  { concepto: 'Comida rápida',             categoryCode: 'FOOD_OUT',          type: 'expense' },
  { concepto: 'Abarrotes / Supermercado',  categoryCode: 'FOOD_SUPER',        type: 'expense' },
  { concepto: 'Abarrotes',                 categoryCode: 'FOOD_SUPER',        type: 'expense' },
  // Servicios
  { concepto: 'Pago electricidad',         categoryCode: 'SERVICES_ELECTRIC', type: 'expense' },
  { concepto: 'Pago agua',                 categoryCode: 'SERVICES_WATER',    type: 'expense' },
  { concepto: 'Pago de internet',          categoryCode: 'SERVICES_INTERNET', type: 'expense' },
  { concepto: 'Pago de celular',           categoryCode: 'SERVICES_PHONE',    type: 'expense' },
  { concepto: 'Pago teléfono',             categoryCode: 'SERVICES_PHONE',    type: 'expense' },
  { concepto: 'Pago cable',                categoryCode: 'SERVICES_STREAMING', type: 'expense' },
  { concepto: 'Servicios del hogar',       categoryCode: 'SERVICES',          type: 'expense' },
  { concepto: 'Limpieza de casa',          categoryCode: 'SERVICES',          type: 'expense' },
  { concepto: 'Jardinería',                categoryCode: 'SERVICES',          type: 'expense' },
  { concepto: 'Pago alquiler',             categoryCode: 'RENT_SERVICE',      type: 'expense' },
  { concepto: 'Pago de alquiler de casa',  categoryCode: 'RENT_SERVICE',      type: 'expense' },
  { concepto: 'Cobros Bancarios',          categoryCode: 'MISC_EXPENSE',      type: 'expense' },
  // Salud
  { concepto: 'Medicamentos',              categoryCode: 'HEALTH_MEDS',       type: 'expense' },
  { concepto: 'Médico',                    categoryCode: 'HEALTH_CONSULT',    type: 'expense' },
  { concepto: 'Dental',                    categoryCode: 'HEALTH_DENTAL',     type: 'expense' },
  { concepto: 'Gimnasio',                  categoryCode: 'HEALTH_GYM',        type: 'expense' },
  { concepto: 'Mensualidad Gimnasio',      categoryCode: 'HEALTH_GYM',        type: 'expense' },
  { concepto: 'Otros Salud',               categoryCode: 'HEALTH',            type: 'expense' },
  { concepto: 'Vitaminas',                 categoryCode: 'HEALTH',            type: 'expense' },
  { concepto: 'Lentes de contacto',        categoryCode: 'HEALTH',            type: 'expense' },
  // Seguros
  { concepto: 'Seguro de vida',            categoryCode: 'INSURANCE_LIFE',    type: 'expense' },
  { concepto: 'Seguro médico',             categoryCode: 'INSURANCE_HEALTH',  type: 'expense' },
  { concepto: 'Seguro auto',               categoryCode: 'INSURANCE_CAR',     type: 'expense' },
  { concepto: 'Seguro de vida/gastos médicos', categoryCode: 'INSURANCE_LIFE', type: 'expense' },
  // Entretenimiento
  { concepto: 'Entradas de cine',          categoryCode: 'ENTERTAINMENT_EVENTS', type: 'expense' },
  { concepto: 'Entradas de conciertos',    categoryCode: 'ENTERTAINMENT_EVENTS', type: 'expense' },
  { concepto: 'Entrada a bares',           categoryCode: 'ENTERTAINMENT_EVENTS', type: 'expense' },
  { concepto: 'Actividades',               categoryCode: 'ENTERTAINMENT_EVENTS', type: 'expense' },
  { concepto: 'Otros entretenimiento',     categoryCode: 'ENTERTAINMENT',     type: 'expense' },
  { concepto: 'Videojuego',                categoryCode: 'ENTERTAINMENT',     type: 'expense' },
  { concepto: 'Pago Netflix',              categoryCode: 'ENTERTAINMENT_SUBS', type: 'expense' },
  { concepto: 'Pago Spotify',              categoryCode: 'ENTERTAINMENT_SUBS', type: 'expense' },
  { concepto: 'Pago Hbo Max',              categoryCode: 'ENTERTAINMENT_SUBS', type: 'expense' },
  { concepto: 'Pago Google One',           categoryCode: 'AFFILIATIONS',      type: 'expense' },
  { concepto: 'Pago Office 365',           categoryCode: 'AFFILIATIONS',      type: 'expense' },
  { concepto: 'Pago de afiliaciones',      categoryCode: 'AFFILIATIONS',      type: 'expense' },
  // Vestimenta
  { concepto: 'Ropa',                      categoryCode: 'CLOTHING',          type: 'expense' },
  { concepto: 'Zapatos',                   categoryCode: 'CLOTHING',          type: 'expense' },
  { concepto: 'Accesorios personales',     categoryCode: 'CLOTHING',          type: 'expense' },
  // Cuidado personal
  { concepto: 'Corte de pelo',             categoryCode: 'PERSONAL_CARE',     type: 'expense' },
  { concepto: 'Corte de barba',            categoryCode: 'PERSONAL_CARE',     type: 'expense' },
  { concepto: 'Artículos de cuidado personal', categoryCode: 'PERSONAL_CARE', type: 'expense' },
  { concepto: 'Tatuajes',                  categoryCode: 'PERSONAL_CARE',     type: 'expense' },
  // Hogar / casa
  { concepto: 'Artículos de limpieza',     categoryCode: 'HOME',              type: 'expense' },
  { concepto: 'Artículos de casa',         categoryCode: 'HOME',              type: 'expense' },
  { concepto: 'Mueble',                    categoryCode: 'HOME',              type: 'expense' },
  { concepto: 'Herramientas / ferretería', categoryCode: 'HOME',              type: 'expense' },
  { concepto: 'Mano de obra arreglo casa', categoryCode: 'HOME_RENO',         type: 'expense' },
  { concepto: 'Materiales construcción',   categoryCode: 'HOME_RENO',         type: 'expense' },
  { concepto: 'Mantenimiento hogar',       categoryCode: 'HOME_RENO',         type: 'expense' },
  // Educación
  { concepto: 'Pago matrícula UCR',        categoryCode: 'EDUCATION',         type: 'expense' },
  { concepto: 'Pago mensualidad clases',   categoryCode: 'EDUCATION',         type: 'expense' },
  { concepto: 'Libro',                     categoryCode: 'EDUCATION',         type: 'expense' },
  // Impuestos
  { concepto: 'Impuestos municipales',     categoryCode: 'TAXES',             type: 'expense' },
  // Préstamos
  { concepto: 'Pago préstamo',             categoryCode: 'LOAN_PAYMENT',      type: 'expense' },
  { concepto: 'Préstamo hipotecario',      categoryCode: 'LOAN_PAYMENT',      type: 'expense' },
  { concepto: 'Préstamo prendario',        categoryCode: 'LOAN_PAYMENT',      type: 'expense' },
  { concepto: 'Préstamo personal',         categoryCode: 'LOAN_PAYMENT',      type: 'expense' },
  { concepto: 'Pago extraordinario préstamo hipotecario', categoryCode: 'LOAN_PAYMENT', type: 'expense' },
  { concepto: 'Pago extraordinario préstamo prendario',   categoryCode: 'LOAN_PAYMENT', type: 'expense' },
  { concepto: 'Pago extraordinario préstamo personal',    categoryCode: 'LOAN_PAYMENT', type: 'expense' },
  // Pagos del trabajo
  { concepto: 'Cuota de café trabajo',     categoryCode: 'WORK_PAYMENTS',     type: 'expense' },
  { concepto: 'Cuota de trabajo',          categoryCode: 'WORK_PAYMENTS',     type: 'expense' },
  // Ahorro / inversión
  { concepto: 'Apertura CDP',              categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión Dominion', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión TRANSCOMER', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión Dólares', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión (Ahorro emergencia)', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Inversión Juicy Fields',    categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Inversión SH Mining',       categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Inversión Meatex',          categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Inversión Royal Q',         categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Inversión Anchor Protocol', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Inversión en nodos Crypto', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Compra Bitcoins',           categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Compra Bienes Inmuebles',   categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Compra de Automovil',       categoryCode: 'MISC_EXPENSE',      type: 'expense' },
  { concepto: 'Pensión voluntaria',        categoryCode: 'SAVINGS_PENSION',   type: 'expense' },
  { concepto: 'Ahorro BAC Objetivos',      categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Ahorro personal Asociación', categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Ahorro Asociación',         categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  { concepto: 'Ahorro Coopeande',          categoryCode: 'SAVINGS_INVESTMENT', type: 'expense' },
  // Gastos de propiedad alquiler
  { concepto: 'Gastos casa de alquiler',   categoryCode: 'RENTAL_EXPENSE',    type: 'expense' },
  // Regalos
  { concepto: 'Regalo a',                  categoryCode: 'GIFTS',             type: 'expense' },
  { concepto: 'Donación',                  categoryCode: 'GIFTS',             type: 'expense' },
  // Viajes
  { concepto: 'Tiquetes aéreos',           categoryCode: 'SAVINGS_TRAVEL',    type: 'expense' },
  { concepto: 'Hospedaje Hotel',           categoryCode: 'ENTERTAINMENT',     type: 'expense' },
  { concepto: 'Trámite de viaje',          categoryCode: 'SAVINGS_TRAVEL',    type: 'expense' },
  // Varios / otros
  { concepto: 'Egreso no identificado',    categoryCode: 'MISC_EXPENSE',      type: 'expense' },
  { concepto: 'Comisiones',               categoryCode: 'MISC_EXPENSE',      type: 'expense' },
  { concepto: 'Pérdida valor Criptomonedas', categoryCode: 'MISC_EXPENSE',   type: 'expense' },
  { concepto: 'Pérdida valor Dominion',    categoryCode: 'MISC_EXPENSE',      type: 'expense' },
  // Personal
  { concepto: 'Manutención Emma',          categoryCode: 'PERSONAL_EMMA',     type: 'expense' },
  { concepto: 'Pago Sita',                 categoryCode: 'PERSONAL_SITA',     type: 'expense' },
  { concepto: 'Artículos de Mariam',       categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Ropa de Mariam',            categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Mensualidad kinder',        categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Matrícula kinder',          categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Buseta Mariam',             categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Uniformes Mariam',          categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Otros gastos Kinder Mariam', categoryCode: 'PERSONAL_MARIAM',  type: 'expense' },
  { concepto: 'Dentista Sita',             categoryCode: 'PERSONAL_SITA',     type: 'expense' },
  { concepto: 'Pediatra Mariam',           categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Danza Mariam',              categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Dentista Mariam',           categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
  { concepto: 'Cuido de Mariam',           categoryCode: 'PERSONAL_MARIAM',   type: 'expense' },
]

// Fast lookup: concept text (lowercase) → CatalogEntry
export const CONCEPT_MAP = new Map<string, CatalogEntry>(
  CONCEPT_CATALOG.map(e => [e.concepto.toLowerCase(), e])
)

// Look up by concept text (case-insensitive)
export function lookupConcept(text: string): CatalogEntry | undefined {
  return CONCEPT_MAP.get(text.trim().toLowerCase())
}
