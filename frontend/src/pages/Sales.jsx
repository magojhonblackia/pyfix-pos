import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSales, voidSale } from '@/services/api.js'
import { formatCOP, formatTime } from '@/lib/utils.js'
import { useToast } from '@/components/Toast.jsx'
import {
  ChevronDown, ChevronRight, RefreshCw, ShoppingBag,
  Calendar, Ban, X, Download,
  Banknote, CreditCard, Smartphone,
} from 'lucide-react'

// ── CSV export ────────────────────────────────────────────────
function exportCSV(sales, dateFrom, dateTo) {
  const rows = [
    ['ID', 'Fecha', 'Hora', 'Método', 'Ítems', 'Total COP', 'Estado'],
    ...sales.map((s) => [
      s.id.slice(0, 8).toUpperCase(),
      new Date(s.created_at).toLocaleDateString('es-CO'),
      new Date(s.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      METHOD_LABEL[s.payment_method] ?? s.payment_method,
      s.items_count,
      s.total,
      s.status === 'voided' ? 'Anulada' : 'Activa',
    ]),
  ]
  const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ventas_${dateFrom ?? 'todo'}_${dateTo ?? 'todo'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── helpers ──────────────────────────────────────────────────
function toColDate(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
const today     = () => toColDate(new Date())
const yesterday = () => toColDate(new Date(Date.now() - 86_400_000))
const daysAgo   = (n) => toColDate(new Date(Date.now() - n * 86_400_000))

const PRESETS = [
  { label: 'Hoy',           id: 'today',     from: today,              to: today      },
  { label: 'Ayer',          id: 'yesterday', from: yesterday,          to: yesterday  },
  { label: 'Últ. 7 días',   id: 'week',      from: () => daysAgo(6),   to: today      },
  { label: 'Personalizado', id: 'custom',    from: () => null,         to: () => null },
]

const METHOD_ICON = {
  cash:      <Banknote   size={13} className="text-green-600"  />,
  card:      <CreditCard size={13} className="text-blue-600"   />,
  nequi:     <Smartphone size={13} className="text-violet-600" />,
  daviplata: <Smartphone size={13} className="text-pink-600"   />,
}
const METHOD_LABEL = {
  cash: 'Efectivo', card: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata',
}

// ── componente principal ─────────────────────────────────────
export default function Sales() {
  const qc    = useQueryClient()
  const toast = useToast()
  const [preset,     setPreset]     = useState('today')
  const [customFrom, setFrom]       = useState(today())
  const [customTo,   setTo]         = useState(today())
  const [expanded,   setExpanded]   = useState(null)
  const [voidTarget,    setVoidTarget]    = useState(null)
  const [voidReason,    setVoidReason]    = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const active    = PRESETS.find((p) => p.id === preset)
  const dateFrom  = preset === 'custom' ? customFrom : active.from()
  const dateTo    = preset === 'custom' ? customTo   : active.to()

  const { data: sales = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sales', dateFrom, dateTo],
    queryFn:  () => getSales(dateFrom, dateTo),
    refetchInterval: 30_000,
  })

  const voidMut = useMutation({
    mutationFn: () => voidSale(
      voidTarget.id,
      voidReason || 'Devolución autorizada',
      adminUsername.trim(),
      adminPassword,
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast(`Venta #${voidTarget.id.slice(0, 8).toUpperCase()} anulada`, 'warning')
      setVoidTarget(null)
      setVoidReason('')
      setAdminUsername('')
      setAdminPassword('')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const activeSales  = sales.filter((s) => s.status !== 'voided')
  const voidedSales  = sales.filter((s) => s.status === 'voided')
  const totalDelDia  = activeSales.reduce((s, v) => s + v.total, 0)
  const totalItems   = activeSales.reduce((s, v) => s + v.items_count, 0)

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-slate-800">Ventas</h2>
          <p className="text-xs text-slate-400">
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  preset === p.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >{p.label}</button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <Calendar size={13} className="text-slate-400" />
              <input type="date" value={customFrom} max={customTo}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              />
              <span className="text-slate-400">—</span>
              <input type="date" value={customTo} min={customFrom} max={today()}
                onChange={(e) => setTo(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              />
            </div>
          )}

          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Actualizar
          </button>

          <button
            onClick={() => {
              exportCSV(sales, dateFrom, dateTo)
              toast(`${sales.length} ventas exportadas`, 'info')
            }}
            disabled={sales.length === 0}
            title="Exportar a CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            CSV
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
        <SummaryCard label="Transacciones"   value={activeSales.length}              unit="ventas"    color="blue"   />
        <SummaryCard label="Ítems vendidos"  value={totalItems}                      unit="unidades"  color="violet" />
        <SummaryCard label="Total recaudado" value={`$${formatCOP(totalDelDia)}`}    unit="COP"       color="green"  />
        <SummaryCard label="Anuladas"        value={voidedSales.length}              unit="ventas"    color="red"    />
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && <p className="text-slate-400 text-sm">Cargando ventas...</p>}

        {!isLoading && sales.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ShoppingBag size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No hay ventas en este rango</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {sales.map((sale) => {
            const isVoided = sale.status === 'voided'
            return (
              <div key={sale.id}
                className={`border rounded-xl overflow-hidden ${
                  isVoided ? 'border-slate-200 opacity-60' : 'border-slate-200 bg-white'
                }`}
              >
                {/* Fila */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Expandir */}
                  <button onClick={() => setExpanded((p) => p === sale.id ? null : sale.id)}
                    className="text-slate-400 shrink-0"
                  >
                    {expanded === sale.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                  </button>

                  <span className="font-mono text-xs text-slate-400 w-20 shrink-0">
                    #{sale.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-500 w-14 shrink-0">
                    {formatTime(sale.created_at)}
                  </span>

                  {/* Método de pago */}
                  {sale.payments && sale.payments.length > 1 ? (
                    <span className="flex items-center gap-1 text-xs text-indigo-600 font-semibold shrink-0">
                      {sale.payments.map((p, i) => (
                        <span key={i}>{METHOD_ICON[p.method] ?? null}</span>
                      ))}
                      Dividido
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                      {METHOD_ICON[sale.payment_method] ?? null}
                      {METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
                    </span>
                  )}

                  <span className="text-xs text-slate-500 shrink-0">
                    {sale.items_count} {sale.items_count === 1 ? 'ítem' : 'ítems'}
                  </span>

                  {sale.customer_name && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0 max-w-[120px] truncate">
                      {sale.customer_name}
                    </span>
                  )}

                  {isVoided && (
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">
                      ANULADA
                    </span>
                  )}

                  <span className={`ml-auto font-bold ${isVoided ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    ${formatCOP(sale.total)}
                  </span>

                  {/* Botón anular */}
                  {!isVoided && (
                    <button
                      onClick={() => { setVoidTarget(sale); setVoidReason('') }}
                      title="Anular venta"
                      className="ml-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Ban size={12} /> Anular
                    </button>
                  )}
                </div>

                {/* Detalle expandido */}
                {expanded === sale.id && (
                  <div className="border-t border-slate-100 bg-slate-50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="px-4 py-2 text-left font-semibold text-slate-500">Producto</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-500">Cant.</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-500">P. Unit.</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-2 text-slate-700">{item.product_name}</td>
                            <td className="px-4 py-2 text-right text-slate-600">{item.quantity}</td>
                            <td className="px-4 py-2 text-right text-slate-600">${formatCOP(item.unit_price)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-blue-700">${formatCOP(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        {sale.discount_total > 0 && (
                          <>
                            <tr className="bg-white">
                              <td colSpan={3} className="px-4 py-1.5 text-right text-xs text-slate-500">
                                Subtotal
                              </td>
                              <td className="px-4 py-1.5 text-right text-xs text-slate-600">
                                ${formatCOP(sale.subtotal)}
                              </td>
                            </tr>
                            <tr className="bg-amber-50">
                              <td colSpan={3} className="px-4 py-1.5 text-right text-xs text-amber-700 font-semibold">
                                Descuento ({sale.discount_pct}%)
                              </td>
                              <td className="px-4 py-1.5 text-right text-xs font-bold text-amber-700">
                                −${formatCOP(sale.discount_total)}
                              </td>
                            </tr>
                          </>
                        )}
                        <tr className="bg-white">
                          <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-600">
                            Total
                          </td>
                          <td className="px-4 py-2 text-right font-extrabold text-slate-900">
                            ${formatCOP(sale.total)}
                          </td>
                        </tr>
                        {sale.payments && sale.payments.length > 1 && (
                          <tr className="bg-indigo-50">
                            <td colSpan={4} className="px-4 py-2">
                              <div className="flex flex-wrap gap-3">
                                {sale.payments.map((p, i) => (
                                  <span key={i} className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                                    {METHOD_ICON[p.method] ?? null}
                                    {METHOD_LABEL[p.method] ?? p.method}:
                                    <span className="font-bold text-indigo-700">${formatCOP(p.amount)}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        {sale.change_given > 0 && (
                          <tr className="bg-green-50">
                            <td colSpan={3} className="px-4 py-1.5 text-right text-xs text-slate-500">
                              Recibido ${formatCOP(sale.cash_tendered)} · Cambio
                            </td>
                            <td className="px-4 py-1.5 text-right text-xs font-bold text-green-700">
                              ${formatCOP(sale.change_given)}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                    {sale.notes && (
                      <p className={`px-4 py-2 text-xs font-semibold border-t border-slate-200 flex items-center gap-1.5 ${
                        isVoided ? 'text-red-500 bg-red-50' : 'text-slate-500 bg-slate-50'
                      }`}>
                        {isVoided ? 'Motivo anulación:' : 'Nota:'} {sale.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modal anular ── */}
      {voidTarget && (
        <VoidModal
          sale={voidTarget}
          reason={voidReason}
          setReason={setVoidReason}
          adminUsername={adminUsername}
          setAdminUsername={setAdminUsername}
          adminPassword={adminPassword}
          setAdminPassword={setAdminPassword}
          loading={voidMut.isPending}
          onConfirm={() => voidMut.mutate()}
          onClose={() => {
            setVoidTarget(null)
            setVoidReason('')
            setAdminUsername('')
            setAdminPassword('')
          }}
        />
      )}
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────
function VoidModal({
  sale, reason, setReason,
  adminUsername, setAdminUsername,
  adminPassword, setAdminPassword,
  loading, onConfirm, onClose,
}) {
  const canConfirm = adminUsername.trim().length > 0 && adminPassword.length > 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Ban size={16} className="text-red-500" /> Anular venta
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              #{sale.id.slice(0, 8).toUpperCase()} · ${formatCOP(sale.total)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Esta acción <strong>devolverá el stock</strong> de todos los ítems al inventario.
            No se puede deshacer.
          </p>

          {/* Motivo */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Motivo (opcional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Error de cobro, producto devuelto..."
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400"
            />
          </div>

          {/* Credenciales admin */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2.5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
              <span>🔐</span> Autorización del administrador
            </p>
            <input
              type="text"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              placeholder="Usuario admin"
              autoFocus
              autoComplete="off"
              className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg outline-none focus:border-amber-500 bg-white"
            />
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm && !loading) onConfirm() }}
              className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg outline-none focus:border-amber-500 bg-white"
            />
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !canConfirm}
            className={`flex-[2] py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-colors ${
              loading || !canConfirm
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 cursor-pointer'
            }`}
          >
            <Ban size={14} />
            {loading ? 'Anulando...' : 'Confirmar anulación'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, unit, color }) {
  const colors = {
    blue:   'text-blue-700 bg-blue-50 border-blue-100',
    violet: 'text-violet-700 bg-violet-50 border-violet-100',
    green:  'text-green-700 bg-green-50 border-green-100',
    red:    'text-red-600 bg-red-50 border-red-100',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">{label}</p>
      <p className="font-extrabold text-xl mt-0.5">{value}</p>
      <p className="text-xs opacity-60">{unit}</p>
    </div>
  )
}
