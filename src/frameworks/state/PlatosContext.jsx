import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'

const STORAGE_KEY = 'santa-fe:platos'
const PlatosCtx = createContext(null)

function leerStorage() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function nuevoId() {
  return `plato-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function PlatosProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync() || {}
  const [platos, setPlatos] = useState(leerStorage)
  const initSent = useRef(false)

  // Broadcast inicial: cuando conecta, comparte los platos locales para que
  // otros dispositivos recién conectados los reciban sin esperar una mutación.
  useEffect(() => {
    if (!connected) { initSent.current = false; return }
    if (initSent.current) return
    if (platos.length > 0) {
      sendMessage?.({ type: 'sync:platos', platos })
    }
    initSent.current = true
  }, [connected, platos, sendMessage])

  useEffect(() => {
    if (serverState?.platos) {
      setPlatos(serverState.platos)
    }
  }, [serverState?.platos])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(platos))
    } catch {
      /* quota excedida — ignoramos silenciosamente */
    }
  }, [platos])

  const syncPlatos = useCallback((nextPlatos) => {
    if (!connected) return
    sendMessage({ type: 'sync:platos', platos: nextPlatos })
  }, [connected, sendMessage])

  const agregarPlato = useCallback((data) => {
    setPlatos((prev) => {
      const next = [{ id: nuevoId(), creadoEn: Date.now(), ...data }, ...prev]
      syncPlatos(next)
      return next
    })
  }, [syncPlatos])

  const actualizarPlato = useCallback((id, data) => {
    setPlatos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...data, actualizadoEn: Date.now() } : p))
      syncPlatos(next)
      return next
    })
  }, [syncPlatos])

  const eliminarPlato = useCallback((id) => {
    setPlatos((prev) => {
      const next = prev.filter((p) => p.id !== id)
      syncPlatos(next)
      return next
    })
  }, [syncPlatos])

  const value = useMemo(
    () => ({ platos, agregarPlato, actualizarPlato, eliminarPlato }),
    [platos, agregarPlato, actualizarPlato, eliminarPlato],
  )

  return <PlatosCtx.Provider value={value}>{children}</PlatosCtx.Provider>
}

export function usePlatos() {
  const ctx = useContext(PlatosCtx)
  if (!ctx) throw new Error('usePlatos debe usarse dentro de <PlatosProvider>')
  return ctx
}
