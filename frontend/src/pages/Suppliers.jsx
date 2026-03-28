import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '@/services/api.js'
import { useToast } from '@/components/Toast.jsx'
import { Plus, Truck, Pencil, Trash2, X, Phone, Mail, Hash } from 'lucide-react'

// ── Valores iniciales del formulario ─────────────────────────
const EMPTY = { name: '', nit: '', contact_name: '', phone: '', email: '', address: '' }

export default function Suppliers() {
  const qc    = useQueryClient()
  const toast = useToast()
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)   // null = crear, obj = editar
  const [deleting,  setDeleting]  = useState(null)

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn:  getSuppliers,
  })

  const saveMut = useMutation({
    mutationFn: (data) =>
      editing ? updateSupplier(editing.id, data) : createSupplier(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setShowModal(false)
      setEditing(null)
      toast(editing ? 'Proveedor actualizado' : 'Proveedor creado', 'success')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteSupplier(deleting.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setDeleting(null)
      toast('Proveedor eliminado', 'warning')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  function openCreate() { setEditing(null); setShowModal(true) }
  function openEdit(s)  { setEditing(s);    setShowModal(true) }

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <Truck size={18} className="text-blue-600" />
          <h2 className="font-bold text-slate-800">Proveedores</h2>
          <span className="text-xs text-slate-400 font-medium">
            ({suppliers.length})
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
        >
          <Plus size={14} /> Nuevo proveedor
        </button>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <p className="text-slate-400 text-sm">Cargando...</p>}

        {!isLoading && suppliers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Truck size={40} className="opacity-25" />
            <p className="text-sm">No hay proveedores registrados todavía</p>
            <button
              onClick={openCreate}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Crear el primero
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 max-w-3xl">
          {suppliers.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              onEdit={() => openEdit(s)}
              onDelete={() => setDeleting(s)}
            />
          ))}
        </div>
      </div>

      {/* ── Modal crear / editar ── */}
      {showModal && (
        <SupplierModal
          initial={editing ?? EMPTY}
          isEdit={Boolean(editing)}
          loading={saveMut.isPending}
          onSave={(data) => saveMut.mutate(data)}
          onClose={() => { setShowModal(false); setEditing(null) }}
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
                <Trash2 size={16} className="text-red-500" /> Eliminar proveedor
              </h3>
              <button onClick={() => setDeleting(null)} className="text-slate-400 hover:text-slate-600">
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

// ── Tarjeta de proveedor ──────────────────────────────────────
function SupplierCard({ supplier: s, onEdit, onDelete }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4">
      {/* Icono */}
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
        <Truck size={16} className="text-blue-600" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-sm">{s.name}</span>
          {s.nit && (
            <span className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
              <Hash size={10} />{s.nit}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
          {s.contact_name && (
            <span className="text-xs text-slate-500">{s.contact_name}</span>
          )}
          {s.phone && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Phone size={10} /> {s.phone}
            </span>
          )}
          {s.email && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Mail size={10} /> {s.email}
            </span>
          )}
          {s.address && (
            <span className="text-xs text-slate-400 truncate max-w-xs">{s.address}</span>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Modal de formulario ───────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function SupplierModal({ initial, isEdit, loading, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    // Solo enviar campos que tengan valor (o null explícito para limpiar)
    onSave({
      name:         form.name.trim(),
      nit:          form.nit.trim()          || null,
      contact_name: form.contact_name.trim() || null,
      phone:        form.phone.trim()        || null,
      email:        form.email.trim()        || null,
      address:      form.address.trim()      || null,
    })
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
            <Truck size={16} className="text-blue-600" />
            {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          <Field label="Nombre *">
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Ej: Distribuidora López"
              autoFocus
              required
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="NIT / Cédula">
              <input
                type="text"
                value={form.nit}
                onChange={set('nit')}
                placeholder="900123456-7"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="text"
                value={form.phone}
                onChange={set('phone')}
                placeholder="300 000 0000"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          <Field label="Persona de contacto">
            <input
              type="text"
              value={form.contact_name}
              onChange={set('contact_name')}
              placeholder="Nombre del vendedor o representante"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </Field>

          <Field label="Correo electrónico">
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="contacto@proveedor.com"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </Field>

          <Field label="Dirección">
            <input
              type="text"
              value={form.address}
              onChange={set('address')}
              placeholder="Calle, ciudad..."
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </Field>

          {/* Acciones */}
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
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
