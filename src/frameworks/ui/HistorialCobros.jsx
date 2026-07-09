import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  History, Search, RotateCcw, Receipt, CircleDollarSign, CreditCard,
  Download, Loader2, AlertCircle, FileText, ExternalLink, X,
} from 'lucide-react'
import { useMesas } from '../state/MesasContext.jsx'
import { db } from '../../adapters/db.js'
import { buildCSV, downloadCSV, csvFilename } from '../../adapters/csv.js'

const formatPEN = (n) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0)

const METODO_META = {
  efectivo:      { label: 'Efectivo',      cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  tarjeta:       { label: 'Tarjeta',       cls: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  transferencia: { label: 'Transferencia', cls: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  yape:          { label: 'Yape',          cls: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300' },
  plin:          { label: 'Plin',          cls: 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' },
}

const fmtFecha = (iso) => {
  const d = new Date(iso)
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Descompone la referencia (AZUL:.. / TRANSF:.. | RNC:..) en partes legibles.
function parseReferencia(ref) {
  if (!ref) return { rnc: null, comprobante: null, auth: null, raw: null }
  const [main, ...rest] = String(ref).split('|RNC:')
  const rnc = rest.length ? rest.join('|RNC:') : null
  if (main.startsWith('AZUL:')) {
    const parts = main.split(':')
    return { rnc, comprobante: null, auth: parts[2] || null, raw: main }
  }
  if (main.startsWith('TRANSF:')) {
    return { rnc, comprobante: main.slice('TRANSF:'.length), auth: null, raw: null }
  }
  return { rnc, comprobante: null, auth: null, raw: main || null }
}

export default function HistorialCobros() {
  const { mesas } = useMesas()
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtros
  const [desde, setDesde]   = useState('')
  const [hasta, setHasta]   = useState('')
  const [metodo, setMetodo] = useState('todos')
  const [query, setQuery]   = useState('') // búsqueda por nº de mesa / referencia

  const mesaNumeroPorId = useMemo(() => {
    const map = new Map()
    for (const m of mesas) map.set(m.id, m.numeroMesa)
    return map
  }, [mesas])

  const cargar = () => {
    setLoading(true)
    setError('')
    db.pagos.list()
      .then((rows) => setPagos(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message || 'No se pudo cargar el historial de cobros.'))
      .finally(() => setLoading(false))
  }

  // Carga inicial: setState sólo en callbacks asíncronos (evita cascadas de render).
  useEffect(() => {
    let cancelled = false
    db.pagos.list()
      .then((rows) => { if (!cancelled) setPagos(Array.isArray(rows) ? rows : []) })
      .catch((e) => { if (!cancelled) setError(e.message || 'No se pudo cargar el historial de cobros.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    const desdeTs = desde ? new Date(`${desde}T00:00:00`).getTime() : null
    const hastaTs = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null
    return pagos.filter((p) => {
      if (metodo !== 'todos' && p.metodo !== metodo) return false
      const ts = new Date(p.creado_en).getTime()
      if (desdeTs && ts < desdeTs) return false
      if (hastaTs && ts > hastaTs) return false
      if (q) {
        const numero = mesaNumeroPorId.get(p.mesa_id)
        const hay = `mesa ${numero ?? ''} ${p.referencia ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [pagos, metodo, desde, hasta, query, mesaNumeroPorId])

  const resumen = useMemo(() => {
    const total = filtrados.reduce((s, p) => s + (Number(p.monto) || 0), 0)
    const n = filtrados.length
    const porMetodo = filtrados.reduce((acc, p) => {
      acc[p.metodo] = (acc[p.metodo] || 0) + (Number(p.monto) || 0)
      return acc
    }, {})
    return { total, n, promedio: n ? total / n : 0, porMetodo }
  }, [filtrados])

  const metodosDisponibles = useMemo(
    () => Array.from(new Set(pagos.map((p) => p.metodo))).filter(Boolean),
    [pagos],
  )

  const hayFiltro = desde || hasta || metodo !== 'todos' || query.trim()
  const limpiarFiltros = () => { setDesde(''); setHasta(''); setMetodo('todos'); setQuery('') }

  function exportarCSV() {
    const csv = buildCSV(
      ['Fecha', 'Mesa', 'Metodo', 'Monto', 'RNC', 'Referencia'],
      filtrados.map((p) => {
        const r = parseReferencia(p.referencia)
        return [
          new Date(p.creado_en).toLocaleString('es-PE'),
          mesaNumeroPorId.get(p.mesa_id) ?? '—',
          p.metodo,
          Number(p.monto || 0).toFixed(2),
          r.rnc ?? '',
          (r.comprobante ?? r.auth ?? r.raw ?? '').replace(/\n/g, ' '),
        ]
      }),
    )
    downloadCSV(csvFilename('cobros'), csv)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-[var(--sf-topbar,0px)] z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4 pl-16 lg:pl-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center">
              <History size={15} />
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-50 text-sm">Historial de cobros</span>
          </div>
          <Link
            to="/cajero/cobros"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-indigo-300 dark:hover:ring-indigo-500 transition-colors"
          >
            <Receipt size={12} /> Panel de cobros
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Recaudado</p>
            <p className="mt-1 text-xl font-black text-[#4F46E5] dark:text-[#0EA5E9] leading-none">{formatPEN(resumen.total)}</p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Cobros</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50 leading-none">{resumen.n}</p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Ticket prom.</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50 leading-none">{formatPEN(resumen.promedio)}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por mesa o referencia"
                className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
              />
            </div>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
            >
              <option value="todos">Todos los métodos</option>
              {metodosDisponibles.map((m) => (
                <option key={m} value={m}>{METODO_META[m]?.label || m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4F46E5]"
              />
            </label>
            <div className="flex items-center gap-2 sm:ml-auto">
              {hayFiltro && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#4F46E5] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={12} /> Limpiar
                </button>
              )}
              <button
                type="button"
                onClick={cargar}
                title="Refrescar"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#4F46E5] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <RotateCcw size={12} /> Refrescar
              </button>
              <button
                type="button"
                onClick={exportarCSV}
                disabled={filtrados.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                <Download size={12} /> CSV
              </button>
            </div>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">
            <Loader2 size={24} className="mx-auto animate-spin mb-2" /> Cargando cobros…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/30 p-6 text-red-700 dark:text-red-300">
            <AlertCircle size={20} className="mb-1.5" />
            <p className="font-bold text-sm">No se pudo cargar el historial</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 p-10 text-center">
            <FileText size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {hayFiltro ? 'Sin cobros para estos filtros' : 'Aún no hay cobros registrados'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {hayFiltro ? 'Ajusta el rango de fechas, el método o la búsqueda.' : 'Los cobros aparecerán aquí cuando registres pagos.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#E2E8F0] dark:ring-slate-800 overflow-hidden">
            {filtrados.map((p, i) => {
              const numero = mesaNumeroPorId.get(p.mesa_id)
              const meta = METODO_META[p.metodo] || { label: p.metodo, cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' }
              const ref = parseReferencia(p.referencia)
              const Icon = p.metodo === 'efectivo' ? CircleDollarSign : CreditCard
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i !== 0 ? 'border-t border-[#E2E8F0] dark:border-slate-800' : ''}`}
                >
                  <span className="w-9 h-9 rounded-xl bg-[#4F46E5]/10 dark:bg-[#4F46E5]/20 text-[#4F46E5] dark:text-[#0EA5E9] flex items-center justify-center font-black text-sm shrink-0">
                    {numero ?? '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-50">Mesa {numero ?? '—'}</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${meta.cls}`}>
                        <Icon size={9} /> {meta.label}
                      </span>
                      {ref.rnc && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          RNC {ref.rnc}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{fmtFecha(p.creado_en)}</span>
                      {ref.comprobante && (
                        <a
                          href={ref.comprobante}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[#4F46E5] dark:text-[#0EA5E9] hover:underline font-semibold"
                        >
                          <ExternalLink size={10} /> Comprobante
                        </a>
                      )}
                    </p>
                  </div>
                  <span className="text-base font-black text-[#4F46E5] dark:text-[#0EA5E9] whitespace-nowrap">
                    {formatPEN(p.monto)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
