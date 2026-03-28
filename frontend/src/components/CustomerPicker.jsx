import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCustomers } from '@/services/api.js'
import { UserCircle, X, Search, Plus } from 'lucide-react'

/**
 * Selector inline de cliente para el POS.
 * value: { id, name } | null
 * onChange: (customer | null) => void
 */
export default function CustomerPicker({ value, onChange }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const wrapRef  = useRef(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', query],
    queryFn:  () => getCustomers(query),
    staleTime: 30_000,
    enabled: open,
  })

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  function select(c) {
    onChange(c)
    setOpen(false)
    setQuery('')
  }

  function clear(e) {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <div className="flex items-center gap-2 mt-2 relative" ref={wrapRef}>
      <UserCircle size={14} className="text-slate-400 shrink-0" />

      {value ? (
        /* ── Cliente seleccionado ── */
        <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-xs font-semibold text-blue-700 flex-1 truncate">{value.name}</span>
          <button
            onClick={clear}
            className="text-blue-400 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
            title="Quitar cliente"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        /* ── Trigger ── */
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-400 hover:border-blue-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          Cliente (opcional)
        </button>
      )}

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute left-5 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o documento..."
              className="flex-1 text-xs outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Results */}
          <div className="max-h-48 overflow-y-auto">
            {customers.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                {query ? 'Sin resultados' : 'Sin clientes registrados'}
              </p>
            )}
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => select(c)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0"
              >
                <div className="text-xs font-semibold text-slate-700">{c.name}</div>
                {c.document_type && c.document_number && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    {c.document_type} {c.document_number}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
