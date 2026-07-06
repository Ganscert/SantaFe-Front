import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Utensils, Plus, Minus, ShoppingBag, Check, X, LogOut, ImageIcon, Clock, ChefHat,
  Users, Receipt, Loader2, KeyRound, CreditCard, CircleDollarSign, Upload, ShieldCheck,
} from 'lucide-react'
import ingredientes from '../assets/data/ingredientes.js'
import { useAuth } from '../state/AuthContext.jsx'
import { useMesas } from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { usePlatos } from '../state/PlatosContext.jsx'
import { useTokens } from '../state/TokensContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { db } from '../../adapters/db.js'
import { supabase } from '../../adapters/supabase.js'

const BUCKET_COMPROBANTES = 'imagenes-menu' // bucket público existente; los comprobantes van en comprobantes/

// POST de formulario clásico → redirige el navegador a la Página de Pagos de Azul (modo live).
function postRedirect(url, fields) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = url
  Object.entries(fields).forEach(([k, v]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = k
    input.value = v ?? ''
    form.appendChild(input)
  })
  document.body.appendChild(form)
  form.submit()
}

const slugify = (s = '') =>
  s.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Sube el comprobante de transferencia al Storage y devuelve { url } o { error }.
async function subirComprobante(mesaId, file) {
  if (!supabase) return { error: 'Almacenamiento no configurado.' }
  if (!file)     return { error: 'Archivo vacío.' }
  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `comprobantes/transfer-${slugify(String(mesaId)).slice(0, 8) || 'mesa'}-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from(BUCKET_COMPROBANTES).upload(path, file, {
    contentType: file.type, upsert: false,
  })
  if (upErr) return { error: upErr.message }
  const { data } = supabase.storage.from(BUCKET_COMPROBANTES).getPublicUrl(path)
  return { url: data?.publicUrl, path }
}

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
  const { pedidos, agregarPedido, cancelarPedido } = usePedidos()
  const [cancelandoId, setCancelandoId] = useState(null)
  const [cancelError, setCancelError]   = useState('')
  const { platos: platosAdmin } = usePlatos()
  useTokens() // mantiene el contexto activo para sincronización
  const { serverState, sendMessage } = useLiveSync()
  const toast = useToast()

  // Leer localStorage una sola vez (no cambia durante la vida del componente).
  const activaRef = useRef(leerMesaActiva())
  const activa = activaRef.current
  const mesa = activa ? mesas.find((m) => m.id === activa.mesaId) : null
  // joinedAt es STATE (no ref) porque puede avanzar tras un cobro para
  // descartar todos los pedidos previos y evitar contaminación al refrescar.
  const [joinedAt, setJoinedAt] = useState(() => activa?.joinedAt ?? Date.now())

  const [carrito, setCarrito]     = useState([]) // [{ nombre, precio, cantidad }]
  const [categoria, setCategoria] = useState('Todos')
  const [confirma, setConfirma]   = useState(false)
  const [ultimo, setUltimo]       = useState(null) // último pedido enviado (mostrar feedback)
  const [cuentaSolicitada, setCuentaSolicitada] = useState(false)
  const [pagoModalOpen, setPagoModalOpen] = useState(false)
  const [pagoExito, setPagoExito] = useState(null) // { metodo } tras un pago confirmado
  const [mesaLiberada, setMesaLiberada] = useState(false)
  const [saliendoError, setSaliendoError] = useState('')
  const [verificandoSalida, setVerificandoSalida] = useState(false)
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [reseteando, setReseteando] = useState(false) // overlay mientras procesamos un cobro
  const enviandoRef = useRef(false)
  const salidaIniciadaRef = useRef(false)
  const lastPagoSeenRef = useRef(0)
  // Pedidos DB SIN COBRAR — única fuente de verdad para lo que el cliente debe pagar.
  // El polling cada 10s es respaldo; el camino primario es sync:pago vía Pusher.
  const [pedidosDB, setPedidosDB] = useState([])

  const refetchPedidosDB = useCallback(async () => {
    if (!mesa?.id) return []
    try {
      const rows = await db.pedidos.listByMesa(mesa.id, { soloNoCobrados: true })
      setPedidosDB(rows || [])
      return rows || []
    } catch {
      return []
    }
  }, [mesa?.id])

  // Polling de respaldo (no carga ítems cobrados).
  useEffect(() => {
    if (!mesa?.id) return
    let cancelled = false
    const fetchPedidos = () => {
      db.pedidos.listByMesa(mesa.id, { soloNoCobrados: true })
        .then(rows => { if (!cancelled) setPedidosDB(rows || []) })
        .catch(() => {})
    }
    fetchPedidos()
    const id = setInterval(() => { if (!document.hidden) fetchPedidos() }, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [mesa?.id])

  // Hard reset al detectar un cobro en esta mesa (vía Pusher sync:pago).
  // Vacía estado UI, avanza joinedAt para que pedidos viejos no reaparezcan
  // al refrescar y re-fetchea pedidosDB para confirmar la cuenta vacía.
  useEffect(() => {
    const lp = serverState?.lastPago
    if (!lp || !mesa?.id) return
    if (lp.mesa_id !== mesa.id) return
    if (lp.at <= lastPagoSeenRef.current) return
    lastPagoSeenRef.current = lp.at

    let cancelled = false
    ;(async () => {
      setReseteando(true)
      const nuevoJoinedAt = Date.now()
      try {
        const next = { ...(activaRef.current || {}), joinedAt: nuevoJoinedAt }
        activaRef.current = next
        localStorage.setItem(ACTIVE_CLIENT_MESA_KEY, JSON.stringify(next))
      } catch {}
      if (!cancelled) {
        setJoinedAt(nuevoJoinedAt)
        setCarrito([])
        setConfirma(false)
        setUltimo(null)
        setCuentaSolicitada(false)
      }
      await refetchPedidosDB()
      if (!cancelled) setReseteando(false)
    })()
    return () => { cancelled = true }
  }, [serverState?.lastPago, mesa?.id, refetchPedidosDB])

  // Cuando el personal libera la mesa (estado → disponible), expulsar al cliente.
  // mesa.estado se actualiza reactivamente vía WS sync en MesasContext.
  useEffect(() => {
    if (!mesa || mesa.estado !== 'disponible') return
    if (salidaIniciadaRef.current) return // el cliente está saliendo por su cuenta
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
    // El cliente sólo ve platos disponibles: los marcados como no disponibles
    // por un usuario autorizado quedan ocultos al elegir su pedido.
    const extra = (platosAdmin || [])
      .filter((p) => p.disponible !== false)
      .map((p) => ({
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

  // Pedidos DB del cliente desde que se unió. Sólo incluye NO cobrados
  // (la query usa soloNoCobrados=true).
  const misPedidosDB = useMemo(
    () => pedidosDB.filter(p => new Date(p.creado_en).getTime() >= joinedAt - 5000),
    [pedidosDB, joinedAt],
  )

  // Match pedido local ↔ pedido DB por timestamp cercano y total similar.
  // Como pedidosDB excluye cobrados, un match implica { cobrado: false }.
  // Devuelve null si no hay match (puede ser: muy reciente y aún no persiste, o ya fue cobrado).
  const inferirPago = (pedidoLocal) => {
    if (!misPedidosDB.length) return null
    const totalLocal = (pedidoLocal.items || []).reduce(
      (s, it) => s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0), 0
    )
    const candidato = misPedidosDB.find(p => {
      const dt = Math.abs(new Date(p.creado_en).getTime() - pedidoLocal.creadoEn)
      const totalDB = Number(p.total) || (p.pedido_items || []).reduce(
        (s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0
      )
      return dt < 15000 && Math.abs(totalDB - totalLocal) < 0.5
    })
    if (!candidato) return null
    return { cobrado: candidato.cobrado_en != null }
  }

  // El cliente NO debe ver el historial de la mesa: sólo los pedidos creados
  // desde joinedAt. Además, NUNCA mostramos un pedido ya cobrado (aislamiento
  // estricto por cobrado_en): si pedidosDB tiene datos y este pedido no aparece
  // ahí, asumimos que ya fue cobrado y lo ocultamos (excepto si es muy reciente
  // y aún no se persistió en DB).
  const misPedidos = useMemo(() => {
    if (!mesa) return []
    const ahora = Date.now()
    return pedidos
      .filter((p) => p.mesa === mesa.numeroMesa && p.creadoEn >= joinedAt)
      .filter((p) => {
        const match = inferirPago(p)
        if (match) return !match.cobrado
        // Sin match: optimista sólo si es muy reciente; si no, asumimos cobrado.
        return ahora - p.creadoEn < 15000
      })
      .sort((a, b) => b.creadoEn - a.creadoEn)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos, mesa, joinedAt, misPedidosDB])

  // Resumen "Por pagar": suma de pedidos DB míos sin cobrar.
  const totalPorPagar = useMemo(
    () => misPedidosDB
      .filter(p => p.cobrado_en == null)
      .reduce((s, p) => {
        const t = Number(p.total) || (p.pedido_items || []).reduce(
          (si, it) => si + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0
        )
        return s + t
      }, 0),
    [misPedidosDB],
  )
  const cantidadPorPagar = useMemo(
    () => misPedidosDB.filter(p => p.cobrado_en == null).length,
    [misPedidosDB],
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
    if (enviandoRef.current) return
    enviandoRef.current = true
    setEnviandoPedido(true)
    const itemsSnapshot = carrito.map((c) => ({ nombre: c.nombre, cantidad: c.cantidad, precio: c.precio }))
    const totalSnapshot = totalCarrito
    const itemsCantSnapshot = itemsCarrito
    vaciarCarrito()
    setConfirma(false)

    // Al pedir un plato nuevo, siempre cancelar cualquier solicitud de cuenta previa
    setCuentaSolicitada(false)
    if ((mesa.solicitudesCuenta || []).some((s) => s.userId === session?.id)) {
      const nextSolicitudes = (mesa.solicitudesCuenta || []).filter((s) => s.userId !== session?.id)
      actualizarMesa(mesa.numeroMesa, { solicitudesCuenta: nextSolicitudes })
    }

    try {
      agregarPedido({
        mesa: mesa.numeroMesa,
        cuentaId: null,
        cliente_nombre: session?.name ?? null,
        items: itemsSnapshot,
      })
      setUltimo({ at: Date.now(), total: totalSnapshot, items: itemsCantSnapshot })
    } finally {
      setTimeout(() => { enviandoRef.current = false; setEnviandoPedido(false) }, 800)
    }
  }

  async function salir() {
    salidaIniciadaRef.current = true
    // Sin mesa o mesa ya liberada → salir directamente
    if (!mesa || mesa.estado === 'disponible') {
      try { localStorage.removeItem(ACTIVE_CLIENT_MESA_KEY) } catch {}
      logout()
      navigate('/', { replace: true })
      return
    }

    setVerificandoSalida(true)
    setSaliendoError('')

    // Solo bloqueamos la salida si el cliente tiene pedidos sin cobrar.
    if (misPedidos.length > 0) {
      try {
        const comensales = await db.comensales.listByMesa(activa.mesaId)
        const miRegistro = comensales.find(c => c.username === session?.name)
        if (miRegistro && !miRegistro.pagado_en) {
          setSaliendoError('Tu cuenta aún no fue cobrada. Solicita la cuenta al cajero.')
          setVerificandoSalida(false)
          return
        }
      } catch {
        // Si la DB no responde, permitir salir.
      }
    }

    // Quitar al usuario de integrantes / cuentas / solicitudes en la mesa.
    const nextIntegrantes = (mesa.integrantes || []).filter(i => i.userId !== session?.id)
    const nextCuentas     = (mesa.cuentas     || []).filter(c => c.userId !== session?.id)
    const nextSolicitudes = (mesa.solicitudesCuenta || []).filter(s => s.userId !== session?.id)
    actualizarMesa(mesa.numeroMesa, {
      integrantes:        nextIntegrantes,
      cuentas:            nextCuentas,
      solicitudesCuenta:  nextSolicitudes,
    })

    // Desactivar al comensal en DB.
    if (session?.name) {
      db.comensales.deactivateOne(activa.mesaId, session.name).catch(() => {})
    }

    // Si era el último integrante → liberar la mesa para el resto del personal.
    if (nextIntegrantes.length === 0 && mesa.estado !== 'disponible') {
      cambiarEstadoA(mesa.numeroMesa, 'disponible')
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

  async function handleCancelar(pedidoId) {
    if (cancelandoId) return
    if (!window.confirm('¿Cancelar este pedido? Sólo se puede mientras la cocina no haya empezado.')) return
    setCancelandoId(pedidoId)
    setCancelError('')
    const r = await cancelarPedido(pedidoId, { cancelado_por: session?.name ?? 'cliente', motivo: 'cliente' })
    if (!r.ok) setCancelError(r.error || 'No se pudo cancelar')
    setCancelandoId(null)
    refetchPedidosDB().catch(() => {})
  }

  function pedirCuenta(opts = {}) {
    if (!mesa) return
    const { metodoPreferido = null, rnc = null } = opts
    const solicitudesCuenta = mesa.solicitudesCuenta || []
    if (solicitudesCuenta.some((s) => s.userId === session?.id)) {
      setCuentaSolicitada(true)
      return
    }
    const nuevasSolicitudes = [
      ...solicitudesCuenta,
      { userId: session.id, nombre: session.name, solicitadoEn: Date.now(), metodoPreferido, rnc },
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

  // Llamado por el modal de pago del cliente.
  // - Efectivo: no registra pago (se paga al personal); sólo solicita la cuenta con el método y RNC.
  // - Tarjeta (Azul sandbox) / Transferencia: el pago YA quedó registrado en DB; aquí limpiamos la
  //   cuenta del cliente, avisamos al personal vía Pusher y marcamos al comensal como pagado.
  async function onPagadoCliente({ pagado, metodo, rnc }) {
    if (!pagado) {
      pedirCuenta({ metodoPreferido: metodo, rnc })
      setPagoModalOpen(false)
      return
    }
    setPagoModalOpen(false)
    setReseteando(true)
    try { sendMessage?.({ type: 'sync:pago', mesa_id: mesa.id, at: Date.now() }) } catch {}
    db.comensales.marcarPagado(mesa.id).catch(() => {})

    const nuevoJoinedAt = Date.now()
    try {
      const next = { ...(activaRef.current || {}), joinedAt: nuevoJoinedAt }
      activaRef.current = next
      localStorage.setItem(ACTIVE_CLIENT_MESA_KEY, JSON.stringify(next))
    } catch {}
    setJoinedAt(nuevoJoinedAt)
    setCarrito([])
    setConfirma(false)
    setCuentaSolicitada(false)
    await refetchPedidosDB()
    setReseteando(false)
    setPagoExito({ metodo })
    toast.success(metodo === 'transferencia'
      ? 'Transferencia registrada con tu comprobante. ¡Gracias!'
      : 'Pago con tarjeta aprobado. ¡Gracias!')
  }

  // Mesa liberada por el personal → pantalla de despedida antes del logout automático
  if (mesaLiberada) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-sm p-6 text-center">
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
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-sm p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A85638]/10 text-[#A85638] flex items-center justify-center mb-3">
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
    <div className="min-h-screen pb-32">
      {/* Overlay bloqueante durante el hard-reset post-cobro */}
      {reseteando && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-2xl p-6 text-center max-w-xs w-full">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
              <Loader2 size={26} className="animate-spin" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Actualizando cuenta…</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tu pago fue registrado. Sincronizando tu cuenta.
            </p>
          </div>
        </div>
      )}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-[#E5D9C9] dark:border-slate-800 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-[#A85638] dark:text-[#C99A3C]">
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
                className="px-2.5 py-2 rounded-xl border border-[#E5D9C9] dark:border-slate-700 text-slate-500 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
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
                      ? 'bg-[#A85638]/15 text-[#A85638] dark:bg-[#A85638]/25 dark:text-[#F6EEE3]'
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
                    ? 'bg-[#A85638] text-white'
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

        {/* Aviso de pedidos por pagar */}
        {cantidadPorPagar > 0 && (
          <div className="mb-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Receipt size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Tienes {cantidadPorPagar} pedido{cantidadPorPagar !== 1 ? 's' : ''} sin pagar
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80">
                Total pendiente: <span className="font-black">{formatPEN(totalPorPagar)}</span>. Revisá abajo cuáles están marcados como <span className="font-bold">Por pagar</span>.
              </p>
            </div>
          </div>
        )}

        {/* Pedir la cuenta / pagar */}
        <div className="mb-4">
          {pagoExito ? (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <Check size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Pago realizado</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300/80">
                  {pagoExito.metodo === 'transferencia'
                    ? 'Tu transferencia y comprobante quedaron registrados.'
                    : 'Tu pago con tarjeta fue aprobado. ¡Gracias!'}
                </p>
              </div>
            </div>
          ) : (cuentaSolicitada || (mesa.solicitudesCuenta || []).some((s) => s.userId === session?.id)) ? (
            <div className="space-y-2">
              <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
                  <Receipt size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">Cuenta solicitada</p>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300/80">El personal fue notificado.</p>
                </div>
              </div>
              {totalPorPagar > 0 && (
                <button
                  type="button"
                  onClick={() => setPagoModalOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#A85638] hover:bg-[#8F4527] text-white text-sm font-bold transition-colors"
                >
                  <CreditCard size={15} /> Pagar en línea ({formatPEN(totalPorPagar)})
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPagoModalOpen(true)}
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
                const pago = inferirPago(p)
                return (
                  <div
                    key={p.id}
                    className={`bg-white dark:bg-slate-900 rounded-2xl ring-1 px-4 py-3 ${
                      pago && !pago.cobrado
                        ? 'ring-amber-300 dark:ring-amber-500/40'
                        : 'ring-[#E5D9C9] dark:ring-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                        <Clock size={11} /> {p.hora}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {pago && (
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              pago.cobrado
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {pago.cobrado ? 'Pagado' : 'Por pagar'}
                          </span>
                        )}
                        <EstadoPedido estado={estado} />
                      </div>
                    </div>
                    <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-0.5">
                      {items.map((it, idx) => (
                        <li key={it.id || idx} className="flex justify-between gap-3">
                          <span className="truncate">{it.cantidad} × {it.nombre}</span>
                          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatPEN((it.precio || 0) * (it.cantidad || 1))}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 pt-2 border-t border-[#E5D9C9] dark:border-slate-800 flex justify-between text-sm font-bold">
                      <span className="text-slate-500 dark:text-slate-400">Total</span>
                      <span className="text-[#A85638] dark:text-[#C99A3C]">{formatPEN(total)}</span>
                    </div>
                    {/* Cancelar (sólo si aún pendiente y no cobrado) */}
                    {estado === 'pendiente' && !(pago && pago.cobrado) && (
                      <button
                        type="button"
                        onClick={() => handleCancelar(p.id)}
                        disabled={cancelandoId === p.id}
                        className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {cancelandoId === p.id
                          ? <><Loader2 size={12} className="animate-spin" /> Cancelando…</>
                          : <><X size={12} /> Cancelar pedido</>}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {cancelError && (
              <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{cancelError}</p>
            )}
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
                <article key={plato.key} className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 overflow-hidden flex">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 bg-[#F6EEE3] dark:bg-slate-800 flex items-center justify-center shrink-0 relative">
                    {plato.imagen ? (
                      <img src={plato.imagen} alt={plato.nombre} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={28} className="text-slate-300 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-50 truncate">{plato.nombre}</h3>
                      <p className="text-[10px] text-[#7D8B6A] dark:text-[#AEBC97] font-bold uppercase tracking-wider">{plato.categoria}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#A85638] dark:text-[#C99A3C] font-black text-sm">{formatPEN(plato.precio)}</span>
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
                            className="w-7 h-7 rounded-lg bg-[#A85638] text-white flex items-center justify-center hover:bg-[#8F4527]"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => agregarAlCarrito(plato)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#A85638] hover:bg-[#8F4527] text-white text-xs font-bold transition-colors"
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
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#A85638] hover:bg-[#8F4527] text-white text-sm font-bold shadow-xl"
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
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5D9C9] dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-lg">Tu pedido</h3>
              <button onClick={() => setConfirma(false)} aria-label="Cerrar" className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center">
                <X size={15} />
              </button>
            </div>
            <ul className="px-5 py-3 max-h-72 overflow-y-auto divide-y divide-[#E5D9C9] dark:divide-slate-800">
              {carrito.map((it) => (
                <li key={it.nombre} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{it.nombre}</p>
                    <p className="text-[11px] text-slate-500">{formatPEN(it.precio)} c/u</p>
                  </div>
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button onClick={() => cambiarCantidad(it.nombre, -1)} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 flex items-center justify-center"><Minus size={12} /></button>
                    <span className="w-6 text-center text-sm font-black">{it.cantidad}</span>
                    <button onClick={() => cambiarCantidad(it.nombre, 1)} className="w-7 h-7 rounded-lg bg-[#A85638] text-white flex items-center justify-center"><Plus size={12} /></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-[#E5D9C9] dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-xl font-black text-[#A85638] dark:text-[#C99A3C]">{formatPEN(totalCarrito)}</span>
            </div>
            <div className="px-5 pb-5 flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={vaciarCarrito}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#E5D9C9] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Vaciar
              </button>
              <button
                type="button"
                onClick={enviarPedido}
                disabled={enviandoPedido}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#A85638] hover:bg-[#8F4527] text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {enviandoPedido
                  ? <><Loader2 size={14} className="animate-spin" /> Enviando…</>
                  : <><ChefHat size={14} /> Enviar a cocina</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de pago del cliente al pedir la cuenta */}
      {pagoModalOpen && (
        <ModalPagoCliente
          mesa={mesa}
          total={totalPorPagar}
          onClose={() => setPagoModalOpen(false)}
          onResult={onPagadoCliente}
        />
      )}
    </div>
  )
}

/**
 * Modal de pago del cliente. Permite elegir RNC (comprobante fiscal) y método:
 *  - Efectivo: avisa al personal (paga en caja); no registra pago en DB.
 *  - Tarjeta (Azul): pasarela. En sandbox aprueba y registra; en live redirige a Azul.
 *  - Transferencia: adjunta el comprobante (obligatorio), lo sube a Storage y registra el pago.
 */
function ModalPagoCliente({ mesa, total, onClose, onResult }) {
  const [metodo, setMetodo] = useState('efectivo')
  const [rnc, setRnc] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [redirigiendo, setRedirigiendo] = useState(false)
  const [error, setError] = useState('')
  const submittedRef = useRef(false)
  const fileInputRef = useRef(null)

  const sinMonto = !(total > 0)
  const rncLimpio = rnc.trim()
  const refRnc = rncLimpio ? `|RNC:${rncLimpio}` : ''

  function elegirArchivo(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const okTipo = f.type.startsWith('image/') || f.type === 'application/pdf'
    if (!okTipo) { setError('El comprobante debe ser una imagen o PDF.'); return }
    setError('')
    setFile(f)
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }

  async function pagarConAzul() {
    const sesion = await db.azul.session({ mesa_id: mesa.id, monto: total, returnTo: 'cliente' })
    if (sesion.mode === 'live') {
      setRedirigiendo(true)
      postRedirect(sesion.url, sesion.fields) // el navegador navega a Azul
      return true // no cerrar: estamos saliendo de la página
    }
    const ap = await db.azul.sandboxApprove({ orderNumber: sesion.orderNumber })
    if (!ap.ok) throw new Error('Azul (sandbox) rechazó el pago.')
    await db.pagos.insert({
      mesa_id: mesa.id, monto: total, metodo: 'tarjeta',
      referencia: `AZUL:${sesion.orderNumber}:${ap.AuthorizationCode}${refRnc}`,
    })
    return false
  }

  async function pagarTransferencia() {
    if (!file) throw new Error('Adjunta el comprobante de la transferencia.')
    const up = await subirComprobante(mesa.id, file)
    if (up.error) throw new Error(`No se pudo subir el comprobante: ${up.error}`)
    await db.pagos.insert({
      mesa_id: mesa.id, monto: total, metodo: 'transferencia',
      referencia: `TRANSF:${up.url}${refRnc}`,
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submittedRef.current) return
    setError('')

    // Efectivo: no requiere monto/pasarela — sólo notifica al personal.
    if (metodo === 'efectivo') {
      onResult({ pagado: false, metodo: 'efectivo', rnc: rncLimpio || null })
      return
    }
    if (sinMonto) return setError('No tienes consumo pendiente de pago.')

    submittedRef.current = true
    setProcesando(true)
    try {
      if (metodo === 'azul') {
        const saliendo = await pagarConAzul()
        if (saliendo) return // redirigiendo a Azul
        onResult({ pagado: true, metodo: 'tarjeta', rnc: rncLimpio || null })
      } else {
        await pagarTransferencia()
        onResult({ pagado: true, metodo: 'transferencia', rnc: rncLimpio || null })
      }
    } catch (err) {
      submittedRef.current = false
      setError(err.message || 'No se pudo procesar el pago.')
    } finally {
      setProcesando(false)
    }
  }

  const OPCIONES = [
    { id: 'efectivo',      label: 'Efectivo',      desc: 'Pagas en caja al personal',          Icon: CircleDollarSign },
    { id: 'azul',          label: 'Tarjeta',       desc: 'Crédito/débito · pasarela Azul',     Icon: CreditCard },
    { id: 'transferencia', label: 'Transferencia', desc: 'Adjunta tu comprobante al instante', Icon: Receipt },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={procesando ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E5D9C9] dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-50 text-lg">Pagar la cuenta</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mesa {mesa.numeroMesa}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" disabled={procesando} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center disabled:opacity-50">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Total */}
          <div className="rounded-2xl bg-[#F6EEE3] dark:bg-slate-800 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Total a pagar</span>
            <span className="text-xl font-black text-[#A85638] dark:text-[#C99A3C]">{formatPEN(total)}</span>
          </div>

          {/* RNC */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
              RNC (comprobante fiscal) · opcional
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={rnc}
              onChange={(e) => setRnc(e.target.value.replace(/[^0-9-]/g, '').slice(0, 15))}
              placeholder="Ej. 1-31-12345-6"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-[#A85638]/30 focus:border-[#A85638]"
            />
          </div>

          {/* Método */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Método de pago</p>
            <div className="space-y-2">
              {OPCIONES.map(({ id, label, desc, Icon }) => {
                const activo = metodo === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMetodo(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ring-1 ${
                      activo
                        ? 'bg-[#A85638] text-white ring-[#8F4527] shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-[#A85638]/50'
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${activo ? 'bg-white/20' : 'bg-[#F6EEE3] dark:bg-slate-700 text-[#A85638] dark:text-[#C99A3C]'}`}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-tight">{label}</span>
                      <span className={`block text-[11px] leading-tight ${activo ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}>{desc}</span>
                    </span>
                    {activo && <Check size={16} className="shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Adjuntar comprobante (sólo transferencia) */}
          {metodo === 'transferencia' && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                Comprobante de transferencia <span className="text-red-500">*</span>
              </p>
              {preview ? (
                <div className="relative rounded-2xl overflow-hidden ring-1 ring-[#E5D9C9] dark:ring-slate-700">
                  <img src={preview} alt="Comprobante" className="w-full max-h-56 object-contain bg-slate-50 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    aria-label="Quitar comprobante"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : file ? (
                <div className="rounded-xl bg-[#F6EEE3] dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2">
                  <span className="truncate">📎 {file.name}</span>
                  <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ) : (
                <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[#E5D9C9] dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer transition-colors">
                  <Upload size={16} />
                  <span>Adjuntar comprobante (imagen o PDF)</span>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={elegirArchivo} />
                </label>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Sube la captura/PDF de tu transferencia interbancaria inmediata.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500 dark:text-red-400 font-semibold">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={procesando}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesando || (metodo !== 'efectivo' && sinMonto) || (metodo === 'transferencia' && !file)}
              className="flex-1 py-2.5 rounded-xl bg-[#A85638] hover:bg-[#8F4527] text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {(procesando || redirigiendo)
                ? <><Loader2 size={14} className="animate-spin" /> {redirigiendo ? 'Redirigiendo a Azul…' : 'Procesando…'}</>
                : metodo === 'efectivo'
                  ? <><CircleDollarSign size={14} /> Solicitar la cuenta</>
                  : metodo === 'azul'
                    ? <><ShieldCheck size={14} /> Pagar {formatPEN(total)}</>
                    : <><Receipt size={14} /> Registrar transferencia</>}
            </button>
          </div>
        </form>
      </div>
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
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-sm p-6 text-center"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A85638]/10 text-[#A85638] dark:text-[#C99A3C] flex items-center justify-center mb-3">
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
          className="mt-5 w-full text-center text-3xl font-black tracking-[0.4em] font-mono px-3 py-3 rounded-xl border border-[#E5D9C9] dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#A85638]/30 focus:border-[#A85638]"
        />

        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={codigo.length !== 6}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#A85638] hover:bg-[#8F4527] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
        >
          Unirme a la mesa
        </button>

        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          ¿Tienes un código QR? Pídele a recepción que lo muestre y escanéalo.
        </p>

        <button
          type="button"
          onClick={onSalir}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5D9C9] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
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
