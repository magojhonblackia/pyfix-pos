import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllProducts, adjustStock, getProductMovements, getSuppliers, getExpiringBatches } from '@/services/api.js'
import { formatCOP } from '@/lib/utils.js'
import { useToast } from '@/components/Toast.jsx'
import { readSettings } from '@/hooks/useSettings.js'
import { Search, Plus, Minus, PackagePlus, AlertTriangle, X, History, SlidersHorizontal, TrendingUp, TrendingDown, Download, DollarSign, Package, BarChart3, CalendarClock } from 'lucide-react'

function exportInventoryCSV(products) {
  const rows = [
    ['Nombre', 'Barcode', 'Categoría', 'Precio', 'Costo', 'Margen %', 'Stock', 'Stock mín.', 'Valor stock', 'Estado'],
    ...products.map((p) => {
      const margin = p.price > 0 ? ((p.price - p.cost_price) / p.price * 100).toFixed(1) : '0.0'
      const stockValue = (p.stock * p.cost_price).toFixed(0)
      return [
        p.name, p.barcode ?? '', p.category_name ?? '',
        p.price, p.cost_price, margin,
        p.stock, p.min_stock, stockValue,
        p.is_active ? 'Activo' : 'Inactivo',
      ]
    }),
  ]
  const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `inventario_${new Date().toLocaleDateString('en-CA')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const REASONS = [
  { id: 'purchase',         label: 'Compra / Entrada'   },
  { id: 'count_correction', label: 'Corrección de conteo' },
  { id: 'damage',           label: 'Daño / Merma'       },
  { id: 'theft',            label: 'Robo / Pérdida'     },
  { id: 'adjustment',       label: 'Ajuste general'     },
]

export default function Inventory() {
  const qc    = useQueryClient()
  const toast = useToast()
  const { minStockThreshold } = readSettings()
  const [tab,      setTab]      = useState('stock')  // 'stock' | 'expiry'
  const [q,        setQ]        = useState('')
  const [filter,   setFilter]   = useState('all')
  const [selected, setSelected] = useState(null)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: getAllProducts,
  })

  const adjMut = useMutation({
    mutationFn: ({ id, delta, reason, notes, batchData }) => adjustStock(id, delta, reason, notes, batchData),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['expiring-batches'] })
      toast(`Stock de "${updated.name}" → ${updated.stock} uds`, 'success')
      setSelected(null)
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const filtered = useMemo(() => {
    let list = products
    if (q) {
      const lq = q.toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(lq) || p.barcode?.includes(q)
      )
    }
    if (filter === 'low')  list = list.filter((p) => p.stock > 0 && p.stock <= minStockThreshold)
    if (filter === 'out')  list = list.filter((p) => p.stock === 0)
    return list
  }, [products, q, filter])

  const lowCount    = products.filter((p) => p.stock > 0 && p.stock <= minStockThreshold).length
  const outCount    = products.filter((p) => p.stock === 0).length
  const activeCount = products.filter((p) => p.is_active).length
  const totalValue  = products
    .filter((p) => p.is_active && p.stock > 0)
    .reduce((sum, p) => sum + p.stock * p.cost_price, 0)

  return (
    <div className="flex flex-col h-full">

      {/* ── Tabs principales ── */}
      <div className="shrink-0 flex gap-0 border-b border-slate-200 bg-white px-5">
        {[
          { id: 'stock',  label: 'Stock',       icon: <Package size={13}/> },
          { id: 'expiry', label: 'Vencimientos', icon: <CalendarClock size={13}/> },
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelected(null) }}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'expiry' ? (
        <ExpiryTab />
      ) : (
      <div className="grid grid-cols-[1fr_340px] flex-1 min-h-0">

      {/* ── LEFT — tabla ── */}
      <div className="flex flex-col overflow-hidden bg-slate-50 border-r border-slate-200">

        {/* Encabezado + filtros */}
        <div className="shrink-0 px-5 pt-5 pb-3 flex flex-col gap-3 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Inventario</h2>
            <button
              onClick={() => exportInventoryCSV(filtered)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download size={13} /> CSV
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-2">
            <InvKpi icon={<Package size={13}/>}    label="Activos"       value={activeCount}             />
            <InvKpi icon={<DollarSign size={13}/>} label="Valor stock"   value={`$${formatCOP(totalValue)}`} accent />
            <InvKpi icon={<AlertTriangle size={13}/>} label="Bajo stock" value={lowCount} warn={lowCount>0} />
            <InvKpi icon={<AlertTriangle size={13}/>} label="Agotados"   value={outCount} danger={outCount>0} />
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto o barcode..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
          </div>

          {/* Pills */}
          <div className="flex gap-1.5">
            {[
              { id: 'all', label: `Todos (${products.length})` },
              { id: 'low', label: `Bajo stock (${lowCount})`,  warn: lowCount > 0 },
              { id: 'out', label: `Agotados (${outCount})`,    warn: outCount > 0 },
            ].map(({ id, label, warn }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  filter === id
                    ? 'bg-blue-600 text-white'
                    : warn
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-5 text-slate-400 text-sm">Cargando...</p>}
          {!isLoading && (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr>
                  {['Producto', 'Barcode', 'Precio', 'Costo', 'Margen', 'Stock', 'Valor', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                      Sin resultados
                    </td>
                  </tr>
                )}
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id
                  const stockColor = p.stock === 0
                    ? 'text-red-600 font-extrabold'
                    : p.stock <= minStockThreshold
                      ? 'text-amber-600 font-bold'
                      : 'text-green-700 font-bold'

                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-slate-100 transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{p.name}</div>
                        {!p.is_active && (
                          <span className="text-xs text-red-500 font-semibold">Inactivo</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                        {p.barcode || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-blue-700 font-semibold">
                        ${formatCOP(p.price)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                        ${formatCOP(p.cost_price)}
                      </td>
                      <td className="px-4 py-2.5">
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
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 ${stockColor}`}>
                        {p.stock === 0
                          ? <span className="flex items-center gap-1"><AlertTriangle size={13} /> 0</span>
                          : p.stock
                        }
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">
                        {p.stock > 0 && p.cost_price > 0
                          ? `$${formatCOP(p.stock * p.cost_price)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setSelected(isSelected ? null : p)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            isSelected
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 border border-slate-200'
                          }`}
                        >
                          <PackagePlus size={13} />
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── RIGHT — panel ajuste ── */}
      <div className="overflow-y-auto bg-white p-5">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <PackagePlus size={36} className="opacity-30" />
            <p className="text-sm text-center">
              Selecciona un producto<br />para ajustar su stock
            </p>
          </div>
        ) : (
          <AdjustPanel
            product={selected}
            onCancel={() => setSelected(null)}
            onSave={(delta, reason, notes, batchData) => adjMut.mutate({ id: selected.id, delta, reason, notes, batchData })}
            loading={adjMut.isPending}
          />
        )}
      </div>
      </div>
      )}
    </div>
  )
}

// ── Mini KPI card ─────────────────────────────────────────────
function InvKpi({ icon, label, value, accent, warn, danger }) {
  const color = danger
    ? 'text-red-600 bg-red-50 border-red-100'
    : warn
      ? 'text-amber-600 bg-amber-50 border-amber-100'
      : accent
        ? 'text-blue-700 bg-blue-50 border-blue-100'
        : 'text-slate-700 bg-white border-slate-200'
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${color}`}>
      <span className="opacity-70 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="opacity-60 uppercase tracking-wide text-[10px] leading-none mb-0.5">{label}</div>
        <div className="font-bold truncate">{value}</div>
      </div>
    </div>
  )
}

// ── Panel de ajuste + historial ──────────────────────────────
function AdjustPanel({ product, onCancel, onSave, loading }) {
  const [tab, setTab] = useState('adjust')   // 'adjust' | 'history'

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado producto */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">{product.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Stock actual: <span className="font-bold text-slate-700">{product.stock} uds</span>
            {product.min_stock > 0 && (
              <span className="ml-2 text-slate-400">· mín: {product.min_stock}</span>
            )}
          </p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        <button
          onClick={() => setTab('adjust')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            tab === 'adjust' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <SlidersHorizontal size={12} /> Ajustar
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            tab === 'history' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={12} /> Historial
        </button>
      </div>

      {tab === 'adjust'
        ? <AdjustForm product={product} onSave={onSave} loading={loading} />
        : <MovementHistory productId={product.id} />
      }
    </div>
  )
}

// ── Formulario de ajuste ──────────────────────────────────────
function AdjustForm({ product, onSave, loading }) {
  const [mode,        setMode]        = useState('add')
  const [amount,      setAmount]      = useState('')
  const [reason,      setReason]      = useState('purchase')
  const [supplierId,  setSupplierId]  = useState('')
  const [invoice,     setInvoice]     = useState('')
  const [obsNotes,    setObsNotes]    = useState('')
  const [lotNumber,   setLotNumber]   = useState('')
  const [expiresAt,   setExpiresAt]   = useState('')
  const [costPerUnit, setCostPerUnit] = useState('')

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
    staleTime: 60_000,
  })

  const num      = parseFloat(amount) || 0
  const delta    = mode === 'add' ? num : mode === 'remove' ? -num : num - product.stock
  const newStock = product.stock + delta
  const canSave  = amount !== '' && num > 0

  function buildNotes() {
    if (reason === 'purchase') {
      const sup = suppliers.find((s) => s.id === supplierId)?.name
      const parts = [
        sup     && `Prov: ${sup}`,
        invoice && `Fact: ${invoice}`,
      ].filter(Boolean)
      return parts.length ? parts.join(' · ') : null
    }
    return obsNotes.trim() || null
  }

  function buildBatchData() {
    if (reason !== 'purchase' || delta <= 0) return {}
    return {
      lot_number:    lotNumber.trim() || undefined,
      expires_at:    expiresAt || undefined,
      cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : undefined,
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Modo */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Tipo de ajuste
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'add',    label: '+ Entrada',  cls: 'text-green-700 border-green-200 bg-green-50' },
            { id: 'remove', label: '− Salida',   cls: 'text-red-600 border-red-200 bg-red-50'   },
            { id: 'set',    label: '= Fijar',    cls: 'text-blue-700 border-blue-200 bg-blue-50' },
          ].map(({ id, label, cls }) => (
            <button
              key={id}
              onClick={() => { setMode(id); setAmount('') }}
              className={`py-2 rounded-lg border-2 text-xs font-bold transition-colors cursor-pointer ${
                mode === id ? cls : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cantidad */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {mode === 'set' ? 'Nuevo stock absoluto' : 'Cantidad'}
        </label>
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => setAmount((v) => String(Math.max(0, (parseFloat(v) || 0) - 1)))}
            className="w-9 h-9 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            placeholder="0"
            className="flex-1 text-center text-xl font-bold py-2 border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setAmount((v) => String((parseFloat(v) || 0) + 1))}
            className="w-9 h-9 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Vista previa */}
      {amount !== '' && num > 0 && (
        <div className={`flex justify-between items-center px-3 py-2.5 rounded-xl text-sm font-semibold ${
          newStock < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
        }`}>
          <span>Stock resultante</span>
          <span className="text-lg font-extrabold">
            {product.stock} → {newStock} uds
          </span>
        </div>
      )}

      {/* Motivo */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Motivo
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
        >
          {REASONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Campos extra para Compra */}
      {reason === 'purchase' && (
        <div className="flex flex-col gap-2 border border-green-100 rounded-xl p-3 bg-green-50">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Datos de compra</p>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
          >
            <option value="">— Proveedor (opcional) —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="N° Factura / Remisión (opcional)"
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
          {/* Datos de lote — solo si es entrada */}
          {mode === 'add' && (
            <>
              <div className="border-t border-green-200 pt-2 mt-1">
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1.5">
                  Lote (opcional)
                </p>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    placeholder="Número de lote / código"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Costo por unidad"
                    min="0"
                    step="any"
                    value={costPerUnit}
                    onChange={(e) => setCostPerUnit(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold">Fecha de vencimiento</label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Observaciones para otros motivos */}
      {reason !== 'purchase' && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Observaciones (opcional)
          </label>
          <input
            type="text"
            placeholder="Detalle del ajuste..."
            value={obsNotes}
            onChange={(e) => setObsNotes(e.target.value)}
            className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* Botón */}
      <button
        onClick={() => onSave(delta, reason, buildNotes(), buildBatchData())}
        disabled={!canSave || loading || newStock < 0}
        className={`py-3 rounded-xl font-bold text-sm text-white transition-colors ${
          canSave && !loading && newStock >= 0
            ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            : 'bg-slate-400 cursor-not-allowed'
        }`}
      >
        {loading ? 'Guardando...' : 'Confirmar ajuste'}
      </button>
    </div>
  )
}

// ── Historial de movimientos ──────────────────────────────────
const REASON_LABEL = {
  sale:             'Venta',
  purchase:         'Compra / Entrada',
  adjustment:       'Ajuste',
  damage:           'Daño / Merma',
  theft:            'Robo / Pérdida',
  count_correction: 'Corrección de conteo',
  void_return:      'Devolución (anulación)',
}

function fmtDT(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Tab Vencimientos ──────────────────────────────────────────
function ExpiryTab() {
  const [days, setDays] = useState(30)

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['expiring-batches', days],
    queryFn:  () => getExpiringBatches(days),
    staleTime: 30_000,
  })

  const expired = batches.filter((b) => b.expired)
  const soon    = batches.filter((b) => !b.expired && b.days_until_expiry <= 7)
  const normal  = batches.filter((b) => !b.expired && b.days_until_expiry > 7)

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {/* Filtro días */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-semibold text-slate-600">Vencen en los próximos</span>
        {[15, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              days === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {d} días
          </button>
        ))}
        {!isLoading && (
          <span className="ml-auto text-xs text-slate-400">{batches.length} lote(s)</span>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-400 text-center py-10">Cargando...</p>}

      {!isLoading && batches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <CalendarClock size={36} className="opacity-30" />
          <p className="text-sm">Sin lotes próximos a vencer en {days} días</p>
        </div>
      )}

      {expired.length > 0 && (
        <ExpirySection title="Vencidos" batches={expired} variant="danger" />
      )}
      {soon.length > 0 && (
        <ExpirySection title="Vencen en menos de 7 días" batches={soon} variant="warn" />
      )}
      {normal.length > 0 && (
        <ExpirySection title="Próximos a vencer" batches={normal} variant="ok" />
      )}
    </div>
  )
}

function ExpirySection({ title, batches, variant }) {
  const colors = {
    danger: 'text-red-700 border-red-200 bg-red-50',
    warn:   'text-amber-700 border-amber-200 bg-amber-50',
    ok:     'text-slate-700 border-slate-200 bg-slate-50',
  }
  const badgeColors = {
    danger: 'bg-red-100 text-red-700',
    warn:   'bg-amber-100 text-amber-700',
    ok:     'bg-slate-200 text-slate-600',
  }
  return (
    <div className="mb-5">
      <h3 className={`text-xs font-bold uppercase tracking-wide mb-2 px-1 ${variant === 'danger' ? 'text-red-600' : variant === 'warn' ? 'text-amber-600' : 'text-slate-500'}`}>
        {title} ({batches.length})
      </h3>
      <div className="flex flex-col gap-1.5">
        {batches.map((b) => (
          <div key={b.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl border text-xs ${colors[variant]}`}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 truncate">{b.product_name}</div>
              <div className="text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {b.lot_number && <span>Lote: <span className="font-mono">{b.lot_number}</span></span>}
                <span>Restante: <strong>{b.remaining} uds</strong></span>
                {b.cost_per_unit > 0 && <span>Costo: ${formatCOP(b.cost_per_unit * b.remaining)}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`inline-block px-2 py-0.5 rounded-lg font-bold text-[11px] ${badgeColors[variant]}`}>
                {b.expired
                  ? `Vencido hace ${Math.abs(b.days_until_expiry)} día(s)`
                  : `${b.days_until_expiry} día(s)`}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {new Date(b.expires_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Historial de movimientos ──────────────────────────────────
function MovementHistory({ productId }) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements', productId],
    queryFn:  () => getProductMovements(productId),
    staleTime: 10_000,
  })

  if (isLoading) return <p className="text-xs text-slate-400 py-4 text-center">Cargando historial...</p>

  if (movements.length === 0) {
    return (
      <p className="text-xs text-slate-400 py-6 text-center">
        Sin movimientos registrados todavía.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
      {movements.map((m) => {
        const isEntry = m.quantity_delta > 0
        return (
          <div
            key={m.id}
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100"
          >
            <div className={`mt-0.5 shrink-0 ${isEntry ? 'text-green-500' : 'text-red-400'}`}>
              {isEntry ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-slate-700 truncate">
                  {REASON_LABEL[m.reason] ?? m.reason}
                </span>
                <span className={`text-xs font-bold shrink-0 ${isEntry ? 'text-green-600' : 'text-red-500'}`}>
                  {isEntry ? '+' : ''}{m.quantity_delta} uds
                </span>
              </div>
              {m.notes && m.notes !== m.reason && (
                <p className="text-[10px] text-slate-500 mt-0.5 truncate" title={m.notes}>
                  {m.notes}
                </p>
              )}
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-slate-400">{fmtDT(m.created_at)}</span>
                <span className="text-[10px] text-slate-400">
                  {m.quantity_before} → <span className="font-semibold text-slate-600">{m.quantity_after}</span>
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
