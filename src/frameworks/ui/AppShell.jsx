import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar.jsx'
import CommandPalette from './CommandPalette.jsx'

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <CommandPalette />

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
