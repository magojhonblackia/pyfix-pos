import { useQuery } from '@tanstack/react-query'
import { getSalesSummary, getProducts, getCurrentRegister } from '@/services/api.js'
import { formatCOP } from '@/lib/utils.js'
import { readSettings } from '@/hooks/useSettings.js'
import {
  ShoppingBag, TrendingUp, Package, Vault,
  AlertTriangle, BarChart3, Unlock, Lock,
  Banknote, CreditCard, Smartphone, UserCircle,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react'

const METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata' }
const METHOD_COLOR = {
  cash:      'bg-green-500',
  card:      'bg-blue-500',
  nequi:     'bg-violet-500',
  daviplata: 'bg-pink-500',
}
const METHOD_ICON = {
  cash:      <Banknote   size={12} />,
  card:      <CreditCard size={12} />,
  nequi:     <Smartphone size={12} />,
  daviplata: <Smartphone size={12} />,
}

export default function Dashboard() {
  const { minStockThreshold: STOCK_LOW } = readSettings()
  const { data: summary, isLoading: loadSum } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getSalesSummary,
    refetchInterval: 60_000,
  })

  const { data: products = [], isLoading: loadProd } = useQuery({
    queryKey: ['products', ''],
    queryFn: () => getProducts(''),
  })

  const { data: register } = useQuery({
    queryKey: ['cash-register-current'],
    queryFn: getCurrentRegister,
    refetchInterval: 30_000,
  })

  const lowStock = products.filter((p) => p.is_active && p.stock <= STOCK_LOW)
  const isOpen   = Boolean(register)

  return (
    <div className="h-full overflow-y-auto p-5 flex flex-col gap-5">

      {/* Título */}
      <div>
        <h2 className="font-bold text-slate-800 text-lg">Dashboard</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── KPIs del día ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          icon={<ShoppingBag size={20} />}
          label="Ventas hoy"
          value={loadSum ? '…' : summary?.sales_count ?? 0}
          sub="transacciones"
          color="blue"
        />
        <KpiCard
          icon={<TrendingUp size={20} />}
          label="Total recaudado"
          value={loadSum ? '…' : `$${formatCOP(summary?.sales_total ?? 0)}`}
          sub="COP"
          color="green"
        />
        <KpiCard
          icon={<Package size={20} />}
          label="Ítems vendidos"
          value={loadSum ? '…' : summary?.items_sold ?? 0}
          sub="unidades"
          color="violet"
        />
        <KpiCard
          icon={isOpen ? <Unlock size={20} /> : <Lock size={20} />}
          label="Turno"
          value={isOpen ? 'ABIERTO' : 'CERRADO'}
          sub={isOpen ? `Base $${formatCOP(register?.opening_amount ?? 0)}` : 'Sin turno activo'}
          color={isOpen ? 'green' : 'slate'}
        />
      </div>

      {/* ── Comparativa semanal ── */}
      {!loadSum && summary?.week_this && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <WeekCard
            label="Ventas esta semana"
            current={summary.week_this.sales_count}
            previous={summary.week_prev.sales_count}
            format={(v) => String(v)}
            unit="transacciones"
          />
          <WeekCard
            label="Ingresos esta semana"
            current={summary.week_this.sales_total}
            previous={summary.week_prev.sales_total}
            format={(v) => `$${formatCOP(v)}`}
            unit="COP"
          />
          <WeekCard
            label="Ganancia esta semana"
            current={summary.week_this.profit}
            previous={summary.week_prev.profit}
            format={(v) => `$${formatCOP(v)}`}
            unit="margen bruto"
          />
          <WeekCard
            label="Ticket promedio"
            current={summary.week_this.sales_count > 0
              ? summary.week_this.sales_total / summary.week_this.sales_count
              : 0}
            previous={summary.week_prev.sales_count > 0
              ? summary.week_prev.sales_total / summary.week_prev.sales_count
              : 0}
            format={(v) => `$${formatCOP(v)}`}
            unit="por venta"
          />
        </div>
      )}

      {/* ── Ganancia + Actividad por hora + Métodos ── */}
      {!loadSum && summary && (
        <div className="grid grid-cols-[200px_1fr_180px] gap-3">

          {/* Ganancia estimada */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                <TrendingUp size={13} /> Ganancia estimada
              </div>
              <div className={`font-extrabold text-2xl ${
                summary.profit_today >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {summary.profit_today < 0 ? '−' : ''}${formatCOP(Math.abs(summary.profit_today))}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">margen bruto del día</div>
            </div>
            {summary.sales_total > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  Margen{' '}
                  <span className="font-bold text-slate-700">
                    {((summary.profit_today / summary.sales_total) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actividad por hora */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={14} className="text-blue-500" />
              <h3 className="font-bold text-slate-700 text-sm">Actividad por hora</h3>
              <span className="text-xs text-slate-400 ml-auto">hoy · COP</span>
            </div>
            <HourlyChart hourly={summary.hourly} />
          </div>

          {/* Métodos de pago */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Banknote size={14} className="text-slate-400" />
              <h3 className="font-bold text-slate-700 text-sm">Métodos de pago</h3>
            </div>
            <PaymentMethodsBreakdown byMethod={summary.by_method ?? {}} total={summary.sales_total} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── Top 5 productos ── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <BarChart3 size={16} className="text-blue-500" />
            <h3 className="font-bold text-slate-700 text-sm">Top productos hoy</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {loadSum && <p className="px-4 py-3 text-sm text-slate-400">Cargando...</p>}
            {!loadSum && (!summary?.top_products?.length) && (
              <p className="px-4 py-4 text-sm text-slate-400 text-center">Sin ventas aún hoy</p>
            )}
            {summary?.top_products?.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-400 bg-slate-100 rounded-full shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-slate-700 font-medium truncate">
                  {p.name}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {p.qty} uds
                </span>
                <span className="text-sm font-bold text-blue-700 shrink-0 min-w-20 text-right">
                  ${formatCOP(p.total)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bajo stock ── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="font-bold text-slate-700 text-sm">
              Bajo stock
              {lowStock.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                  {lowStock.length}
                </span>
              )}
            </h3>
          </div>
          <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
            {loadProd && <p className="px-4 py-3 text-sm text-slate-400">Cargando...</p>}
            {!loadProd && lowStock.length === 0 && (
              <p className="px-4 py-4 text-sm text-slate-400 text-center">
                ✓ Todos los productos tienen stock suficiente
              </p>
            )}
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${p.stock === 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                <span className="flex-1 text-sm text-slate-700 truncate">{p.name}</span>
                <span className={`text-sm font-bold shrink-0 ${p.stock === 0 ? 'text-red-500' : 'text-amber-600'}`}>
                  {p.stock === 0 ? 'AGOTADO' : `${p.stock} uds`}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Últimas ventas ── */}
      {!loadSum && summary?.recent_sales?.length > 0 && (
        <RecentSalesFeed sales={summary.recent_sales} />
      )}

      {/* ── Resumen turno activo ── */}
      {isOpen && (
        <section className="bg-white border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Vault size={16} className="text-green-600" />
            <h3 className="font-bold text-slate-700 text-sm">Turno activo</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Base apertura</p>
              <p className="font-bold text-slate-800">${formatCOP(register.opening_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Ventas en turno</p>
              <p className="font-bold text-slate-800">{register.sales_count} transacciones</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Efectivo esperado</p>
              <p className="font-bold text-green-700">
                ${formatCOP((register.opening_amount ?? 0) + (register.sales_total ?? 0))}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ── Gráfico de barras por hora ─────────────────────────────
function HourlyChart({ hourly }) {
  // Mostramos las horas 6–22 (horario típico de tienda)
  const visible = (hourly ?? []).slice(6, 23)
  const maxTotal = Math.max(...visible.map((h) => h.total), 1)

  return (
    <div className="flex flex-col gap-1">
      {/* Barras */}
      <div className="flex items-end gap-0.5 h-14">
        {visible.map((h) => {
          const pct = Math.max(h.count > 0 ? 10 : 3, (h.total / maxTotal) * 100)
          return (
            <div
              key={h.hour}
              title={h.count > 0 ? `${h.hour}:00 — ${h.count} venta${h.count !== 1 ? 's' : ''} · $${formatCOP(h.total)}` : `${h.hour}:00 — sin ventas`}
              className={`flex-1 rounded-t-sm transition-all ${
                h.count > 0 ? 'bg-blue-500 hover:bg-blue-400' : 'bg-slate-100'
              }`}
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>
      {/* Etiquetas de hora */}
      <div className="flex gap-0.5">
        {visible.map((h) => (
          <div key={h.hour} className="flex-1 text-center">
            {h.hour % 4 === 2 && (
              <span className="text-[9px] text-slate-400">{h.hour}h</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Desglose de métodos de pago ────────────────────────────
function PaymentMethodsBreakdown({ byMethod, total }) {
  const entries = Object.entries(byMethod).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-2">Sin ventas aún</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([method, amount]) => {
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0
        return (
          <div key={method}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                {METHOD_ICON[method]}
                {METHOD_LABEL[method] ?? method}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">{pct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${METHOD_COLOR[method] ?? 'bg-slate-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">${formatCOP(amount)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Feed de ventas recientes ────────────────────────────────
function RecentSalesFeed({ sales }) {
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <ShoppingBag size={14} className="text-blue-500" />
        <h3 className="font-bold text-slate-700 text-sm">Últimas ventas del día</h3>
        <span className="text-xs text-slate-400 ml-auto">en tiempo real</span>
      </div>
      <div className="divide-y divide-slate-50">
        {sales.map((s) => {
          const isVoided = s.status === 'voided'
          return (
            <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${isVoided ? 'opacity-50' : ''}`}>
              <span className="font-mono text-[11px] text-slate-400 w-16 shrink-0">
                #{s.id.slice(0, 6).toUpperCase()}
              </span>
              <span className="text-xs text-slate-400 w-12 shrink-0">{fmtTime(s.created_at)}</span>
              <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                {METHOD_ICON[s.payment_method]}
              </span>
              {s.customer_name ? (
                <span className="text-xs font-semibold text-blue-600 flex items-center gap-1 min-w-0 truncate flex-1">
                  <UserCircle size={11} className="shrink-0" />
                  {s.customer_name}
                </span>
              ) : (
                <span className="text-xs text-slate-400 flex-1">
                  {s.items_count} ítem{s.items_count !== 1 ? 's' : ''}
                </span>
              )}
              {isVoided && (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
                  ANULADA
                </span>
              )}
              <span className={`font-bold text-sm shrink-0 ${isVoided ? 'text-slate-300 line-through' : 'text-slate-700'}`}>
                ${formatCOP(s.total)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Comparativa semana actual vs. anterior ──────────────────
function WeekCard({ label, current, previous, format, unit }) {
  const delta    = previous > 0 ? ((current - previous) / previous) * 100 : null
  const isUp     = delta !== null && delta > 0.5
  const isDown   = delta !== null && delta < -0.5
  const isFlat   = delta !== null && !isUp && !isDown

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="font-extrabold text-xl text-slate-800 leading-tight">{format(current)}</div>
      <div className="text-xs text-slate-400 mt-0.5">{unit}</div>
      <div className={`flex items-center gap-1 text-xs font-semibold mt-2 ${
        isUp ? 'text-emerald-600' : isDown ? 'text-red-500' : 'text-slate-400'
      }`}>
        {isUp   && <ArrowUp   size={12} />}
        {isDown && <ArrowDown size={12} />}
        {isFlat && <Minus     size={12} />}
        {delta !== null
          ? `${Math.abs(delta).toFixed(1)}% vs sem. anterior`
          : 'Sin datos semana anterior'}
        {previous > 0 && (
          <span className="text-slate-300 font-normal ml-1">({format(previous)})</span>
        )}
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, color }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    green:  'bg-green-50 border-green-100 text-green-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    slate:  'bg-slate-50 border-slate-200 text-slate-600',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 text-sm font-semibold opacity-70 mb-1">
        {icon} {label}
      </div>
      <div className="font-extrabold text-2xl">{value}</div>
      <div className="text-xs opacity-60 mt-0.5">{sub}</div>
    </div>
  )
}
