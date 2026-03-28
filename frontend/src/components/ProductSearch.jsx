import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProducts, getCategories } from '@/services/api.js'
import { formatCOP } from '@/lib/utils.js'
import { Search, ScanBarcode, Star } from 'lucide-react'

// ── Favoritos (localStorage) ──────────────────────────────────
const FAV_KEY = 'pyfix_fav_products'

function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { return [] }
}
function saveFavs(ids) {
  localStorage.setItem(FAV_KEY, JSON.stringify(ids))
}

// ── Componente ────────────────────────────────────────────────
const ProductSearch = forwardRef(function ProductSearch({ onSelect }, ref) {
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (scanMode) scannerRef.current?.focus()
      else          inputRef.current?.focus()
    },
  }))

  const [query, setQuery]         = useState('')
  const [debouncedQuery, setDQ]   = useState('')
  const [scanCode, setScanCode]   = useState('')
  const [scanMode, setScanMode]   = useState(false)
  const [activeCat, setActiveCat] = useState('')   // '' = todas
  const [favIds, setFavIds]       = useState(loadFavs)
  const inputRef   = useRef(null)
  const scannerRef = useRef(null)

  // Foco automático al montar
  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounce búsqueda manual
  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 200)
    return () => clearTimeout(t)
  }, [query])

  // Cambiar modo → enfocar el input correcto
  useEffect(() => {
    if (scanMode) scannerRef.current?.focus()
    else          inputRef.current?.focus()
  }, [scanMode])

  const { data: allProducts = [], isFetching } = useQuery({
    queryKey: ['products', debouncedQuery],
    queryFn:  () => getProducts(debouncedQuery),
    enabled: true,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  getCategories,
    staleTime: 300_000,
  })

  // Filtro local por categoría
  const products = useMemo(() => {
    if (!activeCat) return allProducts
    return allProducts.filter((p) => p.category_id === activeCat)
  }, [allProducts, activeCat])

  // Productos favoritos (en orden guardado, actualizados con datos frescos)
  const favProducts = useMemo(
    () => favIds.map((id) => allProducts.find((p) => p.id === id)).filter(Boolean),
    [favIds, allProducts],
  )

  // Toggle favorito
  const toggleFav = (productId, e) => {
    e?.stopPropagation()
    setFavIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId].slice(-12)   // máx 12 favoritos
      saveFavs(next)
      return next
    })
  }

  // Scanner
  const handleScanEnter = (e) => {
    if (e.key !== 'Enter') return
    const code = scanCode.trim()
    if (!code) return
    const found = allProducts.find(
      (p) => p.barcode === code || p.name.toLowerCase() === code.toLowerCase()
    )
    if (found) {
      onSelect(found)
      setScanCode('')
    } else {
      setQuery(code)
      setScanMode(false)
      setScanCode('')
    }
  }

  return (
    <div className="flex flex-col h-full gap-2 min-h-0">

      {/* Barra de búsqueda + toggle scanner */}
      <div className="flex gap-2 shrink-0">
        {!scanMode ? (
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o barcode…"
              className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-blue-500 rounded-lg outline-none focus:border-blue-600 bg-white"
            />
          </div>
        ) : (
          <div className="relative flex-1">
            <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500" />
            <input
              ref={scannerRef}
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={handleScanEnter}
              placeholder="Escanea o escribe código → Enter"
              className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-violet-500 rounded-lg outline-none focus:border-violet-600 bg-white font-mono"
            />
          </div>
        )}

        <button
          onClick={() => setScanMode((v) => !v)}
          title={scanMode ? 'Buscar por texto' : 'Modo scanner'}
          className={`px-3 rounded-lg border-2 transition-colors ${
            scanMode
              ? 'border-violet-500 bg-violet-50 text-violet-600'
              : 'border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-500'
          }`}
        >
          <ScanBarcode size={18} />
        </button>
      </div>

      {/* Pills de categoría */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 flex-wrap shrink-0">
          <button
            onClick={() => setActiveCat('')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              activeCat === ''
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'
            }`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(activeCat === c.id ? '' : c.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                activeCat === c.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Acceso rápido (favoritos) ── */}
      {!scanMode && favProducts.length > 0 && (
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">
            <Star size={11} fill="currentColor" /> Acceso rápido
            <span className="text-slate-300 font-normal ml-1">· clic ⭐ para editar</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {favProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="relative flex flex-col items-start px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-left hover:bg-amber-100 transition-colors cursor-pointer group"
              >
                {/* Quitar favorito */}
                <span
                  onClick={(e) => toggleFav(p.id, e)}
                  title="Quitar de acceso rápido"
                  className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 hover:bg-amber-300 text-amber-600 cursor-pointer"
                >
                  <Star size={10} fill="currentColor" />
                </span>
                <span className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2 pr-5">
                  {p.name}
                </span>
                <span className="text-xs font-bold text-blue-700 mt-1">
                  ${formatCOP(p.price)}
                </span>
                <span className={`text-[10px] mt-0.5 font-medium ${
                  p.stock > 5 ? 'text-green-600' : p.stock > 0 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {p.stock > 0 ? `${p.stock} uds` : 'AGOTADO'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista de productos */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 min-h-0">
        {isFetching && <p className="text-slate-400 text-sm">Buscando...</p>}

        {!isFetching && products.length === 0 && (
          <p className="text-slate-400 text-sm">
            {query || activeCat ? 'Sin resultados' : 'No hay productos disponibles'}
          </p>
        )}

        {!isFetching && products.map((p) => {
          const isFav = favIds.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="flex justify-between items-center px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-left hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer group"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.barcode && (
                    <span className="text-xs text-slate-400 font-mono">{p.barcode}</span>
                  )}
                  {p.category_name && (
                    <span className="text-xs text-violet-600 font-semibold">{p.category_name}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="font-bold text-sm text-blue-700">
                  ${formatCOP(p.price)}
                </div>
                <div className={`text-xs font-medium ${
                  p.stock > 5 ? 'text-green-600' : p.stock > 0 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  Stock: {p.stock}
                </div>
              </div>

              {/* Botón favorito */}
              <button
                onClick={(e) => toggleFav(p.id, e)}
                title={isFav ? 'Quitar de acceso rápido' : 'Agregar a acceso rápido'}
                className={`ml-2 p-1.5 rounded-lg transition-colors shrink-0 ${
                  isFav
                    ? 'text-amber-400 hover:text-amber-600 bg-amber-50'
                    : 'text-slate-200 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                }`}
              >
                <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
              </button>
            </button>
          )
        })}
      </div>
    </div>
  )
})

export default ProductSearch
