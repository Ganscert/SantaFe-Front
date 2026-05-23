import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { supabase, RESTAURANTE_ID } from '../../adapters/supabase.js'

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

// Convierte una fila de `public.platos` al shape interno. `imagenData` se
// mantiene como alias de `imagen_url` para no romper componentes legacy.
function mapRowToPlato(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    precio: Number(row.precio),
    disponible: row.disponible !== false,
    categoria: row.categoria || 'Plato Principal',
    ingredientes: row.ingredientes || [],
    imagenUrl: row.imagen_url || null,
    imagenData: row.imagen_url || null,
    creadoEn: row.creado_en ? new Date(row.creado_en).getTime() : Date.now(),
    remoto: true,
  }
}

// Shape interno → columnas snake_case de Supabase.
function toRow(data) {
  return {
    restaurante_id: RESTAURANTE_ID,
    nombre:        data.nombre,
    precio:        data.precio,
    disponible:    data.disponible ?? true,
    categoria:     data.categoria || null,
    ingredientes:  data.ingredientes || [],
    imagen_url:    data.imagenUrl || data.imagenData || null,
  }
}

export function PlatosProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync() || {}
  const [platos, setPlatos] = useState(leerStorage)
  const initSent = useRef(false)

  // ── Carga inicial desde Supabase (fuente de verdad si está disponible) ──
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('platos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('creado_en', { ascending: false })
      if (cancelled || error) return
      setPlatos(data.map(mapRowToPlato))
    })()
    return () => { cancelled = true }
  }, [])

  // Broadcast inicial via WS (legacy multi-device sync sin Supabase).
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

  // ── Realtime: INSERT/UPDATE/DELETE en public.platos ──
  // Filtrado por restaurante (tenant). Dedupe por id evita doble inserción
  // cuando el cliente que escribe también recibe el echo.
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`platos-changes-${RESTAURANTE_ID}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'platos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` },
        (payload) => {
          const incoming = mapRowToPlato(payload.new)
          setPlatos((prev) => prev.some((p) => p.id === incoming.id) ? prev : [incoming, ...prev])
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'platos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` },
        (payload) => {
          const updated = mapRowToPlato(payload.new)
          setPlatos((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p))
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'platos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` },
        (payload) => {
          const id = payload.old?.id
          if (id) setPlatos((prev) => prev.filter((p) => p.id !== id))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const syncPlatos = useCallback((nextPlatos) => {
    if (!connected) return
    sendMessage({ type: 'sync:platos', platos: nextPlatos })
  }, [connected, sendMessage])

  // ── Mutaciones ──
  // Si Supabase está disponible: escribimos a la BD y dejamos que realtime
  // popule el estado. Optimistic: añadimos al estado inmediatamente y el echo
  // posterior se deduplica por id.
  const agregarPlato = useCallback(async (data) => {
    if (supabase) {
      const { data: row, error } = await supabase
        .from('platos')
        .insert(toRow(data))
        .select()
        .single()
      if (error) {
        console.error('[platos.insert]', error)
        return { ok: false, error: error.message }
      }
      const incoming = mapRowToPlato(row)
      setPlatos((prev) => prev.some((p) => p.id === incoming.id) ? prev : [incoming, ...prev])
      return { ok: true, plato: incoming }
    }
    // Fallback: local + WS
    setPlatos((prev) => {
      const next = [{ id: nuevoId(), creadoEn: Date.now(), ...data }, ...prev]
      syncPlatos(next)
      return next
    })
    return { ok: true }
  }, [syncPlatos])

  const actualizarPlato = useCallback(async (id, data) => {
    if (supabase && typeof id === 'string' && id.length === 36) {
      const { error } = await supabase.from('platos').update(toRow(data)).eq('id', id)
      if (error) {
        console.error('[platos.update]', error)
        return { ok: false, error: error.message }
      }
      // El UPDATE en realtime puede tardar — actualizamos optimistamente.
      setPlatos((prev) => prev.map((p) => p.id === id ? { ...p, ...data, actualizadoEn: Date.now() } : p))
      return { ok: true }
    }
    setPlatos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...data, actualizadoEn: Date.now() } : p))
      syncPlatos(next)
      return next
    })
    return { ok: true }
  }, [syncPlatos])

  const eliminarPlato = useCallback(async (id) => {
    if (supabase && typeof id === 'string' && id.length === 36) {
      const { error } = await supabase.from('platos').delete().eq('id', id)
      if (error) {
        console.error('[platos.delete]', error)
        return { ok: false, error: error.message }
      }
      setPlatos((prev) => prev.filter((p) => p.id !== id))
      return { ok: true }
    }
    setPlatos((prev) => {
      const next = prev.filter((p) => p.id !== id)
      syncPlatos(next)
      return next
    })
    return { ok: true }
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
