import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Volume2, VolumeX, StickyNote } from 'lucide-react'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useMesas } from '../state/MesasContext.jsx'

const SONIDO_KEY = 'santa-fe:cocina-sonido'

// Campana de dos tonos via Web Audio — sin assets externos.
function campanaNuevoPedido() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch { /* sin soporte de audio */ }
}

function ms(d) { return Math.max(0, Date.now() - d) }
function fmt(d) {
  const s = Math.floor(ms(d) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function umbralRing(d) {
  const s = Math.floor(ms(d) / 1000)
  if (s < 300) return 'ring-blue-300'
  if (s < 600) return 'ring-amber-400'
  if (s < 900) return 'ring-orange-500'
  return 'ring-red-500 animate-pulse'
}

function umbralTimer(d) {
  const s = Math.floor(ms(d) / 1000)
  if (s < 300) return 'bg-blue-50 text-blue-700'
  if (s < 600) return 'bg-amber-50 text-amber-700'
  if (s < 900) return 'bg-orange-50 text-orange-700'
  return 'bg-red-50 text-red-700 font-bold'
}

function Card({ pedido, onAccion, labelAccion }) {
  const quienPidio = pedido.cliente_nombre || pedido.cuentaName
  return (
    <article className={`bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm ring-2 ring-inset ${umbralRing(pedido.creadoEn)}`}>
      <header className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-lg text-slate-900 dark:text-slate-50">Mesa {pedido.mesa}</h3>
          {quienPidio && (
            <p className="text-[11px] font-bold text-[#A85638] dark:text-[#C99A3C] truncate" title="Cliente">
              👤 {quienPidio}
            </p>
          )}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${umbralTimer(pedido.creadoEn)}`}>
          ⏱ {fmt(pedido.creadoEn)}
        </span>
      </header>

      <ul className="space-y-1.5 text-sm mb-4">
        {pedido.items.map(i => (
          <li key={i.id} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
              {i.cantidad}
            </span>
            <span className="text-slate-700 dark:text-slate-200">{i.nombre}</span>
          </li>
        ))}
      </ul>

      {pedido.nota && (
        <p className="mb-3 -mt-1 text-xs text-slate-700 dark:text-slate-200 bg-[#C99A3C]/15 ring-1 ring-[#C99A3C]/30 rounded-xl px-3 py-2 flex items-start gap-1.5">
          <StickyNote size={12} className="mt-0.5 shrink-0 text-[#C99A3C]" />
          <span>{pedido.nota}</span>
        </p>
      )}

      <button
        onClick={() => onAccion(pedido.id)}
        className="w-full rounded-xl bg-[#A85638] text-white py-2.5 text-sm font-bold hover:bg-[#8F4527] active:scale-95 transition-all"
      >
        {labelAccion}
      </button>
    </article>
  )
}

function Columna({ titulo, color, pedidos, onAccion, labelAccion }) {
  return (
    <section className="flex-1 min-w-[260px]">
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-2xl ${color}`}>
        <h2 className="font-bold text-sm">{titulo}</h2>
        <span className="text-sm font-black bg-white/60 rounded-full w-7 h-7 flex items-center justify-center">
          {pedidos.length}
        </span>
      </div>
      <div className="space-y-3 p-3 bg-slate-100/80 dark:bg-slate-800/40 rounded-b-2xl min-h-[220px]">
        {pedidos.length === 0
          ? <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-10">— vacía —</p>
          : pedidos.map(p => (
              <Card key={p.id} pedido={p} onAccion={onAccion} labelAccion={labelAccion} />
            ))
        }
      </div>
    </section>
  )
}

/* ── Vista agrupada por platillo ─────────────────── */
function VistaAgrupada({ pedidos }) {
  // Agrupar items por nombre de platillo
  const grupos = useMemo(() => {
    const map = new Map()
    for (const p of pedidos) {
      for (const item of p.items) {
        const key = item.nombre
        const entry = map.get(key) ?? { nombre: key, total: 0, detalles: [] }
        entry.total += item.cantidad
        entry.detalles.push({
          mesa: p.mesa,
          cuentaName: p.cuentaName,
          cliente_nombre: p.cliente_nombre,
          cantidad: item.cantidad,
          estado: p.estado,
          creadoEn: p.creadoEn,
        })
        map.set(key, entry)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [pedidos])

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <span className="text-5xl">🍳</span>
        <p className="text-slate-700 dark:text-slate-200 font-bold text-lg">Sin platillos en cola</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">Ajusta los filtros o espera nuevos pedidos.</p>
      </div>
    )
  }

  const ESTADO_CFG = {
    pendiente:      { bg: 'bg-amber-100 text-amber-800', label: 'Pendiente' },
    en_preparacion: { bg: 'bg-blue-100 text-blue-800',   label: 'En prep.'  },
    listo:          { bg: 'bg-emerald-100 text-emerald-800', label: 'Listo' },
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {grupos.map(g => (
        <article key={g.nombre} className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <header className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-50 truncate">{g.nombre}</h3>
            <span className="flex-shrink-0 text-xs font-black px-3 py-1.5 rounded-full bg-[#A85638] text-white">
              × {g.total}
            </span>
          </header>
          <ul className="space-y-1.5 text-sm">
            {g.detalles.map((d, i) => {
              const cfg = ESTADO_CFG[d.estado] ?? ESTADO_CFG.pendiente
              const quien = d.cliente_nombre || d.cuentaName
              return (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200 truncate">
                    <strong className="text-slate-900 dark:text-slate-50">{d.cantidad}×</strong>{' '}
                    Mesa {d.mesa}
                    {quien && <span className="text-[#A85638] dark:text-[#C99A3C] ml-1">· 👤 {quien}</span>}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </article>
      ))}
    </div>
  )
}

function CocinaPendientes() {
  const {
    pedidosPendientes, pedidosEnPreparacion, pedidosListos,
    marcarPreparando, marcarListo, marcarEntregado, limpiarCocina,
  } = usePedidos()
  const { mesas } = useMesas()
  const [confirmLimpiar, setConfirmLimpiar] = useState(false)

  // ── Aviso sonoro al entrar un pedido nuevo ──
  const [sonido, setSonido] = useState(() => {
    try { return localStorage.getItem(SONIDO_KEY) !== 'off' } catch { return true }
  })
  const prevPendientesRef = useRef(pedidosPendientes.length)
  useEffect(() => {
    if (pedidosPendientes.length > prevPendientesRef.current && sonido) campanaNuevoPedido()
    prevPendientesRef.current = pedidosPendientes.length
  }, [pedidosPendientes.length, sonido])
  const toggleSonido = () => setSonido(s => {
    try { localStorage.setItem(SONIDO_KEY, s ? 'off' : 'on') } catch { /* almacenamiento no disponible */ }
    return !s
  })

  // ── Filtros ──
  const [filtroPlatillo, setFiltroPlatillo] = useState('')
  const [filtroMesa, setFiltroMesa] = useState('todas')
  const [agrupar, setAgrupar] = useState(false)

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Resolver nombre de cuenta por id (cross-mesa)
  const cuentasIndex = useMemo(() => {
    const m = new Map()
    for (const mesa of mesas) for (const c of mesa.cuentas ?? []) m.set(c.id, c.nombre)
    return m
  }, [mesas])

  // Aplica filtros sobre una lista de pedidos y ordena por (mesa, cliente).
  const aplicarFiltros = (lista) => {
    const q = filtroPlatillo.trim().toLowerCase()
    return lista
      .map(p => ({ ...p, cuentaName: cuentasIndex.get(p.cuentaId) }))
      .filter(p => filtroMesa === 'todas' || Number(p.mesa) === Number(filtroMesa))
      .map(p => {
        if (!q) return p
        const items = p.items.filter(i => i.nombre.toLowerCase().includes(q))
        return items.length > 0 ? { ...p, items } : null
      })
      .filter(Boolean)
      .sort((a, b) => {
        const m = Number(a.mesa) - Number(b.mesa)
        if (m !== 0) return m
        const na = (a.cliente_nombre || a.cuentaName || '').toLowerCase()
        const nb = (b.cliente_nombre || b.cuentaName || '').toLowerCase()
        return na.localeCompare(nb)
      })
  }

  const pP = useMemo(() => aplicarFiltros(pedidosPendientes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidosPendientes, filtroPlatillo, filtroMesa, cuentasIndex])
  const pE = useMemo(() => aplicarFiltros(pedidosEnPreparacion),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidosEnPreparacion, filtroPlatillo, filtroMesa, cuentasIndex])
  const pL = useMemo(() => aplicarFiltros(pedidosListos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidosListos, filtroPlatillo, filtroMesa, cuentasIndex])

  const total = pP.length + pE.length + pL.length
  const totalReal = pedidosPendientes.length + pedidosEnPreparacion.length + pedidosListos.length

  // Mesas que actualmente tienen pedidos activos (para popular el filtro)
  const mesasConActivos = useMemo(() => {
    const set = new Set()
    for (const p of [...pedidosPendientes, ...pedidosEnPreparacion, ...pedidosListos]) {
      set.add(Number(p.mesa))
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [pedidosPendientes, pedidosEnPreparacion, pedidosListos])

  const hayFiltros = filtroPlatillo.trim() !== '' || filtroMesa !== 'todas'
  const limpiarFiltros = () => { setFiltroPlatillo(''); setFiltroMesa('todas') }

  return (
    <div className="min-h-screen">
      {/* Topbar */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4 pl-16 lg:pl-4">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-50">Cocina</h1>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold ring-1 ring-amber-200 dark:ring-amber-500/30">
              {pP.length} pendientes
            </span>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold ring-1 ring-blue-200 dark:ring-blue-500/30">
              {pE.length} en prep.
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold ring-1 ring-emerald-200 dark:ring-emerald-500/30">
              {pL.length} listas
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSonido}
              title={sonido ? 'Silenciar aviso de pedidos nuevos' : 'Activar aviso sonoro'}
              aria-label={sonido ? 'Silenciar aviso' : 'Activar aviso sonoro'}
              className={`w-8 h-8 rounded-xl flex items-center justify-center ring-1 transition-colors ${
                sonido
                  ? 'bg-[#C99A3C]/15 text-[#C99A3C] ring-[#C99A3C]/30'
                  : 'text-slate-400 ring-slate-200 dark:ring-slate-700 hover:text-slate-600'
              }`}
            >
              {sonido ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            {totalReal > 0 && (
              <button
                onClick={() => setConfirmLimpiar(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200 dark:border-red-500/30 transition-colors"
              >
                Limpiar todo
              </button>
            )}
            <Link to="/tablero-mesas" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-semibold transition-colors">
              ← Tablero
            </Link>
          </div>
        </div>
      </header>

      {/* Barra de filtros */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center bg-white dark:bg-slate-900 rounded-2xl p-3 ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm">
          {/* Buscar por platillo */}
          <div className="flex-1 min-w-0 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={filtroPlatillo}
              onChange={e => setFiltroPlatillo(e.target.value)}
              placeholder="Buscar platillo (ej. ceviche, lomo…)"
              style={{ fontSize: '16px' }}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-[#A85638] focus:ring-2 focus:ring-[#A85638]/10 transition-all"
            />
          </div>

          {/* Filtro de mesa */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
              Mesa:
            </label>
            <select
              value={filtroMesa}
              onChange={e => setFiltroMesa(e.target.value)}
              style={{ fontSize: '14px' }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-[#A85638] focus:ring-2 focus:ring-[#A85638]/10 transition-all"
            >
              <option value="todas">Todas</option>
              {mesasConActivos.map(n => (
                <option key={n} value={n}>Mesa {n}</option>
              ))}
            </select>
          </div>

          {/* Toggle agrupar */}
          <button
            onClick={() => setAgrupar(v => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              agrupar
                ? 'bg-[#A85638] text-white hover:bg-[#8F4527]'
                : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Agrupar por platillo para preparar en bloque"
          >
            {agrupar ? '✓ Agrupado por platillo' : 'Agrupar por platillo'}
          </button>

          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {hayFiltros && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 px-1">
            Mostrando {total} de {totalReal} pedido{totalReal !== 1 ? 's' : ''} activo{totalReal !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {totalReal === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <span className="text-6xl">🍳</span>
            <p className="text-slate-700 dark:text-slate-200 font-bold text-lg">Cocina al día</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Cuando un mesero envíe un pedido aparecerá aquí.</p>
            <Link to="/pedidos/nuevo" className="mt-2 rounded-xl bg-[#A85638] text-white px-6 py-2.5 text-sm font-bold hover:bg-[#8F4527] transition-colors">
              Crear pedido de prueba
            </Link>
          </div>
        ) : agrupar ? (
          <VistaAgrupada pedidos={[...pP, ...pE, ...pL]} />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 pt-2">
            <Columna
              titulo="Pendientes"
              color="bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200"
              pedidos={pP}
              onAccion={marcarPreparando}
              labelAccion="Empezar a preparar"
            />
            <Columna
              titulo="En preparación"
              color="bg-blue-100 dark:bg-blue-500/20 text-blue-900 dark:text-blue-200"
              pedidos={pE}
              onAccion={marcarListo}
              labelAccion="Marcar como listo"
            />
            <Columna
              titulo="Listas para servir"
              color="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200"
              pedidos={pL}
              onAccion={marcarEntregado}
              labelAccion="✓ Entregado"
            />
          </div>
        )}
      </div>
      {confirmLimpiar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 p-5 max-w-sm w-full shadow-xl">
            <p className="font-bold text-slate-900 dark:text-slate-50 text-base">¿Limpiar toda la cocina?</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Se marcarán como entregados los {totalReal} pedidos activos. El estado de las mesas no cambia (recuerda marcarlas “Por cobrar” manualmente).
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setConfirmLimpiar(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { limpiarCocina(); setConfirmLimpiar(false) }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
              >
                Limpiar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CocinaPendientes
