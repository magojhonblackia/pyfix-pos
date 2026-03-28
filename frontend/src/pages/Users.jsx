import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth.jsx'
import { getUsers, createUser, updateUser, deleteUser } from '@/services/api.js'
import { Plus, Pencil, Trash2, ShieldCheck, X, Eye, EyeOff, AlertCircle } from 'lucide-react'

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
  '/users':      'Usuarios',
  '/hardware':   'Hardware',
  '/settings':   'Configuración',
}

const ROLES = [
  { value: 'admin',      label: 'Administrador', color: 'bg-red-100 text-red-700'       },
  { value: 'supervisor', label: 'Supervisor',     color: 'bg-amber-100 text-amber-700'   },
  { value: 'cashier',    label: 'Cajero',         color: 'bg-blue-100 text-blue-700'     },
  { value: 'accountant', label: 'Contador',       color: 'bg-violet-100 text-violet-700' },
  { value: 'warehouse',  label: 'Almacén',        color: 'bg-green-100 text-green-700'   },
]

function roleInfo(role) {
  return ROLES.find((r) => r.value === role) ?? { label: role, color: 'bg-slate-100 text-slate-600' }
}

// ── Modal crear / editar ──────────────────────────────────────
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
    if (!fullName.trim()) return
    if (!isEdit && !password.trim()) return
    setLoading(true)
    setError('')
    try {
      const body = isEdit
        ? { full_name: fullName.trim(), role, permissions, ...(password ? { password } : {}) }
        : { username: username.trim(), full_name: fullName.trim(), role, password, permissions }
      const data = isEdit ? await updateUser(user.id, body) : await createUser(body)
      onSaved(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm font-semibold">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}

          {/* Username — solo en creación */}
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Usuario</label>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej. cajero2"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* Nombre completo */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre completo</label>
            <input
              type="text"
              autoFocus={isEdit}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ej. María López"
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
            />
          </div>

          {/* Rol */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Contraseña */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Contraseña {isEdit && <span className="font-normal text-slate-400 normal-case">(dejar vacío para no cambiar)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Contraseña inicial'}
                className="w-full px-3 py-2 pr-9 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Permisos adicionales — solo para roles no-admin */}
          {role !== 'admin' && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Permisos adicionales</label>
              <p className="text-xs text-slate-400">Se suman a los permisos del rol seleccionado</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                {Object.entries(ROUTE_LABELS).map(([path, label]) => (
                  <label key={path} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.includes(path)}
                      onChange={(e) => {
                        setPermissions((prev) =>
                          e.target.checked
                            ? [...prev, path]
                            : prev.filter((p) => p !== path)
                        )
                      }}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

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
              disabled={loading || !fullName.trim() || (!isEdit && !username.trim()) || (!isEdit && !password.trim())}
              className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function Users() {
  const { user: me } = useAuth()
  const qc  = useQueryClient()
  const [editing,    setEditing]    = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId,   setDeleteId]   = useState(null)
  const [deleteErr,  setDeleteErr]  = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn:  getUsers,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setDeleteId(null)
    },
    onError: (e) => setDeleteErr(e.message),
  })

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['users'] })
    setEditing(null)
    setShowCreate(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={22} className="text-blue-600" />
            Usuarios
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de acceso al sistema</p>
        </div>
        {me?.role === 'admin' && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors cursor-pointer shadow-lg shadow-blue-600/20"
          >
            <Plus size={16} /> Nuevo usuario
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Estado</th>
                {me?.role === 'admin' && (
                  <th className="px-4 py-3 w-20" />
                )}
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
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${ri.color}`}>
                        {ri.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {me?.role === 'admin' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setEditing(u)}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil size={14} />
                          </button>
                          {u.id !== me?.id && (
                            <button
                              onClick={() => { setDeleteId(u.id); setDeleteErr('') }}
                              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
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

      {/* Modal crear */}
      {showCreate && (
        <UserModal onClose={() => setShowCreate(false)} onSaved={handleSaved} />
      )}

      {/* Modal editar */}
      {editing && (
        <UserModal user={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}

      {/* Confirmar borrado */}
      {deleteId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteId(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs text-center">
            <p className="font-bold text-slate-800 mb-1">¿Eliminar usuario?</p>
            <p className="text-sm text-slate-500 mb-4">Esta acción no se puede deshacer.</p>
            {deleteErr && <p className="text-red-600 text-sm mb-3">{deleteErr}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-400 cursor-pointer"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
