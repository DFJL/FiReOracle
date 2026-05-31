'use client'

import { useState, useTransition } from 'react'
import { Plus, RefreshCw, Trash2, TrendingUp } from 'lucide-react'
import {
  createAsset,
  updateAssetValue,
  deactivateAsset,
  createLiability,
  updateLiabilityBalance,
  deactivateLiability,
} from '@/app/actions/patrimonio'

type Asset = {
  id: string; name: string; asset_type: string
  value_crc: number; as_of_date: string
  is_investable: boolean; notes: string | null
}

type Liability = {
  id: string; name: string; liability_type: string
  current_balance: number; original_balance: number | null
  interest_rate: number | null; as_of_date: string
}

type TrendPoint = { month: string; total: number }

type Props = {
  liquidBalance: number
  totalInvested: number
  iliquidTotal: number
  iliquidInvestable: number
  totalLiabilities: number
  totalActivos: number
  patrimonioNeto: number
  activosInvertibles: number
  assets: Asset[]
  liabilities: Liability[]
  monthlyTrend: TrendPoint[]
}

const ASSET_TYPES = [
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'vehicle',     label: 'Vehículo' },
  { value: 'pension',     label: 'Pensión / OPC' },
  { value: 'business',    label: 'Negocio' },
  { value: 'crypto',      label: 'Cripto' },
  { value: 'other',       label: 'Otro' },
]

const LIABILITY_TYPES = [
  { value: 'mortgage',       label: 'Hipoteca' },
  { value: 'auto_loan',      label: 'Préstamo vehículo' },
  { value: 'personal_loan',  label: 'Préstamo personal' },
  { value: 'credit_card',    label: 'Tarjeta de crédito' },
  { value: 'student_loan',   label: 'Préstamo estudiantil' },
  { value: 'other',          label: 'Otro' },
]

const ASSET_LABEL: Record<string, string> = Object.fromEntries(ASSET_TYPES.map(t => [t.value, t.label]))
const LIABILITY_LABEL: Record<string, string> = Object.fromEntries(LIABILITY_TYPES.map(t => [t.value, t.label]))

function fmtShort(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `₡${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `₡${(v / 1_000).toFixed(0)}K`
  return `₡${Math.round(v).toLocaleString('es-CR')}`
}

function today() { return new Date().toISOString().slice(0, 10) }

// ─── Trend chart ─────────────────────────────────────────────────────────────

function TrendChart({ data }: { data: TrendPoint[] }) {
  const pts = data.slice(-24)
  if (pts.length < 2) {
    return (
      <div className="h-28 flex items-center justify-center text-xs text-zinc-600">
        Sin historial de movimientos aún
      </div>
    )
  }
  const W = 600, H = 80, PAD = 4
  const values = pts.map(p => p.total)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => H - PAD - ((v - minV) / range) * (H - 2 * PAD)
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(pts.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pnGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3e635" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#pnGrad)" />
      <path d={linePath} fill="none" stroke="#a3e635" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <text x={PAD + 2} y={H - 2} fill="#52525b" fontSize="9" textAnchor="start">{pts[0].month}</text>
      <text x={W - PAD - 2} y={H - 2} fill="#52525b" fontSize="9" textAnchor="end">{pts[pts.length - 1].month}</text>
    </svg>
  )
}

// ─── Breakdown bars ──────────────────────────────────────────────────────────

function BreakdownBar({
  liquidBalance, totalInvested, iliquidTotal, totalLiabilities, totalActivos,
}: {
  liquidBalance: number; totalInvested: number; iliquidTotal: number
  totalLiabilities: number; totalActivos: number
}) {
  if (totalActivos <= 0) return null
  const pct = (v: number) => `${((v / totalActivos) * 100).toFixed(1)}%`
  const ratio = (v: number) => v / totalActivos

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Activos</span>
          <span className="text-xs font-bold text-zinc-300">{fmtShort(totalActivos)}</span>
        </div>
        <div className="h-6 flex rounded-lg overflow-hidden gap-px bg-white/[0.03]">
          {liquidBalance > 0 && (
            <div style={{ width: pct(liquidBalance) }} className="bg-amber-500/75 flex items-center justify-center transition-all">
              {ratio(liquidBalance) > 0.07 && <span className="text-[9px] font-black text-black/60 px-1">Liq</span>}
            </div>
          )}
          {totalInvested > 0 && (
            <div style={{ width: pct(totalInvested) }} className="bg-[#a3e635]/75 flex items-center justify-center transition-all">
              {ratio(totalInvested) > 0.07 && <span className="text-[9px] font-black text-black/60 px-1">Inv</span>}
            </div>
          )}
          {iliquidTotal > 0 && (
            <div style={{ width: pct(iliquidTotal) }} className="bg-blue-500/65 flex items-center justify-center transition-all">
              {ratio(iliquidTotal) > 0.07 && <span className="text-[9px] font-black text-black/60 px-1">Ilíq</span>}
            </div>
          )}
        </div>
      </div>

      {totalLiabilities > 0 && (
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Pasivos</span>
            <span className="text-xs font-bold text-rose-400">{fmtShort(totalLiabilities)}</span>
          </div>
          <div className="h-6 flex rounded-lg overflow-hidden bg-white/[0.03]">
            <div
              style={{ width: `${Math.min((totalLiabilities / totalActivos) * 100, 100).toFixed(1)}%` }}
              className="bg-rose-500/65 flex items-center justify-center"
            >
              {ratio(totalLiabilities) > 0.06 && <span className="text-[9px] font-black text-black/60 px-1">Deuda</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-[0.1em] pt-1">
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/75 inline-block" />
          Líquido <span className="text-amber-400 ml-0.5">{fmtShort(liquidBalance)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#a3e635]/75 inline-block" />
          Invertido <span className="text-[#a3e635] ml-0.5">{fmtShort(totalInvested)}</span>
        </span>
        {iliquidTotal > 0 && (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/65 inline-block" />
            Ilíquido <span className="text-blue-400 ml-0.5">{fmtShort(iliquidTotal)}</span>
          </span>
        )}
        {totalLiabilities > 0 && (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/65 inline-block" />
            Pasivos <span className="text-rose-400 ml-0.5">{fmtShort(totalLiabilities)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PatrimonioView({
  liquidBalance, totalInvested, iliquidTotal, iliquidInvestable,
  totalLiabilities, totalActivos, patrimonioNeto, activosInvertibles,
  assets, liabilities, monthlyTrend,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Asset CRUD state
  const [showAddAsset, setShowAddAsset]       = useState(false)
  const [updatingAsset, setUpdatingAsset]     = useState<string | null>(null)
  const [newAssetName, setNewAssetName]       = useState('')
  const [newAssetType, setNewAssetType]       = useState('real_estate')
  const [newAssetValue, setNewAssetValue]     = useState('')
  const [newAssetDate, setNewAssetDate]       = useState(today())
  const [newAssetInv, setNewAssetInv]         = useState(false)
  const [newAssetNotes, setNewAssetNotes]     = useState('')
  const [assetNewVal, setAssetNewVal]         = useState('')
  const [assetNewDate, setAssetNewDate]       = useState(today())

  // Liability CRUD state
  const [showAddLiab, setShowAddLiab]         = useState(false)
  const [updatingLiab, setUpdatingLiab]       = useState<string | null>(null)
  const [newLiabName, setNewLiabName]         = useState('')
  const [newLiabType, setNewLiabType]         = useState('mortgage')
  const [newLiabBal, setNewLiabBal]           = useState('')
  const [newLiabOrigBal, setNewLiabOrigBal]   = useState('')
  const [newLiabRate, setNewLiabRate]         = useState('')
  const [liabNewBal, setLiabNewBal]           = useState('')

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'

  function handleAddAsset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createAsset({
        name: newAssetName,
        asset_type: newAssetType as 'real_estate' | 'vehicle' | 'pension' | 'business' | 'crypto' | 'other',
        value_crc: parseFloat(newAssetValue),
        as_of_date: newAssetDate,
        is_investable: newAssetInv,
        notes: newAssetNotes || undefined,
      })
      if (result.error) { setError(result.error); return }
      setShowAddAsset(false)
      setNewAssetName(''); setNewAssetValue(''); setNewAssetDate(today())
      setNewAssetInv(false); setNewAssetNotes('')
    })
  }

  function handleUpdateAsset(assetId: string) {
    if (!assetNewVal) return
    setError(null)
    startTransition(async () => {
      const result = await updateAssetValue({
        asset_id: assetId,
        value_crc: parseFloat(assetNewVal),
        snapshot_date: assetNewDate,
      })
      if (result.error) { setError(result.error); return }
      setUpdatingAsset(null)
      setAssetNewVal(''); setAssetNewDate(today())
    })
  }

  function handleDeleteAsset(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateAsset(id)
      if (result.error) setError(result.error)
    })
  }

  function handleAddLiab(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createLiability({
        name: newLiabName,
        liability_type: newLiabType as 'mortgage' | 'auto_loan' | 'personal_loan' | 'credit_card' | 'student_loan' | 'other',
        current_balance: parseFloat(newLiabBal),
        original_balance: newLiabOrigBal ? parseFloat(newLiabOrigBal) : undefined,
        interest_rate: newLiabRate ? parseFloat(newLiabRate) / 100 : undefined,
      })
      if (result.error) { setError(result.error); return }
      setShowAddLiab(false)
      setNewLiabName(''); setNewLiabBal(''); setNewLiabOrigBal(''); setNewLiabRate('')
    })
  }

  function handleUpdateLiab(liabId: string) {
    if (!liabNewBal) return
    setError(null)
    startTransition(async () => {
      const result = await updateLiabilityBalance(liabId, parseFloat(liabNewBal))
      if (result.error) { setError(result.error); return }
      setUpdatingLiab(null)
      setLiabNewBal('')
    })
  }

  function handleDeleteLiab(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateLiability(id)
      if (result.error) setError(result.error)
    })
  }

  const pnColor = patrimonioNeto >= 0 ? 'text-[#a3e635]' : 'text-rose-400'

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">Balance Patrimonial</p>
        <h1 className="text-2xl font-black text-white mt-0.5">Patrimonio</h1>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2 md:col-span-1 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Patrimonio Neto</p>
          <p className={`text-2xl font-black ${pnColor}`}>{fmtShort(patrimonioNeto)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Activos − Pasivos</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Total Activos</p>
          <p className="text-xl font-black text-white">{fmtShort(totalActivos)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Liq + Inv + Ilíq</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Pasivos</p>
          <p className="text-xl font-black text-rose-400">{fmtShort(totalLiabilities)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Deuda total</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Invertibles</p>
          <p className="text-xl font-black text-blue-400">{fmtShort(activosInvertibles)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Para número FIRE</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-4">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Composición</p>
        <BreakdownBar
          liquidBalance={liquidBalance} totalInvested={totalInvested}
          iliquidTotal={iliquidTotal} totalLiabilities={totalLiabilities}
          totalActivos={totalActivos}
        />
      </div>

      {/* Trend chart */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={12} className="text-[#a3e635]" />
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">
            Evolución de portafolio
          </p>
          <span className="text-[9px] text-zinc-700 normal-case tracking-normal">
            Liquidez + portafolio transaccional
          </span>
        </div>
        <TrendChart data={monthlyTrend} />
      </div>

      {/* ── Activos Ilíquidos ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Activos Ilíquidos</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Inmuebles, vehículos, pensión y otros bienes</p>
          </div>
          <button
            onClick={() => setShowAddAsset(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#a3e635] hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-[#a3e635]/20 hover:bg-[#a3e635]/10"
          >
            <Plus size={12} strokeWidth={3} />
            Agregar activo
          </button>
        </div>

        {showAddAsset && (
          <form onSubmit={handleAddAsset} className="bg-white/[0.03] rounded-xl border border-[#a3e635]/20 p-4 space-y-3">
            <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-[0.14em]">Nuevo activo</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Nombre</label>
                <input type="text" value={newAssetName} onChange={e => setNewAssetName(e.target.value)}
                  placeholder="Casa en Escazú, Toyota Corolla, OPC…" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Tipo</label>
                <select value={newAssetType} onChange={e => setNewAssetType(e.target.value)} className={inputCls}>
                  {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Valor (₡ CRC)</label>
                <input type="number" min="0" step="any" value={newAssetValue}
                  onChange={e => setNewAssetValue(e.target.value)} placeholder="0" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Fecha de valuación</label>
                <input type="date" value={newAssetDate} onChange={e => setNewAssetDate(e.target.value)}
                  className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="text" value={newAssetNotes} onChange={e => setNewAssetNotes(e.target.value)}
                  placeholder="Descripción adicional…" className={inputCls} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={newAssetInv} onChange={e => setNewAssetInv(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[#a3e635]" />
              <span className="text-xs text-zinc-400">Activo invertible — cuenta para el número FIRE</span>
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending}
                className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
                {isPending ? 'Guardando…' : 'Guardar activo'}
              </button>
              <button type="button" onClick={() => setShowAddAsset(false)}
                className="px-4 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {assets.length === 0 && !showAddAsset ? (
          <div className="text-center py-8 text-sm text-zinc-600 bg-white/[0.02] rounded-xl border border-white/[0.04]">
            Sin activos ilíquidos registrados.
            <br />
            <span className="text-xs">Agregá tu primera propiedad, vehículo o pensión.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map(asset => (
              <div key={asset.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{asset.name}</p>
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                        {ASSET_LABEL[asset.asset_type] ?? asset.asset_type}
                      </span>
                      {asset.is_investable && (
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-[#a3e635]/10 text-[#a3e635]">
                          Invertible
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Valuado al {asset.as_of_date}</p>
                    {asset.notes && <p className="text-[10px] text-zinc-600 mt-0.5">{asset.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <p className="text-base font-black text-white">{fmtShort(asset.value_crc)}</p>
                    <button
                      onClick={() => { setUpdatingAsset(asset.id); setAssetNewVal(String(asset.value_crc)); setAssetNewDate(today()) }}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-[#a3e635] hover:bg-[#a3e635]/10 transition-colors"
                      title="Actualizar valor"
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteAsset(asset.id)} disabled={isPending}
                      className="p-1.5 rounded-lg text-zinc-700 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                      title="Eliminar activo"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {updatingAsset === asset.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-2 items-end">
                    <div>
                      <label className={lbl}>Nuevo valor (₡)</label>
                      <input type="number" min="0" step="any" value={assetNewVal}
                        onChange={e => setAssetNewVal(e.target.value)}
                        className="w-40 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
                    </div>
                    <div>
                      <label className={lbl}>Fecha</label>
                      <input type="date" value={assetNewDate} onChange={e => setAssetNewDate(e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
                    </div>
                    <button onClick={() => handleUpdateAsset(asset.id)} disabled={isPending || !assetNewVal}
                      className="px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
                      {isPending ? '…' : 'Actualizar'}
                    </button>
                    <button onClick={() => setUpdatingAsset(null)}
                      className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pasivos ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Pasivos</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Hipotecas, préstamos, tarjetas de crédito</p>
          </div>
          <button
            onClick={() => setShowAddLiab(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-rose-400/20 hover:bg-rose-400/10"
          >
            <Plus size={12} strokeWidth={3} />
            Agregar pasivo
          </button>
        </div>

        {showAddLiab && (
          <form onSubmit={handleAddLiab} className="bg-white/[0.03] rounded-xl border border-rose-400/20 p-4 space-y-3">
            <p className="text-[9px] font-black text-rose-400/60 uppercase tracking-[0.14em]">Nuevo pasivo</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Nombre</label>
                <input type="text" value={newLiabName} onChange={e => setNewLiabName(e.target.value)}
                  placeholder="Hipoteca BN, Tarjeta Visa…" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Tipo</label>
                <select value={newLiabType} onChange={e => setNewLiabType(e.target.value)} className={inputCls}>
                  {LIABILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Saldo actual (₡)</label>
                <input type="number" min="0" step="any" value={newLiabBal}
                  onChange={e => setNewLiabBal(e.target.value)} placeholder="0" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Saldo original (₡) <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="number" min="0" step="any" value={newLiabOrigBal}
                  onChange={e => setNewLiabOrigBal(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className={lbl}>Tasa de interés % anual <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="number" min="0" step="any" value={newLiabRate}
                  onChange={e => setNewLiabRate(e.target.value)} placeholder="12.5" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white text-xs font-black hover:bg-rose-400 disabled:opacity-50 transition-colors">
                {isPending ? 'Guardando…' : 'Guardar pasivo'}
              </button>
              <button type="button" onClick={() => setShowAddLiab(false)}
                className="px-4 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {liabilities.length === 0 && !showAddLiab ? (
          <div className="text-center py-8 text-sm text-zinc-600 bg-white/[0.02] rounded-xl border border-white/[0.04]">
            Sin pasivos registrados.
          </div>
        ) : (
          <div className="space-y-2">
            {liabilities.map(liab => {
              const remainingPct = liab.original_balance
                ? Math.min((liab.current_balance / liab.original_balance) * 100, 100)
                : null
              const paidPct = remainingPct != null ? (100 - remainingPct).toFixed(0) : null

              return (
                <div key={liab.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white truncate">{liab.name}</p>
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
                          {LIABILITY_LABEL[liab.liability_type] ?? liab.liability_type}
                        </span>
                        {liab.interest_rate != null && (
                          <span className="shrink-0 text-[9px] text-zinc-600">
                            {(liab.interest_rate * 100).toFixed(1)}% anual
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        Actualizado {liab.as_of_date}
                        {paidPct != null && ` · ${paidPct}% pagado`}
                      </p>
                      {remainingPct != null && (
                        <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden w-28">
                          <div
                            style={{ width: `${remainingPct.toFixed(1)}%` }}
                            className="h-full bg-rose-500/60 rounded-full"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <p className="text-base font-black text-rose-400">{fmtShort(liab.current_balance)}</p>
                      <button
                        onClick={() => { setUpdatingLiab(liab.id); setLiabNewBal(String(liab.current_balance)) }}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                        title="Actualizar saldo"
                      >
                        <RefreshCw size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteLiab(liab.id)} disabled={isPending}
                        className="p-1.5 rounded-lg text-zinc-700 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                        title="Eliminar pasivo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {updatingLiab === liab.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-2 items-end">
                      <div>
                        <label className={lbl}>Nuevo saldo (₡)</label>
                        <input type="number" min="0" step="any" value={liabNewBal}
                          onChange={e => setLiabNewBal(e.target.value)}
                          className="w-40 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
                      </div>
                      <button onClick={() => handleUpdateLiab(liab.id)} disabled={isPending || !liabNewBal}
                        className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-black hover:bg-rose-400 disabled:opacity-50 transition-colors">
                        {isPending ? '…' : 'Actualizar'}
                      </button>
                      <button onClick={() => setUpdatingLiab(null)}
                        className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
