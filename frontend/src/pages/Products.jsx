import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ProductForm from '@/components/ProductForm.jsx'
import ProductImportModal from '@/components/ProductImportModal.jsx'
import BulkPriceModal from '@/components/BulkPriceModal.jsx'
import { getProducts, getCategories, createProduct, updateProduct, toggleProductActive } from '@/services/api.js'
import { formatCOP } from '@/lib/utils.js'
import { useToast } from '@/components/Toast.jsx'
import { Pencil, PlusCircle, Search, Power, Download, Upload, Percent } from 'lucide-react'

function exportProductsCSV(products) {
  const rows = [
    ['Nombre', 'Barcode', 'Categoría', 'Precio', 'Costo', 'Margen %', 'Stock', 'Stock mín.', 'Estado'],
    ...products.map((p) => {
      const margin = p.price > 0 ? ((p.price - p.cost_price) / p.price * 100).toFixed(1) : '0.0'
      return [
        p.name,
        p.barcode ?? '',
        p.category_name ?? '',
        p.price,
        p.cost_price,
        margin,
        p.stock,
        p.min_stock,
        p.is_active ? 'Activo' : 'Inactivo',
      ]
    }),
  ]
  const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `productos_${new Date().toLocaleDateString('en-CA')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
import { useState, useMemo } from 'react'

export default function Products() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [selectedProduct, setSelected]   = useState(null)
  const [showImport,      setShowImport]  = useState(false)
  const [showBulkPrice,   setShowBulkPrice] = useState(false)
  const [q,            setQ]           = useState('')
  const [filterActive, setFilter]      = useState('all')     // all | active | inactive
  const [filterCat,    setFilterCat]   = useState('')        // '' = todas

  const { data: products   = [], isLoading } = useQuery({
    queryKey: ['products', ''],
    queryFn:  () => getProducts(''),
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  getCategories,
    staleTime: 300_000,   // las categorías cambian poco
  })

  const filtered = useMemo(() => {
    let list = products
    if (filterActive === 'active')   list = list.filter((p) => p.is_active)
    if (filterActive === 'inactive') list = list.filter((p) => !p.is_active)
    if (filterCat)                   list = list.filter((p) => p.category_id === filterCat)
    if (q) {
      const lq = q.toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(lq) || p.barcode?.includes(q)
      )
    }
    return list
  }, [products, q, filterActive, filterCat])

  // ── Mutaciones ─────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast(`Producto "${vars.name}" creado`, 'success')
    },
    onError: (e) => toast(e.message || 'Error al guardar el producto', 'error'),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }) => updateProduct(id, data),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast(`"${data.name}" actualizado`, 'success')
      setSelected(null)
    },
    onError: (e) => toast(e.message || 'Error al actualizar', 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: toggleProductActive,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      toast(
        `"${updated.name}" ${updated.is_active ? 'activado' : 'desactivado'}`,
        updated.is_active ? 'success' : 'warning',
      )
    },
    onError: (e) => toast(e.message || 'Error al cambiar estado', 'error'),
  })

  const handleCreate = (data) => createMutation.mutateAsync(data)
  const handleEdit   = (data) => editMutation.mutateAsync({ id: selectedProduct.id, data })
  const isLoading_   = createMutation.isPending || editMutation.isPending

  return (
    <div className="grid grid-cols-[1fr_360px] h-full">

      {/* ── LEFT — tabla ── */}
      <div className="overflow-y-auto p-5 bg-slate-50 border-r border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800">
            Productos ({filtered.length}{filtered.length !== products.length ? ` de ${products.length}` : ''})
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkPrice(true)}
              disabled={products.length === 0}
              title="Ajuste masivo de precios"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Percent size={13} /> Ajustar precios
            </button>
            <button
              onClick={() => setShowImport(true)}
              title="Importar productos desde CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 bg-white cursor-pointer"
            >
              <Upload size={13} /> Importar CSV
            </button>
            <button
              onClick={() => exportProductsCSV(filtered)}
              disabled={filtered.length === 0}
              title="Exportar a CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white cursor-pointer"
            >
              <Download size={13} /> CSV
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o código de barras…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-white"
          />
        </div>

        {/* Filtros — estado */}
        <div className="flex gap-1.5 mb-2">
          {[['all','Todos'],['active','Activos'],['inactive','Inactivos']].map(([v,l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                filterActive === v
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Filtros — categoría */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setFilterCat('')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                filterCat === ''
                  ? 'bg-violet-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-violet-300'
              }`}
            >
              Todas las categorías
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCat(filterCat === c.id ? '' : c.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  filterCat === c.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-violet-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="text-slate-400 text-sm">Cargando...</p>}

        {!isLoading && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  {['Nombre', 'Categoría', 'Precio', 'Costo', 'Margen', 'Stock', 'Estado', ''].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400 text-sm">
                      {products.length === 0 ? 'No hay productos. Crea el primero →' : 'Sin resultados para esta búsqueda.'}
                    </td>
                  </tr>
                )}
                {filtered.map((p) => {
                  const isSelected = selectedProduct?.id === p.id
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-slate-100 transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-l-2 border-l-blue-500'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 leading-tight">{p.name}</div>
                        {p.barcode && <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.category_name
                          ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-violet-50 text-violet-700">{p.category_name}</span>
                          : <span className="text-slate-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 font-bold text-blue-700">
                        ${formatCOP(p.price)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">
                        ${formatCOP(p.cost_price)}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.price > 0 ? (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            ((p.price - p.cost_price) / p.price) >= 0.3
                              ? 'bg-green-50 text-green-700'
                              : ((p.price - p.cost_price) / p.price) >= 0.1
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-600'
                          }`}>
                            {((p.price - p.cost_price) / p.price * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 font-bold ${p.stock > 5 ? 'text-green-600' : p.stock > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                        {p.stock}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                          p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {p.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelected(isSelected ? null : p)}
                            title={isSelected ? 'Cancelar edición' : 'Editar'}
                            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                              isSelected
                                ? 'bg-blue-100 text-blue-600'
                                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => toggleMutation.mutate(p)}
                            disabled={toggleMutation.isPending}
                            title={p.is_active ? 'Desactivar' : 'Activar'}
                            className={`w-7 h-7 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
                              p.is_active
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                          >
                            <Power size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ajuste masivo de precios ── */}
      {showBulkPrice && (
        <BulkPriceModal
          products={products}
          categories={categories}
          onClose={() => setShowBulkPrice(false)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
            toast('Precios actualizados', 'success')
            setShowBulkPrice(false)
          }}
        />
      )}

      {/* ── Modal importación CSV ── */}
      {showImport && (
        <ProductImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
            setShowImport(false)
            toast('Importación completada', 'success')
          }}
        />
      )}

      {/* ── RIGHT — formulario ── */}
      <div className="overflow-y-auto p-5 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            {selectedProduct
              ? <><Pencil size={16} className="text-blue-500" /> Editar Producto</>
              : <><PlusCircle size={16} className="text-blue-500" /> Nuevo Producto</>
            }
          </h2>
          {selectedProduct && (
            <span className="text-xs text-slate-400 truncate max-w-32" title={selectedProduct.name}>
              {selectedProduct.name}
            </span>
          )}
        </div>

        <ProductForm
          key={selectedProduct?.id ?? 'new'}
          product={selectedProduct}
          categories={categories}
          onSave={selectedProduct ? handleEdit : handleCreate}
          onCancel={() => setSelected(null)}
          loading={isLoading_}
        />
      </div>
    </div>
  )
}
