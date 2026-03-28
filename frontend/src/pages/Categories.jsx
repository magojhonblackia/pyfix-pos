import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/services/api.js'
import { useToast } from '@/components/Toast.jsx'
import { Tag, Plus, Pencil, Trash2, Check, X } from 'lucide-react'

export default function Categories() {
  const qc    = useQueryClient()
  const toast = useToast()

  const [newName,    setNewName]    = useState('')
  const [editingId,  setEditingId]  = useState(null)
  const [editName,   setEditName]   = useState('')
  const [deletingId, setDeletingId] = useState(null)   // confirmación de borrado
  const newRef  = useRef(null)
  const editRef = useRef(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn:  getCategories,
  })

  const createMut = useMutation({
    mutationFn: () => createCategory(newName.trim()),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast(`Categoría "${cat.name}" creada`, 'success')
      setNewName('')
      newRef.current?.focus()
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, name }) => updateCategory(id, name),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      toast(`Renombrada a "${cat.name}"`, 'success')
      setEditingId(null)
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteCategory(id),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      toast(`"${cat.name}" eliminada`, 'warning')
      setDeletingId(null)
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const startEdit = (cat) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setDeletingId(null)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  const saveEdit = () => {
    if (!editName.trim()) return
    updateMut.mutate({ id: editingId, name: editName.trim() })
  }

  const cancelEdit = () => setEditingId(null)

  return (
    <div className="h-full overflow-y-auto p-5 max-w-2xl">

      {/* Encabezado */}
      <div className="mb-5">
        <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
          <Tag size={20} className="text-violet-500" />
          Categorías
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {categories.length} categorías · organiza tus productos
        </p>
      </div>

      {/* Formulario crear */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex gap-2">
        <input
          ref={newRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMut.mutate() }}
          placeholder="Nombre de la nueva categoría..."
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-violet-500"
        />
        <button
          onClick={() => createMut.mutate()}
          disabled={!newName.trim() || createMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Plus size={15} />
          {createMut.isPending ? 'Creando...' : 'Crear'}
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading && (
          <p className="p-4 text-sm text-slate-400">Cargando...</p>
        )}

        {!isLoading && categories.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            Sin categorías. Crea la primera con el formulario de arriba.
          </p>
        )}

        {categories.map((cat, i) => (
          <div
            key={cat.id}
            className={`flex items-center gap-3 px-4 py-3 ${
              i > 0 ? 'border-t border-slate-100' : ''
            } ${deletingId === cat.id ? 'bg-red-50' : ''}`}
          >
            {editingId === cat.id ? (
              /* ── Modo edición ── */
              <>
                <Tag size={14} className="text-violet-400 shrink-0" />
                <input
                  ref={editRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  saveEdit()
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="flex-1 px-2 py-1 text-sm border-2 border-violet-500 rounded-lg outline-none"
                />
                <button
                  onClick={saveEdit}
                  disabled={updateMut.isPending || !editName.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 cursor-pointer"
                >
                  <Check size={12} /> Guardar
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </>
            ) : deletingId === cat.id ? (
              /* ── Confirmación de borrado ── */
              <>
                <Tag size={14} className="text-red-400 shrink-0" />
                <span className="flex-1 text-sm text-red-700 font-semibold">
                  ¿Eliminar "{cat.name}"?
                  {cat.product_count > 0 && (
                    <span className="ml-1 font-normal text-red-500">
                      ({cat.product_count} producto{cat.product_count !== 1 ? 's' : ''} quedarán sin categoría)
                    </span>
                  )}
                </span>
                <button
                  onClick={() => deleteMut.mutate(cat.id)}
                  disabled={deleteMut.isPending}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 size={12} /> {deleteMut.isPending ? 'Eliminando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              /* ── Vista normal ── */
              <>
                <Tag size={14} className="text-violet-400 shrink-0" />
                <span className="flex-1 text-sm font-medium text-slate-800">{cat.name}</span>

                {cat.product_count > 0 && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                    {cat.product_count} producto{cat.product_count !== 1 ? 's' : ''}
                  </span>
                )}

                <button
                  onClick={() => startEdit(cat)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-violet-600 hover:border-violet-200 transition-colors cursor-pointer"
                >
                  <Pencil size={11} /> Renombrar
                </button>

                <button
                  onClick={() => setDeletingId(cat.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-400 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                >
                  <Trash2 size={11} /> Eliminar
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Al eliminar una categoría, los productos asignados quedan sin categoría y pueden reasignarse después.
        </p>
      )}
    </div>
  )
}
