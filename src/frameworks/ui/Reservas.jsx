import { useMemo, useState } from 'react'
import {
  CalendarDays, Phone, Users, StickyNote, Check, Armchair,
  XCircle, Trash2, Clock, Sparkles,
} from 'lucide-react'
import { useMesas } from '../state/MesasContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { useReservas, ESTADOS_RESERVA, hoyISO } from '../../usecases/useReservas.js'

const ESTADO_BADGE = {
  pendiente:  'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
  confirmada: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  sentada:    'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30',
  cancelada:  'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-[#E5D9C9] dark:border-slate-700 bg-[#FFFCF5] dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#A85638]/30 focus:border-[#A85638] transition-colors'

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}

function FormReserva({ mesas, onCrear, conflictoDe }) {
  const vacio = { nombre: '', telefono: '', personas: 2, mesa: '', fecha: hoyISO(), hora: '', nota: '' }
  const [form, setForm] = useState(vacio)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const conflicto = conflictoDe(form)

  function submit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return setError('Ingresa el nombre del cliente.')
    if (!form.fecha || !form.hora) return setError('Indica fecha y hora.')
    setError('')
    onCrear(form)
    setForm({ ...vacio, fecha: form.fecha })
  }

  return (
    <form onSubmit={submit} className="bg-[#FFFCF5] dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="boho-arch w-8 h-9 bg-[#7D8B6A] text-[#F6EEE3] flex items-center justify-center shrink-0">
          <Sparkles size={14} />
        </span>
        <div>
          <h2 className="text-base">Nueva reserva</h2>
          <p className="text-xs text-slate-400">Aparta un lugar en la casa</p>
        </div>
      </div>

      <Field label="Nombre del cliente">
        <input value={form.nombre} onChange={set('nombre')} placeholder="Ej. Valeria Ríos" className={inputCls} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono">
          <input value={form.telefono} onChange={set('telefono')} placeholder="999 999 999" inputMode="tel" className={inputCls} />
        </Field>
        <Field label="Personas">
          <input type="number" min="1" max="20" value={form.personas} onChange={set('personas')} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <input type="date" value={form.fecha} min={hoyISO()} onChange={set('fecha')} className={inputCls} />
        </Field>
        <Field label="Hora">
          <input type="time" value={form.hora} onChange={set('hora')} className={inputCls} />
        </Field>
      </div>

      <Field label="Mesa (opcional)">
        <select value={form.mesa} onChange={set('mesa')} className={inputCls}>
          <option value="">Asignar después</option>
          {mesas.map(m => (
            <option key={m.id} value={m.numeroMesa}>Mesa {m.numeroMesa} · {m.capacidad} personas</option>
          ))}
        </select>
      </Field>

      <Field label="Nota">
        <input value={form.nota} onChange={set('nota')} placeholder="Cumpleaños, terraza, alergias…" className={inputCls} />
      </Field>

      {conflicto && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/30 rounded-xl px-3 py-2">
          ⚠ La mesa {conflicto.mesa} ya tiene reserva a las {conflicto.hora} ({conflicto.nombre}). Puedes guardarla igual.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/30 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="w-full min-h-[44px] rounded-xl bg-[#A85638] hover:bg-[#8F4527] text-white text-sm font-bold transition-colors shadow-sm"
      >
        Guardar reserva
      </button>
    </form>
  )
}

function TarjetaReserva({ reserva, onEstado, onSentar, onEliminar }) {
  const cfg = ESTADOS_RESERVA[reserva.estado] ?? ESTADOS_RESERVA.pendiente
  const finalizada = reserva.estado === 'sentada' || reserva.estado === 'cancelada'
  return (
    <article className={`bg-[#FFFCF5] dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-sm p-4 flex gap-4 ${finalizada ? 'opacity-70' : ''}`}>
      {/* Hora en arco boho */}
      <div className="boho-arch shrink-0 w-16 h-[72px] bg-[#A85638]/10 dark:bg-[#A85638]/20 flex flex-col items-center justify-center text-[#A85638] dark:text-[#C99A3C]">
        <Clock size={13} />
        <span className="font-display font-bold text-base leading-tight mt-0.5">{reserva.hora}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base truncate">{reserva.nombre}</h3>
          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1 ring-inset ${ESTADO_BADGE[reserva.estado]}`}>
            {cfg.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><Users size={11} /> {reserva.personas} pers.</span>
          {reserva.mesa && <span className="inline-flex items-center gap-1"><Armchair size={11} /> Mesa {reserva.mesa}</span>}
          {reserva.telefono && <span className="inline-flex items-center gap-1"><Phone size={11} /> {reserva.telefono}</span>}
        </div>

        {reserva.nota && (
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 inline-flex items-start gap-1.5 bg-[#C99A3C]/10 rounded-lg px-2 py-1">
            <StickyNote size={11} className="mt-0.5 shrink-0 text-[#C99A3C]" /> {reserva.nota}
          </p>
        )}

        {/* Acciones */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reserva.estado === 'pendiente' && (
            <button
              onClick={() => onEstado(reserva.id, 'confirmada')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors"
            >
              <Check size={12} /> Confirmar
            </button>
          )}
          {(reserva.estado === 'pendiente' || reserva.estado === 'confirmada') && (
            <>
              <button
                onClick={() => onSentar(reserva)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#A85638] hover:bg-[#8F4527] text-white text-xs font-bold transition-colors"
              >
                <Armchair size={12} /> Sentar
              </button>
              <button
                onClick={() => onEstado(reserva.id, 'cancelada')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl ring-1 ring-[#E5D9C9] dark:ring-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10 transition-colors"
              >
                <XCircle size={12} /> Cancelar
              </button>
            </>
          )}
          {finalizada && (
            <button
              onClick={() => onEliminar(reserva.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl ring-1 ring-[#E5D9C9] dark:ring-slate-700 text-slate-400 text-xs font-bold hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} /> Eliminar
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Reservas() {
  const { mesas, cambiarEstadoA } = useMesas()
  const toast = useToast()
  const { reservas, crear, cambiarEstado, eliminar, conflictoDe } = useReservas()

  const [fecha, setFecha] = useState(hoyISO())
  const [filtroEstado, setFiltroEstado] = useState('activas')

  const delDia = useMemo(() => reservas.filter(r => r.fecha === fecha), [reservas, fecha])
  const visibles = useMemo(() => {
    if (filtroEstado === 'todas') return delDia
    if (filtroEstado === 'activas') return delDia.filter(r => r.estado === 'pendiente' || r.estado === 'confirmada')
    return delDia.filter(r => r.estado === filtroEstado)
  }, [delDia, filtroEstado])

  const kpis = useMemo(() => ({
    total: delDia.length,
    confirmadas: delDia.filter(r => r.estado === 'confirmada').length,
    pendientes: delDia.filter(r => r.estado === 'pendiente').length,
    personas: delDia
      .filter(r => r.estado === 'pendiente' || r.estado === 'confirmada')
      .reduce((s, r) => s + r.personas, 0),
  }), [delDia])

  function handleCrear(data) {
    const r = crear(data)
    toast.success(`Reserva de ${r.nombre} guardada para el ${r.fecha} a las ${r.hora}.`)
  }

  function handleSentar(reserva) {
    cambiarEstado(reserva.id, 'sentada')
    if (reserva.mesa) {
      const mesa = mesas.find(m => m.numeroMesa === reserva.mesa)
      if (mesa && mesa.estado === 'disponible') {
        cambiarEstadoA(reserva.mesa, 'ocupada')
        toast.success(`${reserva.nombre} sentado · Mesa ${reserva.mesa} ahora ocupada.`)
        return
      }
    }
    toast.info(`${reserva.nombre} marcado como “en mesa”.`)
  }

  const FILTROS = [
    { id: 'activas',   label: 'Activas' },
    { id: 'sentada',   label: 'En mesa' },
    { id: 'cancelada', label: 'Canceladas' },
    { id: 'todas',     label: 'Todas' },
  ]

  return (
    <div className="min-h-screen">
      {/* Topbar */}
      <header className="sticky top-0 z-20 bg-[#FFFCF5]/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-[#E5D9C9] dark:border-slate-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4 pl-16 lg:pl-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#7D8B6A] text-white flex items-center justify-center">
              <CalendarDays size={15} />
            </span>
            <h1 className="text-base">Reservas</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold ring-1 ring-amber-200 dark:ring-amber-500/30">
              {kpis.pendientes} pendientes
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold ring-1 ring-emerald-200 dark:ring-emerald-500/30">
              {kpis.confirmadas} confirmadas
            </span>
            <span className="hidden sm:inline px-2.5 py-1 rounded-full bg-[#A85638]/10 text-[#A85638] dark:text-[#C99A3C] font-semibold ring-1 ring-[#A85638]/20">
              {kpis.personas} comensales esperados
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* Formulario */}
        <div className="lg:sticky lg:top-20">
          <FormReserva mesas={mesas} onCrear={handleCrear} conflictoDe={conflictoDe} />
        </div>

        {/* Agenda */}
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E5D9C9] dark:border-slate-700 bg-[#FFFCF5] dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-[#A85638] transition-colors"
            />
            <div className="flex gap-1.5 flex-wrap">
              {FILTROS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFiltroEstado(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    filtroEstado === f.id
                      ? 'bg-[#A85638] text-white'
                      : 'bg-[#FFFCF5] dark:bg-slate-900 text-slate-500 dark:text-slate-400 ring-1 ring-[#E5D9C9] dark:ring-slate-700 hover:text-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-slate-400 font-semibold">
              {visibles.length} de {delDia.length} reserva{delDia.length !== 1 ? 's' : ''}
            </span>
          </div>

          {visibles.length === 0 ? (
            <div className="bg-[#FFFCF5] dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 px-6 py-16 text-center">
              <div className="boho-divider text-base mb-4" aria-hidden="true">❋</div>
              <p className="font-display text-lg text-slate-700 dark:text-slate-200">Agenda libre</p>
              <p className="text-sm text-slate-400 mt-1">No hay reservas {filtroEstado !== 'todas' ? 'con ese filtro ' : ''}para esta fecha.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibles.map(r => (
                <TarjetaReserva
                  key={r.id}
                  reserva={r}
                  onEstado={cambiarEstado}
                  onSentar={handleSentar}
                  onEliminar={eliminar}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
