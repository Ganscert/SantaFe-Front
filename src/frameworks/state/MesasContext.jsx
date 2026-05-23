import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { supabase, RESTAURANTE_ID } from '../../adapters/supabase.js'

const MesasContext = createContext(null)
const ESTADOS_VALIDOS = new Set(['disponible', 'ocupada', 'por_cobrar'])

// Fallback usado sólo cuando no hay Supabase ni cache de localStorage.
const defaultMesas = [
  { id: 'mesa-1', numeroMesa: 1, capacidad: 4, estado: 'disponible', cuentas: [] },
  { id: 'mesa-2', numeroMesa: 2, capacidad: 2, estado: 'disponible', cuentas: [] },
  { id: 'mesa-3', numeroMesa: 3, capacidad: 6, estado: 'disponible', cuentas: [] },
  { id: 'mesa-4', numeroMesa: 4, capacidad: 4, estado: 'disponible', cuentas: [] },
  { id: 'mesa-5', numeroMesa: 5, capacidad: 8, estado: 'disponible', cuentas: [] },
  { id: 'mesa-6', numeroMesa: 6, capacidad: 2, estado: 'disponible', cuentas: [] },
]

// Adapta una fila de `public.mesas` al shape interno.
// Los campos de sesión (cuentas/integrantes/solicitudesCuenta) NO viven en
// la BD por ahora; se preservan del estado previo cuando llega un refresh.
function mapRowToMesa(row, prev) {
  return {
    id:           row.id,
    numeroMesa:   row.numero_mesa,
    capacidad:    row.capacidad ?? 4,
    estado:       row.estado,
    cuentas:      prev?.cuentas ?? [],
    integrantes:  prev?.integrantes ?? [],
    solicitudesCuenta: prev?.solicitudesCuenta ?? [],
  }
}

export function MesasProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync()
  const [mesas, setMesas] = useState(() => {
    if (typeof window === 'undefined') return defaultMesas
    const stored = window.localStorage.getItem('mesas')
    return stored ? JSON.parse(stored) : defaultMesas
  })

  // ── Carga inicial desde Supabase (fuente de verdad de id/numero/estado) ──
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('mesas')
        .select('id, numero_mesa, estado')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('numero_mesa')
      if (cancelled || error) {
        if (error) console.error('[mesas.load]', error)
        return
      }
      setMesas((prev) => data.map((row) => {
        const prevMesa = prev.find((m) => m.numeroMesa === row.numero_mesa)
        return mapRowToMesa(row, prevMesa)
      }))
    })()
    return () => { cancelled = true }
  }, [])

  // ── Realtime: estado de mesas cambia desde otros dispositivos ──
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`mesas-changes-${RESTAURANTE_ID}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'mesas', filter: `restaurante_id=eq.${RESTAURANTE_ID}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old?.id
            if (id) setMesas((prev) => prev.filter((m) => m.id !== id))
            return
          }
          const row = payload.new
          setMesas((prev) => {
            const idx = prev.findIndex((m) => m.numeroMesa === row.numero_mesa)
            if (idx === -1) return [...prev, mapRowToMesa(row, null)]
            const next = [...prev]
            next[idx] = mapRowToMesa(row, next[idx])
            return next
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── WS legacy: estado de sesión (cuentas/integrantes) entre dispositivos ──
  useEffect(() => {
    if (serverState?.mesas) {
      setMesas(serverState.mesas)
    }
  }, [serverState?.mesas])

  useEffect(() => {
    window.localStorage.setItem('mesas', JSON.stringify(mesas))
  }, [mesas])

  const syncMesas = useCallback((nextMesas) => {
    if (!connected) return
    sendMessage({ type: 'sync:mesas', mesas: nextMesas })
  }, [connected, sendMessage])

  const cambiarEstadoA = useCallback((numeroMesa, nuevoEstado) => {
    if (!ESTADOS_VALIDOS.has(nuevoEstado)) return
    setMesas(current => {
      const next = current.map(m => {
        if (m.numeroMesa !== numeroMesa) return m
        return nuevoEstado === 'disponible'
          ? { ...m, estado: nuevoEstado, cuentas: [], integrantes: [], solicitudesCuenta: [] }
          : { ...m, estado: nuevoEstado }
      })
      syncMesas(next)
      // Persistir el cambio de estado en Supabase (el resto de campos de
      // sesión sigue siendo local/WS hasta que se modelen en la BD).
      if (supabase) {
        supabase
          .from('mesas')
          .update({ estado: nuevoEstado })
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('numero_mesa', numeroMesa)
          .then(({ error }) => { if (error) console.error('[mesas.update]', error) })
      }
      return next
    })
  }, [syncMesas])

  const actualizarMesa = useCallback((numeroMesa, patch) => {
    setMesas(current => {
      const next = current.map(m => m.numeroMesa === numeroMesa ? { ...m, ...patch } : m)
      syncMesas(next)
      return next
    })
  }, [syncMesas])

  const value = useMemo(
    () => ({ mesas, cambiarEstadoA, actualizarMesa }),
    [mesas, cambiarEstadoA, actualizarMesa]
  )

  return <MesasContext.Provider value={value}>{children}</MesasContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMesas() {
  const context = useContext(MesasContext)
  if (!context) throw new Error('useMesas must be used within MesasProvider')
  return context
}
