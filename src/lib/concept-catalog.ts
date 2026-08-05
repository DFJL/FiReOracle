// Full transaction catalog derived from Google Sheets (I-1..I-65, E-1..E-158).
// Concept strings match the spreadsheet EXACTLY so datalist selection → auto-derive works.

export type CatalogEntry = {
  concepto: string
  categoryCode: string
  type: 'income' | 'expense'
}

export const CONCEPT_CATALOG: CatalogEntry[] = [
  // ── INGRESOS (I-1..I-65) ──────────────────────────────────────────────────
  { concepto: 'Salario',                                          categoryCode: 'SALARY',                   type: 'income' },
  { concepto: 'Salario Escolar',                                  categoryCode: 'SALARY_ESCOLAR',           type: 'income' },
  { concepto: 'Aguinaldo',                                        categoryCode: 'AGUINALDO',                type: 'income' },
  { concepto: 'Intereses',                                        categoryCode: 'INTEREST',                 type: 'income' },
  { concepto: 'Regalo de',                                        categoryCode: 'GIFT_INCOME',              type: 'income' },
  { concepto: 'Depósito Cuenta Débito',                           categoryCode: 'DEPOSIT_DEBIT',            type: 'income' },  // I-6
  { concepto: 'Entrada extra efectivo',                           categoryCode: 'MISC_INCOME',              type: 'income' },  // I-7
  { concepto: 'Otros pagos laborales',                            categoryCode: 'WORK_OTHER',               type: 'income' },  // I-8
  { concepto: 'Préstamo',                                         categoryCode: 'LOAN_RECEIVED',            type: 'income' },  // I-9
  { concepto: 'Retiro FCL',                                       categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-10
  { concepto: 'Pago viáticos',                                    categoryCode: 'WORK_OTHER',               type: 'income' },  // I-11
  { concepto: 'Salario UNED',                                     categoryCode: 'SALARY',                   type: 'income' },  // I-12
  { concepto: 'Ingreso no identificado',                          categoryCode: 'MISC_INCOME',              type: 'income' },  // I-13
  { concepto: 'Pago de millas/puntos',                            categoryCode: 'MISC_INCOME',              type: 'income' },  // I-14
  { concepto: 'Clase',                                            categoryCode: 'WORK_OTHER',               type: 'income' },  // I-15
  { concepto: 'Pago de excedentes',                               categoryCode: 'WORK_OTHER',               type: 'income' },  // I-16
  { concepto: 'Ahorro',                                           categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-17
  { concepto: 'Subsidio',                                         categoryCode: 'MISC_INCOME',              type: 'income' },  // I-18
  { concepto: 'Venta de bienes muebles',                          categoryCode: 'ASSET_SALE',               type: 'income' },  // I-19
  { concepto: 'Liquidación ahorre su vuelto',                     categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-20
  { concepto: 'Ingreso Netflix/Spotify',                          categoryCode: 'RENTAL_INCOME',            type: 'income' },  // I-21
  { concepto: 'Reembolso Seguro',                                 categoryCode: 'REIMBURSEMENT',            type: 'income' },  // I-22
  { concepto: 'Liquidación de ahorros',                           categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-23
  { concepto: 'Liquidación BAC Objetivos',                        categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-24
  { concepto: 'Liquidación CDP',                                  categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-25
  { concepto: 'Liquidación Ahorro personal Asociación',           categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-26
  { concepto: 'Liquidación Ahorro Asociación',                    categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-27
  { concepto: 'Liquidación Ahorro Coopeande',                     categoryCode: 'SAVINGS_LIQUIDATION',      type: 'income' },  // I-28
  { concepto: 'Intereses de Ahorros',                             categoryCode: 'SAVINGS_INTEREST',         type: 'income' },  // I-29
  { concepto: 'Excedentes de ahorros',                            categoryCode: 'SAVINGS_EXCEDENTES',       type: 'income' },  // I-30
  { concepto: 'Liquidación Intereses CDP',                        categoryCode: 'SAVINGS_INTEREST',         type: 'income' },  // I-31
  { concepto: 'Rendimientos Fondo Inversión',                     categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-32
  { concepto: 'Liquidación Rendimientos Fondo Inversión',         categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },  // I-33
  { concepto: 'Liquidación Fondo de Inversión',                   categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-34
  { concepto: 'Liquidación de Excedentes de ahorros',             categoryCode: 'SAVINGS_EXCEDENTES',       type: 'income' },  // I-35
  { concepto: 'Liquidación Laboral',                              categoryCode: 'LABOR_SETTLEMENT',         type: 'income' },  // I-36
  { concepto: 'Rendimientos Fondo Inversión Dominion',            categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-37
  { concepto: 'Liquidación Fondo de Inversión Dominion',          categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-38
  { concepto: 'Rendimientos Fondo Inversión TRANSCOMER',          categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-39
  { concepto: 'Liquidación Rendimientos Fondo Inversión TRANSCOMER', categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' }, // I-40
  { concepto: 'Liquidación Fondo de Inversión TRANSCOMER',        categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-41
  { concepto: 'Rendimientos Juicy Fields',                        categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-42
  { concepto: 'Liquidación Juicy Fields',                         categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-43
  { concepto: 'Rendimientos SH Mining',                           categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-44
  { concepto: 'Liquidación SH Mining',                            categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-45
  { concepto: 'Rendimientos Meatex',                              categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-46
  { concepto: 'Liquidación Rendimientos Meatex',                  categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },  // I-47
  { concepto: 'Rendimientos Royal Q',                             categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },  // I-48
  { concepto: 'Liquidación Royal Q',                              categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-49
  { concepto: 'Rendimientos Hodl criptomonedas',                  categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },  // I-50
  { concepto: 'Liquidación Criptomoneda',                         categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-51
  { concepto: 'Liquidación Fondo de Inversión Dólares',           categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-52
  { concepto: 'Intereses préstamos USDT',                         categoryCode: 'SAVINGS_INTEREST',         type: 'income' },  // I-53
  { concepto: 'Minería Ethereum Tarjetas gráficas',               categoryCode: 'INVESTMENT_RETURN_MINING', type: 'income' },  // I-54
  { concepto: 'Rendimientos Farming Crypto Monedas',              categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },  // I-55
  { concepto: 'Rendimientos Anchor Protocol',                     categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },  // I-56
  { concepto: 'Liquidación Anchor Protocol',                      categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },  // I-57
  { concepto: 'Liquidación Rendimientos Farming Crypto Monedas',  categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },  // I-58
  { concepto: 'Rendimientos nodos Crypto',                        categoryCode: 'INVESTMENT_RETURN_CRYPTO', type: 'income' },  // I-59
  { concepto: 'Liquidación Rendimientos nodos Crypto',            categoryCode: 'INVESTMENT_RETURN_LIQUID', type: 'income' },  // I-60
  { concepto: 'Rendimientos Multimoney',                          categoryCode: 'INVESTMENT_RETURN',        type: 'income' },  // I-61
  { concepto: 'Aumento de valor Criptomonedas',                   categoryCode: 'APPRECIATION',             type: 'income' },  // I-62
  { concepto: 'Aumento de valor Dominion',                        categoryCode: 'APPRECIATION',             type: 'income' },  // I-62b
  { concepto: 'Rendimientos Scotiabank',                          categoryCode: 'SAVINGS_INTEREST',         type: 'income' },  // I-63
  { concepto: 'Alquiler casa',                                    categoryCode: 'RENTAL_INCOME',            type: 'income' },  // I-64
  { concepto: 'Venta de bienes inmuebles',                        categoryCode: 'ASSET_SALE',               type: 'income' },  // I-65

  // Extra income entries in bucket concept_maps or common user usage (not in original I-* list)
  { concepto: 'Bono',                                             categoryCode: 'WORK_OTHER',               type: 'income' },
  { concepto: 'Venta de crypto',                                  categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },

  // ROP & FCL / Pensión Voluntaria buckets (concept_based)
  { concepto: 'Ajuste de valor ROP & FCL',                        categoryCode: 'APPRECIATION',             type: 'income' },
  { concepto: 'Rendimientos ROP & FCL',                           categoryCode: 'INVESTMENT_RETURN',        type: 'income' },
  { concepto: 'Liquidación ROP & FCL',                            categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },
  { concepto: 'Ajuste de valor Pensión Voluntaria',                categoryCode: 'APPRECIATION',             type: 'income' },
  { concepto: 'Rendimientos Pensión Voluntaria',                  categoryCode: 'INVESTMENT_RETURN',        type: 'income' },
  { concepto: 'Liquidación Pensión Voluntaria',                   categoryCode: 'INVESTMENT_LIQUIDATION',   type: 'income' },

  // ── EGRESOS (E-1..E-158) ──────────────────────────────────────────────────
  // Transporte
  { concepto: 'Autobus',                                          categoryCode: 'TRANSPORT',                type: 'expense' },
  { concepto: 'Taxi',                                             categoryCode: 'TRANSPORT',                type: 'expense' },
  { concepto: 'Uber',                                             categoryCode: 'TRANSPORT',                type: 'expense' },
  { concepto: 'Tren',                                             categoryCode: 'TRANSPORT',                type: 'expense' },
  { concepto: 'Gasolina',                                         categoryCode: 'TRANSPORT_FUEL',           type: 'expense' },
  { concepto: 'Mantenimiento carro',                              categoryCode: 'TRANSPORT_MAINT',          type: 'expense' },
  { concepto: 'Revisión carro',                                   categoryCode: 'TRANSPORT_MAINT',          type: 'expense' },
  { concepto: 'Lavado de carro',                                  categoryCode: 'CAR_EXPENSES',             type: 'expense' },
  { concepto: 'Marchamo',                                         categoryCode: 'CAR_EXPENSES',             type: 'expense' },
  { concepto: 'Otros gastos de carro',                            categoryCode: 'CAR_EXPENSES',             type: 'expense' },
  { concepto: 'Parqueo',                                          categoryCode: 'TRANSPORT_PARKING',        type: 'expense' },
  { concepto: 'Alquiler de carro',                                categoryCode: 'TRANSPORT',                type: 'expense' },
  { concepto: 'Flete',                                            categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Servicio flete(compra internet)',                   categoryCode: 'SERVICES',                 type: 'expense' },

  // Alimentación
  { concepto: 'Desayuno',                                         categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Almuerzo',                                         categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Cena',                                             categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Otro alimentación',                                categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Café',                                             categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Comida rápida',                                    categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Soda Walmart',                                     categoryCode: 'FOOD_OUT',                 type: 'expense' },
  { concepto: 'Abarrotes / Supermercado',                         categoryCode: 'FOOD_SUPER',               type: 'expense' },
  { concepto: 'Abarrotes',                                        categoryCode: 'FOOD_SUPER',               type: 'expense' },

  // Servicios del hogar / generales
  { concepto: 'Pago electricidad',                                categoryCode: 'SERVICES_ELECTRIC',        type: 'expense' },
  { concepto: 'Pago agua',                                        categoryCode: 'SERVICES_WATER',           type: 'expense' },
  { concepto: 'Pago de internet',                                 categoryCode: 'SERVICES_INTERNET',        type: 'expense' },
  { concepto: 'Pago de celular',                                  categoryCode: 'SERVICES_PHONE',           type: 'expense' },
  { concepto: 'Pago teléfono',                                    categoryCode: 'SERVICES_PHONE',           type: 'expense' },
  { concepto: 'Pago cable',                                       categoryCode: 'SERVICES_STREAMING',       type: 'expense' },
  { concepto: 'Servicios del hogar',                              categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Limpieza de casa',                                 categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Jardinería',                                       categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Seguridad casa',                                   categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Servicios Legales',                                categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Otros servicios',                                  categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Envío de documentos',                              categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Certificación',                                    categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Impresiones',                                      categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Servicio de electricista',                         categoryCode: 'HOME_RENO',                type: 'expense' },
  { concepto: 'Servicio de costurería',                           categoryCode: 'SERVICES',                 type: 'expense' },
  { concepto: 'Pago alquiler',                                    categoryCode: 'RENT_SERVICE',             type: 'expense' },
  { concepto: 'Pago de alquiler de casa',                         categoryCode: 'RENT_SERVICE',             type: 'expense' },
  { concepto: 'Cobros Bancarios',                                 categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Comisiones',                                       categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Cuota anual TC',                                   categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Cuota anual tarjeta',                              categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Intereses TC',                                     categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Interés TC',                                       categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Cargo por mora',                                   categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Retiro ATM',                                       categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Retiro efectivo',                                  categoryCode: 'MISC_EXPENSE',             type: 'expense' },

  // Salud
  { concepto: 'Medicamentos',                                     categoryCode: 'HEALTH_MEDS',              type: 'expense' },
  { concepto: 'Pastillas',                                        categoryCode: 'HEALTH_MEDS',              type: 'expense' },
  { concepto: 'Pastillas anticonceptivas',                        categoryCode: 'HEALTH_MEDS',              type: 'expense' },
  { concepto: 'Médico',                                           categoryCode: 'HEALTH_CONSULT',           type: 'expense' },
  { concepto: 'Dental',                                           categoryCode: 'HEALTH_DENTAL',            type: 'expense' },
  { concepto: 'Dentista Sita',                                    categoryCode: 'PERSONAL_SITA',            type: 'expense' },
  { concepto: 'Dentista Mariam',                                  categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Pediatra Mariam',                                  categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Gimnasio',                                         categoryCode: 'HEALTH_GYM',               type: 'expense' },
  { concepto: 'Mensualidad Gimnasio',                             categoryCode: 'HEALTH_GYM',               type: 'expense' },
  { concepto: 'Otros Salud',                                      categoryCode: 'HEALTH',                   type: 'expense' },
  { concepto: 'Vitaminas',                                        categoryCode: 'HEALTH',                   type: 'expense' },
  { concepto: 'Lentes de contacto',                               categoryCode: 'HEALTH',                   type: 'expense' },
  { concepto: 'Emergencias médicas',                              categoryCode: 'HEALTH',                   type: 'expense' },

  // Seguros
  { concepto: 'Seguro de vida',                                   categoryCode: 'INSURANCE_LIFE',           type: 'expense' },
  { concepto: 'Seguro médico',                                    categoryCode: 'INSURANCE_HEALTH',         type: 'expense' },
  { concepto: 'Seguro auto',                                      categoryCode: 'INSURANCE_CAR',            type: 'expense' },
  { concepto: 'Seguro de vida/gastos médicos',                    categoryCode: 'INSURANCE_LIFE',           type: 'expense' },
  { concepto: 'Seguro tarjetas',                                  categoryCode: 'INSURANCE_LIFE',           type: 'expense' },
  { concepto: 'Seguro TC',                                        categoryCode: 'INSURANCE_LIFE',           type: 'expense' },
  { concepto: 'Seguro de saldo',                                  categoryCode: 'INSURANCE_LIFE',           type: 'expense' },
  { concepto: 'Seguro vehículo',                                  categoryCode: 'INSURANCE_CAR',            type: 'expense' },
  { concepto: 'Seguro hogar',                                     categoryCode: 'INSURANCE_LIFE',           type: 'expense' },

  // Entretenimiento
  { concepto: 'Entradas de cine',                                 categoryCode: 'ENTERTAINMENT_EVENTS',     type: 'expense' },
  { concepto: 'Entradas de conciertos',                           categoryCode: 'ENTERTAINMENT_EVENTS',     type: 'expense' },
  { concepto: 'Entrada a bares',                                  categoryCode: 'ENTERTAINMENT_EVENTS',     type: 'expense' },
  { concepto: 'Actividades',                                      categoryCode: 'ENTERTAINMENT_EVENTS',     type: 'expense' },
  { concepto: 'Otros entretenimiento',                            categoryCode: 'ENTERTAINMENT',            type: 'expense' },
  { concepto: 'Videojuego',                                       categoryCode: 'ENTERTAINMENT',            type: 'expense' },
  { concepto: 'Alquiler/compra de películas',                     categoryCode: 'ENTERTAINMENT',            type: 'expense' },
  { concepto: 'Hospedaje Hotel',                                  categoryCode: 'ENTERTAINMENT',            type: 'expense' },
  { concepto: 'Pago Netflix',                                     categoryCode: 'ENTERTAINMENT_SUBS',       type: 'expense' },
  { concepto: 'Pago Spotify',                                     categoryCode: 'ENTERTAINMENT_SUBS',       type: 'expense' },
  { concepto: 'Pago Hbo Max',                                     categoryCode: 'ENTERTAINMENT_SUBS',       type: 'expense' },
  { concepto: 'Pago Google One',                                  categoryCode: 'AFFILIATIONS',             type: 'expense' },
  { concepto: 'Pago Office 365',                                  categoryCode: 'AFFILIATIONS',             type: 'expense' },
  { concepto: 'Pago de afiliaciones',                             categoryCode: 'AFFILIATIONS',             type: 'expense' },
  { concepto: 'Pago colegio C.E.',                                categoryCode: 'AFFILIATIONS',             type: 'expense' },

  // Vestimenta
  { concepto: 'Ropa',                                             categoryCode: 'CLOTHING',                 type: 'expense' },
  { concepto: 'Zapatos',                                          categoryCode: 'CLOTHING',                 type: 'expense' },
  { concepto: 'Accesorios personales',                            categoryCode: 'CLOTHING',                 type: 'expense' },

  // Cuidado personal
  { concepto: 'Corte de pelo',                                    categoryCode: 'PERSONAL_CARE',            type: 'expense' },
  { concepto: 'Corte de barba',                                   categoryCode: 'PERSONAL_CARE',            type: 'expense' },
  { concepto: 'Artículos de cuidado personal',                    categoryCode: 'PERSONAL_CARE',            type: 'expense' },
  { concepto: 'Tatuajes',                                         categoryCode: 'PERSONAL_CARE',            type: 'expense' },
  { concepto: 'Pasta de dientes',                                 categoryCode: 'PERSONAL_CARE',            type: 'expense' },
  { concepto: 'Jabón de ropa',                                    categoryCode: 'HOME',                     type: 'expense' },

  // Hogar / casa
  { concepto: 'Artículos de limpieza',                            categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'Artículos de casa',                                categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'Artículos para casa',                              categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'útiles varios',                                    categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'Mueble',                                           categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'Herramientas/piezas de ferreteria',                categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'Herramientas / ferretería',                        categoryCode: 'HOME',                     type: 'expense' },
  { concepto: 'Mano de obra arreglo casa',                        categoryCode: 'HOME_RENO',                type: 'expense' },
  { concepto: 'Mano de obra(arreglo de casa)',                    categoryCode: 'HOME_RENO',                type: 'expense' },
  { concepto: 'Materiales construcción',                          categoryCode: 'HOME_RENO',                type: 'expense' },
  { concepto: 'Mantenimiento hogar',                              categoryCode: 'HOME_RENO',                type: 'expense' },
  { concepto: 'Artículos de tecnología',                          categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Accesorios de tecnología',                         categoryCode: 'MISC_EXPENSE',             type: 'expense' },

  // Educación
  { concepto: 'Pago matrícula UCR',                               categoryCode: 'EDUCATION',                type: 'expense' },
  { concepto: 'Pago mensualidad clases',                          categoryCode: 'EDUCATION',                type: 'expense' },
  { concepto: 'Pago de libros',                                   categoryCode: 'EDUCATION',                type: 'expense' },
  { concepto: 'Libro',                                            categoryCode: 'EDUCATION',                type: 'expense' },
  { concepto: 'Periódico',                                        categoryCode: 'EDUCATION',                type: 'expense' },
  { concepto: 'Artículos de lectura',                             categoryCode: 'EDUCATION',                type: 'expense' },

  // Impuestos
  { concepto: 'Impuestos municipales',                            categoryCode: 'TAXES',                    type: 'expense' },
  { concepto: 'Multa intereses',                                  categoryCode: 'TAXES',                    type: 'expense' },

  // Préstamos
  { concepto: 'Pago préstamo',                                    categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Préstamo hipotecario',                             categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Préstamo personal',                                categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Préstamo prendario',                               categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Pago extraordinario préstamo hipotecario',         categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Pago extraordinario préstamo prendario',           categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Pago extraordinario préstamo personal',            categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Pago Tarjeta Crédito HSBC',                        categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Pago Tarjeta Citibank',                            categoryCode: 'LOAN_PAYMENT',             type: 'expense' },
  { concepto: 'Pago Tarjeta Promerica',                           categoryCode: 'LOAN_PAYMENT',             type: 'expense' },

  // Pagos del trabajo
  { concepto: 'Cuota de café trabajo',                            categoryCode: 'WORK_PAYMENTS',            type: 'expense' },
  { concepto: 'Cuota de trabajo',                                 categoryCode: 'WORK_PAYMENTS',            type: 'expense' },

  // Ahorro / inversión
  { concepto: 'Apertura CDP',                                     categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Ahorre su vuelto',                                 categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Ahorro BAC Objetivos',                             categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Ahorro personal Asociación',                       categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Ahorro Asociación',                                categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Ahorro Coopeande',                                 categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión',                      categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión Dominion',             categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión TRANSCOMER',           categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión Dólares',              categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión(Ahorro emergencia)',   categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Apertura Fondo de Inversión (Ahorro emergencia)',  categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión Juicy Fields',                           categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión SH Mining',                              categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión Meatex',                                 categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión Royal Q',                                categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión Anchor Protocol',                        categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión en nodos Crypto',                        categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Inversión Emprendimiento',                         categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Compra Bitcoins',                                  categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Compra Bienes Inmuebles',                          categoryCode: 'SAVINGS_INVESTMENT',       type: 'expense' },
  { concepto: 'Compra de Automovil',                              categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Regimen de pensión voluntaria',                    categoryCode: 'SAVINGS_PENSION',          type: 'expense' },
  { concepto: 'Pensión voluntaria',                               categoryCode: 'SAVINGS_PENSION',          type: 'expense' },

  // Gastos propiedad alquiler
  { concepto: 'Gastos casa de alquiler',                          categoryCode: 'RENTAL_EXPENSE',           type: 'expense' },

  // Regalos / donaciones
  { concepto: 'Regalo a',                                         categoryCode: 'GIFTS',                    type: 'expense' },
  { concepto: 'Donación',                                         categoryCode: 'GIFTS',                    type: 'expense' },

  // Viajes
  { concepto: 'Tiquetes aéreos',                                  categoryCode: 'SAVINGS_TRAVEL',           type: 'expense' },
  { concepto: 'Trámite de viaje',                                 categoryCode: 'SAVINGS_TRAVEL',           type: 'expense' },
  { concepto: 'Pago entrevista Visa',                             categoryCode: 'SAVINGS_TRAVEL',           type: 'expense' },

  // Pérdidas
  { concepto: 'Pérdida',                                          categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Robo',                                             categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Pérdida valor Criptomonedas',                      categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Pérdida valor Dominion',                           categoryCode: 'MISC_EXPENSE',             type: 'expense' },

  // Varios / otros
  { concepto: 'Egreso no identificado',                           categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Otro',                                             categoryCode: 'MISC_EXPENSE',             type: 'expense' },

  // Personal — Emma, Sita, Mariam, Daniel, Julia
  { concepto: 'Manutención Emma',                                 categoryCode: 'PERSONAL_EMMA',            type: 'expense' },
  { concepto: 'Pago Sita',                                        categoryCode: 'PERSONAL_SITA',            type: 'expense' },
  { concepto: 'Pago Daniel',                                      categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Pago Julia',                                       categoryCode: 'MISC_EXPENSE',             type: 'expense' },
  { concepto: 'Artículos de Mariam',                              categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Ropa de Mariam',                                   categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Mensualidad kinder',                               categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Matrícula kinder',                                 categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Buseta Mariam',                                    categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Uniformes Mariam',                                 categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Otros gastos Kinder Mariam',                       categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Otros Mariam',                                     categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Leche Mariam',                                     categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Danza Mariam',                                     categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
  { concepto: 'Cuido de Mariam',                                  categoryCode: 'PERSONAL_MARIAM',          type: 'expense' },
]

// Fast lookup: concept (lowercase) → CatalogEntry
export const CONCEPT_MAP = new Map<string, CatalogEntry>(
  CONCEPT_CATALOG.map(e => [e.concepto.toLowerCase().trim(), e])
)

// Spanish stopwords stripped before significant-word matching (tier 4)
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'a', 'en', 'por', 'para', 'con', 'al', 'su', 'sus', 'lo', 'le'])
const sigWords = (s: string): string[] => s.split(/\s+/).filter(w => w.length > 1 && !STOPWORDS.has(w))

// Pre-computed significant-word sets for each catalog key (avoids recomputing per lookup)
const CONCEPT_SIG = new Map<string, Set<string>>(
  Array.from(CONCEPT_MAP.keys()).map(k => [k, new Set(sigWords(k))])
)

// Lookup by concept text. Tries:
//   1. Exact case-insensitive match
//   2. Any catalog entry whose key starts with the user's text (user typed prefix)
//   3. Any catalog entry whose key starts with the first 3 words of user's text
//   4. All significant words in user input are found in a catalog key
//      (handles dropped articles/prepositions, e.g. "Limpieza casa" → "Limpieza de casa")
export function lookupConcept(text: string): CatalogEntry | undefined {
  const t = text.trim().toLowerCase()
  if (!t) return undefined

  // 1. Exact
  const exact = CONCEPT_MAP.get(t)
  if (exact) return exact

  // 2. Catalog key starts with user's input (user typed a prefix of a catalog entry, ≥8 chars)
  if (t.length >= 8) {
    for (const [key, entry] of CONCEPT_MAP) {
      if (key.startsWith(t)) return entry
    }
  }

  // 3. First 3 words of user's input match start of a catalog key (handles added notes/annotations)
  const first3 = t.split(/\s+/).slice(0, 3).join(' ')
  if (first3.length >= 8) {
    for (const [key, entry] of CONCEPT_MAP) {
      if (key.startsWith(first3)) return entry
    }
  }

  // 4. Significant-word subset: all content words from user input appear in a catalog key.
  //    Prepositions/articles stripped from both sides, so "Limpieza casa" matches "Limpieza de casa".
  const userSig = sigWords(t)
  if (userSig.length >= 2) {
    for (const [key, entry] of CONCEPT_SIG) {
      if (userSig.every(w => entry.has(w))) return CONCEPT_MAP.get(key)!
    }
  }

  return undefined
}
