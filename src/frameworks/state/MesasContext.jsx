import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { db } from '../../adapters/db.js'

const MesasContext = createContext(null)
const ESTADOS_VALIDOS = new Set(['disponible', 'ocupada', 'por_cobrar'])
const POLL_MS = 4000

const defaultMesas = [
  { id: 'mesa-1', numeroMesa: 1, capacidad: 4, estado: 'disponible', cuentas: [] },
  { id: 'mesa-2', numeroMesa: 2, capacidad: 2, estado: 'disponible', cuentas: [] },
  { id: 'mesa-3', numeroMesa: 3, capacidad: 6, estado: 'disponible', cuentas: [] },
  { id: 'mesa-4', numeroMesa: 4, capacidad: 4, estado: 'disponible', cuentas: [] },
  { id: 'mesa-5', numeroMesa: 5, capacidad: 8, estado: 'disponible', cuentas: [] },
  { id: 'mesa-6', numeroMesa: 6, capacidad: 2, estado: 'disponible', cuentas: [] },
]

function mapRow(row, prev) {
  return {
    id:          row.id,
    numeroMesa:  row.numero_mesa,
    capacidad:   row.capacidad ?? 4,
    estado:      row.estado,
    cuentas:     prev?.cuentas          ?? [],
    integrantes: prev?.integrantes      ?? [],
    solicitudesCuenta: prev?.solicitudesCuenta ?? [],
  }
}

export function MesasProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync()
  const [mesas, setMesas] = useState(defaultMesas)
  const prevRef = useRef([])

  // Carga desde Neon vía API
  async function cargar(prev) {
    try {
      const rows = await db.mesas.list()
      setMesas(rows.map(r => mapRow(r, prev.find(m => m.numeroMesa === r.numero_mesa))))
    } catch (e) {
      console.error('[mesas.cargar]', e.message)
    }
  }

  // Carga inicial
  useEffect(() => {
    cargar([])
  }, [])

  // Polling para detectar cambios desde otros dispositivos
  useEffect(() => {
    const id = setInterval(() => {
      setMesas(prev => { prevRef.current = prev; return prev })
      cargar(prevRef.current)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // WS legacy (cuentas/integrantes en tiempo real)
  useEffect(() => {
    if (serverState?.mesas) setMesas(serverState.mesas)
  }, [serverState?.mesas])

  const syncMesas = useCallback((next) => {
    if (!connected) return
    sendMessage({ type: 'sync:mesas', mesas: next })
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
      const mesa = next.find(m => m.numeroMesa === numeroMesa)
      if (mesa) db.mesas.update(mesa.id, nuevoEstado).catch(e => console.error('[mesas.update]', e.message))
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
    [mesas, cambiarEstadoA, actualizarMesa],
  )

  return <MesasContext.Provider value={value}>{children}</MesasContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMesas() {
  const ctx = useContext(MesasContext)
  if (!ctx) throw new Error('useMesas must be used within MesasProvider')
  return ctx
}
