import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Eye, Undo2 } from 'lucide-react'
import Sidebar from './Sidebar.jsx'
import CommandPalette from './CommandPalette.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { defaultHomeForRole } from './RequireAuth.jsx'

// Aviso fijo mientras el admin navega la app con otro rol ("ver como").
function ViewAsBanner() {
  const { session, setViewAs } = useAuth()
  const navigate = useNavigate()
  const impersonando = session?.realRole === 'admin' && session.role !== 'admin'
  if (!impersonando) return null

  function volver() {
    setViewAs(null)
    navigate(defaultHomeForRole('admin'), { replace: true })
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-[#2C2118]/95 text-[#F6EEE3] shadow-xl ring-1 ring-[#C99A3C]/50 backdrop-blur">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold">
        <Eye size={13} className="text-[#C99A3C]" />
        Viendo como <span className="uppercase tracking-wider text-[#C99A3C]">{session.role}</span>
      </span>
      <button
        onClick={volver}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#C99A3C] hover:bg-[#B3872F] text-[#2C2118] text-xs font-black transition-colors"
      >
        <Undo2 size={12} /> Volver a admin
      </button>
    </div>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <CommandPalette />
      <ViewAsBanner />

      {/* Hamburger flotante (solo móvil/tablet) */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-2.5 left-2.5 z-40 w-10 h-10 rounded-xl bg-[#FFFCF5]/90 dark:bg-slate-800/90 backdrop-blur shadow-md ring-1 ring-[#E5D9C9] dark:ring-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-[#FFFCF5] dark:hover:bg-slate-800 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      {/* Contenido — fade-in al cambiar de ruta para evitar el flash en blanco */}
      <div className="lg:pl-64">
        <div key={location.pathname} className="route-fade">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
