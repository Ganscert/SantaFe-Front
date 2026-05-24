import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Receipt, Users, Clock, CheckCircle2, Wifi, WifiOff, CircleDollarSign,
  AlertCircle, Timer, Hourglass,
} from 'lucide-react'
import { useMesas } from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useTokens } from '../state/TokensContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { db } from '../../adapters/db.js'

const METODOS = ['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia']

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

function formatMinutos(min) {
  const m = Math.round(Number(min) || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`
}

/* ── Modal de cobro ── */
function ModalPago({ mesa, total, onConfirm, onClose }) {
  const [metodo, setMetodo] = useState('efectivo')
  const [monto, setMonto] = useState(total > 0 ? total.toFixed(2) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) return setError('Ingresa un monto válido.')
    setLoading(true)
    try {
      await onConfirm(metodo, montoNum)
      onClose()
    } catch (err) {
      setError(err.message || 'Error al registrar el cobro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 shadow-xl p-6">
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
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold transition-colors disabled:opacity-60"
            >
              {loading ? 'Guardando…' : 'Confirmar cobro'}
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
  const { connected } = useLiveSync()

  const [pagoModal, setPagoModal] = useState(null) // mesa seleccionada para pago
  const [tiempoComensales, setTiempoComensales] = useState([])

  useEffect(() => {
    db.comensales.listTiempo().then(setTiempoComensales).catch(() => {})
  }, [])

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

  const pedidosDeMesa = (mesa) => pedidos.filter((p) => Number(p.mesa) === mesa.numeroMesa)

  async function registrarCobro(mesa, metodo, monto) {
    await db.pagos.insert({ mesa_id: mesa.id, monto, metodo })
    // Mesa queda en por_cobrar — el mesero la libera manualmente
    if (mesa.estado !== 'por_cobrar') {
      cambiarEstadoA(mesa.numeroMesa, 'por_cobrar')
    }
    actualizarMesa(mesa.numeroMesa, { solicitudesCuenta: [] })
    // Invalidar tokens para que no entren nuevos comensales
    invalidarTokensDeMesa(mesa.id)
  }

  function calcularTotal(mesa) {
    const items = pedidosDeMesa(mesa).flatMap((p) => p.items || [])
    const grouped = items.reduce((acc, it) => {
      const k = it.nombre
      if (!acc[k]) acc[k] = { precio: it.precio || 0, cantidad: 0 }
      acc[k].cantidad += it.cantidad || 1
      return acc
    }, {})
    return Object.values(grouped).reduce((s, it) => s + it.precio * it.cantidad, 0)
  }

  return (
    <div className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950">
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
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
            <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-[#e8e0d8] dark:ring-slate-800 p-10 text-center">
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
                  onCobrar={() => setPagoModal(mesa)}
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
              {mesasPorCobrar.map((mesa) => (
                <div
                  key={mesa.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 px-4 py-3 flex items-center justify-between gap-3"
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
                    <button
                      onClick={() => setPagoModal(mesa)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-colors"
                    >
                      Registrar cobro
                    </button>
                    <Link
                      to={`/mesa/${mesa.numeroMesa}`}
                      className="text-xs font-bold text-[#C1440E] dark:text-[#D4A017] hover:underline"
                    >
                      Ver →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <Timer size={11} />
              El mesero debe liberar la mesa desde el tablero cuando el cliente se retire.
            </p>
          </section>
        )}

        {/* ── Tiempo en mesa ── */}
        {tiempoComensales.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
              <Hourglass size={12} />
              Comensales con más tiempo en mesa
            </h2>
            <div className="bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 overflow-hidden">
              {tiempoComensales.slice(0, 10).map((c, i) => {
                const min = Math.round(Number(c.minutos_en_mesa) || 0)
                const esLargo = min > 90
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i !== 0 ? 'border-t border-[#e8e0d8] dark:border-slate-800' : ''}`}
                  >
                    <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center text-[10px] font-black">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{c.username}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Mesa {c.numero_mesa}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                      esLargo
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-500/30'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      <Clock size={10} />
                      {formatMinutos(c.minutos_en_mesa)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* Modal de pago */}
      {pagoModal && (
        <ModalPago
          mesa={pagoModal}
          total={calcularTotal(pagoModal)}
          onConfirm={(metodo, monto) => registrarCobro(pagoModal, metodo, monto)}
          onClose={() => setPagoModal(null)}
        />
      )}
    </div>
  )
}

/* ── Tarjeta de cobro individual ── */
function TarjetaCobro({ mesa, pedidosDeMesa, onCobrar, onAtender }) {
  const solicitudes   = mesa.solicitudesCuenta || []
  const integrantes   = mesa.integrantes || []
  const todosHanPedido = integrantes.length > 0 && solicitudes.length >= integrantes.length

  const allItems = pedidosDeMesa.flatMap((p) => p.items || [])
  const grouped = allItems.reduce((acc, it) => {
    const k = it.nombre
    if (!acc[k]) acc[k] = { nombre: k, precio: it.precio || 0, cantidad: 0 }
    acc[k].cantidad += it.cantidad || 1
    return acc
  }, {})
  const itemsList = Object.values(grouped)
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
      <div className="bg-white dark:bg-slate-900 px-4 py-3 border-b border-[#e8e0d8] dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
          <Users size={9} /> Solicitaron la cuenta
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
        <div className="flex justify-between items-center pt-2.5 border-t border-[#e8e0d8] dark:border-slate-800">
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Total</span>
          <span className="text-xl font-black text-[#C1440E] dark:text-[#D4A017]">{formatPEN(total)}</span>
        </div>
      </div>

      {/* Acciones */}
      <div className="bg-white dark:bg-slate-900 px-4 pb-4 flex flex-col sm:flex-row gap-2">
        <button
          onClick={onCobrar}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold transition-colors shadow-sm"
        >
          <CircleDollarSign size={15} /> Registrar cobro
        </button>
        <div className="flex gap-2">
          <Link
            to={`/mesa/${mesa.numeroMesa}`}
            className="px-3 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center"
          >
            Ver hoja →
          </Link>
          <button
            onClick={onAtender}
            className="px-3 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Marcar como atendido sin registrar cobro"
          >
            Solo atender
          </button>
        </div>
      </div>
    </div>
  )
}
