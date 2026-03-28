import { useState, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { bulkPriceUpdate } from '@/services/api.js'
import { formatCOP } from '@/lib/utils.js'
import { X, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react'

const FIELD_OPTS = [
  { value: 'price',      label: 'Precio de venta' },
  { value: 'cost_price', label: 'Precio de costo' },
  { value: 'both',       label: 'Ambos (venta y costo)' },
]

const ROUND_OPTS = [
  { value: 0,    label: 'Sin redondeo' },
  { value: 100,  label: 'Redondear a $100' },
  { value: 500,  label: 'Redondear a $500' },
  { value: 1000, label: 'Redondear a $1.000' },
  { value: 5000, label: 'Redondear a $5.000' },
]

/**
 * BulkPriceModal
 * @param {Object[]} products  — lista completa de productos activos
 * @param {Object[]} categories — categorías disponibles
 * @param {Function} onClose
 * @param {Function} onDone   — callback con el resultado tras confirmar
 */
export default function BulkPriceModal({ products, categories, onClose, onDone }) {
  const [categoryId, setCategoryId] = useState('')        // '' = todos
  const [field,      setField]      = useState('price')
  const [pct,        setPct]        = useState('')
  const [roundTo,    setRoundTo]    = useState(0)
  const [result,     setResult]     = useState(null)      // {updated, skipped} tras confirmar

  // ── Previsualización ─────────────────────────────────────────
  const pctNum = parseFloat(pct)
  const validPct = !isNaN(pctNum) && pctNum >= -90 && pctNum <= 500 && pct !== ''

  const affected = useMemo(() => {
    let list = products.filter((p) => p.is_active)
    if (categoryId) list = list.filter((p) => p.category_id === categoryId)
    return list
  }, [products, categoryId])

  const preview = useMemo(() => {
    if (!validPct) return null
    const factor = 1 + pctNum / 100
    return affected.slice(0, 5).map((p) => {
      const applyRound = (v) => {
        let n = v * factor
        if (roundTo > 0) n = Math.round(n / roundTo) * roundTo
        return Math.max(1, Math.round(n))
      }
      return {
        name:      p.name,
        oldPrice:  p.price,
        newPrice:  field !== 'cost_price' ? applyRound(p.price)      : p.price,
        oldCost:   p.cost_price,
        newCost:   field !== 'price'      ? applyRound(p.cost_price) : p.cost_price,
      }
    })
  }, [affected, pctNum, validPct, field, roundTo])

  // ── Mutación ─────────────────────────────────────────────────
  const mut = useMutation({
    mutationFn: () => bulkPriceUpdate({
      pct_change:  pctNum,
      field,
      category_id: categoryId || null,
      round_to:    roundTo,
    }),
    onSuccess: (data) => {
      setResult(data)
      onDone?.()
    },
  })

  const isUp = validPct && pctNum > 0

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              {isUp
                ? <TrendingUp size={16} className="text-emerald-500" />
                : <TrendingDown size={16} className="text-blue-500" />
              }
              Ajuste masivo de precios
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Actualiza precios de múltiples productos a la vez</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* ── Pantalla de resultado ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <div>
              <p className="font-extrabold text-xl text-slate-800">¡Ajuste aplicado!</p>
              <p className="text-slate-500 text-sm mt-1">
                <span className="font-bold text-slate-700">{result.updated}</span> producto{result.updated !== 1 ? 's' : ''} actualizado{result.updated !== 1 ? 's' : ''}
                {result.skipped > 0 && ` · ${result.skipped} omitido${result.skipped !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {/* ── Formulario ── */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Categoría */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-white"
                >
                  <option value="">Todos los productos activos ({products.filter(p=>p.is_active).length})</option>
                  {categories.map((c) => {
                    const cnt = products.filter(p => p.is_active && p.category_id === c.id).length
                    return (
                      <option key={c.id} value={c.id}>{c.name} ({cnt})</option>
                    )
                  })}
                </select>
              </div>

              {/* Campo a modificar */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Campo a modificar</label>
                <div className="flex gap-2">
                  {FIELD_OPTS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setField(o.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        field === o.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Porcentaje */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Porcentaje de cambio</label>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[-10, -5, 5, 10, 15, 20].map((v) => (
                      <button
                        key={v}
                        onClick={() => setPct(String(v))}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          pct === String(v)
                            ? v > 0
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-red-500 text-white border-red-500'
                            : v > 0
                              ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                              : 'text-red-600 border-red-200 hover:bg-red-50'
                        }`}
                      >
                        {v > 0 ? `+${v}` : v}%
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.1"
                      min="-90"
                      max="500"
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      placeholder="Ej: 12.5"
                      className={`w-full px-3 py-2 text-sm border rounded-lg outline-none text-right pr-8 ${
                        pct && !validPct
                          ? 'border-red-400 focus:border-red-400'
                          : 'border-slate-200 focus:border-blue-400'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                  </div>
                </div>
                {pct && !validPct && (
                  <p className="text-xs text-red-500 mt-1">El porcentaje debe estar entre −90% y +500%</p>
                )}
              </div>

              {/* Redondeo */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Redondeo</label>
                <select
                  value={roundTo}
                  onChange={(e) => setRoundTo(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-white"
                >
                  {ROUND_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Previsualización */}
              {validPct && preview && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">
                      Vista previa ({affected.length} producto{affected.length !== 1 ? 's' : ''} afectado{affected.length !== 1 ? 's' : ''})
                    </span>
                    {affected.length > 5 && (
                      <span className="text-xs text-slate-400">mostrando 5 de {affected.length}</span>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Producto</th>
                        {field !== 'cost_price' && (
                          <>
                            <th className="px-3 py-2 text-right text-slate-500 font-semibold">Precio actual</th>
                            <th className="px-3 py-2 text-right text-slate-500 font-semibold">Precio nuevo</th>
                          </>
                        )}
                        {field !== 'price' && (
                          <>
                            <th className="px-3 py-2 text-right text-slate-500 font-semibold">Costo actual</th>
                            <th className="px-3 py-2 text-right text-slate-500 font-semibold">Costo nuevo</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2 text-slate-700 font-medium truncate max-w-[140px]">{p.name}</td>
                          {field !== 'cost_price' && (
                            <>
                              <td className="px-3 py-2 text-right text-slate-400">${formatCOP(p.oldPrice)}</td>
                              <td className={`px-3 py-2 text-right font-bold ${
                                p.newPrice > p.oldPrice ? 'text-emerald-600' : p.newPrice < p.oldPrice ? 'text-red-500' : 'text-slate-500'
                              }`}>${formatCOP(p.newPrice)}</td>
                            </>
                          )}
                          {field !== 'price' && (
                            <>
                              <td className="px-3 py-2 text-right text-slate-400">${formatCOP(p.oldCost)}</td>
                              <td className={`px-3 py-2 text-right font-bold ${
                                p.newCost > p.oldCost ? 'text-emerald-600' : p.newCost < p.oldCost ? 'text-red-500' : 'text-slate-500'
                              }`}>${formatCOP(p.newCost)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Advertencia */}
              {validPct && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Esta operación <strong>modificará {affected.length} producto{affected.length !== 1 ? 's'  : ''}</strong> de forma permanente.
                    El cambio se aplicará {pctNum > 0 ? 'aumentando' : 'disminuyendo'} el{' '}
                    {field === 'both' ? 'precio y costo' : field === 'price' ? 'precio de venta' : 'precio de costo'}{' '}
                    un <strong>{Math.abs(pctNum)}%</strong>.
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => mut.mutate()}
                disabled={!validPct || affected.length === 0 || mut.isPending}
                className={`flex-[2] py-2.5 rounded-xl font-bold text-sm text-white transition-colors ${
                  !validPct || affected.length === 0 || mut.isPending
                    ? 'bg-slate-300 cursor-not-allowed'
                    : isUp
                      ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                      : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                }`}
              >
                {mut.isPending
                  ? 'Aplicando…'
                  : `Aplicar a ${affected.length} producto${affected.length !== 1 ? 's' : ''}`
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
