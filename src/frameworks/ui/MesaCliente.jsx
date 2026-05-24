import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Utensils, Plus, Minus, ShoppingBag, Check, X, LogOut, ImageIcon, Clock, ChefHat,
  Users, Receipt, Loader2, KeyRound,
} from 'lucide-react'
import ingredientes from '../assets/data/ingredientes.js'
import { useAuth } from '../state/AuthContext.jsx'
import { useMesas } from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { usePlatos } from '../state/PlatosContext.jsx'
import { useTokens } from '../state/TokensContext.jsx'
import { db } from '../../adapters/db.js'

const ACTIVE_CLIENT_MESA_KEY = 'santa-fe:client-mesa'
const CATEGORIAS = ['Todos', 'Entrada', 'Plato Principal', 'Postre', 'Bebida']

const formatPEN = (n) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0)

function leerMesaActiva() {
  try {
    const raw = localStorage.getItem(ACTIVE_CLIENT_MESA_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/**
 * Vista del cliente una vez unido a una mesa.
 * Sólo ve menú + sus pedidos. No accede al panel ni a otras mesas.
 */
export default function MesaCliente() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const { mesas, actualizarMesa, cambiarEstadoA } = useMesas()
  const { pedidos, agregarPedido } = usePedidos()
  const { platos: platosAdmin } = usePlatos()
  useTokens() // mantiene el contexto activo para sincronización

  // Leer localStorage una sola vez (no cambia durante la vida del componente).
  const activaRef = useRef(leerMesaActiva())
  const activa = activaRef.current
  const mesa = activa ? mesas.find((m) => m.id === activa.mesaId) : null
  // Momento en que el cliente se unió — sirve para ocultar el historial previo.
  const joinedAt = activa?.joinedAt ?? Date.now()

  const [carrito, setCarrito]     = useState([]) // [{ nombre, precio, cantidad }]
  const [categoria, setCategoria] = useState('Todos')
  const [confirma, setConfirma]   = useState(false)
  const [ultimo, setUltimo]       = useState(null) // último pedido enviado (mostrar feedback)
  const [cuentaSolicitada, setCuentaSolicitada] = useState(false)
  const [mesaLiberada, setMesaLiberada] = useState(false)
  const [saliendoError, setSaliendoError] = useState('')
  const [verificandoSalida, setVerificandoSalida] = useState(false)

  // Cuando el personal libera la mesa (estado → disponible), expulsar al cliente.
  // mesa.estado se actualiza reactivamente vía WS sync en MesasContext.
  useEffect(() => {
    if (!mesa || mesa.estado !== 'disponible') return
    setMesaLiberada(true)
    const id = setTimeout(() => {
      try { localStorage.removeItem(ACTIVE_CLIENT_MESA_KEY) } catch {}
      logout()
      navigate('/', { replace: true })
    }, 2200)
    return () => clearTimeout(id)
  }, [mesa?.estado, logout, navigate])

  // Catálogo combinado (estático + admin)
  const catalogo = useMemo(() => {
    const base = ingredientes.map((p, i) => ({
      key: `static-${i}`,
      nombre: p.nombre,
      precio: p.precio,
      categoria: p.categoria,
      imagen: p.imagen,
      ingredientes: p.ingredientes,
    }))
    const extra = (platosAdmin || []).map((p) => ({
      key: `admin-${p.id}`,
      nombre: p.nombre,
      precio: p.precio,
      categoria: p.categoria,
      imagen: p.imagenData || null,
      ingredientes: p.ingredientes,
    }))
    return [...extra, ...base]
  }, [platosAdmin])

  const filtrados = categoria === 'Todos' ? catalogo : catalogo.filter((p) => p.categoria === categoria)

  // Sin mesa válida (token nunca usado o sesión nueva): vista de "espera"
  useEffect(() => {
    if (!session) navigate('/', { replace: true })
  }, [session, navigate])

  // El cliente NO debe ver el historial de la mesa: sólo los pedidos creados
  // desde el momento en que se unió a esta sesión (excluye pedidos previos
  // de otros comensales o de visitas anteriores a la mesa).
  const misPedidos = useMemo(
    () => mesa
      ? pedidos
          .filter((p) => p.mesa === mesa.numeroMesa && p.creadoEn >= joinedAt)
          .sort((a, b) => b.creadoEn - a.creadoEn)
      : [],
    [pedidos, mesa, joinedAt],
  )

  const totalCarrito = carrito.reduce((s, it) => s + it.precio * it.cantidad, 0)
  const itemsCarrito = carrito.reduce((s, it) => s + it.cantidad, 0)

  function agregarAlCarrito(plato) {
    setCarrito((prev) => {
      const existente = prev.find((x) => x.nombre === plato.nombre)
      if (existente) {
        return prev.map((x) => x.nombre === plato.nombre ? { ...x, cantidad: x.cantidad + 1 } : x)
      }
      return [...prev, { nombre: plato.nombre, precio: plato.precio, cantidad: 1 }]
    })
  }

  function cambiarCantidad(nombre, delta) {
    setCarrito((prev) => {
      const next = prev
        .map((x) => x.nombre === nombre ? { ...x, cantidad: x.cantidad + delta } : x)
        .filter((x) => x.cantidad > 0)
      return next
    })
  }

  function vaciarCarrito() {
    setCarrito([])
  }

  function enviarPedido() {
    if (!mesa || carrito.length === 0) return
    agregarPedido({
      mesa: mesa.numeroMesa,
      cuentaId: null,
      items: carrito.map((c) => ({ nombre: c.nombre, cantidad: c.cantidad, precio: c.precio })),
    })
    setUltimo({ at: Date.now(), total: totalCarrito, items: itemsCarrito })
    vaciarCarrito()
    setConfirma(false)
  }

  async function salir() {
    // Sin pedidos o mesa ya liberada → salir directamente
    if (misPedidos.length === 0 || !mesa || mesa.estado === 'disponible') {
      try { localStorage.removeItem(ACTIVE_CLIENT_MESA_KEY) } catch {}
      logout()
      navigate('/', { replace: true })
      return
    }

    setVerificandoSalida(true)
    setSaliendoError('')
    try {
      const comensales = await db.comensales.listByMesa(activa.mesaId)
      const miRegistro = comensales.find(c => c.username === session?.name)
      if (miRegistro && !miRegistro.pagado_en) {
        setSaliendoError('Tu cuenta aún no fue cobrada. Solicita la cuenta al cajero.')
        setVerificandoSalida(false)
        return
      }
    } catch {
      // Si la DB no responde, permitir salir
    }

    try { localStorage.removeItem(ACTIVE_CLIENT_MESA_KEY) } catch {}
    logout()
    navigate('/', { replace: true })
  }

  function cambiarMesa() {
    if (!mesa) return

    // Remover al usuario de integrantes y cuentas de la mesa actual
    const nextIntegrantes = (mesa.integrantes || []).filter(i => i.userId !== session?.id)
    const nextCuentas = (mesa.cuentas || []).filter(c => c.userId !== session?.id)
    actualizarMesa(mesa.numeroMesa, { integrantes: nextIntegrantes, cuentas: nextCuentas })

    // Guardar datos para transferir al unirse a la nueva mesa
    const miCuenta = (mesa.cuentas || []).find(c => c.userId === session?.id)
    if (miCuenta) {
      try {
        localStorage.setItem('santa-fe:pending-transfer', JSON.stringify({
          cuentaId: miCuenta.id,
          oldMesaNumero: mesa.numeroMesa,
        }))
      } catch {}
    }

    try { localStorage.removeItem(ACTIVE_CLIENT_MESA_KEY) } catch {}
    // Navegar a /mi-mesa donde verán el UnirseConCodigo para escanear nueva mesa
    navigate('/mi-mesa', { replace: true })
  }

  function pedirCuenta() {
    if (!mesa) return
    const solicitudesCuenta = mesa.solicitudesCuenta || []
    if (solicitudesCuenta.some((s) => s.userId === session?.id)) {
      setCuentaSolicitada(true)
      return
    }
    const nuevasSolicitudes = [
      ...solicitudesCuenta,
      { userId: session.id, nombre: session.name, solicitadoEn: Date.now() },
    ]
    actualizarMesa(mesa.numeroMesa, { solicitudesCuenta: nuevasSolicitudes })

    // Si todos los integrantes de la mesa ya solicitaron → pasar a por_cobrar
    const integrantes = mesa.integrantes || []
    const todosHanPedido =
      integrantes.length > 0 &&
      integrantes.every((int) => nuevasSolicitudes.some((s) => s.userId === int.userId))
    if (todosHanPedido) {
      cambiarEstadoA(mesa.numeroMesa, 'por_cobrar')
    }

    setCuentaSolicitada(true)
  }

  // Mesa liberada por el personal → pantalla de despedida antes del logout automático
  if (mesaLiberada) {
    return (
      <main className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 shadow-sm p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
            <LogOut size={28} />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">Mesa cerrada</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            El personal ha cerrado la mesa. Gracias por tu visita.
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" /> Saliendo…
          </div>
        </div>
      </main>
    )
  }

  // Si activa existe pero mesas aún no cargaron del WS → mostrar loading en vez de "sin mesa"
  if (activa && !mesa) {
    return (
      <main className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 shadow-sm p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#C1440E]/10 text-[#C1440E] flex items-center justify-center mb-3">
            <Loader2 size={28} className="animate-spin" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">Sincronizando…</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cargando datos de tu mesa.</p>
        </div>
      </main>
    )
  }

  if (!mesa) {
    return <UnirseConCodigo onSalir={salir} />
  }

  return (
    <div className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950 pb-32">
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-[#e8e0d8] dark:border-slate-800 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-[#C1440E] dark:text-[#D4A017]">
                Mesa {mesa.numeroMesa}
              </p>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-50 truncate">
                Hola, {session?.name?.split(' ')[0] || 'invitado'}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={cambiarMesa}
                title="Cambiar de mesa"
                className="px-2.5 py-2 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-500 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cambiar mesa
              </button>
              <button
                type="button"
                onClick={salir}
                aria-label="Cerrar sesión"
                disabled={verificandoSalida}
                className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center disabled:opacity-50"
              >
                {verificandoSalida ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              </button>
            </div>
          </div>

          {saliendoError && (
            <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{saliendoError}</p>
          )}

          {/* Integrantes de la mesa */}
          {(mesa.integrantes || []).length > 0 && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5">
              <Users size={11} className="text-slate-400 shrink-0" />
              {(mesa.integrantes || []).map((int) => (
                <span
                  key={int.userId}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    int.userId === session?.id
                      ? 'bg-[#C1440E]/15 text-[#C1440E] dark:bg-[#C1440E]/25 dark:text-[#FDF6EC]'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {int.nombre.split(' ')[0]}{int.userId === session?.id ? ' (tú)' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Categorías */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  categoria === c
                    ? 'bg-[#C1440E] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {ultimo && (
          <div className="mb-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <Check size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Pedido enviado a cocina</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300/80">
                {ultimo.items} ítem{ultimo.items !== 1 ? 's' : ''} · {formatPEN(ultimo.total)}
              </p>
            </div>
            <button onClick={() => setUltimo(null)} className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Pedir la cuenta */}
        <div className="mb-4">
          {(cuentaSolicitada || (mesa.solicitudesCuenta || []).some((s) => s.userId === session?.id)) ? (
            <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
                <Receipt size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">Cuenta solicitada</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300/80">El personal fue notificado.</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={pedirCuenta}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300 text-sm font-bold hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
            >
              <Receipt size={15} /> Pedir la cuenta
            </button>
          )}
        </div>

        {/* Pedidos previos */}
        {misPedidos.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Tus pedidos
            </h2>
            <div className="space-y-2">
              {misPedidos.slice(0, 5).map((p) => {
                const items = p.items || []
                const total = items.reduce((s, it) => s + (it.precio || 0) * (it.cantidad || 1), 0)
                const estado = items.every((it) => it.estado === 'listo') || p.estado === 'listo'
                  ? 'listo'
                  : p.estado
                return (
                  <div key={p.id} className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                        <Clock size={11} /> {p.hora}
                      </span>
                      <EstadoPedido estado={estado} />
                    </div>
                    <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-0.5">
                      {items.map((it, idx) => (
                        <li key={it.id || idx} className="flex justify-between gap-3">
                          <span className="truncate">{it.cantidad} × {it.nombre}</span>
                          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatPEN((it.precio || 0) * (it.cantidad || 1))}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 pt-2 border-t border-[#e8e0d8] dark:border-slate-800 flex justify-between text-sm font-bold">
                      <span className="text-slate-500 dark:text-slate-400">Total</span>
                      <span className="text-[#C1440E] dark:text-[#D4A017]">{formatPEN(total)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Catálogo */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            Menú
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtrados.map((plato) => {
              const enCarrito = carrito.find((c) => c.nombre === plato.nombre)
              return (
                <article key={plato.key} className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 overflow-hidden flex">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 bg-[#FDF6EC] dark:bg-slate-800 flex items-center justify-center shrink-0 relative">
                    {plato.imagen ? (
                      <img src={plato.imagen} alt={plato.nombre} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={28} className="text-slate-300 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-50 truncate">{plato.nombre}</h3>
                      <p className="text-[10px] text-[#6B7C4F] dark:text-[#a3b48a] font-bold uppercase tracking-wider">{plato.categoria}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#C1440E] dark:text-[#D4A017] font-black text-sm">{formatPEN(plato.precio)}</span>
                      {enCarrito ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(plato.nombre, -1)}
                            aria-label={`Quitar uno de ${plato.nombre}`}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-sm font-black text-slate-900 dark:text-slate-50 w-5 text-center">{enCarrito.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(plato.nombre, 1)}
                            aria-label={`Agregar uno más de ${plato.nombre}`}
                            className="w-7 h-7 rounded-lg bg-[#C1440E] text-white flex items-center justify-center hover:bg-[#a33a0c]"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => agregarAlCarrito(plato)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#C1440E] hover:bg-[#a33a0c] text-white text-xs font-bold transition-colors"
                        >
                          <Plus size={12} /> Agregar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </main>

      {/* Carrito flotante */}
      {carrito.length > 0 && (
        <button
          type="button"
          onClick={() => setConfirma(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#C1440E] hover:bg-[#a33a0c] text-white text-sm font-bold shadow-xl"
        >
          <ShoppingBag size={16} />
          <span>{itemsCarrito} ítem{itemsCarrito !== 1 ? 's' : ''}</span>
          <span className="opacity-70">·</span>
          <span>{formatPEN(totalCarrito)}</span>
          <span className="opacity-70 ml-1">→</span>
        </button>
      )}

      {/* Modal de confirmación */}
      {confirma && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirma(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e8e0d8] dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-lg">Tu pedido</h3>
              <button onClick={() => setConfirma(false)} aria-label="Cerrar" className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center">
                <X size={15} />
              </button>
            </div>
            <ul className="px-5 py-3 max-h-72 overflow-y-auto divide-y divide-[#e8e0d8] dark:divide-slate-800">
              {carrito.map((it) => (
                <li key={it.nombre} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{it.nombre}</p>
                    <p className="text-[11px] text-slate-500">{formatPEN(it.precio)} c/u</p>
                  </div>
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button onClick={() => cambiarCantidad(it.nombre, -1)} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 flex items-center justify-center"><Minus size={12} /></button>
                    <span className="w-6 text-center text-sm font-black">{it.cantidad}</span>
                    <button onClick={() => cambiarCantidad(it.nombre, 1)} className="w-7 h-7 rounded-lg bg-[#C1440E] text-white flex items-center justify-center"><Plus size={12} /></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-[#e8e0d8] dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-xl font-black text-[#C1440E] dark:text-[#D4A017]">{formatPEN(totalCarrito)}</span>
            </div>
            <div className="px-5 pb-5 flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={vaciarCarrito}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Vaciar
              </button>
              <button
                type="button"
                onClick={enviarPedido}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C1440E] hover:bg-[#a33a0c] text-white text-sm font-bold transition-colors"
              >
                <ChefHat size={14} /> Enviar a cocina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Pantalla mostrada al cliente que inicia sesión sin tener una mesa
// asociada (no escaneó QR). Permite ingresar el código de 6 dígitos
// generado por recepción/mesero junto al QR.
function UnirseConCodigo({ onSalir }) {
  const navigate = useNavigate()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')

  function handleChange(e) {
    const limpio = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCodigo(limpio)
    if (error) setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (codigo.length !== 6) {
      setError('Ingresa los 6 dígitos del código.')
      return
    }
    navigate(`/join?codigo=${codigo}`, { replace: true })
  }

  return (
    <main className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 shadow-sm p-6 text-center"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#C1440E]/10 text-[#C1440E] dark:text-[#D4A017] flex items-center justify-center mb-3">
          <KeyRound size={28} />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">
          Únete a tu mesa
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Ingresa el código de 6 dígitos que te mostró recepción.
        </p>

        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={codigo}
          onChange={handleChange}
          placeholder="000000"
          aria-label="Código de 6 dígitos"
          className="mt-5 w-full text-center text-3xl font-black tracking-[0.4em] font-mono px-3 py-3 rounded-xl border border-[#e8e0d8] dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#C1440E]/30 focus:border-[#C1440E]"
        />

        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={codigo.length !== 6}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C1440E] hover:bg-[#a33a0c] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
        >
          Unirme a la mesa
        </button>

        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          ¿Tienes un código QR? Pídele a recepción que lo muestre y escanéalo.
        </p>

        <button
          type="button"
          onClick={onSalir}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <LogOut size={12} /> Cerrar sesión
        </button>
      </form>
    </main>
  )
}

function EstadoPedido({ estado }) {
  const map = {
    pendiente:       { label: 'Pendiente',   cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    en_preparacion:  { label: 'Preparando',  cls: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300' },
    listo:           { label: 'Listo',       cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
    entregado:       { label: 'Entregado',   cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  }
  const cfg = map[estado] || map.pendiente
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
