import { useMemo, useState, useEffect } from 'react'
import { useMesas }   from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ingredientes from '../assets/data/ingredientes.js'

const CATEGORIAS = ['Todos', 'Entrada', 'Plato Principal', 'Postre', 'Bebida']

function NuevoPedido() {
  const { mesas }        = useMesas()
  const { agregarPedido } = usePedidos()
  const navigate         = useNavigate()
  const [params]         = useSearchParams()

  const [mesaSeleccionada, setMesaSeleccionada] = useState(params.get('mesa') ?? '')
  const [itemsPedido, setItemsPedido]           = useState([])
  const [busqueda, setBusqueda]                 = useState('')
  const [categoria, setCategoria]               = useState('Todos')
  const [enviando, setEnviando]                 = useState(false)
  const [confirmado, setConfirmado]             = useState(false)

  useEffect(() => {
    if (params.get('mesa')) setMesaSeleccionada(params.get('mesa'))
  }, [params])

  const platosFiltrados = useMemo(() => ingredientes.filter(p => {
    const okCat = categoria === 'Todos' || p.categoria === categoria
    const okBus = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return okCat && okBus
  }), [busqueda, categoria])

  const cantidadEnCarrito = nombre => itemsPedido.find(i => i.nombre === nombre)?.cantidad ?? 0

  const agregarItem = plato => setItemsPedido(prev => {
    const i = prev.findIndex(p => p.nombre === plato.nombre)
    if (i === -1) return [...prev, { ...plato, cantidad: 1 }]
    const next = [...prev]
    next[i] = { ...next[i], cantidad: next[i].cantidad + 1 }
    return next
  })

  const cambiarCantidad = (nombre, delta) =>
    setItemsPedido(prev =>
      prev
        .map(p => p.nombre === nombre ? { ...p, cantidad: p.cantidad + delta } : p)
        .filter(p => p.cantidad > 0)
    )

  const total    = itemsPedido.reduce((s, i) => s + (i.precio ?? 0) * i.cantidad, 0)
  const canEnviar = mesaSeleccionada && itemsPedido.length > 0 && !enviando

  const enviarACocina = async () => {
    if (!canEnviar) return
    setEnviando(true)
    await new Promise(r => setTimeout(r, 600))
    agregarPedido({ mesa: mesaSeleccionada, items: itemsPedido })
    setConfirmado(true)
    setTimeout(() => navigate('/cocina/pendientes'), 800)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] min-h-screen bg-[#F6EEE3]">

      {/* ── MENÚ ── */}
      <section className="p-4 lg:p-6 overflow-y-auto">
        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-[#F6EEE3]/95 backdrop-blur-sm pb-3 mb-4 border-b border-[#E5D9C9]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="text-xl font-bold text-slate-900">Nuevo Pedido</h1>
            <button
              onClick={() => navigate('/tablero-mesas')}
              className="text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors"
            >
              ← Tablero
            </button>
          </div>

          <input
            autoFocus
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar plato…"
            className="w-full rounded-xl border border-[#E5D9C9] bg-white px-4 py-3 text-sm outline-none focus:border-[#A85638] focus:ring-2 focus:ring-[#A85638]/10 transition-all"
          />

          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {CATEGORIAS.map(c => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  categoria === c
                    ? 'bg-[#A85638] text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de platos */}
        {platosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl">🔍</span>
            <p className="text-slate-600 font-medium">Sin resultados</p>
            <p className="text-sm text-slate-400">Prueba con otro término o categoría.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {platosFiltrados.map(plato => {
              const qty = cantidadEnCarrito(plato.nombre)
              return (
                <article
                  key={plato.nombre}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden ring-1 transition-all ${
                    qty > 0 ? 'ring-[#A85638] ring-2' : 'ring-slate-200'
                  }`}
                >
                  <div className="relative">
                    <img src={plato.imagen} alt={plato.nombre} className="w-full h-32 object-cover" />
                    {qty > 0 && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#A85638] text-white text-xs font-bold flex items-center justify-center shadow">
                        {qty}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight">{plato.nombre}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{plato.categoria}</p>
                      </div>
                      <span className="font-bold text-[#A85638] text-sm whitespace-nowrap">S/ {plato.precio.toFixed(2)}</span>
                    </div>
                    <div className="mt-2">
                      {qty === 0 ? (
                        <button
                          onClick={() => agregarItem(plato)}
                          className="w-full rounded-lg bg-[#A85638] text-white py-2 text-sm font-semibold hover:bg-[#8F4527] active:scale-95 transition-all"
                        >
                          + Añadir
                        </button>
                      ) : (
                        <div className="flex items-center justify-between rounded-lg bg-[#A85638]/10 p-1">
                          <button
                            onClick={() => cambiarCantidad(plato.nombre, -1)}
                            className="size-9 rounded-md bg-white shadow-sm text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                          >
                            −
                          </button>
                          <span className="font-bold text-[#A85638]">{qty}</span>
                          <button
                            onClick={() => cambiarCantidad(plato.nombre, +1)}
                            className="size-9 rounded-md bg-white shadow-sm text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ── CARRITO ── */}
      <aside className="border-l border-[#E5D9C9] bg-white p-4 lg:p-5 lg:sticky lg:top-0 lg:h-screen flex flex-col gap-4">

        {/* Selector de mesa */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Mesa</label>
          <select
            value={mesaSeleccionada}
            onChange={e => setMesaSeleccionada(e.target.value)}
            className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#A85638] focus:ring-2 focus:ring-[#A85638]/10 transition-all"
          >
            <option value="">Selecciona una mesa</option>
            {mesas.map(m => (
              <option key={m.id} value={m.numeroMesa}>
                Mesa {m.numeroMesa} · {m.capacidad}p · {m.estado.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Lista del carrito */}
        <div className="flex-1 overflow-y-auto">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Carrito ({itemsPedido.reduce((s, i) => s + i.cantidad, 0)} items)
          </label>

          {itemsPedido.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400">
              <span className="text-3xl">🛒</span>
              <p className="text-sm">Agrega platos desde el menú.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {itemsPedido.map(item => (
                <li key={item.nombre} className="flex items-center gap-2 text-sm bg-slate-50 rounded-xl px-3 py-2">
                  <span className="flex-1 font-medium text-slate-700 truncate">{item.nombre}</span>
                  <button
                    onClick={() => cambiarCantidad(item.nombre, -1)}
                    className="size-7 rounded-lg bg-white shadow-sm text-slate-500 hover:text-red-500 font-bold transition-colors"
                  >−</button>
                  <span className="w-5 text-center font-bold text-[#A85638]">{item.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(item.nombre, +1)}
                    className="size-7 rounded-lg bg-white shadow-sm text-slate-500 hover:text-[#A85638] font-bold transition-colors"
                  >+</button>
                  <span className="w-16 text-right font-semibold text-slate-700">
                    S/ {(item.precio * item.cantidad).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Total + botón */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex justify-between text-base font-bold text-slate-900">
            <span>Total</span>
            <span>S/ {total.toFixed(2)}</span>
          </div>
          <button
            onClick={enviarACocina}
            disabled={!canEnviar}
            className={`w-full rounded-xl py-3 font-bold text-sm transition-all ${
              confirmado
                ? 'bg-emerald-500 text-white'
                : canEnviar
                  ? 'bg-[#7D8B6A] text-white hover:bg-[#69765A] active:scale-95 shadow-md shadow-[#7D8B6A]/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {confirmado ? '✓ Pedido enviado' : enviando ? 'Enviando…' : 'Enviar a Cocina'}
          </button>
          {!mesaSeleccionada && (
            <p className="text-xs text-slate-400 text-center">Selecciona una mesa para continuar.</p>
          )}
        </div>
      </aside>
    </div>
  )
}

export default NuevoPedido
