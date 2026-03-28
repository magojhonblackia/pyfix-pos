import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
  items:         [],
  discountPct:   0,      // % de descuento global (0–100)
  itemDiscounts: {},     // { product_id: pct } — descuento por ítem (0–99)

  // ── items ──────────────────────────────────────────────────
  addItem: (product, qty = 1) => {
    const addQty = Math.max(0.001, qty)
    set((state) => {
      const existing = state.items.find((i) => i.product_id === product.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product_id === product.id
              ? { ...i, quantity: Math.round((i.quantity + addQty) * 1000) / 1000 }
              : i
          ),
        }
      }
      return {
        items: [
          ...state.items,
          {
            product_id: product.id,
            name:       product.name,
            price:      product.price,
            quantity:   addQty,
          },
        ],
      }
    })
  },

  updateQuantity: (product_id, quantity) => {
    if (quantity <= 0) {
      set((state) => ({
        items:         state.items.filter((i) => i.product_id !== product_id),
        itemDiscounts: Object.fromEntries(
          Object.entries(state.itemDiscounts).filter(([k]) => k !== product_id)
        ),
      }))
      return
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.product_id === product_id ? { ...i, quantity } : i
      ),
    }))
  },

  removeItem: (product_id) => {
    set((state) => ({
      items:         state.items.filter((i) => i.product_id !== product_id),
      itemDiscounts: Object.fromEntries(
        Object.entries(state.itemDiscounts).filter(([k]) => k !== product_id)
      ),
    }))
  },

  clearCart: () => set({ items: [], discountPct: 0, itemDiscounts: {} }),

  // Restaurar carrito desde carrito en espera
  restoreCart: ({ items, discountPct, itemDiscounts }) =>
    set({ items, discountPct: discountPct ?? 0, itemDiscounts: itemDiscounts ?? {} }),

  // ── descuento global ───────────────────────────────────────
  setDiscount: (pct) => set({ discountPct: Math.min(100, Math.max(0, Number(pct) || 0)) }),

  // ── descuento por ítem ─────────────────────────────────────
  setItemDiscount: (productId, pct) =>
    set((state) => {
      const clamped = Math.min(99, Math.max(0, Number(pct) || 0))
      if (clamped === 0) {
        // remove key if zero (keep state clean)
        const { [productId]: _, ...rest } = state.itemDiscounts
        return { itemDiscounts: rest }
      }
      return { itemDiscounts: { ...state.itemDiscounts, [productId]: clamped } }
    }),

  // ── totales ────────────────────────────────────────────────
  // getSubtotal → suma ya con descuentos por ítem, antes del descuento global
  getSubtotal: () => {
    const { items, itemDiscounts } = get()
    return items.reduce((sum, i) => {
      const d = (itemDiscounts[i.product_id] || 0) / 100
      return sum + i.price * (1 - d) * i.quantity
    }, 0)
  },

  getDiscountAmount: () => {
    const sub = get().getSubtotal()
    return sub * get().discountPct / 100
  },

  getTotal: () => {
    const sub  = get().getSubtotal()
    const disc = sub * get().discountPct / 100
    return sub - disc
  },
}))
