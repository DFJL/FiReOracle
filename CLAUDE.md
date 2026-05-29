# FiReOracle — Financial Intelligence Center

> Centro de inteligencia financiera personal potenciado por IA, construido sobre datos reales desde 2017-18.

---

## Vision

Reemplazar hojas de cálculo de finanzas personales con una plataforma modular, inteligente y conversacional que:

1. Centraliza toda la data financiera (ingresos, egresos, presupuesto, inversiones, network, patrimonio).
2. Permite consultar un **Oracle de IA** (Claude) con lenguaje natural sobre cualquier aspecto de las finanzas personales usando toda la data disponible.
3. Genera alertas, proyecciones y sugerencias proactivas.
4. Evoluciona con nuevos módulos sin romper los existentes.

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend/API | Next.js API Routes + Supabase Edge Functions |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Deploy | Vercel |
| IA / Oracle | Anthropic Claude API (claude-sonnet-4-6 o superior) |
| Charts | Recharts o Tremor |

---

## Principios de Desarrollo (NO NEGOCIABLES)

### 1. Modularidad
- Cada módulo financiero (gastos, presupuesto, inversiones, network, wealth) vive en su propia carpeta bajo `src/modules/<nombre>/`.
- Un módulo expone: schema SQL, tipos TypeScript, servicios (queries), componentes UI y, opcionalmente, un agente de IA propio.
- Los módulos se comunican a través de interfaces definidas, nunca importando internals de otro módulo.

### 2. Sin Hardcoding
- **Cero** valores literales en el código: monedas, categorías, umbrales, nombres de tablas, endpoints.
- Toda configuración vive en variables de entorno (`.env.local`) o en tablas de configuración en Supabase.
- Las constantes de dominio (ej. categorías de gasto) se almacenan en la base de datos y se cachean en runtime.

### 3. Variables de Entorno
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_DEFAULT_CURRENCY=USD
```
Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` ni `ANTHROPIC_API_KEY` al cliente.

### 4. Seguridad
- Row Level Security (RLS) habilitado en **todas** las tablas de Supabase.
- Las API Routes validan sesión antes de cualquier operación.
- Inputs del usuario sanitizados antes de pasar a queries o al Oracle de IA.
- Nunca construir SQL con concatenación de strings; usar siempre queries parametrizadas.

### 5. Eficiencia
- Queries costosas se cachean con `unstable_cache` de Next.js o en Supabase Edge Functions.
- Paginación obligatoria en listados; nunca `SELECT *` sin `LIMIT`.
- Índices en columnas de filtrado frecuente: `user_id`, `date`, `category_id`.

### 6. TypeScript Estricto
- `strict: true` en `tsconfig.json`. Sin `any` implícito.
- Tipos generados desde Supabase con `supabase gen types typescript`.
- Zod para validación de inputs en API routes y formularios.

### 7. Convenciones de Nomenclatura
- Base de datos: `snake_case` (tablas, columnas).
- TypeScript: `camelCase` (variables, funciones), `PascalCase` (tipos, componentes).
- Archivos de componentes: `PascalCase.tsx`; servicios y utils: `camelCase.ts`.

---

## Arquitectura de Módulos

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Rutas de autenticación
│   ├── (dashboard)/            # Rutas protegidas
│   │   ├── dashboard/
│   │   ├── expenses/
│   │   ├── budget/
│   │   ├── investments/
│   │   ├── network/
│   │   ├── wealth/
│   │   └── oracle/             # Chat con IA
│   └── api/
│       ├── oracle/             # Endpoint del Oracle de IA
│       └── [...módulos]/
│
├── modules/
│   ├── expenses/               # Gastos e ingresos
│   │   ├── schema.sql
│   │   ├── types.ts
│   │   ├── service.ts
│   │   └── components/
│   ├── budget/                 # Presupuesto
│   ├── investments/            # Inversiones
│   ├── network/                # Red de contactos financieros
│   ├── wealth/                 # Patrimonio neto / Wealth Stability
│   └── oracle/                 # Motor de IA
│       ├── prompts.ts          # System prompts por contexto
│       ├── contextBuilder.ts   # Agrega data financiera al contexto
│       └── oracle.ts           # Wrapper del Claude API
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Cliente browser
│   │   ├── server.ts           # Cliente server-side
│   │   └── admin.ts            # Cliente admin (solo server)
│   ├── validations/            # Schemas Zod compartidos
│   └── utils.ts
│
└── components/
    ├── ui/                     # shadcn/ui components
    ├── charts/                 # Wrappers de charts reutilizables
    └── layout/                 # Shell, nav, sidebar
```

---

## Módulos Financieros — Descripción

### expenses (Control de Ingresos y Egresos)
- Fuente de verdad principal; datos históricos desde 2017-18.
- Entidades: `transactions`, `categories`, `accounts`.
- Flujos: entrada manual, importación CSV, recurrentes automáticos.
- KPIs: flujo neto mensual, top categorías, comparativa YoY.

### budget (Presupuesto)
- Presupuestos por categoría y período.
- Alertas de sobre-gasto en tiempo real.
- Varianza real vs. presupuestado.

### investments (Inversiones)
- Portafolio multi-activo: acciones, cripto, fondos, inmuebles.
- Tracking de retorno, dividendos y rebalanceo.
- Integración futura con APIs de mercado.

### network (Red Financiera)
- Préstamos a/de personas, acuerdos informales, deudas sociales.
- Estado de cada relación financiera, fechas de vencimiento.

### wealth (Patrimonio / Wealth Stability)
- Balance sheet personal: activos vs. pasivos.
- Score de estabilidad financiera calculado dinámicamente.
- Proyecciones de independencia financiera (FIRE number).

### oracle (IA Financiera)
- Chat conversacional con acceso a toda la data del usuario.
- Responde preguntas como: "¿Cuánto gasté en comida en 2023?", "¿Cómo va mi ahorro vs. el año pasado?", "¿Cuándo alcanzo mi meta de $X?"
- El `contextBuilder` inyecta resúmenes financieros relevantes según la pregunta detectada.
- Genera reportes narrativos y sugerencias proactivas.

---

## Roadmap por Fases

### Fase 0 — Fundación (actual)
- [x] CLAUDE.md — arquitectura y principios
- [ ] Setup Next.js + Supabase + Vercel
- [ ] Auth flow completo
- [ ] Schema base de datos (migración inicial)
- [ ] Tipos TypeScript generados desde Supabase

### Fase 1 — Módulo Core: Expenses
- [ ] CRUD de transacciones
- [ ] Categorías configurables (sin hardcoding)
- [ ] Importación histórica (2017-18 → presente)
- [ ] Dashboard con KPIs básicos y gráficas

### Fase 2 — Budget & Wealth
- [ ] Presupuestos por categoría
- [ ] Balance sheet personal
- [ ] Wealth Stability Score

### Fase 3 — Oracle de IA
- [ ] Endpoint `/api/oracle` con Claude API
- [ ] Context builder: agrega data financiera relevante
- [ ] UI de chat conversacional
- [ ] Historial de conversaciones persistido en Supabase

### Fase 4 — Investments & Network
- [ ] Portfolio tracker
- [ ] Red financiera personal

### Fase 5 — Inteligencia Avanzada
- [ ] Alertas y sugerencias proactivas (Edge Functions + cron)
- [ ] Proyecciones de FIRE
- [ ] Reportes narrativos generados por IA
- [ ] Integración con APIs de mercado financiero

---

## Guía para Nuevos Features

Antes de implementar cualquier feature nuevo:

1. **Identifica el módulo** al que pertenece o crea uno nuevo en `src/modules/`.
2. **Define el schema SQL** primero; crea una migración en `supabase/migrations/`.
3. **Genera tipos** con `supabase gen types typescript`.
4. **Escribe el servicio** (queries) antes que la UI.
5. **Valida con Zod** todo input que venga del cliente.
6. **Agrega al Oracle**: si el módulo produce datos útiles para consultas de IA, actualiza `contextBuilder.ts`.

---

## Sugerencias de Features Futuros

- Scraping automático de extractos bancarios (PDF → datos estructurados vía IA).
- Notificaciones push de alertas de gasto.
- Multi-moneda con conversión automática.
- Compartir reportes financieros encriptados.
- Modo "simulación": ¿qué pasa si gasto X menos por mes?
- Integración con calendario para vencimientos y cobros.
- Export a PDF de reportes con branding personalizado.
- Score crediticio simulado basado en comportamiento histórico.

---

## Referencia de Archivos de Origen

Los archivos de referencia históricos (hojas de cálculo 2017-2018+) se documentan aquí conforme se agregan:

| Archivo | Descripción | Estado |
|---|---|---|
| Control de Ingresos y Egresos | Mando de control principal, datos históricos | Pendiente importación |

---

*Este archivo es el contrato de arquitectura del proyecto. Cualquier decisión técnica que lo contradiga requiere actualizar primero este documento.*
