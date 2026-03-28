import { useEffect, useRef, useMemo } from 'react'
import { formatCOP } from '@/lib/utils.js'
import { readSettings } from '@/hooks/useSettings.js'
import { Printer, X, TrendingUp } from 'lucide-react'

const METHOD_LABEL = {
  cash: 'Efectivo', card: 'Tarjeta',
  nequi: 'Nequi', daviplata: 'Daviplata',
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Reporte Z — cierre de turno imprimible.
 * Props:
 *   sales    — array SaleResponse (ventas del período)
 *   register — objeto CashRegister (turno actual o cerrado), puede ser null
 *   onClose  — fn
 */
export default function ZReport({ sales = [], register = null, expenses = [], onClose }) {
  const printRef = useRef(null)
  const cfg = readSettings()
  const now = new Date()

  // Cerrar Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Registrar para impresión
  useEffect(() => {
    const el = document.getElementById('print-receipt')
    if (el && printRef.current) el.replaceChildren(printRef.current.cloneNode(true))
    return () => { const el = document.getElementById('print-receipt'); if (el) el.innerHTML = '' }
  })

  // ── Cómputos ──────────────────────────────────────────────
  const active  = useMemo(() => sales.filter((s) => s.status !== 'voided'), [sales])
  const voided  = useMemo(() => sales.filter((s) => s.status === 'voided'),  [sales])

  const totalRevenue   = useMemo(() => active.reduce((s, v) => s + v.total, 0),    [active])
  const totalDiscount  = useMemo(() => active.reduce((s, v) => s + (v.discount_total || 0), 0), [active])
  const totalItems     = useMemo(() => active.reduce((s, v) => s + v.items_count, 0), [active])

  // Por método de pago
  const byMethod = useMemo(() => {
    const map = {}
    for (const s of active) {
      const m = s.payment_method
      if (!map[m]) map[m] = { count: 0, total: 0 }
      map[m].count++
      map[m].total += s.total
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [active])

  // Top 5 productos
  const topProducts = useMemo(() => {
    const map = {}
    for (const s of active) {
      for (const item of s.items ?? []) {
        if (!map[item.product_name]) map[item.product_name] = { qty: 0, total: 0 }
        map[item.product_name].qty   += item.quantity
        map[item.product_name].total += item.subtotal
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
  }, [active])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-sm">Informe Z — Cierre de turno</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Reporte imprimible */}
        <div className="overflow-y-auto flex-1">
          <div ref={printRef} className="receipt-paper p-4 font-mono text-xs leading-relaxed">

            {/* Cabecera negocio */}
            <div className="text-center mb-3">
              <div className="font-bold text-base">{cfg.businessName}</div>
              {cfg.nit    && <div>NIT: {cfg.nit}</div>}
              {cfg.address && <div>{cfg.address}</div>}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2" />
            <div className="text-center font-bold mb-1">*** INFORME Z ***</div>
            <div className="text-center mb-1">
              {fmtDate(now)}
            </div>
            <div className="text-center text-xs mb-2">
              Impreso: {fmtDateTime(now.toISOString())}
            </div>

            {/* Turno */}
            {register && (
              <>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-bold mb-1">TURNO</div>
                <div className="flex justify-between"><span>Apertura</span><span>{fmtDateTime(register.opened_at)}</span></div>
                {register.closed_at && <div className="flex justify-between"><span>Cierre</span><span>{fmtDateTime(register.closed_at)}</span></div>}
                <div className="flex justify-between"><span>Fondo inicial</span><span>${formatCOP(register.opening_amount)}</span></div>
              </>
            )}

            <div className="border-t border-dashed border-slate-400 my-2" />

            {/* Resumen */}
            <div className="font-bold mb-1">RESUMEN DE VENTAS</div>
            <div className="flex justify-between"><span>Transacciones</span><span>{active.length}</span></div>
            <div className="flex justify-between"><span>Ítems vendidos</span><span>{totalItems}</span></div>
            {totalDiscount > 0 && (
              <div className="flex justify-between"><span>Descuentos</span><span>-${formatCOP(totalDiscount)}</span></div>
            )}
            <div className="flex justify-between"><span>Anuladas</span><span>{voided.length}</span></div>
            <div className="border-t border-slate-300 my-1" />
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL RECAUDADO</span>
              <span>${formatCOP(totalRevenue)}</span>
            </div>

            {/* Por método */}
            {byMethod.length > 0 && (
              <>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-bold mb-1">POR MÉTODO DE PAGO</div>
                {byMethod.map(([method, d]) => (
                  <div key={method} className="flex justify-between">
                    <span>{METHOD_LABEL[method] ?? method} ({d.count})</span>
                    <span>${formatCOP(d.total)}</span>
                  </div>
                ))}
              </>
            )}

            {/* Gastos de caja menor */}
            {expenses.length > 0 && (
              <>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-bold mb-1">GASTOS DE CAJA MENOR</div>
                {expenses.map((e) => (
                  <div key={e.id} className="flex justify-between gap-1">
                    <span className="truncate flex-1">{e.description}</span>
                    <span className="shrink-0">-${formatCOP(e.amount)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-300 my-1" />
                <div className="flex justify-between font-bold">
                  <span>Total gastos</span>
                  <span>-${formatCOP(expenses.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              </>
            )}

            {/* Top productos */}
            {topProducts.length > 0 && (
              <>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-bold mb-1">TOP PRODUCTOS</div>
                {topProducts.map(([name, d]) => (
                  <div key={name} className="flex justify-between gap-1">
                    <span className="truncate flex-1">{name}</span>
                    <span className="shrink-0">x{d.qty} ${formatCOP(d.total)}</span>
                  </div>
                ))}
              </>
            )}

            {/* Cuadre de caja */}
            {register?.closing_amount != null && (
              <>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-bold mb-1">CUADRE DE CAJA</div>
                <div className="flex justify-between"><span>Efectivo esperado</span><span>${formatCOP(register.expected_amount ?? 0)}</span></div>
                <div className="flex justify-between"><span>Efectivo contado</span><span>${formatCOP(register.closing_amount)}</span></div>
                <div className={`flex justify-between font-bold ${Number(register.variance) >= 0 ? '' : 'text-red-600'}`}>
                  <span>Varianza</span>
                  <span>{Number(register.variance) >= 0 ? '+' : ''}${formatCOP(register.variance ?? 0)}</span>
                </div>
              </>
            )}

            <div className="border-t border-dashed border-slate-400 my-2" />
            <div className="text-center">— FIN DEL INFORME Z —</div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 px-4 py-3 border-t border-slate-100 shrink-0 no-print">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            Cerrar
          </button>
          <button onClick={() => window.print()}
            className="flex-[2] py-2 rounded-lg font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2"
          >
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  )
}
