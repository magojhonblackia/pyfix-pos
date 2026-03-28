import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { formatCOP } from '@/lib/utils.js'
import { readSettings } from '@/hooks/useSettings.js'
import { printReceipt, openCashDrawer } from '@/services/api.js'
import { Printer, MonitorDown, Vault, X, CheckCircle2, Loader2 } from 'lucide-react'

const METHOD_LABEL = {
  cash:      'Efectivo',
  card:      'Tarjeta',
  nequi:     'Nequi',
  daviplata: 'Daviplata',
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Modal de recibo — abre automáticamente después de una venta.
 * Props:
 *   sale    — objeto SaleResponse
 *   onClose — fn
 */
export default function SaleReceipt({ sale, onClose }) {
  const printRef   = useRef(null)
  const cfg        = readSettings()
  const [drawerOk, setDrawerOk] = useState(false)

  // Registrar el nodo de impresión en el DOM
  useEffect(() => {
    const el = document.getElementById('print-receipt')
    if (el && printRef.current) el.replaceChildren(printRef.current.cloneNode(true))
    return () => {
      const el = document.getElementById('print-receipt')
      if (el) el.innerHTML = ''
    }
  }, [sale])

  const handlePrint = () => window.print()

  // ── Impresión ESC/POS (impresora térmica real) ────────────────
  const thermalMutation = useMutation({
    mutationFn: () => printReceipt({
      sale_id:        sale.id,
      business_name:  cfg.businessName || 'Minimarket',
      items:          sale.items.map((i) => ({
        name:     i.product_name,
        quantity: i.quantity,
        price:    i.unit_price ?? (i.subtotal / i.quantity),
      })),
      subtotal:       sale.subtotal,
      discount:       sale.discount_total ?? 0,
      total:          sale.total,
      payment_method: sale.payment_method,
      cash_tendered:  sale.cash_tendered,
      change_given:   sale.change_given,
      cashier_name:   cfg.cashierName || '',
      payments:       sale.payments?.length > 1 ? sale.payments : null,
    }),
  })

  // ── Abrir cajón ───────────────────────────────────────────────
  const drawerMutation = useMutation({
    mutationFn: () => openCashDrawer(sale.id, 'sale'),
    onSuccess:  () => setDrawerOk(true),
  })

  // Cerrar con Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-sm">Recibo de venta</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Ticket */}
        <div className="overflow-y-auto max-h-[70vh]">
          <div ref={printRef} className="receipt-paper p-4 font-mono text-xs leading-relaxed">

            {/* Cabecera negocio */}
            <div className="text-center mb-3">
              <div className="font-bold text-base">{cfg.businessName}</div>
              {cfg.nit && <div>NIT: {cfg.nit}</div>}
              {cfg.address && <div>{cfg.address}</div>}
              {cfg.phone && <div>Tel: {cfg.phone}</div>}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2" />

            <div className="text-center mb-2">
              <div className="font-bold">RECIBO DE VENTA</div>
              <div>#{sale.id.slice(0, 12).toUpperCase()}</div>
              <div>{fmtDateTime(sale.created_at)}</div>
            </div>

            {sale.customer_name && (
              <>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="text-xs text-center">
                  <span className="text-slate-500">Cliente: </span>
                  <span className="font-semibold">{sale.customer_name}</span>
                </div>
              </>
            )}

            <div className="border-t border-dashed border-slate-400 my-2" />

            {/* Ítems */}
            <table className="w-full text-xs mb-1">
              <thead>
                <tr>
                  <th className="text-left font-semibold">Descripción</th>
                  <th className="text-right font-semibold">Cant</th>
                  <th className="text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr key={i}>
                    <td className="text-left py-0.5 pr-1">{item.product_name}</td>
                    <td className="text-right py-0.5 px-1">{item.quantity}</td>
                    <td className="text-right py-0.5">${formatCOP(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-slate-400 my-2" />

            {/* Totales */}
            {sale.discount_total > 0 && (
              <div className="text-xs mb-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${formatCOP(sale.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Descuento ({sale.discount_pct}%)</span>
                  <span>-${formatCOP(sale.discount_total)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>${formatCOP(sale.total)}</span>
            </div>

            <div className="border-t border-dashed border-slate-400 my-2" />

            {/* Pago */}
            <div className="text-xs">
              <div className="flex justify-between">
                <span>Forma de pago:</span>
                <span className="font-semibold">{METHOD_LABEL[sale.payment_method] ?? sale.payment_method}</span>
              </div>
              {sale.payment_method === 'cash' && (
                <>
                  <div className="flex justify-between">
                    <span>Recibido:</span>
                    <span>${formatCOP(sale.cash_tendered)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Cambio:</span>
                    <span>${formatCOP(sale.change_given)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-dashed border-slate-400 my-3" />

            {/* Footer */}
            <div className="text-center text-xs text-slate-500">
              {cfg.receiptFooter}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-2 px-4 py-3 border-t border-slate-100 no-print">
          {/* Fila 1: Imprimir en pantalla + térmica */}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              Cerrar
            </button>
            <button onClick={handlePrint}
              title="Imprimir en impresora del sistema (Ctrl+P)"
              className="flex-1 py-2 rounded-lg font-semibold text-sm text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <MonitorDown size={15} /> PDF / Sistema
            </button>
          </div>

          {/* Fila 2: Térmica + Cajón */}
          <div className="flex gap-2">
            <button
              onClick={() => thermalMutation.mutate()}
              disabled={thermalMutation.isPending || thermalMutation.isSuccess}
              className="flex-[2] py-2 rounded-lg font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 transition-colors"
            >
              {thermalMutation.isPending ? (
                <><Loader2 size={15} className="animate-spin" /> Imprimiendo…</>
              ) : thermalMutation.isSuccess ? (
                <><CheckCircle2 size={15} /> Impreso</>
              ) : thermalMutation.isError ? (
                <><Printer size={15} /> Reintentar</>
              ) : (
                <><Printer size={15} /> Impresora térmica</>
              )}
            </button>

            <button
              onClick={() => drawerMutation.mutate()}
              disabled={drawerMutation.isPending || drawerOk}
              title="Abrir cajón de dinero (registrado en auditoría)"
              className="flex-1 py-2 rounded-lg font-bold text-sm border cursor-pointer flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            >
              {drawerMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : drawerOk ? (
                <><CheckCircle2 size={14} /> Abierto</>
              ) : (
                <><Vault size={14} /> Cajón</>
              )}
            </button>
          </div>

          {/* Errores inline */}
          {thermalMutation.isError && (
            <p className="text-xs text-red-600 text-center">
              {thermalMutation.error?.message || 'Error de impresión'}
            </p>
          )}
          {drawerMutation.isError && (
            <p className="text-xs text-red-600 text-center">
              {drawerMutation.error?.message || 'Error al abrir cajón'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
