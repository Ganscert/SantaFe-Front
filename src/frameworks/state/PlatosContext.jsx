import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { supabase, RESTAURANTE_ID } from '../../adapters/supabase.js'

const STORAGE_KEY = 'santa-fe:platos'
const PlatosCtx = createContext(null)

// Adapta una fila de `public.platos` (snake_case) al shape interno del front.
// El schema base no incluye categoría/imagen/ingredientes → defaults seguros.
function mapRowToPlato(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    precio: Number(row.precio),
    disponible: row.disponible,
    categoria: row.categoria || 'Plato Principal',
    ingredientes: row.ingredientes || [],
    imagenData: row.imagen_data || null,
    creadoEn: row.creado_en ? new Date(row.creado_en).getTime() : Date.now(),
    remoto: true,
  }
}

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

  // ── Realtime menú: inyecta nuevos platos sin recargar la página ──
  // Suscripción a INSERT en `public.platos` filtrada por restaurante (tenant).
  // El payload se mapea y se concatena al estado; la dedupe evita duplicar si
  // el plato también llegó por el WS de Pusher.
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`platos-insert-${RESTAURANTE_ID}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'platos',
          filter: `restaurante_id=eq.${RESTAURANTE_ID}`,
        },
        (payload) => {
          const incoming = mapRowToPlato(payload.new)
          setPlatos((prev) => {
            if (prev.some((p) => p.id === incoming.id)) return prev
            return [incoming, ...prev]
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

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
