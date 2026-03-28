import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCurrentRegister,
  openRegister,
  closeRegister,
  getRegisterHistory,
  getSales,
  getShiftExpenses,
  addExpense,
} from '@/services/api.js'
import { formatCOP, formatTime } from '@/lib/utils.js'
import {
  Lock, Unlock, TrendingUp, ShoppingBag, Banknote, Clock,
  FileBarChart2, Plus, Receipt,
} from 'lucide-react'
import { useToast } from '@/components/Toast.jsx'
import ZReport from '@/components/ZReport.jsx'

// ── helpers ──────────────────────────────────────────────────
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function duration(opened, closed) {
  const ms = (closed ? new Date(closed) : new Date()) - new Date(opened)
  const h  = Math.floor(ms / 3_600_000)
  const m  = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const EXPENSE_CATS = [
  { value: 'supplies',     label: 'Suministros'    },
  { value: 'cleaning',     label: 'Limpieza'       },
  { value: 'transport',    label: 'Transporte'     },
  { value: 'food',         label: 'Alimentación'   },
  { value: 'maintenance',  label: 'Mantenimiento'  },
  { value: 'other',        label: 'Otro'           },
]

// ── componente principal ──────────────────────────────────────
export default function CashRegister() {
  const qc    = useQueryClient()
  const toast = useToast()
  const [openAmt,    setOpenAmt]  = useState('')
  const [closeAmt,   setCloseAmt] = useState('')
  const [showZReport, setZReport] = useState(false)

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ['cash-register-current'],
    queryFn: getCurrentRegister,
    refetchInterval: 30_000,
  })

  // Sales del turno (para el informe Z) — solo se cargan cuando se abre el modal
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const { data: zSales = [] } = useQuery({
    queryKey: ['sales-z', current?.id],
    queryFn: () => getSales(
      current?.opened_at
        ? new Date(current.opened_at).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
        : todayStr,
      todayStr,
    ),
    enabled: showZReport,
  })

  // Gastos del turno (para el informe Z)
  const { data: zExpenses = [] } = useQuery({
    queryKey: ['shift-expenses'],
    queryFn: getShiftExpenses,
    enabled: showZReport && Boolean(current),
  })

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['cash-register-history'],
    queryFn: getRegisterHistory,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cash-register-current'] })
    qc.invalidateQueries({ queryKey: ['cash-register-history'] })
  }

  const openMut = useMutation({
    mutationFn: () => openRegister(parseFloat(openAmt) || 0),
    onSuccess: () => { invalidate(); setOpenAmt(''); toast('Turno abierto', 'success') },
    onError:   (e) => toast(e.message, 'error'),
  })

  const closeMut = useMutation({
    mutationFn: () => closeRegister(parseFloat(closeAmt) || 0),
    onSuccess: () => { invalidate(); setCloseAmt(''); toast('Turno cerrado', 'warning') },
    onError:   (e) => toast(e.message, 'error'),
  })

  const isOpen = Boolean(current)

  return (
    <div className="grid grid-cols-[1fr_340px] h-full">

      {/* ── LEFT — estado del turno ── */}
      <div className="overflow-y-auto p-6 bg-slate-50 border-r border-slate-200 flex flex-col gap-5">

        {loadingCurrent ? (
          <p className="text-slate-400 text-sm">Cargando...</p>
        ) : isOpen ? (
          <TurnoAbierto
            reg={current}
            closeAmt={closeAmt}
            setCloseAmt={setCloseAmt}
            onClose={() => closeMut.mutate()}
            onZReport={() => setZReport(true)}
            loading={closeMut.isPending}
          />
        ) : (
          <TurnoCerrado
            openAmt={openAmt}
            setOpenAmt={setOpenAmt}
            onOpen={() => openMut.mutate()}
            loading={openMut.isPending}
          />
        )}
      </div>

      {/* ── Modal Informe Z ── */}
      {showZReport && (
        <ZReport
          sales={zSales}
          register={current}
          expenses={zExpenses}
          onClose={() => setZReport(false)}
        />
      )}

      {/* ── RIGHT — historial ── */}
      <div className="overflow-y-auto p-5 bg-white">
        <h3 className="font-bold text-slate-700 text-sm mb-3 uppercase tracking-wide">
          Historial de turnos
        </h3>

        {loadingHistory && <p className="text-slate-400 text-sm">Cargando...</p>}

        <div className="flex flex-col gap-2">
          {history.map((r) => (
            <HistoryCard key={r.id} reg={r} />
          ))}
          {!loadingHistory && history.length === 0 && (
            <p className="text-slate-400 text-sm">Sin historial todavía</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── sub-componentes ──────────────────────────────────────────

function TurnoAbierto({ reg, closeAmt, setCloseAmt, onClose, onZReport, loading }) {
  // Descuenta gastos de caja menor del efectivo esperado
  const expensesTotal = reg.expenses_total || 0
  const expected = (reg.opening_amount + reg.sales_total - expensesTotal).toFixed(0)
  const diff     = parseFloat(closeAmt || 0) - parseFloat(expected)

  return (
    <div className="flex flex-col gap-4">
      {/* Badge abierto */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-bold">
            <Unlock size={14} /> Turno ABIERTO
          </span>
          <span className="text-slate-400 text-sm flex items-center gap-1">
            <Clock size={13} /> {duration(reg.opened_at, null)}
          </span>
        </div>
        <button
          onClick={onZReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <FileBarChart2 size={14} /> Informe Z
        </button>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Banknote size={18} />}
          label="Base apertura"
          value={`$${formatCOP(reg.opening_amount)}`}
          color="slate"
        />
        <StatCard
          icon={<ShoppingBag size={18} />}
          label="Ventas en turno"
          value={reg.sales_count}
          sub="transacciones"
          color="blue"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Total ventas"
          value={`$${formatCOP(reg.sales_total)}`}
          color="violet"
        />
        <StatCard
          icon={<Banknote size={18} />}
          label="Efectivo esperado"
          value={`$${formatCOP(expected)}`}
          sub={expensesTotal > 0 ? `−$${formatCOP(expensesTotal)} gastos` : undefined}
          color="green"
        />
      </div>

      {/* Gastos de caja menor */}
      <ExpensesCard registerId={reg.id} />

      {/* Cierre */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
        <h4 className="font-bold text-slate-700 text-sm">Cerrar turno</h4>
        <p className="text-xs text-slate-400">
          Abierto: {fmtDate(reg.opened_at)} a las {formatTime(reg.opened_at)}
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Efectivo en caja al cierre *
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={closeAmt}
            onChange={(e) => setCloseAmt(e.target.value)}
            placeholder="0"
            className="px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Diferencia en tiempo real */}
        {closeAmt !== '' && (
          <div className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm font-semibold ${
            diff === 0
              ? 'bg-green-50 text-green-700'
              : diff > 0
                ? 'bg-blue-50 text-blue-700'
                : 'bg-red-50 text-red-600'
          }`}>
            <span>{diff >= 0 ? 'Sobrante' : 'Faltante'}</span>
            <span>${formatCOP(Math.abs(diff))}</span>
          </div>
        )}

        <button
          onClick={onClose}
          disabled={loading || closeAmt === ''}
          className={`py-3 rounded-xl font-bold text-sm text-white transition-colors ${
            loading || closeAmt === ''
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700 cursor-pointer'
          }`}
        >
          {loading ? 'Cerrando...' : 'Cerrar turno'}
        </button>
      </div>
    </div>
  )
}

function ExpensesCard({ registerId }) {
  const qc    = useQueryClient()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [amt,  setAmt]  = useState('')
  const [cat,  setCat]  = useState('other')
  const [desc, setDesc] = useState('')

  const { data: expenses = [] } = useQuery({
    queryKey: ['shift-expenses'],
    queryFn: getShiftExpenses,
    enabled: Boolean(registerId),
    staleTime: 15_000,
  })

  const addMut = useMutation({
    mutationFn: () => addExpense(parseFloat(amt), cat, desc.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-expenses'] })
      qc.invalidateQueries({ queryKey: ['cash-register-current'] })
      setAmt(''); setDesc(''); setCat('other'); setShowForm(false)
      toast('Gasto registrado', 'success')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  const handleKey = (e) => {
    if (e.key === 'Enter' && amt && desc.trim()) addMut.mutate()
    if (e.key === 'Escape') { setShowForm(false); setAmt(''); setDesc(''); setCat('other') }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={15} className="text-orange-500" />
          <h4 className="font-bold text-slate-700 text-sm">Caja menor</h4>
          {total > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
              −${formatCOP(total)}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
        >
          <Plus size={13} /> Agregar
        </button>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div className="flex flex-col gap-2 border border-blue-100 rounded-lg p-3 bg-blue-50">
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Monto"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
              className="w-28 px-2 py-1.5 text-xs border rounded border-slate-300 focus:border-blue-500 outline-none"
            />
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border rounded border-slate-300 focus:border-blue-500 outline-none bg-white"
            >
              {EXPENSE_CATS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Descripción del gasto..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={handleKey}
            className="px-2 py-1.5 text-xs border rounded border-slate-300 focus:border-blue-500 outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); setAmt(''); setDesc(''); setCat('other') }}
              className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => addMut.mutate()}
              disabled={!amt || !desc.trim() || addMut.isPending}
              className="flex-1 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
            >
              {addMut.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de gastos */}
      {expenses.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400">Sin gastos registrados en este turno</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-1.5 text-xs">
              <div>
                <span className="font-semibold text-slate-700">{e.description}</span>
                <span className="ml-1.5 text-slate-400">
                  · {EXPENSE_CATS.find((c) => c.value === e.category)?.label ?? e.category}
                </span>
              </div>
              <span className="font-bold text-orange-600 shrink-0 ml-2">−${formatCOP(e.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TurnoCerrado({ openAmt, setOpenAmt, onOpen, loading }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full text-sm font-bold">
          <Lock size={14} /> Turno CERRADO
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 max-w-sm">
        <h4 className="font-bold text-slate-700 text-sm">Abrir nuevo turno</h4>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Base de apertura (efectivo inicial)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={openAmt}
            onChange={(e) => setOpenAmt(e.target.value)}
            placeholder="Ej: 50000"
            autoFocus
            className="px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 outline-none"
          />
        </div>

        <button
          onClick={onOpen}
          disabled={loading}
          className={`py-3 rounded-xl font-bold text-sm text-white transition-colors ${
            loading
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 cursor-pointer'
          }`}
        >
          {loading ? 'Abriendo...' : 'Abrir turno'}
        </button>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  const colors = {
    slate:  'bg-slate-50 border-slate-200 text-slate-700',
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    green:  'bg-green-50 border-green-100 text-green-700',
  }
  return (
    <div className={`border rounded-xl p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold opacity-70 uppercase tracking-wide mb-1">
        {icon} {label}
      </div>
      <div className="font-extrabold text-lg">{value}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  )
}

function HistoryCard({ reg }) {
  const isOpen  = reg.status === 'open'
  const variant = reg.variance

  return (
    <div className={`border rounded-xl p-3 text-sm ${
      isOpen ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          isOpen ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-600'
        }`}>
          {isOpen ? 'ABIERTO' : 'CERRADO'}
        </span>
        <span className="text-xs text-slate-400">
          {fmtDate(reg.opened_at)} {formatTime(reg.opened_at)}
        </span>
      </div>

      <div className="flex justify-between text-slate-600 text-xs">
        <span>Base: <strong>${formatCOP(reg.opening_amount)}</strong></span>
        {reg.closing_amount != null && (
          <span>Cierre: <strong>${formatCOP(reg.closing_amount)}</strong></span>
        )}
      </div>

      {variant != null && (
        <div className={`mt-1.5 text-xs font-semibold ${
          variant === 0 ? 'text-green-600' : variant > 0 ? 'text-blue-600' : 'text-red-500'
        }`}>
          {variant > 0 ? `+$${formatCOP(variant)} sobrante` :
           variant < 0 ? `-$${formatCOP(Math.abs(variant))} faltante` :
           'Cuadre exacto ✓'}
        </div>
      )}

      {!isOpen && reg.opened_at && reg.closed_at && (
        <div className="text-xs text-slate-400 mt-1">
          Duración: {duration(reg.opened_at, reg.closed_at)}
        </div>
      )}
    </div>
  )
}
