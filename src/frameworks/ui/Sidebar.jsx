import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, X, Sun, Moon, Search } from 'lucide-react'
import { useTheme } from '../state/ThemeContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { rolesFor } from './roleAccess.js'
import { NAV_ITEMS, OPEN_PALETTE_EVENT } from './nav.js'

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
    } catch { /* almacenamiento no disponible */ }
    logout()
    navigate('/', { replace: true })
  }

  function abrirPaleta() {
    onClose?.()
    window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
  }

  const ItemLink = ({ to, label, icon: Icon }) => (
    <NavLink
      to={to}
      onClick={() => onClose?.()}
      end={to === '/admin/dashboard'}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${
          isActive
            ? 'bg-[#A85638]/10 text-[#A85638] dark:bg-[#A85638]/25 dark:text-[#F6EEE3]'
            : 'text-slate-600 dark:text-slate-300 hover:bg-[#A85638]/5 dark:hover:bg-slate-800'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-[#C99A3C]" />}
          <Icon size={18} className="flex-shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )

  // Filtrar por rol de la sesión y agrupar
  const role = session?.role
  const visibles = NAV_ITEMS.filter((it) => role && rolesFor(it.to).includes(role))
  const groups = visibles.reduce((acc, it) => {
    (acc[it.group] = acc[it.group] || []).push(it)
    return acc
  }, {})

  const content = (
    <div className="h-full w-64 flex flex-col bg-[#FFFCF5] dark:bg-slate-900 border-r border-[#E5D9C9] dark:border-slate-800">
      {/* Header / marca */}
      <div className="px-4 pt-5 pb-4 flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="boho-arch w-11 h-12 bg-gradient-to-b from-[#A85638] to-[#8F4527] text-[#F6EEE3] flex items-center justify-center font-display font-bold text-base shadow-md shrink-0">
            SF
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight text-slate-900 dark:text-slate-50 truncate">Santa Fe</p>
            <p className="text-[10px] text-[#C99A3C] uppercase tracking-[0.22em] font-bold">Casa · Cocina</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 rounded-lg hover:bg-[#A85638]/5 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="boho-divider text-xs select-none" aria-hidden="true">❋</div>
      </div>

      {/* Buscador rápido (⌘K) */}
      <div className="px-3 pb-2">
        <button
          onClick={abrirPaleta}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-sm text-slate-400 dark:text-slate-500 ring-1 ring-[#E5D9C9] dark:ring-slate-700 hover:ring-[#A85638]/40 hover:text-slate-600 dark:hover:text-slate-300 transition-all bg-[#FAF4EA]/60 dark:bg-slate-950/40"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left">Ir a…</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      {/* Items */}
      <nav className="flex-1 p-3 pt-1 space-y-4 overflow-y-auto">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <p className="px-3 mb-1 text-[10px] uppercase tracking-[0.2em] font-bold text-[#C99A3C]">{group}</p>
            <div className="space-y-1">
              {items.map(it => <ItemLink key={it.to} {...it} />)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#E5D9C9] dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className={`text-xs font-semibold inline-flex items-center gap-1.5 ${connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-600 animate-pulse' : 'bg-slate-300'}`} />
            {connected ? 'En vivo' : 'Sin conexión'}
          </span>
          <button
            onClick={toggle}
            className="w-8 h-8 rounded-lg hover:bg-[#A85638]/5 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors"
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
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
          <div className="absolute inset-0 bg-[#2C2118]/55 backdrop-blur-sm" onClick={onClose} />
          <div className="relative h-full animate-[slideIn_.18s_ease-out]">{content}</div>
        </div>
      )}
    </>
  )
}
