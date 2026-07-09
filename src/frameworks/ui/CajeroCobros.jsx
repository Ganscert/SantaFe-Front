import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Receipt, Users, Clock, CheckCircle2, Wifi, WifiOff, CircleDollarSign,
  AlertCircle, Timer, History, Printer, CreditCard, Loader2, ShieldCheck,
} from 'lucide-react'
import { useMesas } from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useTokens } from '../state/TokensContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { db } from '../../adapters/db.js'

const METODOS = ['efectivo', 'transferencia', 'tarjeta']

// Envía un POST de formulario clásico (redirige el navegador a la Página de Pagos de Azul).
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

const formatPEN = (n) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0)

function tiempoRelativo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'ahora mismo'
  const min = Math.floor(diff / 60000)
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)}h`
}

const PROPINAS = [0, 5, 10, 15]

// Agrupa los items de una lista de pedidos por nombre (suma cantidades).
function agruparItems(pedidos) {
  const grouped = pedidos.flatMap((p) => p.items || []).reduce((acc, it) => {
    const k = it.nombre
    if (!acc[k]) acc[k] = { nombre: k, precio: it.precio || 0, cantidad: 0 }
    acc[k].cantidad += it.cantidad || 1
    return acc
  }, {})
  return Object.values(grouped)
}

/* ── Ticket para impresora de 80mm (visible solo al imprimir) ── */
function TicketImpresion({ ticket }) {
  if (!ticket) return null
  return (
    <div className="print-ticket">
      <p style={{ textAlign: 'center', fontWeight: 700 }}>RESTAURANTE SANTA FE</p>
      <p style={{ textAlign: 'center' }}>· comida con alma ·</p>
      <p style={{ textAlign: 'center' }}>{'='.repeat(32)}</p>
      <p>Mesa: {ticket.numeroMesa}</p>
      <p>Fecha: {ticket.fecha.toLocaleString('es-PE')}</p>
      <p>{'-'.repeat(32)}</p>
      {ticket.items.map((it) => (
        <p key={it.nombre}>
          {it.cantidad} x {it.nombre} — {formatPEN(it.precio * it.cantidad)}
        </p>
      ))}
      <p>{'-'.repeat(32)}</p>
      <p style={{ fontWeight: 700 }}>TOTAL: {formatPEN(ticket.total)}</p>
      <p style={{ textAlign: 'center', marginTop: 8 }}>¡Gracias por su visita!</p>
    </div>
  )
}

/* ── Modal de cobro ── */
function ModalPago({ mesa, total, onConfirm, onClose }) {
  const [metodo, setMetodo] = useState('efectivo')
  const [propinaPct, setPropinaPct] = useState(0)
  const [monto, setMonto] = useState(total > 0 ? total.toFixed(2) : '')
  const [loading, setLoading] = useState(false)
  const [redirigiendo, setRedirigiendo] = useState(false)
  const [error, setError] = useState('')
  const submittedRef = useRef(false)
  const sinPendientes = total <= 0
  const propina = total * (propinaPct / 100)
  const esAzul = metodo === 'azul'

  function elegirPropina(pct) {
    setPropinaPct(pct)
    if (total > 0) setMonto((total * (1 + pct / 100)).toFixed(2))
  }

  // Flujo Azul: crea la sesión de pago. En modo live redirige a la Página de Pagos;
  // en sandbox simula la aprobación y registra el cobro como tarjeta + referencia.
  async function pagarConAzul(montoNum) {
    const sesion = await db.azul.session({ mesa_id: mesa.id, monto: montoNum })
    if (sesion.mode === 'live') {
      setRedirigiendo(true)
      postRedirect(sesion.url, sesion.fields)
      return // el navegador navega a Azul; no cerramos el modal
    }
    // Sandbox: aprobación simulada
    const ap = await db.azul.sandboxApprove({ orderNumber: sesion.orderNumber })
    if (!ap.ok) throw new Error('Azul (sandbox) rechazó el pago.')
    const referencia = `AZUL:${sesion.orderNumber}:${ap.AuthorizationCode}`
    await onConfirm('tarjeta', montoNum, { referencia, gateway: 'azul' })
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submittedRef.current) return
    if (sinPendientes) return setError('No hay pedidos pendientes de cobro en esta mesa.')
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) return setError('Ingresa un monto válido.')
    submittedRef.current = true
    setLoading(true)
    try {
      if (esAzul) await pagarConAzul(montoNum)
      else { await onConfirm(metodo, montoNum); onClose() }
    } catch (err) {
      submittedRef.current = false
      setError(err.message || 'Error al registrar el cobro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E2E8F0] dark:ring-slate-800 shadow-xl p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-0.5">Registrar cobro</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Mesa {mesa.numeroMesa}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
              Método de pago
            </p>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className={`py-2 rounded-xl text-xs font-bold capitalize transition-all ring-1 ${
                    metodo === m
                      ? 'bg-indigo-500 text-white ring-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-indigo-300 dark:hover:ring-indigo-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {/* Pasarela de pago con tarjeta */}
            <button
              type="button"
              onClick={() => setMetodo('azul')}
              className={`mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ring-1 ${
                esAzul
                  ? 'bg-sky-600 text-white ring-sky-700 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-sky-400'
              }`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${esAzul ? 'bg-white/20' : 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300'}`}>
                <CreditCard size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight">Pagar con Azul</span>
                <span className={`block text-[11px] leading-tight ${esAzul ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}>
                  Tarjeta crédito/débito · pasarela segura
                </span>
              </span>
              {esAzul && <CheckCircle2 size={16} className="ml-auto shrink-0" />}
            </button>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
              Propina
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PROPINAS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => elegirPropina(pct)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ring-1 ${
                    propinaPct === pct
                      ? 'bg-[#0EA5E9] text-white ring-[#0EA5E9]'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-[#0EA5E9]/60'
                  }`}
                >
                  {pct === 0 ? 'Sin' : `${pct}%`}
                </button>
              ))}
            </div>
            {propinaPct > 0 && total > 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Cuenta {formatPEN(total)} + propina {formatPEN(propina)} = <strong className="text-slate-900 dark:text-slate-50">{formatPEN(total + propina)}</strong>
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1.5">
              Monto recibido (S/)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="0.00"
            />
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400 font-semibold">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || sinPendientes}
              className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 ${
                esAzul ? 'bg-sky-600 hover:bg-sky-700' : 'bg-indigo-500 hover:bg-indigo-600'
              }`}
            >
              {esAzul && !loading && <ShieldCheck size={14} />}
              {(loading || redirigiendo)
                ? <><Loader2 size={14} className="animate-spin" /> {redirigiendo ? 'Redirigiendo a Azul…' : 'Procesando…'}</>
                : sinPendientes ? 'Sin pendientes' : esAzul ? 'Pagar con Azul' : 'Confirmar cobro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CajeroCobros() {
  const { mesas, cambiarEstadoA, actualizarMesa } = useMesas()
  const { pedidos } = usePedidos()
  const { invalidarTokensDeMesa } = useTokens()
  const { connected, sendMessage } = useLiveSync()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  // Retorno desde la Página de Pagos de Azul (modo live): muestra el resultado.
  useEffect(() => {
    const azul = searchParams.get('azul')
    if (!azul) return
    if (azul === 'ok') toast.success('Pago con Azul aprobado y registrado.')
    else if (azul === 'cancelado') toast.info('El pago con Azul fue cancelado.')
    else toast.error('El pago con Azul fue rechazado.')
    searchParams.delete('azul')
    setSearchParams(searchParams, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [pagoModal, setPagoModal] = useState(null) // mesa seleccionada para pago
  const [ticket, setTicket] = useState(null) // datos del ticket a imprimir
  const [pedidosDBMap, setPedidosDBMap] = useState({}) // { [mesa_id]: pedido[] }
  const [cobrandoSet, setCobrandoSet] = useState(() => new Set()) // mesa.id que están en cobro
  const cobrandoRef = useRef(new Set())

  const mesasConSolicitud = useMemo(() => {
    return mesas
      .filter((m) => (m.solicitudesCuenta?.length || 0) > 0)
      .sort((a, b) => {
        const aTodos = (a.solicitudesCuenta?.length || 0) >= (a.integrantes?.length || 1)
        const bTodos = (b.solicitudesCuenta?.length || 0) >= (b.integrantes?.length || 1)
        if (aTodos !== bTodos) return aTodos ? -1 : 1
        const aTs = Math.min(...(a.solicitudesCuenta || []).map((s) => s.solicitadoEn || 0))
        const bTs = Math.min(...(b.solicitudesCuenta || []).map((s) => s.solicitadoEn || 0))
        return aTs - bTs
      })
  }, [mesas])

  const mesasPorCobrar = useMemo(
    () => mesas.filter((m) => m.estado === 'por_cobrar' && !(m.solicitudesCuenta?.length > 0)),
    [mesas],
  )

  // Claves estables para el effect de fetch
  const solicitudIdsKey = mesasConSolicitud.map(m => m.id).join(',')
  const porCobrarIdsKey = mesasPorCobrar.map(m => m.id).join(',')

  useEffect(() => {
    const allMesas = [...mesasConSolicitud, ...mesasPorCobrar]
    const seen = new Set()
    const unique = allMesas.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
    unique.forEach(mesa => {
      db.pedidos.listByMesa(mesa.id, { soloNoCobrados: true })
        .then(rows => setPedidosDBMap(prev => ({ ...prev, [mesa.id]: rows })))
        .catch(() => {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudIdsKey, porCobrarIdsKey])

  // Solo cuenta lo que la DB confirma como NO cobrado.
  // - Si la query aún no respondió (undefined) → fallback al state local
  //   (mientras carga, mostrar algo razonable para que la tarjeta no parezca rota).
  // - Si la query respondió [] → no hay nada que cobrar (no caer al state local
  //   porque ese contiene pedidos ya cobrados que rearrastran el total).
  const pedidosDeMesa = (mesa) => {
    const dbRows = pedidosDBMap[mesa.id]
    if (dbRows !== undefined) return dbRows
    return pedidos.filter(p => Number(p.mesa) === mesa.numeroMesa)
  }

  async function registrarCobro(mesa, metodo, monto, opts = {}) {
    // Guard contra doble cobro: si ya hay un cobro en curso para esta mesa, abortar
    if (cobrandoRef.current.has(mesa.id)) {
      throw new Error('Ya hay un cobro en curso para esta mesa.')
    }
    cobrandoRef.current.add(mesa.id)
    setCobrandoSet(prev => new Set(prev).add(mesa.id))
    try {
      if (monto > 0) {
        await db.pagos.insert({ mesa_id: mesa.id, monto, metodo, referencia: opts.referencia ?? null })
        await db.comensales.marcarPagado(mesa.id).catch(() => {})
      }
      // Notificar a clientes de esta mesa para que hagan hard-reset (sin esperar polling).
      sendMessage({ type: 'sync:pago', mesa_id: mesa.id, at: Date.now() })
      // Mesa queda en por_cobrar — el mesero la libera manualmente
      if (mesa.estado !== 'por_cobrar') {
        cambiarEstadoA(mesa.numeroMesa, 'por_cobrar')
      }
      actualizarMesa(mesa.numeroMesa, { solicitudesCuenta: [] })
      invalidarTokensDeMesa(mesa.id)

      // Refrescar pedidos no cobrados de la mesa — ahora deben venir vacíos
      try {
        const rows = await db.pedidos.listByMesa(mesa.id, { soloNoCobrados: true })
        setPedidosDBMap(prev => ({ ...prev, [mesa.id]: rows }))
      } catch {
        // Si falla, limpiar manualmente para no mostrar items obsoletos
        setPedidosDBMap(prev => ({ ...prev, [mesa.id]: [] }))
      }
    } finally {
      cobrandoRef.current.delete(mesa.id)
      setCobrandoSet(prev => {
        const next = new Set(prev)
        next.delete(mesa.id)
        return next
      })
    }
  }

  function calcularTotal(mesa) {
    return agruparItems(pedidosDeMesa(mesa)).reduce((s, it) => s + it.precio * it.cantidad, 0)
  }

  function imprimirTicket(mesa) {
    const items = agruparItems(pedidosDeMesa(mesa))
    setTicket({
      numeroMesa: mesa.numeroMesa,
      items,
      total: items.reduce((s, it) => s + it.precio * it.cantidad, 0),
      fecha: new Date(),
    })
    // Espera el render del ticket antes de abrir el diálogo de impresión
    setTimeout(() => window.print(), 80)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-[var(--sf-topbar,0px)] z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4 pl-16 lg:pl-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
              <Receipt size={15} />
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-50 text-sm">Panel de Cobros</span>
          </div>
          <div className="flex items-center gap-3">
            {mesasConSolicitud.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold text-xs ring-1 ring-indigo-200 dark:ring-indigo-500/30 inline-flex items-center gap-1">
                <AlertCircle size={10} />
                {mesasConSolicitud.length} solicitando
              </span>
            )}
            <Link
              to="/cajero/historial"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-indigo-300 dark:hover:ring-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
            >
              <History size={12} /> Historial
            </Link>
            <span className={`text-xs font-semibold inline-flex items-center gap-1.5 ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'En vivo' : 'Sin conexión'}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">

        {/* ── Solicitudes activas ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Solicitando la cuenta ({mesasConSolicitud.length})
            </h2>
          </div>

          {mesasConSolicitud.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 p-10 text-center">
              <CheckCircle2 size={36} className="mx-auto text-emerald-400 dark:text-emerald-500 mb-3" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Sin solicitudes pendientes</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Las alertas aparecen aquí cuando un cliente pide la cuenta.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {mesasConSolicitud.map((mesa) => (
                <TarjetaCobro
                  key={mesa.id}
                  mesa={mesa}
                  pedidosDeMesa={pedidosDeMesa(mesa)}
                  cobrando={cobrandoSet.has(mesa.id)}
                  onCobrar={() => setPagoModal(mesa)}
                  onTicket={() => imprimirTicket(mesa)}
                  onAtender={() => actualizarMesa(mesa.numeroMesa, { solicitudesCuenta: [] })}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Por cobrar — esperando liberación ── */}
        {mesasPorCobrar.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
              Por cobrar — pendiente de liberación ({mesasPorCobrar.length})
            </h2>
            <div className="space-y-2">
              {mesasPorCobrar.map((mesa) => {
                const total = calcularTotal(mesa)
                return (
                <div
                  key={mesa.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#E2E8F0] dark:ring-slate-800 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-sm">
                      {mesa.numeroMesa}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-50 text-sm">Mesa {mesa.numeroMesa}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Esperando que el mesero libere la mesa</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {total > 0 && (
                      <button
                        onClick={() => setPagoModal(mesa)}
                        disabled={cobrandoSet.has(mesa.id)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-wait"
                      >
                        {cobrandoSet.has(mesa.id) ? 'Procesando…' : 'Registrar cobro'}
                      </button>
                    )}
                    <Link
                      to={`/mesa/${mesa.numeroMesa}`}
                      className="text-xs font-bold text-[#4F46E5] dark:text-[#0EA5E9] hover:underline"
                    >
                      Ver →
                    </Link>
                  </div>
                </div>
              )})}
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <Timer size={11} />
              El mesero debe liberar la mesa desde el tablero cuando el cliente se retire.
            </p>
          </section>
        )}

      </div>

      {/* Modal de pago */}
      {pagoModal && (
        <ModalPago
          mesa={pagoModal}
          total={calcularTotal(pagoModal)}
          onConfirm={(metodo, monto, opts) => registrarCobro(pagoModal, metodo, monto, opts)}
          onClose={() => setPagoModal(null)}
        />
      )}

      {/* Ticket — solo visible en la impresión */}
      <TicketImpresion ticket={ticket} />
    </div>
  )
}

/* ── Tarjeta de cobro individual ── */
function TarjetaCobro({ mesa, pedidosDeMesa, cobrando, onCobrar, onTicket, onAtender }) {
  const solicitudes   = mesa.solicitudesCuenta || []
  const integrantes   = mesa.integrantes || []
  const todosHanPedido = integrantes.length > 0 && solicitudes.length >= integrantes.length
  const enviadaPorMesero = solicitudes.some((s) => s.origen === 'mesero')

  const itemsList = agruparItems(pedidosDeMesa)
  const total = itemsList.reduce((s, it) => s + it.precio * it.cantidad, 0)

  return (
    <div className={`rounded-2xl overflow-hidden ring-1 ${
      todosHanPedido
        ? 'ring-indigo-300 dark:ring-indigo-500/40'
        : 'ring-amber-200 dark:ring-amber-500/30'
    }`}>
      {/* Cabecera */}
      <div className={`px-4 py-3 flex items-center justify-between gap-3 ${
        todosHanPedido
          ? 'bg-indigo-50 dark:bg-indigo-500/10'
          : 'bg-amber-50/60 dark:bg-amber-500/5'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base shadow-sm ${
            todosHanPedido ? 'bg-indigo-500' : 'bg-amber-500'
          }`}>
            {mesa.numeroMesa}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 dark:text-slate-50">Mesa {mesa.numeroMesa}</p>
            <p className={`text-xs font-semibold ${
              todosHanPedido
                ? 'text-indigo-700 dark:text-indigo-300'
                : 'text-amber-700 dark:text-amber-300'
            }`}>
              {todosHanPedido
                ? `✓ Todos pidieron la cuenta (${solicitudes.length}/${integrantes.length})`
                : enviadaPorMesero
                  ? `Enviada a caja por el mesero · ${solicitudes.length} cuenta${solicitudes.length !== 1 ? 's' : ''}`
                  : `${solicitudes.length} de ${integrantes.length || '?'} comensales solicitaron`}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
          mesa.estado === 'por_cobrar'
            ? 'bg-indigo-500 text-white'
            : 'bg-amber-500 text-white'
        }`}>
          {mesa.estado === 'por_cobrar' ? 'Por cobrar' : 'Ocupada'}
        </span>
      </div>

      {/* Quién solicitó */}
      <div className="bg-white dark:bg-slate-900 px-4 py-3 border-b border-[#E2E8F0] dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
          <Users size={9} /> {enviadaPorMesero ? 'Cuentas por cobrar' : 'Solicitaron la cuenta'}
        </p>
        <div className="flex flex-wrap gap-2">
          {solicitudes.map((s) => (
            <span
              key={s.userId}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-200"
            >
              {s.nombre}
              {s.solicitadoEn && (
                <span className="text-slate-400 dark:text-slate-500 inline-flex items-center gap-0.5 text-[10px]">
                  <Clock size={9} /> {tiempoRelativo(s.solicitadoEn)}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Detalle del consumo */}
      <div className="bg-white dark:bg-slate-900 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
          Detalle del consumo
        </p>
        {itemsList.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">Sin pedidos registrados</p>
        ) : (
          <ul className="space-y-1 mb-3">
            {itemsList.map((it) => (
              <li key={it.nombre} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-700 dark:text-slate-200 truncate">
                  {it.cantidad} × {it.nombre}
                </span>
                <span className="font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {formatPEN(it.precio * it.cantidad)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between items-center pt-2.5 border-t border-[#E2E8F0] dark:border-slate-800">
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Total</span>
          <span className="text-xl font-black text-[#4F46E5] dark:text-[#0EA5E9]">{formatPEN(total)}</span>
        </div>
      </div>

      {/* Acciones */}
      <div className="bg-white dark:bg-slate-900 px-4 pb-4 flex flex-col sm:flex-row gap-2">
        {total > 0 ? (
          <button
            onClick={onCobrar}
            disabled={cobrando}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold transition-colors shadow-sm disabled:opacity-60 disabled:cursor-wait"
          >
            <CircleDollarSign size={15} /> {cobrando ? 'Procesando…' : 'Registrar cobro'}
          </button>
        ) : (
          <span className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-sm font-semibold">
            Sin consumo
          </span>
        )}
        <div className="flex gap-2">
          {itemsList.length > 0 && (
            <button
              onClick={onTicket}
              title="Imprimir ticket de consumo"
              className="px-3 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
            >
              <Printer size={13} /> Ticket
            </button>
          )}
          <Link
            to={`/mesa/${mesa.numeroMesa}`}
            className="px-3 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center"
          >
            Ver hoja →
          </Link>
          <button
            onClick={onAtender}
            className="px-3 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Marcar como atendido sin registrar cobro"
          >
            Solo atender
          </button>
        </div>
      </div>
    </div>
  )
}
