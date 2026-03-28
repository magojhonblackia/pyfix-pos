import { useState, useEffect, useRef } from 'react'
import { formatCOP } from '@/lib/utils.js'
import { X, Banknote, CreditCard, Smartphone, CheckCircle, ArrowLeftRight } from 'lucide-react'
import { useLicense } from '@/hooks/useLicense.jsx'

const ALL_METHODS = [
  { id: 'cash',      label: 'Efectivo',  icon: <Banknote   size={14} />, color: 'green'  },
  { id: 'card',      label: 'Tarjeta',   icon: <CreditCard size={14} />, color: 'blue'   },
  { id: 'nequi',     label: 'Nequi',     icon: <Smartphone size={14} />, color: 'violet' },
  { id: 'daviplata', label: 'Daviplata', icon: <Smartphone size={14} />, color: 'pink'   },
]

const METHOD_COLORS = {
  green:  { active: 'bg-green-600 text-white border-green-600',   base: 'border-slate-200 text-slate-600 hover:border-green-400'  },
  blue:   { active: 'bg-blue-600 text-white border-blue-600',     base: 'border-slate-200 text-slate-600 hover:border-blue-400'   },
  violet: { active: 'bg-violet-600 text-white border-violet-600', base: 'border-slate-200 text-slate-600 hover:border-violet-400' },
  pink:   { active: 'bg-pink-600 text-white border-pink-600',     base: 'border-slate-200 text-slate-600 hover:border-pink-400'   },
}

/**
 * Props:
 *   total       — number
 *   subtotal    — number
 *   discountPct — number (0–100)
 *   onConfirm({ method, cashTendered, splitPayments }) — fn
 *   onClose  — fn
 *   loading  — bool
 */
export default function PaymentModal({ total, subtotal = 0, discountPct = 0, onConfirm, onClose, loading }) {
  const { canUseAllPayments, status } = useLicense()

  // Si licencia bloqueada → solo efectivo
  const METHODS = canUseAllPayments ? ALL_METHODS : ALL_METHODS.filter(m => m.id === 'cash')

  // ── Modo pago único ──────────────────────────────────────
  const [method,   setMethod]   = useState('cash')
  const [tendered, setTendered] = useState('')

  // ── Modo pago dividido ───────────────────────────────────
  const [splitMode,    setSplitMode]    = useState(false)
  const [split1Method, setSplit1Method] = useState('cash')
  const [split1Amount, setSplit1Amount] = useState('')
  const [split2Method, setSplit2Method] = useState('card')

  const inputRef  = useRef(null)
  const split1Ref = useRef(null)

  useEffect(() => {
    if (!splitMode && method === 'cash') setTimeout(() => inputRef.current?.focus(), 50)
    if (splitMode)                       setTimeout(() => split1Ref.current?.focus(), 50)
  }, [method, splitMode])

  // ── Modo único: cálculos ─────────────────────────────────
  const isCash      = method === 'cash'
  const tendNum     = parseFloat(tendered) || 0
  const change      = isCash ? tendNum - total : 0
  const canPay      = !isCash || tendNum >= total
  const discountAmt = subtotal - total
  const hasDiscount = discountPct > 0 && discountAmt > 0

  const BILLS      = [1000, 2000, 5000, 10000, 20000, 50000, 100000]
  const quickBills = BILLS.filter((b) => b >= total).slice(0, 4)

  // ── Modo dividido: cálculos ──────────────────────────────
  const split1Num  = parseFloat(split1Amount) || 0
  const split2Num  = Math.max(0, total - split1Num)            // restante automático

  // Cambio solo sobre la parte en efectivo
  const splitNonCash  = (split1Method !== 'cash' ? split1Num : 0) + (split2Method !== 'cash' ? split2Num : 0)
  const splitCashIn   = (split1Method === 'cash' ? split1Num : 0) + (split2Method === 'cash' ? split2Num : 0)
  const splitCashNeed = Math.max(0, total - splitNonCash)
  const splitChange   = Math.max(0, splitCashIn - splitCashNeed)

  const splitDiffMethods = split1Method !== split2Method
  const canSplit = split1Num > 0 && split1Num < total && splitDiffMethods

  // ── Confirmar ────────────────────────────────────────────
  const handleConfirm = () => {
    if (loading) return
    if (splitMode) {
      if (!canSplit) return
      onConfirm({
        method:        split1Method,
        cashTendered:  null,
        splitPayments: [
          { method: split1Method, amount: split1Num  },
          { method: split2Method, amount: split2Num  },
        ],
      })
    } else {
      if (!canPay) return
      onConfirm({
        method,
        cashTendered:  isCash ? tendNum : null,
        splitPayments: null,
      })
    }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const confirmEnabled = !loading && (splitMode ? canSplit : canPay)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1">
            <h3 className="font-bold text-slate-800">Cobrar venta</h3>
            {hasDiscount ? (
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal</span><span>${formatCOP(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600 font-semibold">
                  <span>Descuento ({discountPct}%)</span>
                  <span>−${formatCOP(discountAmt)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-xl text-slate-900 border-t border-slate-100 pt-1">
                  <span>Total</span><span>${formatCOP(total)}</span>
                </div>
              </div>
            ) : (
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">${formatCOP(total)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto flex-1">

          {/* Toggle pago dividido */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {splitMode ? 'Pago dividido' : 'Método de pago'}
            </p>
            <button
              onClick={() => setSplitMode((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                splitMode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50 bg-white'
              }`}
            >
              <ArrowLeftRight size={11} />
              {splitMode ? 'Pago único' : 'Dividir pago'}
            </button>
          </div>

          {!splitMode ? (
            /* ── Modo pago único ── */
            <>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => {
                  const cls      = METHOD_COLORS[m.color]
                  const isActive = method === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all cursor-pointer ${
                        isActive ? cls.active : cls.base
                      }`}
                    >
                      {m.icon} {m.label}
                    </button>
                  )
                })}
              </div>

              {isCash && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Monto recibido
                  </p>
                  <input
                    ref={inputRef}
                    type="number"
                    min={total}
                    step="any"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
                    placeholder={`Mín. $${formatCOP(total)}`}
                    className="w-full px-3 py-2.5 text-lg font-bold border-2 rounded-xl outline-none focus:border-green-500 border-slate-300"
                  />
                  {quickBills.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {quickBills.map((b) => (
                        <button
                          key={b}
                          onClick={() => setTendered(String(b))}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          ${formatCOP(b)}
                        </button>
                      ))}
                    </div>
                  )}
                  {tendered !== '' && (
                    <div className={`flex justify-between items-center px-3 py-2 rounded-xl font-bold ${
                      change < 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
                    }`}>
                      <span className="text-sm">{change < 0 ? 'Falta' : 'Cambio'}</span>
                      <span className="text-lg">${formatCOP(Math.abs(change))}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ── Modo pago dividido ── */
            <div className="flex flex-col gap-4">

              {/* Pago 1 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pago 1</p>
                <div className="flex gap-1 flex-wrap">
                  {METHODS.map((m) => {
                    const cls      = METHOD_COLORS[m.color]
                    const isActive = split1Method === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSplit1Method(m.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                          isActive ? cls.active : cls.base
                        }`}
                      >
                        {m.icon} {m.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  ref={split1Ref}
                  type="number"
                  min="0"
                  max={total}
                  step="any"
                  value={split1Amount}
                  onChange={(e) => setSplit1Amount(e.target.value)}
                  placeholder={`Monto a pagar (de $${formatCOP(total)})`}
                  className="w-full px-3 py-2.5 text-base font-bold border-2 rounded-xl outline-none focus:border-blue-500 border-slate-300"
                />
              </div>

              {/* Pago 2 — restante automático */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Pago 2
                  <span className="ml-1.5 text-slate-400 font-normal normal-case">
                    (restante: ${formatCOP(split2Num)})
                  </span>
                </p>
                <div className="flex gap-1 flex-wrap">
                  {METHODS.map((m) => {
                    const cls      = METHOD_COLORS[m.color]
                    const isActive = split2Method === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSplit2Method(m.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                          isActive ? cls.active : cls.base
                        }`}
                      >
                        {m.icon} {m.label}
                      </button>
                    )
                  })}
                </div>
                <div className="w-full px-3 py-2.5 text-base font-bold border-2 rounded-xl border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-between">
                  <span>${formatCOP(split2Num)}</span>
                  <span className="text-xs font-normal text-slate-400">automático</span>
                </div>
              </div>

              {/* Cambio si hay efectivo */}
              {splitChange > 0 && (
                <div className="flex justify-between items-center px-3 py-2 rounded-xl font-bold bg-green-50 text-green-700">
                  <span className="text-sm">Cambio</span>
                  <span className="text-lg">${formatCOP(splitChange)}</span>
                </div>
              )}

              {/* Avisos de validación */}
              {split1Amount !== '' && split1Num >= total && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  El primer monto cubre el total. Usa pago único.
                </p>
              )}
              {split1Amount !== '' && split1Num > 0 && !splitDiffMethods && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Los dos métodos de pago deben ser diferentes.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2 shrink-0 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmEnabled}
            className={`flex-[2] py-3 rounded-xl font-extrabold text-sm text-white flex items-center justify-center gap-2 transition-all ${
              confirmEnabled
                ? 'bg-green-600 hover:bg-green-700 cursor-pointer shadow-lg shadow-green-600/20'
                : 'bg-slate-400 cursor-not-allowed'
            }`}
          >
            {loading
              ? 'Procesando...'
              : <><CheckCircle size={16} /> Confirmar venta</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
