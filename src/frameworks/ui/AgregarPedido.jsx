import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMesas }    from '../state/MesasContext.jsx'
import { usePedidos }  from '../state/PedidosContext.jsx'
import { useTableManagement } from '../../usecases/useTableManagement.js'
import AccountPicker  from './AccountPicker.jsx'
import ingredientes    from '../assets/data/ingredientes.js'

/* ─────────────────────────────────────────────────────────
   Datos de ejemplo — reemplaza con fetch real cuando conectes backend
───────────────────────────────────────────────────────── */
const productosDisponibles = ingredientes   // reutiliza los datos del proyecto

const CATEGORIAS = ['Todos', 'Entrada', 'Plato Principal', 'Postre', 'Bebida']

/* ── helpers ──────────────────────────────────────── */
function fmt(n) { return `S/ ${Number(n).toFixed(2)}` }

/* ── Tarjeta de producto ──────────────────────────── */
function TarjetaProducto({ plato, qty, onAdd, onChange }) {
  return (
    <article className={`bg-white dark:bg-slate-900 rounded-3xl border shadow-sm overflow-hidden flex flex-col transition-all ${
      qty > 0 ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]/30' : 'border-slate-200 dark:border-slate-800'
    }`}>
      <div className="relative">
        <img
          src={plato.imagen}
          alt={plato.nombre}
          className="w-full h-28 sm:h-32 object-cover"
        />
        {qty > 0 && (
          <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-[#4F46E5] text-white text-xs font-bold flex items-center justify-center shadow-md">
            {qty}
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 leading-tight truncate">{plato.nombre}</h3>
            <p className="text-xs text-[#10B981] dark:text-[#6EE7B7] font-semibold mt-0.5 truncate">{plato.categoria}</p>
          </div>
          <span className="text-sm font-black text-[#4F46E5] dark:text-[#0EA5E9] whitespace-nowrap shrink-0">{fmt(plato.precio)}</span>
        </div>

        {/* CTA — mt-auto lo fija siempre al fondo de la card */}
        <div className="mt-auto">
        {qty === 0 ? (
          <button
            onClick={() => onAdd(plato)}
            /* min-h-[44px] garantiza zona táctil cómoda para el pulgar */
            className="w-full min-h-[44px] rounded-xl bg-[#4F46E5] text-white text-sm font-bold
                       hover:bg-[#4338CA] active:scale-95 transition-all"
          >
            + Añadir
          </button>
        ) : (
          <div className="flex items-center justify-between gap-1 bg-[#4F46E5]/8 dark:bg-[#4F46E5]/15 rounded-xl p-1">
            <button
              onClick={() => onChange(plato.nombre, -1)}
              className="min-w-[40px] min-h-[40px] rounded-lg bg-white dark:bg-slate-800 shadow-sm text-slate-600 dark:text-slate-200
                         font-bold text-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >−</button>
            <span className="font-black text-[#4F46E5] dark:text-[#0EA5E9] text-base w-6 text-center">{qty}</span>
            <button
              onClick={() => onChange(plato.nombre, +1)}
              className="min-w-[40px] min-h-[40px] rounded-lg bg-white dark:bg-slate-800 shadow-sm text-slate-600 dark:text-slate-200
                         font-bold text-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >+</button>
          </div>
        )}
        </div>
      </div>
    </article>
  )
}

/* ── Fila del carrito ─────────────────────────────── */
function FilaCarrito({ item, onChange }) {
  return (
    <li className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
      {/* nombre */}
      <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
        {item.nombre}
      </span>
      {/* stepper */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onChange(item.nombre, -1)}
          className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 shadow-sm text-slate-500 dark:text-slate-200 font-bold
                     hover:text-red-500 active:scale-95 transition-all"
        >−</button>
        <span className="w-5 text-center font-black text-[#4F46E5] dark:text-[#0EA5E9] text-sm">{item.cantidad}</span>
        <button
          onClick={() => onChange(item.nombre, +1)}
          className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 shadow-sm text-slate-500 dark:text-slate-200 font-bold
                     hover:text-[#4F46E5] active:scale-95 transition-all"
        >+</button>
      </div>
      {/* precio */}
      <span className="w-16 text-right text-sm font-semibold text-slate-700 dark:text-slate-200 shrink-0">
        {fmt(item.precio * item.cantidad)}
      </span>
    </li>
  )
}

/* ── Panel / Resumen ──────────────────────────────── */
function ResumenPedido({ mesas, mesaSel, onMesaChange, items, onChange, total, onEnviar, enviando, confirmado, cuentaActual, nota, onNotaChange }) {
  return (
    <div className="flex flex-col gap-4">
      {cuentaActual && (
        <div className="rounded-xl bg-[#4F46E5]/8 dark:bg-[#4F46E5]/15 ring-1 ring-[#4F46E5]/25 px-3 py-2.5 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#4F46E5] text-white flex items-center justify-center text-xs font-black">
            {cuentaActual.nombre.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#4F46E5]/80 dark:text-[#0EA5E9]">Cuenta activa</p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{cuentaActual.nombre}</p>
          </div>
        </div>
      )}

      {/* Selector de mesa */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
          Mesa
        </label>
        <select
          value={mesaSel}
          onChange={e => onMesaChange(e.target.value)}
          /* font-size 16px evita zoom en iOS */
          style={{ fontSize: '16px' }}
          className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950
                     focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/10
                     transition-all text-slate-700 dark:text-slate-200"
        >
          <option value="">Selecciona una mesa</option>
          {mesas.map(m => (
            <option key={m.id} value={m.numeroMesa}>
              Mesa {m.numeroMesa} · {m.capacidad}p · {m.estado.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Lista items */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          Carrito ({items.reduce((s, i) => s + i.cantidad, 0)} ítems)
        </label>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-400 dark:text-slate-500">
            <span className="text-3xl">🛒</span>
            <p className="text-sm">Agrega platos desde el menú.</p>
          </div>
        ) : (
          <ul className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {items.map(item => (
              <FilaCarrito key={item.nombre} item={item} onChange={onChange} />
            ))}
          </ul>
        )}
      </div>

      {/* Nota para cocina */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
          Nota para cocina <span className="normal-case font-medium tracking-normal">(opcional)</span>
        </label>
        <textarea
          value={nota}
          onChange={e => onNotaChange(e.target.value)}
          rows={2}
          maxLength={140}
          placeholder="Sin ají, término medio, alergia a maní…"
          style={{ fontSize: '16px' }}
          className="w-full resize-none px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950
                     focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/10
                     transition-all text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        />
      </div>

      {/* Total + CTA */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-slate-500 dark:text-slate-400 font-semibold">Total</span>
          <span className="text-xl font-black text-slate-900 dark:text-slate-50">{fmt(total)}</span>
        </div>
        <button
          onClick={onEnviar}
          disabled={!mesaSel || !cuentaActual || items.length === 0 || enviando}
          className={`w-full min-h-[48px] rounded-xl font-bold text-sm transition-all ${
            confirmado
              ? 'bg-emerald-500 text-white'
              : mesaSel && cuentaActual && items.length > 0 && !enviando
                ? 'bg-[#10B981] text-white hover:bg-[#059669] active:scale-95 shadow-md'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {confirmado ? '✓ Pedido enviado' : enviando ? 'Enviando…' : 'Enviar a Cocina'}
        </button>
        {!mesaSel && (
          <p className="text-xs text-slate-400 text-center">Selecciona una mesa para continuar.</p>
        )}
        {mesaSel && !cuentaActual && (
          <p className="text-xs text-amber-600 text-center">Selecciona una cuenta para continuar.</p>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Componente principal
═══════════════════════════════════════════════════ */
export default function AgregarPedido() {
  const { mesas }         = useMesas()
  const { agregarPedido } = usePedidos()
  const navigate          = useNavigate()
  const [params]          = useSearchParams()

  /* ── estado ── */
  const [mesaSel, setMesaSel]   = useState(params.get('mesa') ?? '')
  const [cuentaId, setCuentaId] = useState(params.get('cuenta') ?? '')
  const [items, setItems]       = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todos')
  const [nota, setNota]         = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  /* drawer móvil */
  const [drawerOpen, setDrawerOpen] = useState(false)

  /* cuentas de la mesa seleccionada */
  const { cuentas: cuentasMesa } = useTableManagement(mesaSel)
  const cuentaActual = cuentasMesa.find(c => c.id === cuentaId)
  const requiereCuenta = Boolean(mesaSel) && !cuentaActual

  useEffect(() => {
    const m = params.get('mesa')
    if (m) setMesaSel(m)
    const c = params.get('cuenta')
    if (c) setCuentaId(c)
  }, [params])

  /* si cambia de mesa manualmente, limpia la cuenta seleccionada */
  useEffect(() => {
    if (cuentaId && cuentasMesa.length && !cuentasMesa.find(c => c.id === cuentaId)) {
      setCuentaId('')
    }
  }, [mesaSel, cuentasMesa, cuentaId])

  /* cierra drawer con Escape */
  useEffect(() => {
    const fn = e => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  /* ── lógica de carrito ── */
  const filtrados = useMemo(() =>
    productosDisponibles.filter(p => {
      const okCat = categoria === 'Todos' || p.categoria === categoria
      const okBus = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      return okCat && okBus
    }), [busqueda, categoria])

  const qty = nombre => items.find(i => i.nombre === nombre)?.cantidad ?? 0

  const addItem = plato => setItems(prev => {
    const idx = prev.findIndex(i => i.nombre === plato.nombre)
    if (idx === -1) return [...prev, { ...plato, cantidad: 1 }]
    const next = [...prev]
    next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 }
    return next
  })

  const changeQty = (nombre, delta) =>
    setItems(prev =>
      prev.map(i => i.nombre === nombre ? { ...i, cantidad: i.cantidad + delta } : i)
          .filter(i => i.cantidad > 0)
    )

  const total = items.reduce((s, i) => s + (i.precio ?? 0) * i.cantidad, 0)
  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)

  /* ── enviar ── */
  const enviarACocina = async () => {
    if (!mesaSel || !cuentaId || items.length === 0 || enviando) return
    setEnviando(true)
    await new Promise(r => setTimeout(r, 500))
    agregarPedido({ mesa: mesaSel, cuentaId, items, nota })
    setConfirmado(true)
    setDrawerOpen(false)
    setTimeout(() => navigate('/cocina/pendientes'), 900)
  }

  const resumenProps = { mesas, mesaSel, onMesaChange: setMesaSel, items, onChange: changeQty, total, onEnviar: enviarACocina, enviando, confirmado, cuentaActual, nota, onNotaChange: setNota }

  /* ══════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col">
      {requiereCuenta && (
        <AccountPicker
          numeroMesa={mesaSel}
          onSelect={(c) => setCuentaId(c.id)}
          onClose={() => navigate(-1)}
        />
      )}

      {/* ── Topbar ── */}
      <header className="sticky top-[var(--sf-topbar,0px)] z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3 pl-16 lg:pl-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/tablero-mesas')}
              className="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              ← Tablero
            </button>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:block">|</span>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-50 hidden sm:block">Agregar Pedido</h1>
          </div>

          {/* Mesa + cuenta activa */}
          {mesaSel && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] border border-[#4F46E5]/20">
                Mesa {mesaSel}
              </span>
              {cuentaActual && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 truncate max-w-[140px]">
                  {cuentaActual.nombre}
                </span>
              )}
            </div>
          )}

          {/* Botón carrito en móvil */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden relative flex items-center gap-2 rounded-xl bg-[#10B981] text-white px-3 py-2 text-sm font-bold"
          >
            🛒
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#4F46E5] text-white text-xs font-black flex items-center justify-center">
                {totalItems}
              </span>
            )}
            <span className="hidden sm:inline">{fmt(total)}</span>
          </button>
        </div>
      </header>

      {/* ── Layout principal ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-5
                      flex flex-col lg:flex-row lg:gap-6 lg:items-start">

        {/* ════ COLUMNA 1: Selector de productos ════ */}
        <section className="flex-1 min-w-0">

          {/* Buscador + filtros — sticky en desktop */}
          <div className="sticky top-14 z-10 bg-[#EEF2FF]/95 dark:bg-slate-950/95 backdrop-blur-sm pb-3 mb-4 border-b border-[#E2E8F0] dark:border-slate-800">
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar plato…"
              autoComplete="off"
              /* 16px mínimo evita zoom en iOS */
              style={{ fontSize: '16px' }}
              className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3
                         outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/10
                         transition-all text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5 scrollbar-none">
              {CATEGORIAS.map(c => (
                <button
                  key={c}
                  onClick={() => setCategoria(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    categoria === c
                      ? 'bg-[#4F46E5] text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Grid responsivo de productos */}
          {filtrados.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <span className="text-4xl">🔍</span>
              <p className="text-slate-600 font-medium">Sin resultados</p>
              <p className="text-sm text-slate-400">Prueba otro término o categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-32 lg:pb-6">
              {filtrados.map(plato => (
                <TarjetaProducto
                  key={plato.nombre}
                  plato={plato}
                  qty={qty(plato.nombre)}
                  onAdd={addItem}
                  onChange={changeQty}
                />
              ))}
            </div>
          )}
        </section>

        {/* ════ COLUMNA 2: Resumen — solo desktop ════ */}
        <aside className="hidden lg:block w-[320px] shrink-0 sticky top-20">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Resumen del pedido</h2>
            <ResumenPedido {...resumenProps} />
          </div>
        </aside>
      </div>

      {/* ════ MÓVIL: Barra inferior fija ════ */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30
                      bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]
                      px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold">{totalItems} ítem{totalItems !== 1 ? 's' : ''}</p>
          <p className="text-base font-black text-slate-900 dark:text-slate-50">{fmt(total)}</p>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          disabled={items.length === 0}
          className={`px-5 py-3 rounded-xl text-sm font-bold transition-all ${
            items.length > 0
              ? 'bg-[#10B981] text-white hover:bg-[#059669] active:scale-95'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          Ver pedido →
        </button>
      </div>

      {/* ════ MÓVIL: Drawer (resumen completo) ════ */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Sheet */}
          <div className="relative w-full max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl overflow-hidden">
            {/* Handle + header */}
            <div className="flex-none pt-3 pb-2 px-4 border-b border-slate-100 dark:border-slate-800">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Resumen del pedido</h2>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800
                             hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              <ResumenPedido {...resumenProps} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
