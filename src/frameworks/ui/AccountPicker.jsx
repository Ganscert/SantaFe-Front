import { useState } from 'react'
import { Users, X, AlertCircle, UserPlus } from 'lucide-react'
import { useTableManagement } from '../../usecases/useTableManagement.js'

/**
 * AccountPicker
 * Modal/inline para seleccionar o crear una cuenta dentro de una mesa.
 *
 * Props:
 *   - numeroMesa
 *   - onSelect(cuenta) — se llama al elegir o crear
 *   - onClose — opcional; si se omite no se renderiza el botón de cerrar
 *   - asModal (default true) — render con overlay; si es false renderiza inline
 */
export default function AccountPicker({ numeroMesa, onSelect, onClose, asModal = true }) {
  const {
    mesa, cuentas, cuentasAbiertas, puedeAgregar, capacidadMaxima,
    totalesPorCuenta, agregarCuenta,
  } = useTableManagement(numeroMesa)

  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')

  if (!mesa) return null

  const sugerirNombre = () => `John Doe ${cuentas.length + 1}`

  const handleCrear = () => {
    const c = agregarCuenta(nombreNuevo || sugerirNombre())
    setNombreNuevo('')
    setCreando(false)
    if (c) onSelect?.(c)
  }

  const fmt = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

  const card = (
    <div className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-xl w-full max-w-md overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-[#4F46E5] dark:text-[#0EA5E9]">Mesa {mesa.numeroMesa}</p>
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-50 mt-0.5">Selecciona una cuenta</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Capacidad de la mesa: {capacidadMaxima} cuenta{capacidadMaxima !== 1 ? 's' : ''} · {cuentasAbiertas.length} activa{cuentasAbiertas.length !== 1 ? 's' : ''}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
        {cuentasAbiertas.length === 0 && !creando && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/30 p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">No hay cuentas abiertas</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">Crea una para empezar a tomar pedidos.</p>
            </div>
          </div>
        )}

        {cuentasAbiertas.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect?.(c)}
            className="w-full text-left rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-[#4F46E5] dark:hover:ring-[#4F46E5] hover:bg-[#4F46E5]/5 dark:hover:bg-[#4F46E5]/10 transition-all px-4 py-3 flex items-center gap-3 group"
          >
            <span className="w-9 h-9 rounded-xl bg-[#4F46E5]/10 dark:bg-[#4F46E5]/20 text-[#4F46E5] dark:text-[#EEF2FF] flex items-center justify-center font-black text-sm">
              {c.nombre.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{c.nombre}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Acumulado: {fmt(totalesPorCuenta[c.id] || 0)}</p>
            </div>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#4F46E5] dark:group-hover:text-[#EEF2FF] transition-colors">
              Seleccionar →
            </span>
          </button>
        ))}

        {creando ? (
          <div className="rounded-2xl ring-1 ring-[#4F46E5] bg-[#4F46E5]/5 dark:bg-[#4F46E5]/10 p-3 space-y-2">
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCrear()}
              placeholder={sugerirNombre()}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:border-[#4F46E5]"
              style={{ fontSize: '16px' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCrear}
                className="flex-1 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white py-2 text-sm font-bold transition-colors"
              >
                Crear y seleccionar
              </button>
              <button
                onClick={() => { setCreando(false); setNombreNuevo('') }}
                className="rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreando(true)}
            disabled={!puedeAgregar}
            className="w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#4F46E5] dark:hover:border-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-300 dark:disabled:hover:border-slate-700 transition-colors px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-300 hover:text-[#4F46E5] dark:hover:text-[#EEF2FF]"
          >
            <UserPlus size={16} />
            {puedeAgregar
              ? `Crear cuenta nueva (${cuentasAbiertas.length + 1}/${capacidadMaxima})`
              : `Mesa al máximo de cuentas (${capacidadMaxima})`}
          </button>
        )}
      </div>

      {cuentas.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Users size={12} />
          {cuentas.length} cuenta{cuentas.length !== 1 ? 's' : ''} en total · {cuentasAbiertas.length} activa{cuentasAbiertas.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )

  if (!asModal) return card

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{card}</div>
    </div>
  )
}
