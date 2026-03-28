import { useState, useRef } from 'react'
import { formatCOP } from '@/lib/utils.js'
import { X, Minus, Plus, Percent } from 'lucide-react'
import { useCartStore } from '@/store/cartStore.js'

export default function Cart({ items, onUpdateQuantity, onRemove }) {
  const { itemDiscounts, setItemDiscount } = useCartStore()

  // ── Edición de cantidad ──────────────────────────────────
  const [editing,  setEditing]  = useState(null)
  const [editVal,  setEditVal]  = useState('')
  const qtyRef = useRef(null)

  const startEdit = (productId, currentQty) => {
    setEditing(productId)
    setEditVal(String(currentQty))
    setTimeout(() => qtyRef.current?.select(), 0)
  }
  const commitEdit = (productId) => {
    const n = parseInt(editVal, 10)
    if (!isNaN(n) && n >= 0) onUpdateQuantity(productId, n)
    setEditing(null)
    setEditVal('')
  }
  const cancelEdit = () => { setEditing(null); setEditVal('') }

  // ── Edición de descuento por ítem ───────────────────────
  const [discEditing, setDiscEditing] = useState(null)
  const [discVal,     setDiscVal]     = useState('')
  const discRef = useRef(null)

  const startDiscEdit = (productId) => {
    setDiscEditing(productId)
    setDiscVal(String(itemDiscounts[productId] || ''))
    setTimeout(() => { discRef.current?.focus(); discRef.current?.select() }, 0)
  }
  const commitDisc = (productId) => {
    const n = parseFloat(discVal)
    setItemDiscount(productId, isNaN(n) ? 0 : n)
    setDiscEditing(null)
    setDiscVal('')
  }
  const cancelDisc = () => { setDiscEditing(null); setDiscVal('') }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        El carrito está vacío. Selecciona productos.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
      {items.map((item) => {
        const isEditingQty  = editing  === item.product_id
        const isEditingDisc = discEditing === item.product_id
        const discPct       = itemDiscounts[item.product_id] || 0
        const effPrice      = item.price * (1 - discPct / 100)
        const lineTotal     = effPrice * item.quantity

        return (
          <div
            key={item.product_id}
            className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
              discPct > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-white border-slate-200'
            }`}
          >
            {/* Nombre + precio */}
            <div className="min-w-0">
              <div className="font-semibold text-sm text-slate-800 leading-tight truncate">
                {item.name}
              </div>

              {/* Precio con/sin descuento */}
              {isEditingDisc ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Percent size={10} className="text-amber-500 shrink-0" />
                  <input
                    ref={discRef}
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={discVal}
                    onChange={(e) => setDiscVal(e.target.value)}
                    onBlur={() => commitDisc(item.product_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitDisc(item.product_id) }
                      if (e.key === 'Escape') cancelDisc()
                    }}
                    placeholder="0"
                    className="w-10 text-center text-xs font-bold border-2 border-amber-400 rounded outline-none bg-white py-0.5"
                  />
                  <span className="text-xs text-slate-500">% desc.</span>
                  <button
                    onClick={cancelDisc}
                    className="text-slate-400 hover:text-slate-600 ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : discPct > 0 ? (
                <button
                  onClick={() => startDiscEdit(item.product_id)}
                  className="flex items-center gap-1 mt-0.5 group"
                  title="Editar descuento"
                >
                  <span className="text-xs text-slate-400 line-through">
                    ${formatCOP(item.price)}
                  </span>
                  <span className="text-xs font-bold text-amber-600">
                    ${formatCOP(effPrice)}
                  </span>
                  <span className="text-[10px] bg-amber-200 text-amber-800 font-bold px-1 rounded group-hover:bg-amber-300 transition-colors">
                    -{discPct}%
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => startDiscEdit(item.product_id)}
                  className="flex items-center gap-1 mt-0.5 group"
                  title="Aplicar descuento a este ítem"
                >
                  <span className="text-xs text-slate-500">
                    ${formatCOP(item.price)} c/u
                  </span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Percent size={9} className="text-slate-400" />
                  </span>
                </button>
              )}
            </div>

            {/* Controles de cantidad */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (isEditingQty) cancelEdit()
                  onUpdateQuantity(item.product_id, item.quantity - 1)
                }}
                className="w-7 h-7 flex items-center justify-center bg-slate-100 border border-slate-300 rounded hover:bg-slate-200 transition-colors"
              >
                <Minus size={12} />
              </button>

              {isEditingQty ? (
                <input
                  ref={qtyRef}
                  type="number"
                  min="0"
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => commitEdit(item.product_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(item.product_id) }
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="w-12 text-center font-bold text-sm border-2 border-blue-400 rounded outline-none bg-blue-50 text-blue-700 py-0.5"
                />
              ) : (
                <span
                  onClick={() => startEdit(item.product_id, item.quantity)}
                  title="Clic para editar cantidad"
                  className="min-w-8 text-center font-bold text-sm cursor-pointer select-none px-1.5 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {item.quantity}
                </span>
              )}

              <button
                onClick={() => {
                  if (isEditingQty) cancelEdit()
                  onUpdateQuantity(item.product_id, item.quantity + 1)
                }}
                className="w-7 h-7 flex items-center justify-center bg-slate-100 border border-slate-300 rounded hover:bg-slate-200 transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Subtotal */}
            <div className={`font-bold text-sm min-w-20 text-right tabular-nums ${
              discPct > 0 ? 'text-amber-700' : 'text-blue-700'
            }`}>
              ${formatCOP(lineTotal)}
            </div>

            {/* Eliminar */}
            <button
              onClick={() => { if (isEditingQty) cancelEdit(); onRemove(item.product_id) }}
              className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Eliminar"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
