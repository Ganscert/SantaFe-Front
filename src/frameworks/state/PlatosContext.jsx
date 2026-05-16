import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

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
  const [platos, setPlatos] = useState(leerStorage)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(platos))
    } catch {
      /* quota excedida — ignoramos silenciosamente */
    }
  }, [platos])

  const agregarPlato = useCallback((data) => {
    setPlatos((prev) => [{ id: nuevoId(), creadoEn: Date.now(), ...data }, ...prev])
  }, [])

  const actualizarPlato = useCallback((id, data) => {
    setPlatos((prev) => prev.map((p) => (p.id === id ? { ...p, ...data, actualizadoEn: Date.now() } : p)))
  }, [])

  const eliminarPlato = useCallback((id) => {
    setPlatos((prev) => prev.filter((p) => p.id !== id))
  }, [])

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
