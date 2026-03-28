import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSalesReport, getMonthlyTrend } from '@/services/api.js'
import { formatCOP } from '@/lib/utils.js'
import {
  TrendingUp, ShoppingBag, Receipt, Package,
  Tag, DollarSign, XCircle, Download, RefreshCw,
  BarChart3, PieChart, Layers,
} from 'lucide-react'

// ── Helpers zona horaria Colombia (UTC-5) ─────────────────────
function colNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
}
function colDate(offset = 0) {
  const d = colNow()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-CA')  // YYYY-MM-DD
}
function colWeekStart() {
  const d = colNow()
  d.setDate(d.getDate() - d.getDay())
  return d.toLocaleDateString('en-CA')
}
function colMonthStart(offset = 0) {
  const d = colNow()
  d.setMonth(d.getMonth() + offset, 1)
  return d.toLocaleDateString('en-CA')
}
function colMonthEnd(offset = 0) {
  const d = colNow()
  d.setMonth(d.getMonth() + offset + 1, 0)
  return d.toLocaleDateString('en-CA')
}

const PRESETS = [
  { label: 'Hoy',          fn: () => { const t = colDate();  return [t, t] } },
  { label: 'Ayer',         fn: () => { const y = colDate(-1); return [y, y] } },
  { label: 'Esta semana',  fn: () => [colWeekStart(), colDate()] },
  { label: 'Este mes',     fn: () => [colMonthStart(0), colDate()] },
  { label: 'Mes anterior', fn: () => [colMonthStart(-1), colMonthEnd(-1)] },
  { label: 'Últimos 30 d', fn: () => [colDate(-29), colDate()] },
]

const METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata' }
const METHOD_COLOR  = { cash: 'bg-green-500', card: 'bg-blue-500', nequi: 'bg-violet-500', daviplata: 'bg-red-500' }

// ── KPI card ──────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accentClass }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1 ${accentClass ?? ''}`}>
      <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="text-xl font-extrabold text-slate-800 truncate leading-tight">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────
function exportReportCSV(report, from, to) {
  const rows = [
    ['Período', `${from} al ${to}`],
    ['Ventas', report.sales_count],
    ['Total ventas', report.sales_total.toFixed(0)],
    ['Ticket promedio', report.avg_ticket.toFixed(0)],
    ['Artículos vendidos', report.items_sold],
    ['Descuentos', report.discount_total.toFixed(0)],
    ['Ganancia bruta', report.profit.toFixed(0)],
    ['Anuladas', report.voided_count],
    [],
    ['--- Ventas por día ---'],
    ['Fecha', 'Transacciones', 'Total', 'Ganancia'],
    ...report.by_day.map((d) => [d.date, d.count, d.total.toFixed(0), d.profit.toFixed(0)]),
    [],
    ['--- Método de pago ---'],
    ['Método', 'Transacciones', 'Total'],
    ...report.by_method.map((m) => [METHOD_LABEL[m.method] ?? m.method, m.count, m.total.toFixed(0)]),
    [],
    ['--- Top productos ---'],
    ['Producto', 'Cantidad', 'Total vendido'],
    ...report.top_products.map((p) => [p.name, p.qty, p.total.toFixed(0)]),
  ]
  const csv  = rows.map((r) => r.map((v) => `"${v ?? ''}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `reporte_${from}_${to}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Página ────────────────────────────────────────────────────
export default function Reports() {
  const today = colDate()
  const [tab,          setTab]         = useState('general')
  const [from,         setFrom]        = useState(colMonthStart(0))
  const [to,           setTo]          = useState(today)
  const [activePreset, setActivePreset] = useState('Este mes')

  const { data: report, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report', from, to],
    queryFn:  () => getSalesReport(from, to),
    staleTime: 60_000,
  })

  const { data: monthlyTrend = [] } = useQuery({
    queryKey: ['monthly-trend'],
    queryFn:  () => getMonthlyTrend(12),
    staleTime: 300_000,
  })

  const maxDayTotal  = useMemo(
    () => Math.max(...(report?.by_day      ?? []).map((d) => d.total), 1),
    [report],
  )
  const maxProdTotal = useMemo(
    () => Math.max(...(report?.top_products ?? []).map((p) => p.total), 1),
    [report],
  )

  const applyPreset = (p) => {
    const [f, t] = p.fn()
    setFrom(f); setTo(t); setActivePreset(p.label)
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* Cabecera */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-500" />
              Reportes de Ventas
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Análisis detallado por período</p>
          </div>
          {report && tab === 'general' && (
            <button
              onClick={() => exportReportCSV(report, from, to)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white bg-white cursor-pointer"
            >
              <Download size={13} /> Exportar CSV
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200">
          {[
            { id: 'general',      label: 'General',      icon: <BarChart3 size={13}/> },
            { id: 'categorias',   label: 'Categorías',   icon: <PieChart  size={13}/> },
            { id: 'rentabilidad', label: 'Rentabilidad', icon: <Layers    size={13}/> },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  activePreset === p.label
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Rango personalizado */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-slate-500 font-semibold">Desde</label>
            <input
              type="date" value={from} max={to}
              onChange={(e) => { setFrom(e.target.value); setActivePreset(null) }}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400"
            />
            <label className="text-xs text-slate-500 font-semibold">Hasta</label>
            <input
              type="date" value={to} min={from} max={today}
              onChange={(e) => { setTo(e.target.value); setActivePreset(null) }}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400"
            />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Actualizar"
              className="ml-auto p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tab Rentabilidad no necesita filtro de fecha (usa tendencia mensual fija) */}
        {tab !== 'rentabilidad' && (
          <>
            {isLoading && (
              <div className="text-center text-slate-400 py-20 text-sm">Cargando reporte…</div>
            )}

            {report && !isLoading && report.sales_count === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400 text-sm">
                No hay ventas registradas en el período seleccionado
              </div>
            )}
          </>
        )}

        {tab === 'general' && report && !isLoading && report.sales_count > 0 && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <KpiCard icon={<ShoppingBag size={12}/>} label="Ventas"
                value={report.sales_count}
                accentClass="border-l-4 border-l-blue-500"
              />
              <KpiCard icon={<DollarSign size={12}/>} label="Total"
                value={`$${formatCOP(report.sales_total)}`}
                accentClass="border-l-4 border-l-green-500"
              />
              <KpiCard icon={<Receipt size={12}/>} label="Ticket prom."
                value={`$${formatCOP(report.avg_ticket)}`}
              />
              <KpiCard icon={<Package size={12}/>} label="Artículos"
                value={report.items_sold}
              />
              <KpiCard icon={<Tag size={12}/>} label="Descuentos"
                value={`$${formatCOP(report.discount_total)}`}
                sub="acumulado"
              />
              <KpiCard icon={<TrendingUp size={12}/>} label="Ganancia"
                value={`$${formatCOP(report.profit)}`}
                accentClass="border-l-4 border-l-emerald-500"
              />
              <KpiCard icon={<XCircle size={12}/>} label="Anuladas"
                value={report.voided_count}
                accentClass={report.voided_count > 0 ? 'border-l-4 border-l-red-400' : ''}
              />
            </div>

            {/* Gráfico día + método pago */}
            <div className="grid grid-cols-[1fr_260px] gap-4">

              {/* Ventas por día */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Ventas por día</h3>
                <div className="flex items-end gap-0.5 h-44 overflow-x-auto pb-6 pt-1">
                  {report.by_day.map((d) => {
                    const pct   = Math.max((d.total / maxDayTotal) * 100, 3)
                    const label = d.date.slice(5)  // MM-DD
                    return (
                      <div
                        key={d.date}
                        className="flex flex-col items-center flex-1 min-w-[28px] h-full justify-end relative group"
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col z-10 bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none shadow-lg">
                          <span className="font-bold">{d.date}</span>
                          <span>{d.count} venta{d.count !== 1 ? 's' : ''} · ${formatCOP(d.total)}</span>
                          <span className="text-emerald-300">Gan: ${formatCOP(d.profit)}</span>
                        </div>
                        <div
                          className="w-full bg-blue-500 hover:bg-blue-400 rounded-t transition-colors cursor-default"
                          style={{ height: `${pct}%` }}
                        />
                        <span className="absolute bottom-0 text-[9px] text-slate-400 font-mono rotate-45 origin-left translate-y-5 translate-x-1 select-none">
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Método de pago */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Método de pago</h3>
                {report.by_method.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-10">Sin datos</p>
                ) : (
                  <div className="space-y-4">
                    {report.by_method.map((m) => {
                      const pct   = report.sales_total > 0 ? (m.total / report.sales_total) * 100 : 0
                      const color = METHOD_COLOR[m.method] ?? 'bg-slate-400'
                      return (
                        <div key={m.method}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-700">
                              {METHOD_LABEL[m.method] ?? m.method}
                            </span>
                            <span className="text-slate-400">{m.count} · {pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-xs text-slate-600 font-semibold mt-0.5">
                            ${formatCOP(m.total)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Top 10 productos */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Top 10 productos más vendidos</h3>
              <div className="space-y-2.5">
                {report.top_products.map((p, idx) => {
                  const pct = (p.total / maxProdTotal) * 100
                  return (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className={`text-xs font-extrabold w-5 text-right shrink-0 tabular-nums ${
                        idx === 0 ? 'text-amber-400' :
                        idx === 1 ? 'text-slate-400' :
                        idx === 2 ? 'text-orange-300' : 'text-slate-200'
                      }`}>
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700 truncate">{p.name}</span>
                          <span className="text-slate-400 shrink-0 ml-2 tabular-nums">
                            {p.qty} uds ·{' '}
                            <span className="text-slate-600 font-semibold">${formatCOP(p.total)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Tab Categorias ── */}
        {tab === 'categorias' && report && !isLoading && (
          report.sales_count === 0
            ? <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400 text-sm">Sin ventas en el periodo</div>
            : <CategoryTab byCategory={report.by_category ?? []} salesTotal={report.sales_total} />
        )}

        {/* ── Tab Rentabilidad ── */}
        {tab === 'rentabilidad' && (
          <RentabilidadTab
            marginProducts={report?.margin_products ?? []}
            monthlyTrend={monthlyTrend}
            hasReport={!!report && !isLoading && report.sales_count > 0}
          />
        )}

      </div>
    </div>
  )
}

// ── Tab Categorías ────────────────────────────────────────────
function CategoryTab({ byCategory, salesTotal }) {
  if (!byCategory || byCategory.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400 text-sm">
        Sin datos de categorías para el período seleccionado
      </div>
    )
  }

  const maxCatTotal = Math.max(...byCategory.map((c) => c.total), 1)

  return (
    <div className="space-y-4">
      {/* Barras horizontales */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-5">Ventas por categoría</h3>
        <div className="space-y-3">
          {byCategory.map((cat) => {
            const pct    = (cat.total / maxCatTotal) * 100
            const sharePct = salesTotal > 0 ? (cat.total / salesTotal) * 100 : 0
            return (
              <div key={cat.category} className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 w-32 shrink-0 truncate">
                  {cat.category || 'Sin categoría'}
                </span>
                <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-blue-500 rounded-lg transition-all"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white mix-blend-difference select-none">
                    ${formatCOP(cat.total)}
                  </span>
                </div>
                <span className="text-xs text-slate-400 w-12 text-right tabular-nums shrink-0">
                  {sharePct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabla detalle */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Categoría</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Ventas</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Ganancia</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Margen</th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">% del total</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((cat, idx) => {
              const margin    = cat.total > 0 ? (cat.profit / cat.total) * 100 : 0
              const sharePct  = salesTotal > 0 ? (cat.total / salesTotal) * 100 : 0
              const marginColor =
                margin >= 30 ? 'text-emerald-600' :
                margin >= 15 ? 'text-amber-600'   :
                               'text-red-500'
              return (
                <tr key={cat.category} className={`border-b border-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {cat.category || <span className="text-slate-400 italic">Sin categoría</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{cat.count}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-700 tabular-nums">
                    ${formatCOP(cat.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold tabular-nums">
                    ${formatCOP(cat.profit)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${marginColor}`}>
                    {margin.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">
                    {sharePct.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-bold">
              <td className="px-4 py-2.5 text-slate-700">Total</td>
              <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                {byCategory.reduce((s, c) => s + c.count, 0)}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-800 tabular-nums">
                ${formatCOP(salesTotal)}
              </td>
              <td className="px-4 py-2.5 text-right text-emerald-600 tabular-nums">
                ${formatCOP(byCategory.reduce((s, c) => s + c.profit, 0))}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                {salesTotal > 0
                  ? ((byCategory.reduce((s, c) => s + c.profit, 0) / salesTotal) * 100).toFixed(1)
                  : '0.0'}%
              </td>
              <td className="px-4 py-2.5 text-right text-slate-400">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Tab Rentabilidad ──────────────────────────────────────────
function RentabilidadTab({ marginProducts, monthlyTrend, hasReport }) {
  const maxTrendTotal  = Math.max(...(monthlyTrend ?? []).map((m) => m.total), 1)
  const maxMarginProfit = Math.max(...(marginProducts ?? []).map((p) => p.profit), 1)

  return (
    <div className="space-y-4">

      {/* Tendencia mensual — gráfico de barras doble */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700">Tendencia mensual — últimos 12 meses</h3>
          <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Ventas</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Ganancia</span>
          </div>
        </div>

        {monthlyTrend.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-12">Sin datos de tendencia</div>
        ) : (
          <div className="flex items-end gap-1 h-48 pb-7 pt-1 overflow-x-auto">
            {monthlyTrend.map((m) => {
              const revPct    = Math.max((m.total  / maxTrendTotal) * 100, 2)
              const profitPct = m.total > 0 ? (m.profit / m.total) * revPct : 0
              return (
                <div
                  key={m.month}
                  className="flex flex-col items-center flex-1 min-w-[40px] h-full justify-end relative group"
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col z-10 bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none shadow-lg">
                    <span className="font-bold">{m.label}</span>
                    <span>{m.count} venta{m.count !== 1 ? 's' : ''}</span>
                    <span>Ventas: ${formatCOP(m.total)}</span>
                    <span className="text-emerald-300">Gan: ${formatCOP(m.profit)}</span>
                    {m.total > 0 && (
                      <span className="text-blue-200">Margen: {((m.profit / m.total) * 100).toFixed(1)}%</span>
                    )}
                  </div>

                  {/* Barra revenue */}
                  <div className="relative w-full flex items-end justify-center" style={{ height: `${revPct}%` }}>
                    <div className="w-full bg-blue-200 hover:bg-blue-300 rounded-t transition-colors h-full" />
                    {/* Barra ganancia superpuesta */}
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-emerald-400 hover:bg-emerald-300 rounded-t transition-colors"
                      style={{ height: `${profitPct}%` }}
                    />
                  </div>

                  <span className="absolute bottom-0 text-[9px] text-slate-400 font-semibold translate-y-5 select-none truncate w-full text-center">
                    {m.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Top productos por margen */}
      {hasReport && marginProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Top productos por ganancia bruta</h3>
          <div className="space-y-2.5">
            {marginProducts.map((p, idx) => {
              const barPct    = (p.profit / maxMarginProfit) * 100
              const marginPct = p.total > 0 ? (p.profit / p.total) * 100 : 0
              const marginColor =
                marginPct >= 40 ? 'text-emerald-600 bg-emerald-50' :
                marginPct >= 20 ? 'text-amber-600 bg-amber-50'    :
                                  'text-red-500 bg-red-50'
              return (
                <div key={p.name} className="flex items-center gap-3">
                  <span className={`text-xs font-extrabold w-5 text-right shrink-0 tabular-nums ${
                    idx === 0 ? 'text-amber-400' :
                    idx === 1 ? 'text-slate-400' :
                    idx === 2 ? 'text-orange-300' : 'text-slate-200'
                  }`}>
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1 gap-2">
                      <span className="font-semibold text-slate-700 truncate">{p.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400 tabular-nums">${formatCOP(p.total)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${marginColor}`}>
                          {marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                      Gan: ${formatCOP(p.profit)} · {p.qty} uds
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!hasReport && (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400 text-sm">
          Selecciona un período con ventas para ver el análisis de rentabilidad por producto
        </div>
      )}
    </div>
  )
}
