import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth.jsx'
import { LicenseProvider, useLicense } from '@/hooks/useLicense.jsx'
import { getLowStockProducts } from './services/api.js'
import Activation  from './pages/Activation.jsx'
import TrialBanner from './components/TrialBanner.jsx'
import Dashboard     from './pages/Dashboard.jsx'
import POS           from './pages/POS.jsx'
import Products      from './pages/Products.jsx'
import Inventory     from './pages/Inventory.jsx'
import Sales         from './pages/Sales.jsx'
import CashRegister  from './pages/CashRegister.jsx'
import Categories    from './pages/Categories.jsx'
import Suppliers     from './pages/Suppliers.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Customers     from './pages/Customers.jsx'
import Reports       from './pages/Reports.jsx'
import Settings      from './pages/Settings.jsx'
import Login         from './pages/Login.jsx'
import {
  LayoutDashboard, ShoppingCart, Package,
  Boxes, ClipboardList, Vault, Tag, Truck, PackageCheck,
  Users as UsersIcon, FileBarChart2, Settings as SettingsIcon,
  LogOut,
} from 'lucide-react'

// ── Rol → acceso ────────────────────────────────────────────
const ROLE_ROUTES = {
  admin:      ['/', '/pos', '/products', '/categories', '/inventory', '/sales', '/customers', '/suppliers', '/purchases', '/caja', '/reports', '/settings'],
  supervisor: ['/', '/pos', '/products', '/inventory', '/sales', '/customers', '/caja', '/reports'],
  cashier:    ['/pos'],
  accountant: ['/', '/reports', '/inventory', '/sales'],
  warehouse:  ['/', '/inventory', '/products', '/purchases', '/suppliers'],
}

function canAccess(user, path) {
  const roleRoutes = ROLE_ROUTES[user?.role] ?? []
  if (roleRoutes.includes(path)) return true
  return (user?.permissions ?? []).includes(path)
}

function defaultRoute(role) {
  return role === 'cashier' ? '/pos' : '/'
}

// ── Sidebar nav — agrupado ────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Operaciones',
    items: [
      { to: '/pos',   icon: <ShoppingCart size={17} />, label: 'Caja (POS)',   roles: ['admin', 'supervisor', 'cashier'] },
      { to: '/caja',  icon: <Vault        size={17} />, label: 'Turno / Caja', roles: ['admin', 'supervisor', 'cashier'] },
      { to: '/sales', icon: <ClipboardList size={17}/>, label: 'Ventas',       roles: ['admin', 'supervisor', 'accountant'] },
      { to: '/customers', icon: <UsersIcon size={17}/>, label: 'Clientes',     roles: ['admin', 'supervisor'] },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/products',  icon: <Package    size={17} />, label: 'Productos',         roles: ['admin', 'supervisor', 'warehouse'] },
      { to: '/inventory', icon: <Boxes      size={17} />, label: 'Inventario', badge: true, roles: ['admin', 'supervisor', 'accountant', 'warehouse'] },
      { to: '/suppliers', icon: <Truck      size={17} />, label: 'Proveedores',        roles: ['admin', 'warehouse'] },
      { to: '/purchases', icon: <PackageCheck size={17}/>, label: 'Órdenes de Compra', roles: ['admin', 'warehouse'] },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { to: '/',        end: true, icon: <LayoutDashboard size={17} />, label: 'Dashboard', roles: ['admin', 'supervisor', 'accountant', 'warehouse'] },
      { to: '/reports',            icon: <FileBarChart2   size={17} />, label: 'Reportes',  roles: ['admin', 'supervisor', 'accountant'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/settings', icon: <SettingsIcon size={17} />, label: 'Configuración', roles: ['admin'] },
    ],
  },
]

// ── Componentes auxiliares ────────────────────────────────────
function LowStockBadge() {
  const { data } = useQuery({
    queryKey: ['low-stock-count'],
    queryFn:  getLowStockProducts,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
  if (!data?.count) return null
  return (
    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
      {data.count}
    </span>
  )
}

function ProtectedRoute({ path, element }) {
  const { user } = useAuth()
  if (!canAccess(user, path)) {
    return <Navigate to={defaultRoute(user?.role)} replace />
  }
  return element
}

// ── Vista cajero: solo POS, sin sidebar ─────────────────────
function CashierLayout() {
  const { user, logout } = useAuth()
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-extrabold text-sm tracking-tight">PYFIX POS</span>
          <span className="text-slate-400 text-xs">·</span>
          <span className="text-slate-300 text-sm font-semibold">{user?.full_name}</span>
          <span className="text-xs bg-blue-600/30 text-blue-300 font-bold px-2 py-0.5 rounded-full">Cajero</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut size={14} /> Salir
        </button>
      </header>
      <main className="flex-1 overflow-hidden">
        <POS />
      </main>
    </div>
  )
}

// ── Vista admin/supervisor: sidebar completo ─────────────────
function AdminLayout() {
  const { user, logout }  = useAuth()
  const { canUseReports } = useLicense()

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.to === '/reports' && !canUseReports) return false
      return canAccess(user, item.to)
    }),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex h-screen overflow-hidden">

      {/* Sidebar */}
      <aside className="flex flex-col w-52 shrink-0 bg-slate-900 border-r border-slate-800">

        {/* Logo + usuario */}
        <div className="px-4 py-4 border-b border-slate-800">
          <span className="text-white font-extrabold text-base tracking-tight">PYFIX POS</span>
          <span className="block text-slate-500 text-xs mt-0.5">v3.0</span>
        </div>

        {/* Banner licencia */}
        <TrialBanner />

        {/* Links agrupados */}
        <nav className="flex flex-col p-2 flex-1 overflow-y-auto gap-4">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, end, icon, label, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`
                    }
                  >
                    {icon}
                    {label}
                    {badge && <LowStockBadge />}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Pie: usuario + salir */}
        <div className="px-2 pb-2 border-t border-slate-800 pt-2">
          <div className="px-3 py-2 mt-1">
            <p className="text-xs text-slate-300 font-semibold truncate">{user?.full_name}</p>
            <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/"           element={<ProtectedRoute path="/"           element={<Dashboard      />} />} />
          <Route path="/pos"        element={<ProtectedRoute path="/pos"        element={<POS            />} />} />
          <Route path="/products"   element={<ProtectedRoute path="/products"   element={<Products       />} />} />
          <Route path="/inventory"  element={<ProtectedRoute path="/inventory"  element={<Inventory      />} />} />
          <Route path="/sales"      element={<ProtectedRoute path="/sales"      element={<Sales          />} />} />
          <Route path="/caja"       element={<ProtectedRoute path="/caja"       element={<CashRegister   />} />} />
          <Route path="/customers"  element={<ProtectedRoute path="/customers"  element={<Customers      />} />} />
          <Route path="/suppliers"  element={<ProtectedRoute path="/suppliers"  element={<Suppliers      />} />} />
          <Route path="/purchases"  element={<ProtectedRoute path="/purchases"  element={<PurchaseOrders />} />} />
          <Route path="/reports"    element={<ProtectedRoute path="/reports"    element={<Reports        />} />} />
          <Route path="/settings"   element={<ProtectedRoute path="/settings"   element={<Settings       />} />} />
          <Route path="*"           element={<Navigate to={defaultRoute(user?.role)} replace />} />
        </Routes>
      </main>
    </div>
  )
}

// ── Root: decide qué layout mostrar ─────────────────────────
function AppShell() {
  const { isAuth, user }                    = useAuth()
  const { isActivated } = useLicense()

  // 1. Sin licencia activada → pantalla de activación
  if (!isActivated) return <Activation />

  // 2. Sin login → pantalla de login
  if (!isAuth) return <Login />

  // 3. Cajero sin permisos extra → layout mínimo
  if (user?.role === 'cashier' && (user?.permissions ?? []).length === 0) return (
    <BrowserRouter>
      <CashierLayout />
    </BrowserRouter>
  )

  return (
    <BrowserRouter>
      <AdminLayout />
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <LicenseProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </LicenseProvider>
  )
}
