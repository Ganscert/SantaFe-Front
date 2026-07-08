import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Building2, ArrowLeft, Loader2, AlertCircle, Users, Utensils, LayoutGrid,
  TrendingUp, Receipt, Download, RotateCcw, Pencil, Check, X, Activity,
  CircleDollarSign, CreditCard, MapPin,
} from 'lucide-react'
import { db, RESTAURANTE_ID } from '../../adapters/db.js'
import { buildCSV, downloadCSV, csvFilename } from '../../adapters/csv.js'
import { useToast } from '../state/ToastContext.jsx'

const fmtMoney = (n) => `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const ESTADO_MESA = {
  disponible: { label: 'Disponible', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  ocupada:    { label: 'Ocupada',    cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  por_cobrar: { label: 'Por cobrar', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300' },
}

const ROLE_CLS = {
  admin:         'bg-[#A85638]/10 text-[#A85638] dark:bg-[#A85638]/25 dark:text-[#F6EEE3]',
  gerente:       'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300',
  recepcionista: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  mesero:        'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cocinero:      'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  cajero:        'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  cliente:       'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
}

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        <Icon size={12} className="text-[#7D8B6A]" /> {label}
      </div>
      <p className="mt-1.5 text-xl font-black text-slate-900 dark:text-slate-50">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Seccion({ titulo, sub, accion, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="font-bold">{titulo}</h3>
          {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

function Vacio({ texto }) {
  return <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{texto}</p>
}

export default function AdminRestaurante() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  // loading derivado: aún no se cargó el detalle del id solicitado.
  const [loadedId, setLoadedId] = useState(null)
  const loading = loadedId !== id
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const toast = useToast()

  function cargar() {
    setError('')
    db.restaurantes.detail(id)
      .then((d) => { setData(d); setNombre(d?.nombre ?? '') })
      .catch((e) => setError(e.message || 'No se pudo cargar el restaurante.'))
      .finally(() => setLoadedId(id))
  }

  useEffect(() => {
    let cancelled = false
    db.restaurantes.detail(id)
      .then((d) => { if (!cancelled) { setData(d); setNombre(d?.nombre ?? '') } })
      .catch((e) => { if (!cancelled) setError(e.message || 'No se pudo cargar el restaurante.') })
      .finally(() => { if (!cancelled) setLoadedId(id) })
    return () => { cancelled = true }
  }, [id])

  async function renombrar(e) {
    e.preventDefault()
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    try {
      await db.restaurantes.update(id, { nombre: nombre.trim() })
      toast.success('Nombre actualizado.')
      setEditando(false)
      cargar()
    } catch (err) {
      toast.error(err.message || 'No se pudo renombrar.')
    } finally {
      setGuardando(false)
    }
  }

  function exportarEquipo() {
    downloadCSV(csvFilename(`equipo-${data.nombre}`), buildCSV(
      ['Nombre', 'Email', 'Rol', 'Activo', 'Alta'],
      data.usuarios.map(u => [u.nombre, u.email, u.role, u.activo ? 'sí' : 'no', new Date(u.creado_en).toLocaleDateString('es-PE')]),
    ))
  }

  function exportarMenu() {
    downloadCSV(csvFilename(`menu-${data.nombre}`), buildCSV(
      ['Plato', 'Categoría', 'Precio', 'Disponible'],
      data.platos.map(p => [p.nombre, p.categoria ?? '', Number(p.precio).toFixed(2), p.disponible ? 'sí' : 'no']),
    ))
  }

  function exportarCobros() {
    const mesaPorId = new Map(data.mesas.map(m => [m.id, m.numero_mesa]))
    downloadCSV(csvFilename(`cobros-${data.nombre}`), buildCSV(
      ['Fecha', 'Mesa', 'Método', 'Monto', 'Referencia'],
      data.pagos.map(p => [fmtFecha(p.creado_en), mesaPorId.get(p.mesa_id) ?? '—', p.metodo, Number(p.monto).toFixed(2), p.referencia ?? '']),
    ))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400">
        <Loader2 size={26} className="animate-spin mr-2" /> Cargando restaurante…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="rounded-3xl bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/30 p-6 text-red-700 dark:text-red-300">
          <AlertCircle size={20} className="mb-1.5" />
          <p className="font-bold text-sm">{error || 'Restaurante no encontrado.'}</p>
          <Link to="/admin/plataforma" className="inline-flex items-center gap-1 mt-3 text-xs font-bold hover:underline">
            <ArrowLeft size={12} /> Volver a la plataforma
          </Link>
        </div>
      </div>
    )
  }

  const esActivo = data.id === RESTAURANTE_ID
  const staff = data.usuarios.filter(u => u.role !== 'cliente')
  const clientes = data.usuarios.length - staff.length
  const disponibles = data.platos.filter(p => p.disponible).length

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3 pl-16 lg:pl-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin/plataforma" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center gap-1 text-sm font-semibold shrink-0">
              <ArrowLeft size={16} /> <span className="hidden sm:inline">Plataforma</span>
            </Link>
            <span className="hidden sm:block text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-[#A85638] text-white flex items-center justify-center shrink-0">
                <Building2 size={15} />
              </span>
              {editando ? (
                <form onSubmit={renombrar} className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="px-2 py-1 rounded-lg text-sm font-bold bg-white dark:bg-slate-950 border border-[#A85638] text-slate-800 dark:text-slate-100 focus:outline-none w-44"
                  />
                  <button type="submit" disabled={guardando} className="text-emerald-600 hover:text-emerald-700"><Check size={15} /></button>
                  <button type="button" onClick={() => { setEditando(false); setNombre(data.nombre) }} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
                </form>
              ) : (
                <>
                  <h1 className="text-base font-bold truncate">{data.nombre}</h1>
                  <button onClick={() => setEditando(true)} title="Renombrar" className="text-slate-400 hover:text-[#A85638] transition-colors shrink-0">
                    <Pencil size={13} />
                  </button>
                </>
              )}
              {esActivo && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                  Activo
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => { setLoadedId(null); cargar() }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#A85638] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <RotateCcw size={12} /> Refrescar
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* KPIs 30 días */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={TrendingUp} label="Ventas 30d" value={fmtMoney(data.kpis.ventas30d)} sub={`${data.kpis.cobros30d} cobros`} />
          <Kpi icon={Receipt}    label="Pedidos 30d" value={data.kpis.pedidos30d} sub={`${data.kpis.pedidosActivos} activos ahora`} />
          <Kpi icon={LayoutGrid} label="Mesas" value={data.mesas.length} sub={`${data.mesas.filter(m => m.estado !== 'disponible').length} en uso`} />
          <Kpi icon={Users}      label="Usuarios" value={data.usuarios.length} sub={`${staff.length} staff · ${clientes} clientes`} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Mesas */}
          <Seccion titulo="Mesas" sub={`${data.mesas.length} registradas · ${(data.zonas?.length ?? 0)} zona${(data.zonas?.length ?? 0) !== 1 ? 's' : ''}`}>
            {!data.mesas.length ? <Vacio texto="Este restaurante aún no tiene mesas." /> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.mesas.map((m) => {
                  const meta = ESTADO_MESA[m.estado] ?? ESTADO_MESA.disponible
                  const zonaNombre = data.zonas?.find(z => z.id === m.zona_id)?.nombre
                  return (
                    <div key={m.id} className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-black">Mesa {m.numero_mesa}</span>
                        <span className="text-[10px] text-slate-400">{m.capacidad}p</span>
                      </div>
                      <span className={`inline-block mt-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {zonaNombre && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-[#5f6b4e] dark:text-[#AEBC97]">
                          <MapPin size={9} /> {zonaNombre}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Seccion>

          {/* Equipo */}
          <Seccion
            titulo="Equipo y usuarios"
            sub={`${staff.length} staff · ${clientes} clientes`}
            accion={
              <button onClick={exportarEquipo} disabled={!data.usuarios.length} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#A85638] hover:bg-[#A85638]/5 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                <Download size={12} /> CSV
              </button>
            }
          >
            {!data.usuarios.length ? <Vacio texto="Sin usuarios registrados." /> : (
              <ul className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {data.usuarios.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
                    <span className="w-8 h-8 rounded-lg bg-[#7D8B6A]/15 text-[#7D8B6A] dark:text-[#AEBC97] flex items-center justify-center font-black text-xs shrink-0">
                      {u.nombre.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{u.nombre} {!u.activo && <span className="text-[10px] text-red-500 font-black">· inactivo</span>}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{u.email}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${ROLE_CLS[u.role] ?? ROLE_CLS.cliente}`}>
                      {u.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {/* Menú */}
          <Seccion
            titulo="Menú"
            sub={`${data.platos.length} platos · ${disponibles} disponibles`}
            accion={
              <button onClick={exportarMenu} disabled={!data.platos.length} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#A85638] hover:bg-[#A85638]/5 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                <Download size={12} /> CSV
              </button>
            }
          >
            {!data.platos.length ? <Vacio texto="Sin platos en el menú." /> : (
              <ul className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {data.platos.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
                    <span
                      className="w-8 h-8 rounded-lg shrink-0 ring-1 ring-slate-200 dark:ring-slate-700 bg-cover bg-center flex items-center justify-center text-[10px] font-black text-white"
                      style={{
                        backgroundImage: p.imagen_url ? `url(${p.imagen_url})` : undefined,
                        backgroundColor: p.imagen_url ? undefined : '#7D8B6A',
                      }}
                    >
                      {!p.imagen_url && <Utensils size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{p.nombre}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{p.categoria ?? 'Sin categoría'}</p>
                    </div>
                    <span className="text-sm font-black text-[#A85638] dark:text-[#C99A3C] shrink-0">{fmtMoney(p.precio)}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.disponible ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} title={p.disponible ? 'Disponible' : 'No disponible'} />
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {/* Cobros recientes */}
          <Seccion
            titulo="Cobros recientes"
            sub="Últimos 50 pagos registrados"
            accion={
              <button onClick={exportarCobros} disabled={!data.pagos.length} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#A85638] hover:bg-[#A85638]/5 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
                <Download size={12} /> CSV
              </button>
            }
          >
            {!data.pagos.length ? <Vacio texto="Sin cobros registrados." /> : (
              <ul className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {data.pagos.map((p) => {
                  const Icon = p.metodo === 'efectivo' ? CircleDollarSign : CreditCard
                  const numero = data.mesas.find(m => m.id === p.mesa_id)?.numero_mesa
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
                      <span className="w-8 h-8 rounded-lg bg-[#A85638]/10 dark:bg-[#A85638]/20 text-[#A85638] dark:text-[#C99A3C] flex items-center justify-center shrink-0">
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">Mesa {numero ?? '—'} <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">· {p.metodo}</span></p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{fmtFecha(p.creado_en)}</p>
                      </div>
                      <span className="text-sm font-black text-[#A85638] dark:text-[#C99A3C] shrink-0">{fmtMoney(p.monto)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Seccion>
        </div>

        {/* Actividad */}
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 justify-center pb-4">
          <Activity size={11} />
          Restaurante creado el {new Date(data.creado_en).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </main>
    </div>
  )
}
