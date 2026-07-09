import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMesas } from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useToast } from '../state/ToastContext.jsx'

const ESTADO_CFG = {
  disponible: { bg: 'bg-emerald-50 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-500/30', label: 'Disponible'  },
  ocupada:    { bg: 'bg-amber-50 dark:bg-amber-500/15',     text: 'text-amber-700 dark:text-amber-300',     ring: 'ring-amber-200 dark:ring-amber-500/30',     label: 'Ocupada'     },
  por_cobrar: { bg: 'bg-indigo-50 dark:bg-indigo-500/15',   text: 'text-indigo-700 dark:text-indigo-300',   ring: 'ring-indigo-200 dark:ring-indigo-500/30',   label: 'Por cobrar'  },
}

const PEDIDO_ESTADO_CFG = {
  pendiente:       { bg: 'bg-amber-50 dark:bg-amber-500/15',   text: 'text-amber-700 dark:text-amber-300',   label: 'Pendiente'       },
  en_preparacion:  { bg: 'bg-blue-50 dark:bg-blue-500/15',     text: 'text-blue-700 dark:text-blue-300',     label: 'En preparación'  },
  listo:           { bg: 'bg-emerald-50 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', label: 'Listo' },
  entregado:       { bg: 'bg-slate-100 dark:bg-slate-800',     text: 'text-slate-500 dark:text-slate-400',   label: 'Entregado'       },
}

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CFG[estado] ?? { bg: 'bg-slate-50', text: 'text-slate-600', ring: 'ring-slate-200', label: estado }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className="size-2 rounded-full bg-current" />
      {cfg.label}
    </span>
  )
}

function MesaDetalle() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { mesas, cambiarEstadoA, enviarACobro } = useMesas()
  const { pedidos } = usePedidos()
  const toast = useToast()
  const numeroMesa = Number(id)
  const mesa = mesas.find(m => m.numeroMesa === numeroMesa)

  const pedidosDeMesa = pedidos.filter(p => Number(p.mesa) === numeroMesa)
  const pedidosActivos = pedidosDeMesa.filter(p => p.estado !== 'entregado')

  const handleSetEstado = (estado) => {
    if ((estado === 'por_cobrar' || estado === 'disponible') && pedidosActivos.length > 0) {
      toast.error(`No se puede cambiar a “${estado === 'por_cobrar' ? 'Por cobrar' : 'Disponible'}”: hay ${pedidosActivos.length} pedido(s) sin entregar.`)
      return
    }
    // "Por cobrar" envía la mesa a caja con todas sus cuentas
    if (estado === 'por_cobrar') {
      enviarACobro(numeroMesa)
      toast.success(`Mesa ${numeroMesa} enviada a caja — ya aparece en Cobros con sus cuentas.`)
      return
    }
    cambiarEstadoA(numeroMesa, estado)
  }

  if (!mesa) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center max-w-sm">
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Mesa no encontrada</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">La mesa {id} no existe en el sistema.</p>
        <button
          onClick={() => navigate('/tablero-mesas')}
          className="rounded-xl bg-[#4F46E5] text-white px-6 py-2.5 text-sm font-bold hover:bg-[#4338CA] transition-colors"
        >
          ← Volver al tablero
        </button>
      </div>
    </div>
  )

  const BORDER_ESTADO = {
    disponible: 'border-emerald-300',
    ocupada:    'border-amber-300',
    por_cobrar: 'border-indigo-300',
  }

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      {/* Topbar */}
      <header className="sticky top-[var(--sf-topbar,0px)] z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3 pl-16 lg:pl-4">
          <button
            onClick={() => navigate('/tablero-mesas')}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-semibold transition-colors"
          >
            ← Tablero
          </button>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Mesa {mesa.numeroMesa}</span>
          <EstadoBadge estado={mesa.estado} />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 items-start">

        {/* Pedidos activos */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Pedidos activos</h2>
            <Link
              to={`/pedidos/nuevo?mesa=${numeroMesa}`}
              className="rounded-xl bg-[#4F46E5] text-white px-4 py-2 text-sm font-bold hover:bg-[#4338CA] transition-colors"
            >
              + Agregar pedido
            </Link>
          </div>

          {pedidosActivos.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <p className="text-3xl mb-3">🍽</p>
              <p className="text-slate-600 dark:text-slate-300 font-medium mb-1">Sin pedidos activos</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">Agrega un pedido para esta mesa.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pedidosActivos.map(pedido => {
                const cfg = PEDIDO_ESTADO_CFG[pedido.estado] ?? PEDIDO_ESTADO_CFG.pendiente
                const cuenta = mesa.cuentas?.find(c => c.id === pedido.cuentaId)
                return (
                  <div key={pedido.id} className={`bg-white dark:bg-slate-900 rounded-3xl border-l-4 border border-slate-200 dark:border-slate-800 shadow-sm p-4 ${BORDER_ESTADO[pedido.estado === 'en_preparacion' ? 'ocupada' : pedido.estado === 'listo' ? 'disponible' : 'por_cobrar'] ?? 'border-l-slate-300'}`}>
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{pedido.hora}</span>
                        {cuenta && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#EEF2FF] truncate">
                            {cuenta.nombre}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {pedido.items.map(item => (
                        <li key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 dark:text-slate-200">
                            <strong className="text-slate-900 dark:text-slate-50">{item.cantidad}×</strong> {item.nombre}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 text-xs">S/ {(item.precio * item.cantidad).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-sm font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Total pedido</span>
                      <span className="text-slate-800 dark:text-slate-100">
                        S/ {pedido.items.reduce((s, i) => s + i.precio * i.cantidad, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Historial */}
          {pedidosDeMesa.filter(p => p.estado === 'entregado').length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                Historial de la sesión
              </h3>
              <div className="space-y-2 opacity-60">
                {pedidosDeMesa.filter(p => p.estado === 'entregado').map(pedido => (
                  <div key={pedido.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{pedido.items.length} platos · {pedido.hora}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">Entregado</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Panel info mesa */}
        <aside className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 md:sticky md:top-20 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">Mesa {mesa.numeroMesa}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{mesa.capacidad} personas · max {mesa.capacidad} cuentas</p>
          </div>

          <EstadoBadge estado={mesa.estado} />

          {mesa.cuentas?.filter(c => c.abierta !== false).length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Cuentas abiertas</p>
              <div className="flex flex-wrap gap-1.5">
                {mesa.cuentas.filter(c => c.abierta !== false).map(c => (
                  <span key={c.id} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#EEF2FF] ring-1 ring-[#4F46E5]/20">
                    {c.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 space-y-3">
            {/* Botonera de control rápido */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Cambiar estado
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { estado: 'disponible', label: 'Disponible', activeBg: 'bg-emerald-500',   text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-500/30', disabled: pedidosActivos.length > 0, motivo: `${pedidosActivos.length} pedido(s) sin entregar` },
                  { estado: 'ocupada',    label: 'Ocupada',    activeBg: 'bg-amber-500',     text: 'text-amber-700 dark:text-amber-300',     ring: 'ring-amber-200 dark:ring-amber-500/30',     disabled: false, motivo: '' },
                  { estado: 'por_cobrar', label: 'Por cobrar', activeBg: 'bg-indigo-500',    text: 'text-indigo-700 dark:text-indigo-300',   ring: 'ring-indigo-200 dark:ring-indigo-500/30',   disabled: pedidosActivos.length > 0, motivo: 'Todos los pedidos deben estar entregados' },
                ].map(b => {
                  const isActive = mesa.estado === b.estado
                  return (
                    <button
                      key={b.estado}
                      onClick={() => !b.disabled && !isActive && handleSetEstado(b.estado)}
                      disabled={b.disabled || isActive}
                      title={b.disabled ? b.motivo : (isActive ? 'Estado actual' : `Marcar como ${b.label}`)}
                      className={`rounded-xl py-2 text-xs font-bold transition-all ring-1 ring-inset ${
                        isActive
                          ? `${b.activeBg} text-white shadow-sm`
                          : b.disabled
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 ring-slate-200 dark:ring-slate-700 cursor-not-allowed'
                            : `bg-white dark:bg-slate-900 ${b.text} ${b.ring} hover:bg-slate-50 dark:hover:bg-slate-800`
                      }`}
                    >
                      {b.label}
                    </button>
                  )
                })}
              </div>
              {pedidosActivos.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  ⚠ {pedidosActivos.length} pedido{pedidosActivos.length !== 1 ? 's' : ''} sin entregar
                </p>
              )}
            </div>

            <button
              onClick={() => navigate('/tablero-mesas')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              ← Volver al tablero
            </button>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider mb-2">Resumen</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Pedidos activos</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{pedidosActivos.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Total acumulado</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  S/ {pedidosDeMesa
                    .filter(p => p.estado !== 'entregado')
                    .flatMap(p => p.items)
                    .reduce((s, i) => s + (i.precio ?? 0) * i.cantidad, 0)
                    .toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default MesaDetalle
