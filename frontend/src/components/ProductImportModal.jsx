import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { importProducts } from '@/services/api.js'
import { X, Upload, Download, CheckCircle, AlertTriangle, FileText, RefreshCw } from 'lucide-react'

// ── Columnas esperadas en el CSV ──────────────────────────────
const COLUMNS = [
  { key: 'nombre',    label: 'nombre',    required: true,  hint: 'Nombre del producto'         },
  { key: 'precio',    label: 'precio',    required: true,  hint: 'Precio de venta (número)'     },
  { key: 'costo',     label: 'costo',     required: false, hint: 'Precio de costo (número)'     },
  { key: 'barcode',   label: 'barcode',   required: false, hint: 'Código de barras'             },
  { key: 'categoria', label: 'categoria', required: false, hint: 'Nombre de categoría'          },
  { key: 'stock',     label: 'stock',     required: false, hint: 'Stock inicial (número entero)'},
  { key: 'stock_min', label: 'stock_min', required: false, hint: 'Mínimo de stock para alerta'  },
]

// ── CSV template ──────────────────────────────────────────────
const TEMPLATE_ROWS = [
  ['nombre', 'precio', 'costo', 'barcode', 'categoria', 'stock', 'stock_min'],
  ['Leche Entera 1L', '4500', '3200', '7702057045008', 'Lácteos', '50', '5'],
  ['Pan tajado', '3800', '2800', '', 'Panadería', '30', '3'],
  ['Gaseosa Cola 600ml', '2500', '1800', '7891234560123', 'Bebidas', '24', '4'],
]

function downloadTemplate() {
  const csv  = TEMPLATE_ROWS.map((r) => r.join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = 'plantilla_productos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── CSV parser (maneja comillas, BOM, CRLF) ───────────────────
function parseCSV(text) {
  // Remove BOM
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return { headers: [], rows: [], error: 'El archivo debe tener al menos una fila de datos.' }

  function splitLine(line) {
    const result = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().trim())
  const rows = lines.slice(1).map((line, idx) => {
    const values = splitLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
    obj._row = idx + 2   // número de fila (1-indexed, +1 por header)
    return obj
  }).filter((r) => Object.values(r).some((v, i) => i < headers.length && v !== ''))

  return { headers, rows, error: null }
}

// ── Validar fila ──────────────────────────────────────────────
function validateRow(row) {
  const errors = []
  if (!row.nombre?.trim()) errors.push('nombre requerido')
  const precio = parseFloat(row.precio)
  if (isNaN(precio) || precio <= 0) errors.push('precio inválido')
  if (row.costo && isNaN(parseFloat(row.costo))) errors.push('costo inválido')
  if (row.stock && isNaN(parseFloat(row.stock))) errors.push('stock inválido')
  return errors
}

// ── Convertir fila a payload ──────────────────────────────────
function rowToPayload(row) {
  return {
    name:          row.nombre?.trim() ?? '',
    price:         parseFloat(row.precio) || 0,
    cost_price:    parseFloat(row.costo)  || 0,
    barcode:       row.barcode?.trim()    || null,
    category_name: row.categoria?.trim() || null,
    stock:         parseFloat(row.stock)  || 0,
    min_stock:     parseFloat(row.stock_min) || 0,
  }
}

// ── Componente principal ──────────────────────────────────────
export default function ProductImportModal({ onClose, onImported }) {
  const fileRef  = useRef(null)
  const dropRef  = useRef(null)
  const [parsed, setParsed] = useState(null)   // { headers, rows, error }
  const [dragging, setDragging] = useState(false)
  const [result,  setResult]  = useState(null)  // resultado del import

  const importMut = useMutation({
    mutationFn: (items) => importProducts(items),
    onSuccess: (res) => {
      setResult(res)
      onImported()
    },
    onError: (e) => setResult({ serverError: e.message }),
  })

  function processFile(file) {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setParsed({ headers: [], rows: [], error: 'Solo se aceptan archivos .csv' })
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const p = parseCSV(text)
      setParsed(p)
      setResult(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleFile(e)   { processFile(e.target.files[0]) }
  function handleDrop(e)   { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]) }
  function handleDragOver(e) { e.preventDefault(); setDragging(true) }
  function handleDragLeave() { setDragging(false) }

  const validRows   = parsed?.rows.filter((r) => validateRow(r).length === 0) ?? []
  const invalidRows = parsed?.rows.filter((r) => validateRow(r).length > 0)   ?? []
  const hasData     = parsed && !parsed.error && validRows.length > 0

  function handleImport() {
    const items = validRows.map(rowToPayload)
    importMut.mutate(items)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Upload size={16} className="text-blue-600" />
            Importar productos desde CSV
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* Plantilla */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-blue-800">¿Primera vez?</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Descarga la plantilla con el formato correcto y las columnas requeridas.
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-50 transition-colors cursor-pointer shrink-0"
            >
              <Download size={13} /> Plantilla CSV
            </button>
          </div>

          {/* Columnas esperadas */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Columnas del CSV</p>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => (
                <span
                  key={c.key}
                  title={c.hint}
                  className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                    c.required
                      ? 'bg-blue-100 text-blue-700 font-bold'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {c.label}{c.required ? ' *' : ''}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">* Requeridos · El resto son opcionales</p>
          </div>

          {/* Drop zone */}
          {!result && (
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="hidden"
              />
              <FileText size={28} className="mx-auto text-slate-300 mb-2" />
              {parsed?.error ? (
                <p className="text-sm font-semibold text-red-500">{parsed.error}</p>
              ) : parsed ? (
                <p className="text-sm font-semibold text-blue-600">
                  {parsed.rows.length} filas cargadas — haz clic para cambiar el archivo
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-600">
                    Arrastra tu archivo CSV aquí
                  </p>
                  <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionarlo</p>
                </>
              )}
            </div>
          )}

          {/* Preview de filas válidas */}
          {hasData && !result && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Vista previa
                  <span className="ml-2 text-green-600 font-bold">{validRows.length} válidas</span>
                  {invalidRows.length > 0 && (
                    <span className="ml-2 text-red-500 font-bold">{invalidRows.length} con errores</span>
                  )}
                </p>
                <button
                  onClick={() => { setParsed(null); fileRef.current && (fileRef.current.value = '') }}
                  className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={11} /> Cambiar archivo
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Nombre', 'Precio', 'Costo', 'Barcode', 'Categoría', 'Stock'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-700">{row.nombre}</td>
                        <td className="px-3 py-2 text-blue-700 font-semibold">${Number(row.precio).toLocaleString('es-CO')}</td>
                        <td className="px-3 py-2 text-slate-500">{row.costo ? `$${Number(row.costo).toLocaleString('es-CO')}` : '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{row.barcode || '—'}</td>
                        <td className="px-3 py-2 text-violet-700">{row.categoria || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.stock || '0'}</td>
                      </tr>
                    ))}
                    {validRows.length > 8 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-center text-slate-400 italic">
                          … y {validRows.length - 8} más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Filas con errores */}
              {invalidRows.length > 0 && (
                <div className="mt-2 bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-600 mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Filas ignoradas ({invalidRows.length})
                  </p>
                  <div className="flex flex-col gap-1">
                    {invalidRows.slice(0, 5).map((row, i) => (
                      <p key={i} className="text-[11px] text-red-500">
                        Fila {row._row}: {validateRow(row).join(', ')}
                        {row.nombre ? ` — "${row.nombre}"` : ''}
                      </p>
                    ))}
                    {invalidRows.length > 5 && (
                      <p className="text-[11px] text-red-400">… y {invalidRows.length - 5} más</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resultado del import */}
          {result && (
            <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
              result.serverError ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
            }`}>
              {result.serverError ? (
                <p className="text-sm font-bold text-red-600 flex items-center gap-2">
                  <AlertTriangle size={16} /> Error: {result.serverError}
                </p>
              ) : (
                <>
                  <p className="text-sm font-bold text-green-700 flex items-center gap-2">
                    <CheckCircle size={16} /> Importación completada
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <ResultStat label="Creados"      value={result.created} color="text-green-700" />
                    <ResultStat label="Actualizados" value={result.updated} color="text-blue-700" />
                    <ResultStat label="Omitidos"     value={result.skipped} color="text-slate-500" />
                  </div>
                  {result.errors?.length > 0 && (
                    <div className="bg-white border border-red-100 rounded-lg p-3">
                      <p className="text-xs font-bold text-red-600 mb-1">Errores individuales:</p>
                      {result.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-[11px] text-red-500">{e}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
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
            {result && !result.serverError ? 'Cerrar' : 'Cancelar'}
          </button>
          {hasData && !result && (
            <button
              onClick={handleImport}
              disabled={importMut.isPending}
              className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {importMut.isPending ? (
                <><RefreshCw size={14} className="animate-spin" /> Importando...</>
              ) : (
                <><Upload size={14} /> Importar {validRows.length} productos</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultStat({ label, value, color }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-center">
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 font-semibold">{label}</div>
    </div>
  )
}
