import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, ChefHat, PlusCircle, Utensils, UtensilsCrossed,
  ShieldCheck, LogOut, X, Sun, Moon, Users, Receipt, UserCog,
} from 'lucide-react'
import { useTheme } from '../state/ThemeContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { rolesFor } from './roleAccess.js'

const ITEMS = [
  { to: '/admin/dashboard',   label: 'Dashboard',      icon: LayoutDashboard, group: 'Supervisión' },
  { to: '/admin/meseros',     label: 'Meseros',        icon: UserCog,         group: 'Supervisión' },
  { to: '/admin/usuarios',    label: 'Usuarios',       icon: Users,           group: 'Supervisión' },
  { to: '/admin/roles',       label: 'Roles',          icon: ShieldCheck,     group: 'Supervisión' },
  { to: '/mi-mesa',           label: 'Mi mesa',        icon: ClipboardList,   group: 'Operación' },
  { to: '/tablero-mesas',     label: 'Tablero',        icon: ClipboardList,   group: 'Operación' },
  { to: '/cocina/pendientes', label: 'Cocina',         icon: ChefHat,         group: 'Operación' },
  { to: '/cajero/cobros',     label: 'Cobros',         icon: Receipt,         group: 'Operación' },
  { to: '/pedidos/nuevo',     label: 'Nuevo pedido',   icon: PlusCircle,      group: 'Operación' },
  { to: '/menu',              label: 'Menú',           icon: Utensils,        group: 'Catálogo' },
  { to: '/admin/platos',      label: 'Gestionar Menú', icon: UtensilsCrossed, group: 'Catálogo' },
]

export default function Sidebar({ open, onClose }) {
  const { theme, toggle } = useTheme()
  const { connected } = useLiveSync()
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  function cerrarSesion() {
    onClose?.()
    // Limpiar artefactos de sesión QR para que no haya "fugas" al siguiente login
    try {
      localStorage.removeItem('santa-fe:pending-join-token')
      localStorage.removeItem('santa-fe:client-mesa')
    } catch {}
    logout()
    navigate('/', { replace: true })
  }

  const ItemLink = ({ to, label, icon: Icon }) => (
    <NavLink
      to={to}
      onClick={() => onClose?.()}
      end={to === '/admin/dashboard'}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          isActive
            ? 'bg-[#C1440E]/10 text-[#C1440E] dark:bg-[#C1440E]/20 dark:text-[#FDF6EC]'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-[#C1440E]" />}
          <Icon size={18} className="flex-shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )

  // Filtrar por rol de la sesión y agrupar
  const role = session?.role
  const visibles = ITEMS.filter((it) => {
    const allowed = rolesFor(it.to)
    return role && allowed.includes(role)
  })
  const groups = visibles.reduce((acc, it) => {
    (acc[it.group] = acc[it.group] || []).push(it)
    return acc
  }, {})

  const content = (
    <div className="h-full w-60 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Header / brand */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#C1440E] text-white flex items-center justify-center font-black text-sm shadow-sm">SF</span>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-900 dark:text-slate-50 truncate">Santa Fe</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Restaurante</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>

      {/* Items */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <p className="px-3 mb-1 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">{group}</p>
            <div className="space-y-1">
              {items.map(it => <ItemLink key={it.to} {...it} />)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className={`text-xs font-semibold inline-flex items-center gap-1.5 ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            {connected ? 'En vivo' : 'Sin conexión'}
          </span>
          <button
            onClick={toggle}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors"
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        {session && (
          <div className="px-2 pb-1 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 truncate" title={session.email}>
            {session.name} · {session.role}
          </div>
        )}
        <button
          onClick={cerrarSesion}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop: fijo */}
      <aside className="hidden lg:block fixed top-0 left-0 h-screen z-30">
        {content}
      </aside>

      {/* Mobile: drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <div className="relative h-full animate-[slideIn_.18s_ease-out]">{content}</div>
        </div>
      )}
    </>
  )
}
