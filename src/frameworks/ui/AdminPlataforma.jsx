import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2, Plus, Loader2, AlertCircle, Users, Utensils, LayoutGrid,
  TrendingUp, Trash2, Pencil, Eye, ArrowRight, RotateCcw, Check, X, Receipt,
} from 'lucide-react'
import { db, RESTAURANTE_ID } from '../../adapters/db.js'
import { useAuth } from '../state/AuthContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { defaultHomeForRole } from './RequireAuth.jsx'

const fmtMoney = (n) => `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const ROLE_LABELS = {
  gerente: 'Gerente', recepcionista: 'Recepcionista', mesero: 'Mesero',
  cocinero: 'Cocinero', cajero: 'Cajero', cliente: 'Cliente',
}

function KpiGlobal({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-[#A85638]/10 dark:bg-[#A85638]/20 text-[#A85638] dark:text-[#C99A3C] flex items-center justify-center shrink-0">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-lg font-black text-slate-900 dark:text-slate-50 leading-tight truncate">{value}</p>
      </div>
    </div>
  )
}

function StatMini({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Icon size={12} className="text-[#7D8B6A]" />
      <span className="font-bold text-slate-700 dark:text-slate-200">{value}</span> {label}
    </div>
  )
}

// Cambio rápido de vista por rol — el banner de AppShell permite volver.
function SelectorRol() {
  const { setViewAs } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  function verComo(role) {
    setViewAs(role)
    toast.info(`Viendo la plataforma como ${ROLE_LABELS[role] ?? role}.`)
    navigate(defaultHomeForRole(role))
  }

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Eye size={15} className="text-[#C99A3C]" />
        <h3 className="font-bold">Cambiar de vista</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Navega la plataforma con los ojos de cualquier rol. Tu sesión de admin se mantiene; vuelve desde el aviso flotante.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <button
            key={role}
            onClick={() => verComo(role)}
            className="px-3 py-1.5 rounded-full text-xs font-bold ring-1 ring-[#E5D9C9] dark:ring-slate-700 text-slate-600 dark:text-slate-300 hover:bg-[#A85638] hover:text-white hover:ring-[#A85638] transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function FormCrear({ onCreado }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [mesas, setMesas] = useState(8)
  const [guardando, setGuardando] = useState(false)
  const toast = useToast()

  async function crear(e) {
    e.preventDefault()
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    try {
      const r = await db.restaurantes.create({ nombre: nombre.trim(), mesas_iniciales: mesas })
      toast.success(`Restaurante “${r.nombre}” creado.`)
      setNombre(''); setMesas(8); setAbierto(false)
      onCreado()
    } catch (err) {
      toast.error(err.message || 'No se pudo crear el restaurante.')
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#A85638] hover:bg-[#8F4527] text-white text-xs font-bold transition-colors"
      >
        <Plus size={14} /> Nuevo restaurante
      </button>
    )
  }

  return (
    <form onSubmit={crear} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del restaurante"
        className="px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#A85638] w-52"
      />
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Mesas
        <input
          type="number" min={0} max={50}
          value={mesas}
          onChange={(e) => setMesas(Number(e.target.value))}
          className="w-16 px-2 py-2 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#A85638]"
        />
      </label>
      <button
        type="submit"
        disabled={!nombre.trim() || guardando}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#7D8B6A] hover:bg-[#69765A] disabled:opacity-50 text-white text-xs font-bold transition-colors"
      >
        {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Crear
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="px-2 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <X size={14} />
      </button>
    </form>
  )
}

function TarjetaRestaurante({ r, onRefrescar }) {
  const esActivo = r.id === RESTAURANTE_ID
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(r.nombre)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()

  async function renombrar(e) {
    e.preventDefault()
    if (!nombre.trim() || ocupado) return
    setOcupado(true)
    try {
      await db.restaurantes.update(r.id, { nombre: nombre.trim() })
      toast.success('Nombre actualizado.')
      setEditando(false)
      onRefrescar()
    } catch (err) {
      toast.error(err.message || 'No se pudo renombrar.')
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar() {
    if (ocupado) return
    setOcupado(true)
    try {
      await db.restaurantes.remove(r.id)
      toast.success(`Restaurante “${r.nombre}” eliminado.`)
      onRefrescar()
    } catch (err) {
      toast.error(err.message || 'No se pudo eliminar.')
      setConfirmando(false)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="boho-arch w-11 h-12 bg-gradient-to-b from-[#A85638] to-[#8F4527] text-[#F6EEE3] flex items-center justify-center shrink-0">
            <Building2 size={17} />
          </span>
          <div className="min-w-0">
            {editando ? (
              <form onSubmit={renombrar} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="px-2 py-1 rounded-lg text-sm font-bold bg-white dark:bg-slate-950 border border-[#A85638] text-slate-800 dark:text-slate-100 focus:outline-none w-40"
                />
                <button type="submit" disabled={ocupado} className="text-emerald-600 hover:text-emerald-700"><Check size={15} /></button>
                <button type="button" onClick={() => { setEditando(false); setNombre(r.nombre) }} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
              </form>
            ) : (
              <p className="font-display text-lg leading-tight text-slate-900 dark:text-slate-50 truncate">{r.nombre}</p>
            )}
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">
              Desde {new Date(r.creado_en).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        {esActivo && (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
            Activo
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <StatMini icon={LayoutGrid} label="mesas"    value={r.stats.mesas} />
        <StatMini icon={Utensils}   label="platos"   value={r.stats.platos} />
        <StatMini icon={Users}      label="usuarios" value={r.stats.usuarios} />
        <StatMini icon={Receipt}    label="pedidos 30d" value={r.stats.pedidos30d} />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-1 text-sm font-black text-[#A85638] dark:text-[#C99A3C]">
          <TrendingUp size={13} /> {fmtMoney(r.stats.ventas30d)}
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">/ 30d</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditando(true)}
            title="Renombrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#A85638] hover:bg-[#A85638]/5 dark:hover:bg-slate-800 transition-colors"
          >
            <Pencil size={14} />
          </button>
          {!esActivo && (confirmando ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
              ¿Borrar todo?
              <button onClick={eliminar} disabled={ocupado} className="px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700">Sí</button>
              <button onClick={() => setConfirmando(false)} className="px-1.5 py-0.5 rounded ring-1 ring-slate-300 dark:ring-slate-600">No</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              title="Eliminar restaurante"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          ))}
          <Link
            to={`/admin/plataforma/${r.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#A85638]/10 dark:bg-[#A85638]/20 text-[#A85638] dark:text-[#F6EEE3] text-xs font-bold hover:bg-[#A85638] hover:text-white transition-colors"
          >
            Administrar <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AdminPlataforma() {
  const [restaurantes, setRestaurantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function cargar() {
    setError('')
    db.restaurantes.list()
      .then((rows) => setRestaurantes(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message || 'No se pudo cargar la plataforma.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    db.restaurantes.list()
      .then((rows) => { if (!cancelled) setRestaurantes(Array.isArray(rows) ? rows : []) })
      .catch((e) => { if (!cancelled) setError(e.message || 'No se pudo cargar la plataforma.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const totales = restaurantes.reduce(
    (acc, r) => ({
      usuarios: acc.usuarios + r.stats.usuarios,
      ventas:   acc.ventas + r.stats.ventas30d,
      pedidos:  acc.pedidos + r.stats.pedidos30d,
    }),
    { usuarios: 0, ventas: 0, pedidos: 0 },
  )

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3 pl-16 lg:pl-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#A85638] text-white flex items-center justify-center">
              <Building2 size={15} />
            </span>
            <span className="font-bold text-sm">Panel de plataforma</span>
          </div>
          <button
            onClick={() => { setLoading(true); cargar() }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#A85638] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw size={12} /> Refrescar
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#A85638] dark:text-[#C99A3C]">Administración informática</p>
            <h2 className="text-2xl sm:text-3xl font-black mt-1">Toda la plataforma, en un lugar</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Restaurantes, equipos y actividad de los últimos 30 días.
            </p>
          </div>
          <FormCrear onCreado={cargar} />
        </div>

        {/* KPIs globales */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiGlobal icon={Building2}  label="Restaurantes"  value={restaurantes.length} />
          <KpiGlobal icon={Users}      label="Usuarios"      value={totales.usuarios} />
          <KpiGlobal icon={Receipt}    label="Pedidos 30d"   value={totales.pedidos} />
          <KpiGlobal icon={TrendingUp} label="Ventas 30d"    value={fmtMoney(totales.ventas)} />
        </section>

        <SelectorRol />

        {/* Restaurantes */}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500 dark:text-slate-400">
            <Loader2 size={24} className="mx-auto animate-spin mb-2" /> Cargando plataforma…
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/30 p-6 text-red-700 dark:text-red-300">
            <AlertCircle size={20} className="mb-1.5" />
            <p className="font-bold text-sm">No se pudo cargar la plataforma</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {restaurantes.map((r) => (
              <TarjetaRestaurante key={r.id} r={r} onRefrescar={cargar} />
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
