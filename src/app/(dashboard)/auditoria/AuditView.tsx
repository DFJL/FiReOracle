'use client'

import { useState, useTransition } from 'react'
import { runAudit } from '@/app/actions/audit'
import type { AuditReport, AuditCheck, AuditSeverity } from '@/app/actions/audit'

function fmtCRC(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

const SEV_META: Record<AuditSeverity, { label: string; dot: string; badge: string; border: string; head: string }> = {
  error:   { label: 'Error',      dot: 'bg-rose-400',   badge: 'bg-rose-500/15 text-rose-400',      border: 'border-rose-500/20',   head: 'bg-rose-500/[0.05]'   },
  warning: { label: 'Advertencia',dot: 'bg-amber-400',  badge: 'bg-amber-500/15 text-amber-400',    border: 'border-amber-500/20',  head: 'bg-amber-500/[0.05]'  },
  info:    { label: 'Info',       dot: 'bg-blue-400',   badge: 'bg-blue-500/15 text-blue-400',      border: 'border-blue-500/20',   head: 'bg-blue-500/[0.05]'   },
  ok:      { label: 'OK',         dot: 'bg-lime-400',   badge: 'bg-lime-500/15 text-lime-400',      border: 'border-white/[0.06]',  head: 'bg-white/[0.02]'      },
}

function CheckCard({ check }: { check: AuditCheck }) {
  const [open, setOpen] = useState(check.severity !== 'ok' && check.count > 0)
  const m = SEV_META[check.severity]

  return (
    <div className={`rounded-xl border ${m.border} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 ${m.head} text-left`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-zinc-200">{check.label}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{check.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {check.count > 0 && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.badge}`}>
              {check.count}
            </span>
          )}
          {check.severity === 'ok' && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-lime-500/15 text-lime-400">✓</span>
          )}
          <span className="text-zinc-600 text-[10px]">{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && check.issues.length > 0 && (
        <div className="border-t border-white/[0.04]">
          {check.issues.map((issue, i) => (
            <div key={issue.id + i} className="px-4 py-2.5 border-b border-white/[0.03] last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-300">{issue.description}</p>
                  {issue.action && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">→ {issue.action}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {issue.date && <p className="text-[10px] text-zinc-600">{issue.date}</p>}
                  {issue.amount !== undefined && issue.amount !== 0 && (
                    <p className="text-[11px] font-bold tabular-nums text-zinc-400">{fmtCRC(issue.amount)}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && check.count === 0 && check.severity === 'ok' && (
        <div className="px-4 py-2.5 border-t border-white/[0.04]">
          <p className="text-[10px] text-lime-600">Sin problemas encontrados.</p>
        </div>
      )}
    </div>
  )
}

export function AuditView() {
  const [report, setReport]   = useState<AuditReport | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [isPending, start]    = useTransition()

  function run() {
    setError(null)
    start(async () => {
      const res = await runAudit()
      if ('error' in res) { setError(res.error); return }
      setReport(res)
    })
  }

  const errorChecks   = report?.checks.filter(c => c.severity === 'error'   && c.count > 0) ?? []
  const warningChecks = report?.checks.filter(c => c.severity === 'warning'  && c.count > 0) ?? []
  const infoChecks    = report?.checks.filter(c => c.severity === 'info'     && c.count > 0) ?? []
  const okChecks      = report?.checks.filter(c => c.severity === 'ok')                      ?? []

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">Fire Oracle</p>
          <h1 className="text-2xl font-black text-white mt-0.5">Auditoría de datos</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Revisa duplicados, inconsistencias de flujo, clasificaciones faltantes y coherencia entre módulos.
          </p>
        </div>
        <button
          onClick={run}
          disabled={isPending}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#a3e635] text-black text-sm font-black disabled:opacity-50 hover:bg-[#b4f040] transition-colors"
        >
          {isPending ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Analizando…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {report ? 'Re-ejecutar auditoría' : 'Ejecutar auditoría'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">{error}</div>
      )}

      {/* Summary strip */}
      {report && (
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-xl p-3 border ${report.total_errors > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Errores</p>
            <p className={`text-2xl font-black mt-0.5 ${report.total_errors > 0 ? 'text-rose-400' : 'text-zinc-600'}`}>
              {report.total_errors}
            </p>
          </div>
          <div className={`rounded-xl p-3 border ${report.total_warnings > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Advertencias</p>
            <p className={`text-2xl font-black mt-0.5 ${report.total_warnings > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
              {report.total_warnings}
            </p>
          </div>
          <div className="rounded-xl p-3 border bg-white/[0.03] border-white/[0.06]">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Checks</p>
            <p className="text-2xl font-black mt-0.5 text-zinc-400">{report.checks.length}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {report && (
        <div className="space-y-6">
          {errorChecks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-rose-400/70 uppercase tracking-[0.16em]">Errores — acción requerida</p>
              {errorChecks.map(c => <CheckCard key={c.id} check={c} />)}
            </div>
          )}
          {warningChecks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-[0.16em]">Advertencias</p>
              {warningChecks.map(c => <CheckCard key={c.id} check={c} />)}
            </div>
          )}
          {infoChecks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-blue-400/70 uppercase tracking-[0.16em]">Informativo</p>
              {infoChecks.map(c => <CheckCard key={c.id} check={c} />)}
            </div>
          )}
          {okChecks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.16em]">Sin problemas</p>
              {okChecks.map(c => <CheckCard key={c.id} check={c} />)}
            </div>
          )}
          <p className="text-[9px] text-zinc-700 text-center pt-2">
            Ejecutado {new Date(report.ran_at).toLocaleString('es-CR')}
          </p>
        </div>
      )}

      {!report && !isPending && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center space-y-2">
          <p className="text-zinc-500 text-sm font-semibold">Listo para auditar</p>
          <p className="text-zinc-700 text-xs">
            10 verificaciones: duplicados, clasificaciones, flujo, coherencia entre módulos y más.
          </p>
        </div>
      )}
    </div>
  )
}
