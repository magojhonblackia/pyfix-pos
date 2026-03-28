import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers, createCustomer, updateCustomer,
  deleteCustomer, getCustomerPurchases,
} from '@/services/api.js'
import { useToast } from '@/components/Toast.jsx'
import {
  Users, Plus, Pencil, Trash2, X,
  Phone, Mail, Hash, CreditCard,
  ShoppingBag, TrendingUp, Calendar,
  Search, UserCircle,
} from 'lucide-react'

const DOC_TYPES = ['CC', 'NIT', 'CE', 'PPN', 'NUIP']

const EMPTY = {
  name: '', document_type: 'CC', document_number: '',
  phone: '', email: '', address: '',
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
const METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata' }

// ── Main Page ─────────────────────────────────────────────────
export default function Customers() {
  const qc    = useQueryClient()
  const toast = useToast()
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [deleting,  setDeleting]  = useState(null)
  const searchRef = useRef(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn:  () => getCustomers(search),
    staleTime: 30_000,
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteCustomer(deleting.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      if (selected?.id === deleting.id) setSelected(null)
      setDeleting(null)
      toast('Cliente eliminado', 'warning')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  function openCreate() { setEditing(null); setShowModal(true) }
  function openEdit(c)  { setEditing(c);    setShowModal(true) }

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">

      {/* ── Left: list ── */}
      <div className="flex flex-col w-72 shrink-0 bg-white border-r border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <span className="font-bold text-slate-800 text-sm">Clientes</span>
            <span className="text-xs text-slate-400">({customers.length})</span>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={13} /> Nuevo
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 rounded-lg">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, documento, teléfono..."
              className="flex-1 bg-transparent text-xs outline-none text-slate-700 placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="text-slate-400 text-xs text-center py-8">Cargando...</p>
          )}
          {!isLoading && customers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Users size={32} className="opacity-20" />
              <p className="text-xs">{search ? 'Sin resultados' : 'Sin clientes'}</p>
              {!search && (
                <button onClick={openCreate} className="text-xs font-semibold text-blue-600 hover:underline">
                  Crear el primero
                </button>
              )}
            </div>
          )}
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${
                selected?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <UserCircle size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 truncate">{c.name}</span>
              </div>
              {(c.document_type && c.document_number) && (
                <span className="text-[11px] text-slate-400 font-mono ml-5">
                  {c.document_type} {c.document_number}
                </span>
              )}
              {c.phone && (
                <div className="flex items-center gap-1 mt-0.5 ml-5">
                  <Phone size={10} className="text-slate-400" />
                  <span className="text-[11px] text-slate-400">{c.phone}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3">
            <Users size={48} className="opacity-30" />
            <p className="text-sm">Selecciona un cliente para ver su ficha</p>
          </div>
        ) : (
          <CustomerDetail
            customer={selected}
            onEdit={() => openEdit(selected)}
            onDelete={() => setDeleting(selected)}
          />
        )}
      </div>

      {/* ── Modal crear/editar ── */}
      {showModal && (
        <CustomerModal
          initial={editing ?? EMPTY}
          isEdit={Boolean(editing)}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSaved={(c) => {
            qc.invalidateQueries({ queryKey: ['customers'] })
            setSelected(c)
            setShowModal(false)
            setEditing(null)
            toast(editing ? 'Cliente actualizado' : 'Cliente creado', 'success')
          }}
        />
      )}

      {/* ── Confirm delete ── */}
      {deleting && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleting(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" /> Eliminar cliente
              </h3>
              <button onClick={() => setDeleting(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              ¿Eliminar a <strong>{deleting.name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="flex-[2] py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-400 cursor-pointer"
              >
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Customer Detail ───────────────────────────────────────────
function CustomerDetail({ customer: c, onEdit, onDelete }) {
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['customer-purchases', c.id],
    queryFn:  () => getCustomerPurchases(c.id),
    staleTime: 60_000,
  })

  const totalSpent     = purchases.filter(p => p.status !== 'voided').reduce((s, p) => s + p.total, 0)
  const completedCount = purchases.filter(p => p.status !== 'voided').length

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <UserCircle size={24} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{c.name}</h2>
            {c.document_type && c.document_number && (
              <span className="text-sm text-slate-400 font-mono">
                {c.document_type} {c.document_number}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Pencil size={13} /> Editar
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className="flex flex-wrap gap-4 mb-5 text-sm text-slate-500">
        {c.phone && (
          <span className="flex items-center gap-1.5"><Phone size={14} className="text-slate-400" />{c.phone}</span>
        )}
        {c.email && (
          <span className="flex items-center gap-1.5"><Mail size={14} className="text-slate-400" />{c.email}</span>
        )}
        {c.address && (
          <span className="flex items-center gap-1.5 text-slate-400 text-xs">{c.address}</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard icon={<ShoppingBag size={15} />} label="Compras" value={completedCount} />
        <StatCard icon={<TrendingUp size={15} />} label="Total gastado" value={fmtCOP(totalSpent)} highlight />
        <StatCard
          icon={<Calendar size={15} />}
          label="Última compra"
          value={purchases.length > 0 ? fmtDate(purchases[0].created_at) : '—'}
        />
      </div>

      {/* Purchases history */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <ShoppingBag size={14} className="text-slate-400" />
          <span className="font-semibold text-sm text-slate-700">Historial de compras</span>
        </div>
        {isLoading && <p className="text-xs text-slate-400 p-4">Cargando...</p>}
        {!isLoading && purchases.length === 0 && (
          <p className="text-xs text-slate-400 p-4 text-center">Sin compras registradas</p>
        )}
        {purchases.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 ${
              p.status === 'voided' ? 'opacity-50' : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">#{p.id.slice(0, 8).toUpperCase()}</span>
                {p.status === 'voided' && (
                  <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Anulada</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-slate-500">{fmtDate(p.created_at)}</span>
                <span className="text-xs text-slate-400">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</span>
                <span className="text-xs text-slate-400">{p.items_count} ítem{p.items_count !== 1 ? 's' : ''}</span>
              </div>
              {p.notes && (
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{p.notes}</p>
              )}
            </div>
            <span className="font-bold text-sm text-slate-700 shrink-0">{fmtCOP(p.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, highlight }) {
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

// ── Modal Form ────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function CustomerModal({ initial, isEdit, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ ...initial })
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    try {
      const payload = {
        name:            form.name.trim(),
        document_type:   form.document_type  || null,
        document_number: form.document_number.trim() || null,
        phone:           form.phone.trim()   || null,
        email:           form.email.trim()   || null,
        address:         form.address.trim() || null,
      }
      const result = isEdit
        ? await updateCustomer(initial.id, payload)
        : await createCustomer(payload)
      onSaved(result)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          <Field label="Nombre *">
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Nombre completo"
              autoFocus
              required
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </Field>

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field label="Tipo doc.">
              <select
                value={form.document_type}
                onChange={set('document_type')}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
              >
                <option value="">—</option>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Número documento">
              <input
                type="text"
                value={form.document_number}
                onChange={set('document_number')}
                placeholder="123456789"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <input
                type="text"
                value={form.phone}
                onChange={set('phone')}
                placeholder="300 000 0000"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Correo electrónico">
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="correo@ejemplo.com"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          <Field label="Dirección">
            <input
              type="text"
              value={form.address}
              onChange={set('address')}
              placeholder="Calle, barrio, ciudad..."
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !form.name.trim()}
              className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
