import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QrCode, Receipt, Users, LogOut, MapPin, Settings2 } from 'lucide-react'
import { useMesas } from '../state/MesasContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useTokens } from '../state/TokensContext.jsx'
import { useAuth, ROLES } from '../state/AuthContext.jsx'
import { db } from '../../adapters/db.js'
import AccountPicker from './AccountPicker.jsx'
import GenerarQR from './GenerarQR.jsx'
import ZonasManager from './ZonasManager.jsx'

/* ── Badge de estado ──────────────────────────────── */
const ESTADO_CFG = {
  disponible: { bg: 'bg-emerald-50 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-500/30', label: 'Disponible'  },
  ocupada:    { bg: 'bg-amber-50 dark:bg-amber-500/15',     text: 'text-amber-700 dark:text-amber-300',     ring: 'ring-amber-200 dark:ring-amber-500/30',     label: 'Ocupada'     },
  por_cobrar: { bg: 'bg-indigo-50 dark:bg-indigo-500/15',   text: 'text-indigo-700 dark:text-indigo-300',   ring: 'ring-indigo-200 dark:ring-indigo-500/30',   label: 'Por cobrar'  },
}

function EstadoBadge({ estado, size = 'sm' }) {
  const cfg = ESTADO_CFG[estado] ?? { bg: 'bg-slate-50', text: 'text-slate-600', ring: 'ring-slate-200', label: estado }
  const px = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium ${px} ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  )
}

/* ── Tarjeta de mesa ──────────────────────────────── */
const BORDER_ESTADO = {
  disponible: 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5',
  ocupada:    'border-amber-300 dark:border-amber-500/40    bg-amber-50/40 dark:bg-amber-500/5',
  por_cobrar: 'border-indigo-300 dark:border-indigo-500/40  bg-indigo-50/40 dark:bg-indigo-500/5',
}

function TarjetaMesa({ mesa, seleccionada, onSelect }) {
  const border = BORDER_ESTADO[mesa.estado] ?? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
  const ring   = seleccionada ? 'ring-2 ring-[#A85638] ring-offset-2 dark:ring-offset-slate-950' : ''
  const integrantes = mesa.integrantes || []
  return (
    <article
      onClick={() => onSelect(mesa)}
      className={`relative cursor-pointer rounded-2xl border-2 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${border} ${ring}`}
    >
      {/* Badge "pedir cuenta" */}
      {(mesa.solicitudesCuenta?.length > 0) && (
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-sm" title="Mesa solicitó la cuenta">
          <Receipt size={12} />
        </span>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 mb-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 whitespace-nowrap">Mesa {mesa.numeroMesa}</h3>
          <p className="text-xs leading-snug text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">{mesa.capacidad} pers · {mesa.capacidad} cuentas</p>
          {mesa.zonaNombre && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#7D8B6A]/15 text-[#5f6b4e] dark:text-[#AEBC97]">
              <MapPin size={9} /> {mesa.zonaNombre}
            </span>
          )}
        </div>
        <EstadoBadge estado={mesa.estado} />
      </div>

      {integrantes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {integrantes.slice(0, 3).map(int => (
            <span key={int.userId} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 truncate max-w-[110px]">
              {int.nombre.split(' ')[0]}
            </span>
          ))}
          {integrantes.length > 3 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              +{integrantes.length - 3}
            </span>
          )}
        </div>
      )}

      <Link
        to={`/mesa/${mesa.numeroMesa}`}
        onClick={e => e.stopPropagation()}
        className="text-xs font-semibold text-[#A85638] dark:text-[#C99A3C] hover:underline"
      >
        Ver detalle →
      </Link>
    </article>
  )
}

/* ── Botonera de control de estado de mesa ────────── */
const BOTONERA_CFG = {
  disponible: { activeBg: 'bg-emerald-500',   activeText: 'text-white',  activeRing: 'ring-emerald-600', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-500/30' },
  ocupada:    { activeBg: 'bg-amber-500',     activeText: 'text-white',  activeRing: 'ring-amber-600',   text: 'text-amber-700 dark:text-amber-300',     ring: 'ring-amber-200 dark:ring-amber-500/30' },
  por_cobrar: { activeBg: 'bg-indigo-500',    activeText: 'text-white',  activeRing: 'ring-indigo-600',  text: 'text-indigo-700 dark:text-indigo-300',   ring: 'ring-indigo-200 dark:ring-indigo-500/30' },
}

function BotoneraBtn({ mesa, onSetEstado, estado, label, color, disabled, motivo }) {
  const isActive = mesa.estado === estado
  return (
    <button
      onClick={() => !disabled && !isActive && onSetEstado(mesa.numeroMesa, estado)}
      disabled={disabled || isActive}
      title={disabled ? motivo : (isActive ? 'Estado actual' : `Marcar como ${label}`)}
      className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ring-1 ring-inset ${
        isActive
          ? `${color.activeBg} ${color.activeText} ${color.activeRing} shadow-sm`
          : disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 ring-slate-200 dark:ring-slate-700 cursor-not-allowed'
            : `bg-white dark:bg-slate-900 ${color.text} ${color.ring} hover:${color.activeBg}`
      }`}
    >
      {label}
    </button>
  )
}

function BotoneraEstado({ mesa, pedidosActivosCount, onSetEstado }) {
  const bloqueaCobrar    = pedidosActivosCount > 0
  const bloqueaDisponible = pedidosActivosCount > 0

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        Estado de la mesa
      </p>
      <div className="flex gap-2">
        <BotoneraBtn
          mesa={mesa}
          onSetEstado={onSetEstado}
          estado="disponible"
          label="Disponible"
          color={BOTONERA_CFG.disponible}
          disabled={bloqueaDisponible}
          motivo={`Hay ${pedidosActivosCount} pedido(s) sin entregar`}
        />
        <BotoneraBtn
          mesa={mesa}
          onSetEstado={onSetEstado}
          estado="ocupada"
          label="Ocupada"
          color={BOTONERA_CFG.ocupada}
        />
        <BotoneraBtn
          mesa={mesa}
          onSetEstado={onSetEstado}
          estado="por_cobrar"
          label="Por cobrar"
          color={BOTONERA_CFG.por_cobrar}
          disabled={bloqueaCobrar}
          motivo="Todos los pedidos deben estar entregados"
        />
      </div>
      {(bloqueaCobrar || bloqueaDisponible) && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
          ⚠ {pedidosActivosCount} pedido{pedidosActivosCount !== 1 ? 's' : ''} sin entregar — sólo se puede mantener “Ocupada”.
        </p>
      )}
    </div>
  )
}

/* ── Panel lateral ────────────────────────────────── */
function PanelMesa({ mesa, pedidosDeMesa, pedidosActivosCount, onSetEstado, onPedirCuenta, onGenerarQR, puedeGenerarQR, onClearCuenta, onLiberarMesa, comensalesDB = [], zonas = [], onAsignarZona, onEliminarMesa }) {
  if (!mesa) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
      <span className="text-4xl">👆</span>
      <p className="text-slate-600 dark:text-slate-300 font-medium">Selecciona una mesa</p>
      <p className="text-sm text-slate-400 dark:text-slate-500">Toca cualquier tarjeta para ver acciones rápidas.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* cabecera panel */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Mesa {mesa.numeroMesa}</h2>
        <EstadoBadge estado={mesa.estado} size="lg" />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{mesa.capacidad} personas</p>

      {/* Asignación de zona */}
      {onAsignarZona && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <MapPin size={13} className="text-[#7D8B6A] shrink-0" />
          <select
            value={mesa.zonaId ?? ''}
            onChange={e => onAsignarZona(mesa.numeroMesa, e.target.value || null)}
            className="flex-1 px-2.5 py-1.5 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#A85638]"
          >
            <option value="">Sin zona</option>
            {zonas.filter(z => z.activa !== false).map(z => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
        </label>
      )}

      {/* Alerta: clientes solicitaron la cuenta */}
      {(mesa.solicitudesCuenta?.length > 0) && (
        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-200 dark:ring-indigo-500/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Receipt size={15} className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">
                Mesa {mesa.numeroMesa} pide la cuenta
                {(mesa.integrantes?.length > 0) && (
                  <span className="ml-1 text-xs font-semibold">
                    ({mesa.solicitudesCuenta.length}/{mesa.integrantes.length})
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {mesa.solicitudesCuenta.map((s) => (
                  <span key={s.userId} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                    {s.nombre.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => onClearCuenta?.(mesa)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors whitespace-nowrap shrink-0"
            >
              Atendido
            </button>
          </div>
        </div>
      )}

      {/* Alerta: mesa pagada, esperando liberación */}
      {mesa.estado === 'por_cobrar' && !(mesa.solicitudesCuenta?.length > 0) && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200 dark:ring-emerald-500/30 p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Cobro registrado</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              Libera la mesa cuando el cliente se retire.
            </p>
          </div>
          <button
            onClick={() => onLiberarMesa?.(mesa)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors"
          >
            <LogOut size={11} /> Liberar
          </button>
        </div>
      )}

      {/* Comensales activos en la mesa: SÓLO los logueados (DB, activo=true).
          La lista de integrantes sincronizada por WS puede quedar obsoleta;
          la tabla de comensales es la fuente de verdad de quién está conectado. */}
      {(() => {
        const activos = comensalesDB.filter(c => c.activo)
        if (activos.length === 0) return null
        return (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-200 dark:ring-slate-700 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
              <Users size={10} /> Comensales en mesa ({activos.length})
            </p>
            {activos.map(c => {
              const diff = Date.now() - new Date(c.creado_en).getTime()
              const min = Math.floor(diff / 60000)
              const tiempoStr = min < 1 ? 'ahora' : min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}min`
              return (
                <div key={c.id} className="py-1.5 border-b last:border-0 border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.username}</p>
                  <p className="text-[10px] text-slate-400">{tiempoStr}</p>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* botonera de estado */}
      <BotoneraEstado mesa={mesa} pedidosActivosCount={pedidosActivosCount} onSetEstado={onSetEstado} />

      {/* acciones */}
      <div className="grid gap-2">
        <button
          onClick={() => onPedirCuenta?.(mesa)}
          className="w-full rounded-xl bg-[#A85638] text-white py-2.5 text-sm font-semibold hover:bg-[#8F4527] transition-colors"
        >
          + Nuevo pedido para esta mesa
        </button>
        {puedeGenerarQR && (
          <button
            onClick={() => onGenerarQR?.(mesa)}
            className="w-full rounded-xl border-2 border-[#A85638] text-[#A85638] dark:text-[#C99A3C] dark:border-[#C99A3C] py-2 text-sm font-bold hover:bg-[#A85638]/5 dark:hover:bg-[#A85638]/10 transition-colors inline-flex items-center justify-center gap-2"
          >
            <QrCode size={15} /> Generar código QR
          </button>
        )}
        <Link
          to={`/mesa/${mesa.numeroMesa}`}
          className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2 text-sm font-semibold text-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Ver hoja de mesa
        </Link>
        {onEliminarMesa && (
          <button
            onClick={() => onEliminarMesa(mesa)}
            disabled={mesa.estado !== 'disponible'}
            title={mesa.estado !== 'disponible' ? 'Solo se pueden eliminar mesas disponibles' : 'Eliminar mesa'}
            className="w-full rounded-xl border-2 border-red-200 dark:border-red-500/40 text-red-600 dark:text-red-400 py-2 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut size={14} className="rotate-180" /> Eliminar mesa
          </button>
        )}
      </div>

      {/* pedidos activos */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
          Pedidos activos ({pedidosDeMesa.length})
        </h3>
        {pedidosDeMesa.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Sin pedidos activos.</p>
        ) : (
          <ul className="space-y-2">
            {pedidosDeMesa.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                <span className="text-slate-700 dark:text-slate-200"><strong>{p.cantidad}×</strong> {p.item}</span>
                <EstadoBadge estado={p.estado === 'en_preparacion' ? 'ocupada' : p.estado === 'listo' ? 'disponible' : 'por_cobrar'} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── Panel / Drawer híbrido ───────────────────────── */
function PanelDrawer({ mesa, pedidosDeMesa, pedidosActivosCount, onSetEstado, onClose, onPedirCuenta, onGenerarQR, puedeGenerarQR, onClearCuenta, onLiberarMesa, comensalesDB = [], zonas = [], onAsignarZona, onEliminarMesa }) {
  // Cierra con Escape
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const content = (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 relative">
      {/* Botón X — solo visible en móvil dentro del drawer */}
      <button
        onClick={onClose}
        className="lg:hidden absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors"
        aria-label="Cerrar"
      >
        ✕
      </button>
      <PanelMesa mesa={mesa} pedidosDeMesa={pedidosDeMesa} pedidosActivosCount={pedidosActivosCount} onSetEstado={onSetEstado} onPedirCuenta={onPedirCuenta} onGenerarQR={onGenerarQR} puedeGenerarQR={puedeGenerarQR} onClearCuenta={onClearCuenta} onLiberarMesa={onLiberarMesa} comensalesDB={comensalesDB} zonas={zonas} onAsignarZona={onAsignarZona} onEliminarMesa={onEliminarMesa} />
    </div>
  )

  return (
    <>
      {/* ── Desktop: aside sticky ── */}
      <aside className="hidden lg:block lg:sticky lg:top-20">
        {content}
      </aside>

      {/* ── Móvil/Tablet: drawer desde abajo ── */}
      {mesa && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Sheet */}
          <div className="relative w-full max-h-[85vh] overflow-y-auto rounded-t-3xl">
            {/* Handle */}
            <div className="sticky top-0 flex justify-center pt-3 pb-1 bg-white rounded-t-3xl">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="px-4 pb-6 bg-white">
              {content}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Chip-filtro de la topbar: clic activa/desactiva el filtro ── */
function FiltroChip({ estado, count, label, cls, filtroEstado, onToggle }) {
  const activo = filtroEstado === estado
  return (
    <button
      onClick={() => onToggle(estado)}
      aria-pressed={activo}
      title={activo ? 'Quitar filtro' : `Ver solo mesas ${label.toLowerCase()}`}
      className={`px-2.5 py-1 rounded-full font-semibold ring-1 whitespace-nowrap transition-all ${cls} ${
        activo ? 'ring-2 scale-105 shadow-sm' : 'ring-inset opacity-90 hover:opacity-100'
      }`}
    >
      {count} {label}
    </button>
  )
}

/* ── Componente principal ─────────────────────────── */
function TableroMesas() {
  const { mesas, zonas, cargarZonas, cambiarEstadoA, actualizarMesa, enviarACobro, asignarZona, agregarMesa, eliminarMesa } = useMesas()
  const { pedidos, contarActivosMesa } = usePedidos()
  const { invalidarTokensDeMesa } = useTokens()
  const { session } = useAuth()
  const toast = useToast()
  const navigate                 = useNavigate()
  const [selectedMesa, setSelectedMesa] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [filtroZona, setFiltroZona] = useState('todas')
  const [pickerMesa, setPickerMesa] = useState(null)
  const [qrMesa, setQrMesa] = useState(null)
  const [comensalesDB, setComensalesDB] = useState([])
  const [zonasOpen, setZonasOpen] = useState(false)

  const puedeGenerarQR = session?.role === ROLES.RECEPCIONISTA || session?.role === ROLES.MESERO
    || session?.role === 'admin' || session?.role === 'gerente'
  const puedeGestionarZonas = session?.role === 'admin' || session?.role === 'gerente'
  // Admin y gerente (supervisor) pueden dar de alta / baja mesas.
  const puedeGestionarMesas = session?.role === 'admin' || session?.role === 'gerente'

  const [fabOpen, setFabOpen] = useState(false)
  const [agregandoMesa, setAgregandoMesa] = useState(false)

  const handleSelect = (mesa) => setSelectedMesa(mesa)
  const handleClose  = () => setSelectedMesa(null)
  const handlePedirCuenta = (mesa) => setPickerMesa(mesa)
  const handleClearCuenta = (mesa) => actualizarMesa(mesa.numeroMesa, { solicitudesCuenta: [] })

  const handleAgregarMesa = async () => {
    setAgregandoMesa(true)
    const res = await agregarMesa({ capacidad: 4 })
    setAgregandoMesa(false)
    if (res?.ok) toast.success(`Mesa ${res.numero} agregada.`)
    else toast.error(res?.error || 'No se pudo agregar la mesa.')
  }

  const handleEliminarMesa = async (mesa) => {
    if (!window.confirm(`¿Eliminar la Mesa ${mesa.numeroMesa}? Esta acción no se puede deshacer.`)) return
    const res = await eliminarMesa(mesa.numeroMesa)
    if (res?.ok) {
      toast.success(`Mesa ${mesa.numeroMesa} eliminada.`)
      setSelectedMesa(null)
    } else {
      toast.error(res?.error || 'No se pudo eliminar la mesa.')
    }
  }

  const handleLiberarMesa = (mesa) => {
    invalidarTokensDeMesa(mesa.id)
    db.comensales.deactivate(mesa.id).catch(() => {})
    cambiarEstadoA(mesa.numeroMesa, 'disponible')
    setSelectedMesa(null)
  }

  useEffect(() => {
    if (!selectedMesa?.id) { setComensalesDB([]); return }
    db.comensales.listByMesa(selectedMesa.id).then(setComensalesDB).catch(() => {})
  }, [selectedMesa?.id])

  useEffect(() => {
    if (!selectedMesa) return
    const actualizada = mesas.find(m => m.numeroMesa === selectedMesa.numeroMesa)
    if (actualizada && actualizada !== selectedMesa) setSelectedMesa(actualizada)
  }, [mesas, selectedMesa])

  const pedidosActivosDeMesa = selectedMesa
    ? pedidos.filter(p => Number(p.mesa) === selectedMesa.numeroMesa && p.estado !== 'entregado')
    : []

  const pedidosDeMesa = pedidosActivosDeMesa
    .flatMap(p => (p.items || []).map(i => ({ item: i.nombre, cantidad: i.cantidad, estado: p.estado })))

  // Handler con validación reactiva al intentar cambiar de estado desde la botonera
  const handleSetEstado = (numeroMesa, estado) => {
    const activos = contarActivosMesa(numeroMesa)
    if ((estado === 'por_cobrar' || estado === 'disponible') && activos > 0) {
      toast.error(`No se puede cambiar a “${estado === 'por_cobrar' ? 'Por cobrar' : 'Disponible'}”: hay ${activos} pedido(s) sin entregar.`)
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

  const countDisponibles = mesas.filter(m => m.estado === 'disponible').length
  const countOcupadas    = mesas.filter(m => m.estado === 'ocupada').length
  const countPorCobrar   = mesas.filter(m => m.estado === 'por_cobrar').length
  const ocupacionPct     = mesas.length ? Math.round(((countOcupadas + countPorCobrar) / mesas.length) * 100) : 0

  const mesasFiltradas = useMemo(
    () => mesas.filter(m => {
      if (filtroEstado !== 'todas' && m.estado !== filtroEstado) return false
      if (filtroZona === 'sin') return !m.zonaId
      if (filtroZona !== 'todas' && m.zonaId !== filtroZona) return false
      return true
    }),
    [mesas, filtroEstado, filtroZona],
  )

  return (
    <div className="min-h-screen">
      {/* ── Topbar ── */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4 pl-16 lg:pl-4">
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">Tablero de Mesas</span>
          </div>

          <div className="flex items-center gap-2 text-xs min-w-0 overflow-x-auto">
            <FiltroChip
              filtroEstado={filtroEstado}
              onToggle={(e) => setFiltroEstado(f => (f === e ? 'todas' : e))}
              estado="disponible"
              count={countDisponibles}
              label={`libre${countDisponibles !== 1 ? 's' : ''}`}
              cls="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30"
            />
            <FiltroChip
              filtroEstado={filtroEstado}
              onToggle={(e) => setFiltroEstado(f => (f === e ? 'todas' : e))}
              estado="ocupada"
              count={countOcupadas}
              label={`ocupada${countOcupadas !== 1 ? 's' : ''}`}
              cls="bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30"
            />
            <FiltroChip
              filtroEstado={filtroEstado}
              onToggle={(e) => setFiltroEstado(f => (f === e ? 'todas' : e))}
              estado="por_cobrar"
              count={countPorCobrar}
              label="por cobrar"
              cls="bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-500/30"
            />
          </div>

          <nav className="flex items-center gap-2">

            {/* ── Desktop: dos botones normales ── */}
            <Link to="/pedidos/nuevo"
              className="hidden lg:flex rounded-xl bg-[#A85638] text-white px-4 py-2 text-sm font-bold hover:bg-[#8F4527] transition-colors">
              + Nuevo pedido
            </Link>
            <Link to="/cocina/pendientes"
              className="hidden lg:flex rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Cocina
            </Link>

            {/* ── Móvil: FAB con popover ── */}
            <div className="lg:hidden relative">
              <button
                onClick={() => setFabOpen(o => !o)}
                className="w-9 h-9 rounded-full bg-[#A85638] text-white flex items-center justify-center text-xl font-bold shadow-md hover:bg-[#8F4527] transition-all active:scale-95"
                aria-label="Acciones"
              >
                {fabOpen ? '✕' : '+'}
              </button>

              {/* Popover */}
              {fabOpen && (
                <>
                  {/* Overlay invisible — cierra al tocar fuera */}
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setFabOpen(false)}
                  />
                  {/* Menú */}
                  <div className="absolute right-0 top-11 z-40 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                    <Link
                      to="/pedidos/nuevo"
                      onClick={() => setFabOpen(false)}
                      className="flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-slate-800 hover:bg-[#F6EEE3] transition-colors"
                    >
                      <span className="w-8 h-8 rounded-xl bg-[#A85638]/10 text-[#A85638] flex items-center justify-center text-base">+</span>
                      Nuevo pedido
                    </Link>
                    <div className="h-px bg-slate-100 mx-3" />
                    <Link
                      to="/cocina/pendientes"
                      onClick={() => setFabOpen(false)}
                      className="flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-slate-800 hover:bg-[#F6EEE3] transition-colors"
                    >
                      <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-base">🍳</span>
                      Ver cocina
                    </Link>
                  </div>
                </>
              )}
            </div>

          </nav>
        </div>
      </header>

      {/* ── Cuerpo ── */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* Grid de mesas */}
        <section>
          <div className="flex items-end justify-between gap-4 mb-2">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Mesas</h1>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {ocupacionPct}% de ocupación
            </span>
          </div>
          {/* Barra de ocupación de sala */}
          <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden mb-4" role="img" aria-label={`Ocupación de sala: ${ocupacionPct}%`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7D8B6A] via-[#C99A3C] to-[#A85638] transition-all duration-500"
              style={{ width: `${ocupacionPct}%` }}
            />
          </div>

          {/* Filtro y gestión de zonas / mesas */}
          {(zonas.length > 0 || puedeGestionarZonas || puedeGestionarMesas) && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              {puedeGestionarMesas && (
                <button
                  onClick={handleAgregarMesa}
                  disabled={agregandoMesa}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#A85638] hover:bg-[#8F4527] disabled:opacity-60 transition-colors"
                >
                  + {agregandoMesa ? 'Agregando…' : 'Agregar mesa'}
                </button>
              )}
              {zonas.length > 0 && (
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <MapPin size={13} className="text-[#7D8B6A]" />
                  <select
                    value={filtroZona}
                    onChange={e => setFiltroZona(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#A85638]"
                  >
                    <option value="todas">Todas las zonas</option>
                    {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                    <option value="sin">Sin zona</option>
                  </select>
                </label>
              )}
              {puedeGestionarZonas && (
                <button
                  onClick={() => setZonasOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-[#A85638] dark:text-[#C99A3C] ring-1 ring-[#A85638]/30 hover:bg-[#A85638]/5 transition-colors"
                >
                  <Settings2 size={13} /> Gestionar zonas
                </button>
              )}
            </div>
          )}

          {filtroEstado !== 'todas' && (
            <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Mostrando {mesasFiltradas.length} de {mesas.length} mesas ·{' '}
              <button onClick={() => setFiltroEstado('todas')} className="text-[#A85638] dark:text-[#C99A3C] underline underline-offset-2">
                ver todas
              </button>
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {mesasFiltradas.map(mesa => (
              <TarjetaMesa
                key={mesa.id}
                mesa={mesa}
                seleccionada={selectedMesa?.numeroMesa === mesa.numeroMesa}
                onSelect={handleSelect}
              />
            ))}
          </div>
          {mesasFiltradas.length === 0 && (
            <div className="rounded-3xl bg-[#FFFCF5] dark:bg-slate-900 ring-1 ring-[#E5D9C9] dark:ring-slate-800 px-6 py-12 text-center">
              <p className="font-display text-slate-600 dark:text-slate-300">Ninguna mesa en este estado</p>
            </div>
          )}
        </section>

        {/* Panel híbrido desktop/móvil */}
        <PanelDrawer
          mesa={selectedMesa}
          pedidosDeMesa={pedidosDeMesa}
          pedidosActivosCount={pedidosActivosDeMesa.length}
          onSetEstado={handleSetEstado}
          onClose={handleClose}
          onPedirCuenta={handlePedirCuenta}
          onGenerarQR={(m) => setQrMesa(m)}
          puedeGenerarQR={puedeGenerarQR}
          onClearCuenta={handleClearCuenta}
          onLiberarMesa={handleLiberarMesa}
          comensalesDB={comensalesDB}
          zonas={zonas}
          onAsignarZona={puedeGestionarZonas ? asignarZona : undefined}
          onEliminarMesa={puedeGestionarMesas ? handleEliminarMesa : undefined}
        />
      </div>

      {/* Modal QR */}
      {qrMesa && <GenerarQR mesa={qrMesa} onClose={() => setQrMesa(null)} />}

      {/* Modal gestión de zonas */}
      {zonasOpen && (
        <ZonasManager
          zonas={zonas}
          onClose={() => setZonasOpen(false)}
          onChanged={cargarZonas}
        />
      )}

      {/* Selector de cuenta antes de crear pedido */}
      {pickerMesa && (
        <AccountPicker
          numeroMesa={pickerMesa.numeroMesa}
          onClose={() => setPickerMesa(null)}
          onSelect={(c) => {
            setPickerMesa(null)
            navigate(`/pedidos/nuevo?mesa=${pickerMesa.numeroMesa}&cuenta=${c.id}`)
          }}
        />
      )}
    </div>
  )
}

export default TableroMesas
