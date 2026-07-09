import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Eye, Undo2, Building2, ChevronDown, LayoutPanelLeft } from 'lucide-react'
import Sidebar from './Sidebar.jsx'
import CommandPalette from './CommandPalette.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { useRestaurante } from '../state/RestauranteContext.jsx'
import { db, RESTAURANTE_ID } from '../../adapters/db.js'
import { track, describirClick } from '../../adapters/track.js'
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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-[#0F172A]/95 text-[#EEF2FF] shadow-xl ring-1 ring-[#818CF8]/50 backdrop-blur">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold">
        <Eye size={13} className="text-[#818CF8]" />
        Viendo como <span className="uppercase tracking-wider text-[#818CF8]">{session.role}</span>
      </span>
      <button
        onClick={volver}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-black transition-colors"
      >
        <Undo2 size={12} /> Volver a admin
      </button>
    </div>
  )
}

// ── Contexto de auditoría ─────────────────────────────────────────────────────
// Barra fija superior, sólo para el ADMIN: recuerda y muestra en todo momento
// qué restaurante se está auditando, y permite cambiar de sede sin perderse.
function AuditBar() {
  const { esAdmin, restauranteActivo, setRestauranteActivo } = useRestaurante()
  const [restaurantes, setRestaurantes] = useState([])

  // Lista de sedes para el selector (sólo se pide siendo admin).
  useEffect(() => {
    if (!esAdmin) return
    let cancelled = false
    db.restaurantes.list()
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setRestaurantes(rows) })
      .catch(() => { /* la barra funciona igual sin la lista */ })
    return () => { cancelled = true }
  }, [esAdmin])

  if (!esAdmin) return null

  const base = restaurantes.find(r => r.id === RESTAURANTE_ID)
  const nombreMostrado = restauranteActivo?.nombre ?? base?.nombre ?? 'Sede principal'
  const idActual = restauranteActivo?.id ?? RESTAURANTE_ID

  function cambiar(e) {
    const id = e.target.value
    const rest = restaurantes.find(r => r.id === id)
    if (!rest) return
    // Volver a la sede base = quitar el override.
    setRestauranteActivo(rest.id === RESTAURANTE_ID ? null : { id: rest.id, nombre: rest.nombre })
    track('accion', `Cambió la auditoría a "${rest.nombre}"`)
  }

  return (
    <div className="fixed top-0 right-0 left-0 lg:left-64 z-40 h-9 flex items-center gap-2 px-3 sm:px-4 bg-[#0F172A]/95 dark:bg-[#020617]/95 text-slate-200 backdrop-blur border-b border-white/10 text-xs">
      <span className="inline-flex items-center gap-1.5 min-w-0 font-bold">
        <Building2 size={12} className="text-[#818CF8] shrink-0" />
        <span className="hidden sm:inline uppercase tracking-widest text-[10px] text-slate-400 shrink-0">Auditando</span>
        <span className="truncate text-white">{nombreMostrado}</span>
      </span>
      {restaurantes.length > 1 && (
        <label className="relative inline-flex items-center ml-1 shrink-0">
          <select
            value={idActual}
            onChange={cambiar}
            aria-label="Cambiar restaurante auditado"
            className="appearance-none bg-white/10 hover:bg-white/15 rounded-md pl-2 pr-6 py-0.5 text-[11px] font-semibold text-slate-100 cursor-pointer focus:outline-none max-w-40 truncate"
          >
            {restaurantes.map(r => (
              <option key={r.id} value={r.id} className="text-slate-900">{r.nombre}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-slate-300" />
        </label>
      )}
      <span className="flex-1" />
      <Link
        to="/admin/plataforma"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-[#A5B4FC] hover:text-white hover:bg-white/10 transition-colors shrink-0"
      >
        <LayoutPanelLeft size={11} /> <span className="hidden sm:inline">Plataforma</span>
      </Link>
    </div>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { esAdmin } = useRestaurante()

  // Auditoría: navegación entre pantallas.
  useEffect(() => {
    track('navegacion', `Visitó ${location.pathname}`, { ruta: location.pathname })
  }, [location.pathname])

  // Auditoría: clics en botones/enlaces (delegado, en captura).
  useEffect(() => {
    function onClick(e) {
      const el = e.target?.closest?.('button, a[href], [role="button"]')
      if (!el) return
      const texto = describirClick(el)
      if (texto) track('click', `Clic: ${texto}`)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return (
    <div className="min-h-screen" style={{ '--sf-topbar': esAdmin ? '36px' : '0px' }}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <CommandPalette />
      <AuditBar />
      <ViewAsBanner />

      {/* Hamburger flotante (solo móvil/tablet) */}
      <button
        onClick={() => setOpen(true)}
        className={`lg:hidden fixed ${esAdmin ? 'top-11' : 'top-2.5'} left-2.5 z-40 w-10 h-10 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur shadow-md ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors`}
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      {/* Contenido — fade-in al cambiar de ruta para evitar el flash en blanco */}
      <div className={`lg:pl-64 ${esAdmin ? 'pt-9' : ''}`}>
        <div key={location.pathname} className="route-fade">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
