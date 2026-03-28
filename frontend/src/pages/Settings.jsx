/**
 * Settings.jsx — Configuración unificada con pestañas
 * Pestañas: Negocio | Usuarios | Hardware | Sistema
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSettings }  from '@/hooks/useSettings.js'
import { useAuth }      from '@/hooks/useAuth.jsx'
import { useToast }     from '@/components/Toast.jsx'
import { useScale }     from '@/hooks/useScale.jsx'
import {
  getUsers, createUser, updateUser, deleteUser,
  getHardwareStatus, getScalePorts, connectScale, disconnectScale,
  printerTest, openCashDrawer,
} from '@/services/api.js'
import {
  Settings as SettingsIcon, Store, Receipt, Bell, Save, Info,
  ShieldCheck, Cpu, Tag, Plus, Pencil, Trash2, X, Eye, EyeOff, AlertCircle,
  Scale, Printer, Vault, Power, PowerOff, RefreshCw, CheckCircle2,
  Loader2, AlertTriangle, WifiOff, Check,
} from 'lucide-react'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/services/api.js'

// ── Constantes ────────────────────────────────────────────────
const ROUTE_LABELS = {
  '/':           'Dashboard',
  '/pos':        'Caja (POS)',
  '/products':   'Productos',
  '/categories': 'Categorías',
  '/inventory':  'Inventario',
  '/sales':      'Ventas',
  '/customers':  'Clientes',
  '/suppliers':  'Proveedores',
  '/purchases':  'Órdenes de Compra',
  '/caja':       'Turno / Caja',
  '/reports':    'Reportes',
}

const ROLES = [
  { value: 'admin',      label: 'Administrador', color: 'bg-red-100 text-red-700'       },
  { value: 'supervisor', label: 'Supervisor',     color: 'bg-amber-100 text-amber-700'   },
  { value: 'cashier',    label: 'Cajero',         color: 'bg-blue-100 text-blue-700'     },
  { value: 'accountant', label: 'Contador',       color: 'bg-violet-100 text-violet-700' },
  { value: 'warehouse',  label: 'Almacén',        color: 'bg-green-100 text-green-700'   },
]

const INPUT = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition'
const BTN_P = 'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_S = 'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_R = 'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed'

function roleInfo(role) {
  return ROLES.find((r) => r.value === role) ?? { label: role, color: 'bg-slate-100 text-slate-600' }
}

// ── Card genérica ─────────────────────────────────────────────
function Card({ icon, title, badge, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="text-slate-400">{icon}</span>{title}
        </h3>
        {badge}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function StatusPill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
      ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
    }`}>
      {ok ? <CheckCircle2 size={11} /> : <WifiOff size={11} />} {label}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════
// PESTAÑA: NEGOCIO
// ══════════════════════════════════════════════════════════════
function TabNegocio() {
  const { settings, save, loading } = useSettings()
  const toast = useToast()
  const [form,   setForm]   = useState({ ...settings })
  const [dirty,  setDirty]  = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading) setForm({ ...settings })
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field, value) => { setForm((p) => ({ ...p, [field]: value })); setDirty(true) }

  const handleSave = async () => {
    if (!form.businessName?.trim()) return toast('El nombre del negocio no puede estar vacío', 'error')
    setSaving(true)
    try {
      await save(form); setDirty(false); toast('Configuración guardada', 'success')
    } catch { toast('Error al guardar', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            dirty && !saving ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm' : 'bg-slate-100 text-slate-400 cursor-default'
          }`}
        >
          <Save size={14} />{saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <Card icon={<Store size={15} />} title="Datos del negocio">
        <Field label="Nombre del negocio *">
          <input value={form.businessName ?? ''} onChange={(e) => set('businessName', e.target.value)} placeholder="Minimarket" className={INPUT} />
        </Field>
        <Field label="NIT / Número de identificación">
          <input value={form.nit ?? ''} onChange={(e) => set('nit', e.target.value)} placeholder="900.000.000-0" className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dirección">
            <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Calle 123 # 45-67" className={INPUT} />
          </Field>
          <Field label="Teléfono">
            <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="300 000 0000" className={INPUT} />
          </Field>
        </div>
      </Card>

      <Card icon={<Receipt size={15} />} title="Recibo de venta">
        <Field label="Mensaje al pie del recibo" hint="Se muestra al final de cada ticket de venta impreso">
          <textarea
            value={form.receiptFooter ?? ''} onChange={(e) => set('receiptFooter', e.target.value)}
            rows={2} placeholder="¡Gracias por su compra!" className={`${INPUT} resize-none`}
          />
        </Field>
      </Card>

      <Card icon={<Bell size={15} />} title="Alertas de inventario">
        <Field label="Umbral de stock mínimo por defecto" hint="Productos con stock igual o inferior aparecen en alertas">
          <div className="flex items-center gap-3">
            <input
              type="number" min={0} max={9999}
              value={form.minStockThreshold ?? 5}
              onChange={(e) => set('minStockThreshold', Math.max(0, Number(e.target.value)))}
              className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition"
            />
            <span className="text-sm text-slate-500">unidades</span>
          </div>
        </Field>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PESTAÑA: USUARIOS
// ══════════════════════════════════════════════════════════════
function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user
  const [username,    setUsername]    = useState(user?.username    ?? '')
  const [fullName,    setFullName]    = useState(user?.full_name   ?? '')
  const [role,        setRole]        = useState(user?.role        ?? 'cashier')
  const [permissions, setPermissions] = useState(user?.permissions ?? [])
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fullName.trim() || (!isEdit && !password.trim())) return
    setLoading(true); setError('')
    try {
      const body = isEdit
        ? { full_name: fullName.trim(), role, permissions, ...(password ? { password } : {}) }
        : { username: username.trim(), full_name: fullName.trim(), role, password, permissions }
      const data = isEdit ? await updateUser(user.id, body) : await createUser(body)
      onSaved(data)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm font-semibold">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Usuario</label>
              <input type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="ej. cajero2"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre completo</label>
            <input type="text" autoFocus={isEdit} value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="ej. María López"
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Contraseña {isEdit && <span className="font-normal text-slate-400 normal-case">(vacío = no cambiar)</span>}
            </label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Contraseña inicial'}
                className="w-full px-3 py-2 pr-9 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {role !== 'admin' && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Permisos adicionales</label>
              <p className="text-xs text-slate-400">Se suman a los permisos del rol seleccionado</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                {Object.entries(ROUTE_LABELS).map(([path, label]) => (
                  <label key={path} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={permissions.includes(path)}
                      onChange={(e) => setPermissions((prev) => e.target.checked ? [...prev, path] : prev.filter((p) => p !== path))}
                      className="rounded" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 cursor-pointer">
              Cancelar
            </button>
            <button type="submit"
              disabled={loading || !fullName.trim() || (!isEdit && !username.trim()) || (!isEdit && !password.trim())}
              className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer">
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TabUsuarios() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [editing,    setEditing]    = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId,   setDeleteId]   = useState(null)
  const [deleteErr,  setDeleteErr]  = useState('')

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeleteId(null) },
    onError: (e) => setDeleteErr(e.message),
  })

  const handleSaved = () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditing(null); setShowCreate(false) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Gestiona el acceso y los permisos de cada empleado</p>
        {me?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors cursor-pointer shadow-lg shadow-blue-600/20">
            <Plus size={16} /> Nuevo usuario
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Estado</th>
                {me?.role === 'admin' && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const ri = roleInfo(u.role)
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {u.full_name}
                      {u.id === me?.id && (
                        <span className="ml-2 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Tú</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${ri.color}`}>{ri.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {me?.role === 'admin' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setEditing(u)}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
                            <Pencil size={14} />
                          </button>
                          {u.id !== me?.id && (
                            <button onClick={() => { setDeleteId(u.id); setDeleteErr('') }}
                              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <UserModal onClose={() => setShowCreate(false)} onSaved={handleSaved} />}
      {editing    && <UserModal user={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs text-center">
            <p className="font-bold text-slate-800 mb-1">¿Eliminar usuario?</p>
            <p className="text-sm text-slate-500 mb-4">Esta acción no se puede deshacer.</p>
            {deleteErr && <p className="text-red-600 text-sm mb-3">{deleteErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 cursor-pointer">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-400 cursor-pointer">
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PESTAÑA: HARDWARE
// ══════════════════════════════════════════════════════════════
function ScaleSection({ status, toast }) {
  const [port, setPort]         = useState('')
  const [protocol, setProtocol] = useState('cas')
  const { weight, stable, connected: liveConn, unit, error: liveErr, enabled, setEnabled } = useScale()

  const { data: portsData, isLoading: loadingPorts, refetch: refetchPorts } = useQuery({
    queryKey: ['hw-scale-ports'], queryFn: getScalePorts, staleTime: 30_000,
  })

  const connectMut    = useMutation({ mutationFn: () => connectScale(port, protocol),
    onSuccess: () => { toast('Balanza conectada', 'success'); setEnabled(true) },
    onError: (e) => toast(e.message, 'error') })
  const disconnectMut = useMutation({ mutationFn: disconnectScale,
    onSuccess: () => { toast('Balanza desconectada', 'info'); setEnabled(false) },
    onError: (e) => toast(e.message, 'error') })

  const ports       = portsData?.ports ?? []
  const isConnected = status?.connected ?? false

  return (
    <Card icon={<Scale size={15} />} title="Balanza RS-232"
      badge={<StatusPill ok={isConnected} label={isConnected ? 'Conectada' : 'Desconectada'} />}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Puerto serial</label>
          <div className="flex gap-1">
            <select value={port} onChange={(e) => setPort(e.target.value)} className={INPUT} disabled={isConnected}>
              <option value="">— Seleccionar —</option>
              {ports.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => refetchPorts()} disabled={loadingPorts} title="Escanear"
              className="px-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 cursor-pointer shrink-0">
              <RefreshCw size={13} className={loadingPorts ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Protocolo</label>
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className={INPUT} disabled={isConnected}>
            <option value="cas">CAS (LP/CI)</option>
            <option value="toledo">Toledo (8142/8217)</option>
            <option value="mettler">Mettler MT-SICS</option>
            <option value="generic">Genérico</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        {!isConnected ? (
          <button onClick={() => connectMut.mutate()} disabled={!port || connectMut.isPending} className={BTN_P}>
            {connectMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Conectando...</> : <><Power size={14} /> Conectar</>}
          </button>
        ) : (
          <button onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending} className={BTN_R}>
            <PowerOff size={14} /> Desconectar
          </button>
        )}
      </div>
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lectura en vivo</span>
          <button onClick={() => setEnabled((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              enabled ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {enabled ? <Power size={12} /> : <PowerOff size={12} />} {enabled ? 'Activa' : 'Inactiva'}
          </button>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 rounded-xl px-5 py-4">
          <Scale size={22} className={enabled ? 'text-blue-400' : 'text-slate-600'} />
          <span className={`font-mono text-3xl font-extrabold tabular-nums tracking-tight ${
            !enabled ? 'text-slate-600' : liveErr ? 'text-amber-400' : stable && weight ? 'text-green-400' : 'text-white'}`}>
            {enabled && weight !== null ? weight.toFixed(3) : '- - -'}
          </span>
          <span className="text-slate-400 font-semibold">{unit}</span>
          {enabled && weight !== null && (
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${stable ? 'bg-green-900 text-green-300' : 'bg-amber-900 text-amber-300 animate-pulse'}`}>
              {stable ? 'ESTABLE' : 'MIDIENDO'}
            </span>
          )}
          {enabled && !weight && !liveErr && <Loader2 size={16} className="ml-auto text-slate-400 animate-spin" />}
          {liveErr && <span className="ml-auto flex items-center gap-1 text-xs text-amber-400"><AlertTriangle size={12} /> {liveErr}</span>}
        </div>
      </div>
    </Card>
  )
}

function TabHardware() {
  const toast = useToast()
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['hw-status'], queryFn: getHardwareStatus, staleTime: 5_000, refetchInterval: 10_000,
  })

  const printerMut = useMutation({ mutationFn: printerTest,
    onSuccess: () => toast('Página de prueba enviada', 'success'),
    onError: (e) => toast(e.message, 'error') })

  const [reason, setReason] = useState('manual')
  const drawerMut = useMutation({ mutationFn: () => openCashDrawer(null, reason),
    onSuccess: () => toast('Cajón abierto — registrado en auditoría', 'success'),
    onError: (e) => toast(e.message, 'error') })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Periféricos conectados al punto de venta</p>
        <div className="flex items-center gap-2">
          {status?.mock_mode && (
            <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">MOCK MODE</span>
          )}
          <button onClick={() => refetch()} disabled={isLoading} className={BTN_S}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      <ScaleSection status={status?.scale} toast={toast} />

      <Card icon={<Printer size={15} />} title="Impresora térmica ESC/POS">
        <div className="text-sm text-slate-500 space-y-1">
          <p>Conexión: <span className="font-semibold text-slate-700">USB auto-detect</span></p>
          <p className="text-xs text-slate-400">Modelos: Xprinter XP-58IIL, Bixolon SRP-350III y compatibles ESC/POS.</p>
        </div>
        <button onClick={() => printerMut.mutate()} disabled={printerMut.isPending} className={BTN_P}>
          {printerMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Imprimiendo...</> : <><Printer size={14} /> Imprimir página de prueba</>}
        </button>
        {printerMut.isSuccess && <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> Página enviada correctamente</p>}
        {printerMut.isError   && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {printerMut.error?.message}</p>}
      </Card>

      <Card icon={<Vault size={15} />} title="Cajón de dinero">
        <div className="text-sm text-slate-500">
          <p>Conectado al puerto <span className="font-semibold text-slate-700">cash drawer</span> de la impresora ESC/POS.</p>
          <p className="text-xs text-slate-400 mt-1">Cada apertura queda registrada en el log de auditoría con hash SHA-256.</p>
        </div>
        <Field label="Motivo de apertura">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT}>
            <option value="manual">Manual / prueba</option>
            <option value="shift_end">Cierre de turno</option>
          </select>
        </Field>
        <button onClick={() => drawerMut.mutate()} disabled={drawerMut.isPending} className={BTN_P}>
          {drawerMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Abriendo...</> : <><Vault size={14} /> Abrir cajón</>}
        </button>
        {drawerMut.isSuccess && <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> Cajón abierto y auditado</p>}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PESTAÑA: CATEGORÍAS
// ══════════════════════════════════════════════════════════════
function TabCategorias() {
  const qc    = useQueryClient()
  const toast = useToast()
  const [newName,    setNewName]    = useState('')
  const [editingId,  setEditingId]  = useState(null)
  const [editName,   setEditName]   = useState('')
  const [deletingId, setDeletingId] = useState(null)
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
    setEditingId(cat.id); setEditName(cat.name); setDeletingId(null)
    setTimeout(() => editRef.current?.focus(), 50)
  }
  const saveEdit   = () => { if (editName.trim()) updateMut.mutate({ id: editingId, name: editName.trim() }) }
  const cancelEdit = () => setEditingId(null)

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Organiza tus productos en categorías</p>

      {/* Formulario crear */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-2">
        <input
          ref={newRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMut.mutate() }}
          placeholder="Nombre de la nueva categoría..."
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-100"
        />
        <button
          onClick={() => createMut.mutate()}
          disabled={!newName.trim() || createMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Plus size={15} />{createMut.isPending ? 'Creando...' : 'Crear'}
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading && <p className="p-4 text-sm text-slate-400">Cargando...</p>}
        {!isLoading && categories.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">Sin categorías. Crea la primera arriba.</p>
        )}
        {categories.map((cat, i) => (
          <div key={cat.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-100' : ''} ${deletingId === cat.id ? 'bg-red-50' : ''}`}>
            {editingId === cat.id ? (
              <>
                <Tag size={14} className="text-violet-400 shrink-0" />
                <input
                  ref={editRef} value={editName} onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                  className="flex-1 px-2 py-1 text-sm border-2 border-violet-500 rounded-lg outline-none"
                />
                <button onClick={saveEdit} disabled={updateMut.isPending || !editName.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 cursor-pointer">
                  <Check size={12} /> Guardar
                </button>
                <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={14} />
                </button>
              </>
            ) : deletingId === cat.id ? (
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
                <button onClick={() => deleteMut.mutate(cat.id)} disabled={deleteMut.isPending}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 cursor-pointer">
                  <Trash2 size={12} /> {deleteMut.isPending ? 'Eliminando...' : 'Confirmar'}
                </button>
                <button onClick={() => setDeletingId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <Tag size={14} className="text-violet-400 shrink-0" />
                <span className="flex-1 text-sm font-medium text-slate-800">{cat.name}</span>
                {cat.product_count > 0 && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                    {cat.product_count} producto{cat.product_count !== 1 ? 's' : ''}
                  </span>
                )}
                <button onClick={() => startEdit(cat)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-violet-600 hover:border-violet-200 transition-colors cursor-pointer">
                  <Pencil size={11} /> Renombrar
                </button>
                <button onClick={() => setDeletingId(cat.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-400 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer">
                  <Trash2 size={11} /> Eliminar
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <p className="text-xs text-slate-400">
          Al eliminar una categoría, los productos asignados quedan sin categoría y pueden reasignarse después.
        </p>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PESTAÑA: SISTEMA
// ══════════════════════════════════════════════════════════════
function TabSistema() {
  return (
    <Card icon={<Info size={15} />} title="Acerca del sistema">
      <div className="space-y-2 text-sm text-slate-500">
        {[
          ['Versión',        <span className="font-mono">PYFIX POS v3.0</span>],
          ['Modo',           <span className="text-amber-600 font-semibold">Desarrollo</span>],
          ['Base de datos',  <span className="font-mono">SQLite (local)</span>],
          ['API',            <span className="font-mono text-xs">{import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8765/api'}</span>],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
            <span className="font-medium text-slate-600">{label}</span>
            {value}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════
const TABS = [
  { id: 'negocio',    label: 'Negocio',    icon: <Store      size={15} /> },
  { id: 'categorias', label: 'Categorías', icon: <Tag        size={15} /> },
  { id: 'usuarios',   label: 'Usuarios',   icon: <ShieldCheck size={15} /> },
  { id: 'hardware',   label: 'Hardware',   icon: <Cpu        size={15} /> },
  { id: 'sistema',    label: 'Sistema',    icon: <Info       size={15} /> },
]

export default function Settings() {
  const [tab, setTab] = useState('negocio')

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-3xl mx-auto p-6 space-y-5">

        {/* Cabecera */}
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <SettingsIcon size={20} className="text-blue-500" />
            Configuración
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Ajustes del negocio, usuarios y hardware</p>
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        {tab === 'negocio'    && <TabNegocio    />}
        {tab === 'categorias' && <TabCategorias />}
        {tab === 'usuarios'   && <TabUsuarios   />}
        {tab === 'hardware'   && <TabHardware   />}
        {tab === 'sistema'    && <TabSistema    />}

      </div>
    </div>
  )
}
