import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Download, Loader2, RotateCcw, Search, AlertTriangle,
  MousePointerClick, Route, Zap, KeyRound, Building2, Database,
} from 'lucide-react'
import { db } from '../../adapters/db.js'
import { buildCSV, downloadCSV, csvFilename } from '../../adapters/csv.js'
import { useToast } from '../state/ToastContext.jsx'

const TIPOS = {
  navegacion: { label: 'Navegación', icon: Route,              cls: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  click:      { label: 'Clic',       icon: MousePointerClick,  cls: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
  accion:     { label: 'Acción',     icon: Zap,                cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  sesion:     { label: 'Sesión',     icon: KeyRound,           cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
}

// Zona horaria del restaurante (consistente con la moneda/locale es-PE).
// Fijarla evita el "desfase" de que cada visor viera la hora en SU zona:
// ahora todos ven la misma hora local del negocio.
const TZ_RESTAURANTE = 'America/Lima'
const fmtTs = (iso) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  timeZone: TZ_RESTAURANTE,
})

function ChipTipo({ tipo }) {
  const meta = TIPOS[tipo] ?? TIPOS.accion
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}>
      <Icon size={10} /> {meta.label}
    </span>
  )
}

export default function AdminActividad() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [restaurantes, setRestaurantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [error, setError] = useState('')

  // Filtros
  const [fRestaurante, setFRestaurante] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [q, setQ] = useState('')

  // Filtros normalizados para la API (memo: el effect refetchea al cambiar).
  const filtros = useMemo(() => ({
    restaurante_id: fRestaurante,
    tipo: fTipo,
    desde: fDesde ? `${fDesde}T00:00:00` : '',
    hasta: fHasta ? `${fHasta}T23:59:59` : '',
    q,
  }), [fRestaurante, fTipo, fDesde, fHasta, q])

  // Todos los setState ocurren en callbacks async (patrón de AdminPlataforma).
  useEffect(() => {
    let cancelled = false
    db.actividad.list(filtros)
      .then((res) => {
        if (cancelled) return
        setRows(res.rows ?? [])
        setMissingTable(Boolean(res.missingTable))
        setError('')
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'No se pudo cargar la actividad.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filtros])

  function refrescar() {
    setLoading(true)
    db.actividad.list(filtros)
      .then((res) => {
        setRows(res.rows ?? [])
        setMissingTable(Boolean(res.missingTable))
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudo cargar la actividad.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    db.restaurantes.list()
      .then((r) => Array.isArray(r) && setRestaurantes(r))
      .catch(() => { /* el filtro simplemente queda sin opciones */ })
  }, [])

  const stats = useMemo(() => {
    const porTipo = { navegacion: 0, click: 0, accion: 0, sesion: 0 }
    const usuarios = new Set()
    for (const r of rows) {
      porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1
      if (r.usuario_email) usuarios.add(r.usuario_email)
    }
    return { total: rows.length, usuarios: usuarios.size, ...porTipo }
  }, [rows])

  function exportarCSV() {
    if (!rows.length) return
    downloadCSV(csvFilename('actividad-usuarios'), buildCSV(
      ['Restaurante Asociado', 'Usuario', 'Correo', 'Rol', 'Tipo', 'Acción del Usuario', 'Navegación', 'Marca de Tiempo'],
      rows.map(r => [
        r.restaurante_nombre ?? r.restaurante_id ?? '—',
        r.usuario_nombre ?? '—',
        r.usuario_email ?? '—',
        r.rol ?? '—',
        TIPOS[r.tipo]?.label ?? r.tipo,
        r.accion,
        r.ruta ?? '—',
        fmtTs(r.creado_en),
      ]),
    ))
    toast.success(`CSV exportado (${rows.length} eventos).`)
  }

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <header className="sticky top-[var(--sf-topbar,0px)] z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3 pl-16 lg:pl-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center">
              <Activity size={15} />
            </span>
            <span className="font-bold text-sm">Actividad de usuarios</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={refrescar}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#4F46E5] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw size={12} /> Refrescar
            </button>
            <button
              onClick={exportarCSV}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-40 text-white text-xs font-bold transition-colors"
            >
              <Download size={12} /> Exportar CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#4F46E5] dark:text-[#818CF8]">Auditoría</p>
          <h2 className="text-2xl sm:text-3xl font-black mt-1">Qué hace cada usuario, y dónde</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Navegación entre pantallas y clics de cada usuario, con su restaurante y marca de tiempo. Exportable a CSV.
          </p>
        </div>

        {/* Aviso de migración pendiente */}
        {missingTable && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/30 p-4 text-amber-800 dark:text-amber-300 flex items-start gap-3">
            <Database size={18} className="shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">Falta crear la tabla de actividad en Supabase.</p>
              <p className="text-xs mt-1 opacity-90">
                Ejecuta <code className="font-mono font-bold">supabase_actividad.sql</code> (raíz del repo) en el SQL Editor de Supabase.
                Mientras tanto los eventos no se guardan; la app funciona con normalidad.
              </p>
            </div>
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Eventos', value: stats.total, icon: Activity },
            { label: 'Usuarios activos', value: stats.usuarios, icon: KeyRound },
            { label: 'Navegaciones', value: stats.navegacion, icon: Route },
            { label: 'Clics', value: stats.click, icon: MousePointerClick },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[#4F46E5]/10 dark:bg-[#4F46E5]/20 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center shrink-0">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
                <p className="text-lg font-black text-slate-900 dark:text-slate-50 leading-tight">{value}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Filtros */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Restaurante
            <select
              value={fRestaurante}
              onChange={(e) => setFRestaurante(e.target.value)}
              className="px-2.5 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
            >
              <option value="">Todos</option>
              {restaurantes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tipo
            <select
              value={fTipo}
              onChange={(e) => setFTipo(e.target.value)}
              className="px-2.5 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
            >
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Desde
            <input
              type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Hasta
            <input
              type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
            />
          </label>
          <label className="flex-1 min-w-44 flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Buscar
            <span className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Acción, ruta, usuario…"
                className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
              />
            </span>
          </label>
        </section>

        {/* Tabla */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500 dark:text-slate-400">
            <Loader2 size={24} className="mx-auto animate-spin mb-2" /> Cargando actividad…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/30 p-6 text-red-700 dark:text-red-300">
            <AlertTriangle size={20} className="mb-1.5" />
            <p className="font-bold text-sm">{error}</p>
          </div>
        ) : !rows.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-400 dark:text-slate-500">
            Sin actividad registrada con estos filtros. La actividad se captura automáticamente mientras los usuarios navegan.
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3">Marca de tiempo</th>
                    <th className="px-4 py-3">Restaurante</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Navegación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-mono">{fmtTs(r.creado_en)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                          <Building2 size={11} className="text-[#4F46E5] dark:text-[#818CF8]" />
                          {r.restaurante_nombre ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-40">{r.usuario_nombre ?? '—'}</p>
                        <p className="text-[10px] text-slate-400 truncate max-w-40">{r.usuario_email ?? ''} {r.rol ? `· ${r.rol}` : ''}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><ChipTipo tipo={r.tipo} /></td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-72 truncate" title={r.accion}>{r.accion}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs font-mono text-slate-500 dark:text-slate-400">{r.ruta ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
              Mostrando los {rows.length} eventos más recientes{fRestaurante || fTipo || q || fDesde ? ' (filtrados)' : ''}.
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
