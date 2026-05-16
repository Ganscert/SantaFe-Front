import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'

const MesasContext = createContext(null)

const defaultMesas = [
  { id: 'mesa-1', numeroMesa: 1, capacidad: 4, estado: 'disponible', cuentas: [] },
  { id: 'mesa-2', numeroMesa: 2, capacidad: 2, estado: 'disponible', cuentas: [] },
  { id: 'mesa-3', numeroMesa: 3, capacidad: 6, estado: 'disponible', cuentas: [] },
  { id: 'mesa-4', numeroMesa: 4, capacidad: 4, estado: 'disponible', cuentas: [] },
  { id: 'mesa-5', numeroMesa: 5, capacidad: 8, estado: 'disponible', cuentas: [] },
  { id: 'mesa-6', numeroMesa: 6, capacidad: 2, estado: 'disponible', cuentas: [] },
]

const ESTADOS_VALIDOS = new Set(['disponible', 'ocupada', 'por_cobrar'])

export function MesasProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync()
  const [mesas, setMesas] = useState(() => {
    if (typeof window === 'undefined') return defaultMesas
    const stored = window.localStorage.getItem('mesas')
    return stored ? JSON.parse(stored) : defaultMesas
  })

  useEffect(() => {
    if (serverState?.mesas) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // Al liberar la mesa se borran cuentas, integrantes y solicitudes de cuenta
        return nuevoEstado === 'disponible'
          ? { ...m, estado: nuevoEstado, cuentas: [], integrantes: [], solicitudesCuenta: [] }
          : { ...m, estado: nuevoEstado }
      })
      syncMesas(next)
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
