import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPurchaseOrders, createPurchaseOrder,
  receivePurchaseOrder, cancelPurchaseOrder,
  getSuppliers, getProducts,
} from '@/services/api.js'
import { useToast } from '@/components/Toast.jsx'
import {
  PackageCheck, Plus, X, Trash2, ChevronRight,
  CheckCheck, Ban, Package, Truck, Hash, Calendar,
  FileText, ShoppingBasket,
} from 'lucide-react'

// ── Status config ─────────────────────────────────────────────
const STATUS = {
  draft:     { label: 'Borrador',  color: 'bg-slate-100 text-slate-600' },
  sent:      { label: 'Enviada',   color: 'bg-blue-100  text-blue-700'  },
  partial:   { label: 'Parcial',   color: 'bg-yellow-100 text-yellow-700' },
  received:  { label: 'Recibida',  color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100   text-red-600'   },
}

function StatusBadge({ status }) {
  const cfg = STATUS[status] ?? STATUS.draft
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Main Page ─────────────────────────────────────────────────
export default function PurchaseOrders() {
  const qc    = useQueryClient()
  const toast = useToast()
  const [selected,   setSelected]   = useState(null)
  const [showModal,  setShowModal]  = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn:  getPurchaseOrders,
  })

  const receiveMut = useMutation({
    mutationFn: (id) => receivePurchaseOrder(id),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setSelected(updated)
      toast('Mercancía recibida y stock actualizado', 'success')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: (id) => cancelPurchaseOrder(id),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      setSelected(updated)
      toast('Orden cancelada', 'warning')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return orders
    return orders.filter((o) => o.status === statusFilter)
  }, [orders, statusFilter])

  // Keep selected in sync with query cache
  const selectedOrder = selected
    ? (orders.find((o) => o.id === selected.id) ?? selected)
    : null

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">

      {/* ── Left panel: list ── */}
      <div className="flex flex-col w-72 shrink-0 bg-white border-r border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <PackageCheck size={16} className="text-blue-600" />
            <span className="font-bold text-slate-800 text-sm">Órdenes de Compra</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={13} /> Nueva
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 px-3 py-2 border-b border-slate-100 overflow-x-auto shrink-0">
          {['all', 'draft', 'sent', 'partial', 'received', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {s === 'all' ? `Todas (${orders.length})` : STATUS[s].label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="text-slate-400 text-xs text-center py-8">Cargando...</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <PackageCheck size={32} className="opacity-20" />
              <p className="text-xs">Sin órdenes</p>
            </div>
          )}
          {filtered.map((po) => (
            <button
              key={po.id}
              onClick={() => setSelected(po)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${
                selectedOrder?.id === po.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-slate-400">
                  #{po.id.slice(0, 8).toUpperCase()}
                </span>
                <StatusBadge status={po.status} />
              </div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Truck size={11} className="text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 truncate">{po.supplier_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{fmtDate(po.created_at)}</span>
                <span className="text-xs font-bold text-slate-600">{fmtCOP(po.total)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel: detail ── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedOrder ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3">
            <PackageCheck size={48} className="opacity-30" />
            <p className="text-sm">Selecciona una orden para ver el detalle</p>
          </div>
        ) : (
          <PODetail
            po={selectedOrder}
            onReceive={() => receiveMut.mutate(selectedOrder.id)}
            onCancel={() => cancelMut.mutate(selectedOrder.id)}
            receiving={receiveMut.isPending}
            cancelling={cancelMut.isPending}
          />
        )}
      </div>

      {/* ── Create Modal ── */}
      {showModal && (
        <CreatePOModal
          onClose={() => setShowModal(false)}
          onCreated={(po) => {
            qc.invalidateQueries({ queryKey: ['purchase-orders'] })
            setSelected(po)
            setShowModal(false)
            toast('Orden de compra creada', 'success')
          }}
        />
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────
function PODetail({ po, onReceive, onCancel, receiving, cancelling }) {
  const canReceive = ['draft', 'sent', 'partial'].includes(po.status)
  const canCancel  = ['draft', 'sent'].includes(po.status)

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-slate-400">
              #{po.id.slice(0, 8).toUpperCase()}
            </span>
            <StatusBadge status={po.status} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">{po.supplier_name}</h2>
          {po.notes && (
            <p className="mt-1 text-sm text-slate-500 flex items-center gap-1.5">
              <FileText size={13} /> {po.notes}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canReceive && (
            <button
              onClick={onReceive}
              disabled={receiving}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <CheckCheck size={14} />
              {receiving ? 'Recibiendo...' : 'Recibir todo'}
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <Ban size={13} />
              {cancelling ? '...' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <MetaCard icon={<Calendar size={14} />} label="Fecha creación" value={fmtDate(po.created_at)} />
        <MetaCard icon={<CheckCheck size={14} />} label="Recibida" value={fmtDate(po.received_at)} />
        <MetaCard icon={<ShoppingBasket size={14} />} label="Total" value={fmtCOP(po.total)} highlight />
      </div>

      {/* Items table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Package size={14} className="text-slate-400" />
          <span className="font-semibold text-sm text-slate-700">
            Productos ({po.items.length})
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Producto</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Cant.</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Costo unit.</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 1 ? 'bg-slate-50/50' : ''}>
                <td className="px-4 py-2.5 font-medium text-slate-700">{item.product_name}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{item.quantity_ordered}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmtCOP(item.unit_cost)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmtCOP(item.total_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-slate-700">Total</td>
              <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{fmtCOP(po.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function MetaCard({ icon, label, value, highlight }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className={`flex items-center gap-1.5 text-xs mb-1 ${highlight ? 'text-blue-600' : 'text-slate-400'}`}>
        {icon}
        <span className="font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`font-bold text-sm ${highlight ? 'text-blue-700' : 'text-slate-700'}`}>{value}</p>
    </div>
  )
}

// ── Create PO Modal ───────────────────────────────────────────
const EMPTY_ITEM = () => ({ product_id: '', quantity_ordered: '', unit_cost: '' })

function CreatePOModal({ onClose, onCreated }) {
  const toast = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [notes,      setNotes]      = useState('')
  const [items,      setItems]      = useState([EMPTY_ITEM()])

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn:  getSuppliers,
    staleTime: 60_000,
  })
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn:  () => import('@/services/api.js').then(m => m.getAllProducts()),
    staleTime: 60_000,
  })

  const createMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: onCreated,
    onError: (e) => toast(e.message, 'error'),
  })

  function setItem(i, key, val) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  }

  function addItem()    { setItems((prev) => [...prev, EMPTY_ITEM()]) }
  function removeItem(i){ setItems((prev) => prev.filter((_, idx) => idx !== i)) }

  // Auto-fill cost_price when product is selected
  function handleProductChange(i, productId) {
    const product = allProducts.find((p) => p.id === productId)
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it
      return {
        ...it,
        product_id: productId,
        unit_cost: product?.cost_price ? String(product.cost_price) : it.unit_cost,
      }
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!supplierId) return toast('Selecciona un proveedor', 'error')
    const validItems = items.filter((it) => it.product_id && it.quantity_ordered && it.unit_cost)
    if (validItems.length === 0) return toast('Agrega al menos un producto', 'error')
    createMut.mutate({
      supplier_id: supplierId,
      notes: notes.trim() || null,
      items: validItems.map((it) => ({
        product_id:       it.product_id,
        quantity_ordered: parseFloat(it.quantity_ordered),
        unit_cost:        parseFloat(it.unit_cost),
      })),
    })
  }

  const total = items.reduce((sum, it) => {
    const qty  = parseFloat(it.quantity_ordered) || 0
    const cost = parseFloat(it.unit_cost)        || 0
    return sum + qty * cost
  }, 0)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <PackageCheck size={16} className="text-blue-600" />
            Nueva Orden de Compra
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

            {/* Supplier + notes row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Proveedor *
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                >
                  <option value="">— Seleccionar —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Notas / Referencia
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Factura, pedido, etc."
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Productos
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  <Plus size={12} /> Agregar fila
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_90px_28px] bg-slate-50 border-b border-slate-200 px-3 py-2 gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Producto</span>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase text-center">Cant.</span>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase text-center">Costo $</span>
                  <span />
                </div>

                {items.map((item, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_80px_90px_28px] px-3 py-2 gap-2 border-b border-slate-100 last:border-0 items-center"
                  >
                    <select
                      value={item.product_id}
                      onChange={(e) => handleProductChange(i, e.target.value)}
                      className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="">— Producto —</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity_ordered}
                      onChange={(e) => setItem(i, 'quantity_ordered', e.target.value)}
                      placeholder="0"
                      className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-center"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.unit_cost}
                      onChange={(e) => setItem(i, 'unit_cost', e.target.value)}
                      placeholder="0"
                      className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            {total > 0 && (
              <div className="flex justify-end">
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <span className="text-sm text-blue-600 font-semibold">Total estimado:</span>
                  <span className="text-lg font-bold text-blue-700">{fmtCOP(total)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer"
            >
              {createMut.isPending ? 'Creando...' : 'Crear orden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
