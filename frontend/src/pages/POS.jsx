import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ProductSearch   from '@/components/ProductSearch.jsx'
import Cart            from '@/components/Cart.jsx'
import CheckoutButton  from '@/components/CheckoutButton.jsx'
import PaymentModal    from '@/components/PaymentModal.jsx'
import SaleReceipt     from '@/components/SaleReceipt.jsx'
import CustomerPicker  from '@/components/CustomerPicker.jsx'
import { useCartStore } from '@/store/cartStore.js'
import { createSale }  from '@/services/api.js'
import { formatCOP, formatTime }   from '@/lib/utils.js'
import { useToast }    from '@/components/Toast.jsx'
import ScaleWidget  from '@/components/ScaleWidget.jsx'
import { AlertCircle, Receipt, Percent, StickyNote, PauseCircle, PlayCircle, X, Scale } from 'lucide-react'

// ── Carrito en espera (held carts) ──────────────────────────
const HELD_KEY = 'pyfix_held_carts'
const loadHeld  = () => { try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]') } catch { return [] } }
const saveHeld  = (carts) => localStorage.setItem(HELD_KEY, JSON.stringify(carts))

export default function POS() {
  const {
    items, addItem, updateQuantity, removeItem,
    clearCart, restoreCart, getTotal, getSubtotal, getDiscountAmount,
    discountPct, setDiscount, itemDiscounts,
  } = useCartStore()

  const [saleKey,   setSaleKey]   = useState(() => crypto.randomUUID())
  const [heldCarts, setHeldCarts] = useState(loadHeld)
  const [showHeld,  setShowHeld]  = useState(false)

  const [showPayment,   setShowPayment]   = useState(false)
  const [lastSale,      setLastSale]      = useState(null)
  const [showReceipt,   setShowReceipt]   = useState(false)
  const [saleNote,      setSaleNote]      = useState('')
  const [customer,      setCustomer]      = useState(null)   // { id, name }
  const [pendingWeight, setPendingWeight] = useState(null)   // kg desde balanza
  const qc        = useQueryClient()
  const toast     = useToast()
  const searchRef = useRef(null)

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F9') {
        e.preventDefault()
        if (items.length > 0 && !showPayment && !showReceipt) setShowPayment(true)
      }
      if (e.key === 'F3') { e.preventDefault(); holdCart() }
      if (e.key === 'Escape') {
        if (showHeld)   setShowHeld(false)
        else if (showPayment)  setShowPayment(false)
        else if (showReceipt) setShowReceipt(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPayment, showReceipt, showHeld, items.length])

  // Cerrar dropdown de held carts al hacer clic fuera
  useEffect(() => {
    if (!showHeld) return
    const close = () => setShowHeld(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [showHeld])

  // ── Carrito en espera ────────────────────────────────────
  const holdCart = () => {
    if (items.length === 0) return
    const snapshot = {
      id:          Date.now(),
      items:       [...items],
      discountPct,
      itemDiscounts: { ...itemDiscounts },
      heldAt:      new Date().toISOString(),
    }
    const updated = [...heldCarts, snapshot].slice(-3)   // máx 3 en espera
    saveHeld(updated)
    setHeldCarts(updated)
    clearCart()
    toast(`Carrito guardado en espera (${snapshot.items.length} ítem${snapshot.items.length !== 1 ? 's' : ''})`, 'info')
  }

  const recallCart = (cartId) => {
    const cart = heldCarts.find((c) => c.id === cartId)
    if (!cart) return
    restoreCart(cart)
    const updated = heldCarts.filter((c) => c.id !== cartId)
    saveHeld(updated)
    setHeldCarts(updated)
    setShowHeld(false)
    toast('Carrito retomado', 'success')
  }

  const deleteHeld = (cartId) => {
    const updated = heldCarts.filter((c) => c.id !== cartId)
    saveHeld(updated)
    setHeldCarts(updated)
    if (updated.length === 0) setShowHeld(false)
  }

  const mutation = useMutation({
    mutationFn: ({ method, cashTendered, splitPayments }) =>
      createSale(
        items.map((i) => {
          const disc = (itemDiscounts[i.product_id] || 0) / 100
          const effPrice = i.price * (1 - disc)
          return {
            product_id: i.product_id,
            quantity:   i.quantity,
            ...(disc > 0 && { unit_price: effPrice }),
          }
        }),
        method ?? 'cash',
        cashTendered,
        discountPct,
        saleNote.trim() || null,
        customer?.id ?? null,
        splitPayments ?? null,
        saleKey,
      ),
    onSuccess: (sale) => {
      clearCart()
      setSaleNote('')
      setCustomer(null)
      setSaleKey(crypto.randomUUID())
      setShowPayment(false)
      setLastSale(sale)
      setShowReceipt(true)
      toast(`Venta $${formatCOP(sale.total)} registrada`, 'success')
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => {
      setShowPayment(false)
      toast(e.message || 'Error al procesar la venta', 'error')
    },
  })

  const subtotal      = getSubtotal()
  const discountAmt   = getDiscountAmount()
  const total         = getTotal()
  const hasDiscount   = discountPct > 0 && discountAmt > 0

  return (
    <div className="grid grid-cols-[1fr_380px] h-full">

      {/* LEFT — búsqueda */}
      <div className="flex flex-col p-4 bg-slate-50 border-r border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Productos</h2>
          <ScaleWidget
            onWeightAccepted={(w) => setPendingWeight(w)}
          />
        </div>

        {/* Banner peso en espera */}
        {pendingWeight !== null && (
          <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-700">
            <span className="flex items-center gap-1.5">
              <Scale size={13} />
              Peso en espera: <span className="font-mono font-extrabold">{pendingWeight.toFixed(3)} kg</span>
              — se aplicará al próximo producto
            </span>
            <button
              onClick={() => setPendingWeight(null)}
              className="text-blue-400 hover:text-blue-600 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <ProductSearch
          ref={searchRef}
          onSelect={(product) => {
            if (pendingWeight !== null) {
              addItem(product, pendingWeight)
              setPendingWeight(null)
            } else {
              addItem(product)
            }
          }}
        />
      </div>

      {/* RIGHT — carrito + checkout */}
      <div className="flex flex-col p-4 bg-white overflow-hidden">

        {/* Recibo del último cobro */}
        {lastSale && !showReceipt && (
          <button
            onClick={() => setShowReceipt(true)}
            className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors cursor-pointer"
          >
            <Receipt size={14} />
            Venta #{lastSale.id.slice(0,8).toUpperCase()} — ${formatCOP(lastSale.total)}
            <span className="ml-auto underline">Ver recibo</span>
          </button>
        )}

        {/* ── Cabecera carrito + botones hold ── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
            Carrito ({items.length} {items.length === 1 ? 'producto' : 'productos'})
          </h2>
          <div className="flex items-center gap-1.5 relative">
            {/* Retomar carrito en espera */}
            {heldCarts.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowHeld((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <PlayCircle size={12} />
                  Retomar ({heldCarts.length})
                </button>
                {showHeld && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-full mt-1 right-0 bg-white shadow-xl rounded-xl border border-slate-200 z-30 w-60 overflow-hidden"
                  >
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 pt-2.5 pb-1">
                      Carritos en espera
                    </p>
                    {heldCarts.map((c) => {
                      const heldTotal = c.items.reduce((s, i) => {
                        const d = (c.itemDiscounts?.[i.product_id] || 0) / 100
                        return s + i.price * (1 - d) * i.quantity
                      }, 0)
                      return (
                        <div key={c.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-50 border-t border-slate-100 first:border-0">
                          <button
                            onClick={() => recallCart(c.id)}
                            className="flex-1 text-left"
                          >
                            <div className="text-xs font-semibold text-slate-700">
                              {c.items.length} ítem{c.items.length !== 1 ? 's' : ''} · ${formatCOP(heldTotal)}
                              {c.discountPct > 0 && (
                                <span className="ml-1 text-green-600">-{c.discountPct}%</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {formatTime(c.heldAt)}
                            </div>
                          </button>
                          <button
                            onClick={() => deleteHeld(c.id)}
                            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Suspender carrito */}
            <button
              onClick={holdCart}
              disabled={items.length === 0}
              title="Guardar carrito en espera (suspender)"
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <PauseCircle size={12} /> Suspender
            </button>
          </div>
        </div>

        <Cart items={items} onUpdateQuantity={updateQuantity} onRemove={removeItem} />

        {/* ── Descuento ── */}
        <div className="flex items-center gap-2 mt-3 border-t border-slate-100 pt-3">
          <Percent size={14} className="text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 font-semibold w-20 shrink-0">Descuento</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={discountPct === 0 ? '' : discountPct}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0"
            className="w-16 px-2 py-1 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 text-center"
          />
          <span className="text-xs text-slate-400">%</span>
          {hasDiscount && (
            <span className="ml-auto text-xs text-green-600 font-semibold">
              -${formatCOP(discountAmt)}
            </span>
          )}
        </div>

        {/* ── Nota ── */}
        <div className="flex items-center gap-2 mt-2">
          <StickyNote size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Nota de venta (opcional)"
            value={saleNote}
            onChange={(e) => setSaleNote(e.target.value)}
            maxLength={120}
            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-400 text-slate-700 placeholder:text-slate-400"
          />
        </div>

        {/* ── Cliente ── */}
        <CustomerPicker value={customer} onChange={setCustomer} />

        {/* ── Totales ── */}
        <div className="border-t border-slate-200 pt-3 mt-3 mb-3">
          {hasDiscount && (
            <div className="flex justify-between text-sm text-slate-400 mb-1">
              <span>Subtotal</span>
              <span>${formatCOP(subtotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-500 text-sm uppercase tracking-wide">Total</span>
            <span className="font-extrabold text-2xl text-slate-900">
              ${formatCOP(total)}
            </span>
          </div>
        </div>

        {/* Error inline */}
        {mutation.isError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-3 text-red-600 font-semibold text-sm">
            <AlertCircle size={16} className="shrink-0" />
            {mutation.error?.message || 'Error al procesar la venta'}
          </div>
        )}

        <CheckoutButton
          total={total}
          disabled={items.length === 0}
          loading={false}
          onClick={() => items.length > 0 && setShowPayment(true)}
        />

        {/* Atajos de teclado */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100 text-xs text-slate-400 flex-wrap">
          <span><kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600">F2</kbd> Buscar</span>
          <span><kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600">F3</kbd> Suspender</span>
          <span><kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600">F9</kbd> Cobrar</span>
          <span><kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600">Esc</kbd> Cancelar</span>
        </div>
      </div>

      {/* Modal de pago */}
      {showPayment && (
        <PaymentModal
          total={total}
          subtotal={subtotal}
          discountPct={discountPct}
          onConfirm={({ method, cashTendered, splitPayments }) =>
            mutation.mutate({ method, cashTendered, splitPayments })
          }
          onClose={() => setShowPayment(false)}
          loading={mutation.isPending}
        />
      )}

      {/* Recibo */}
      {showReceipt && lastSale && (
        <SaleReceipt
          sale={lastSale}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  )
}
