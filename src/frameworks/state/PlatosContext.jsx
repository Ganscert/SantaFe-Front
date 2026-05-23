import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { db } from '../../adapters/db.js'

const POLL_MS = 5000
const PlatosCtx = createContext(null)

function mapRow(row) {
  return {
    id:          row.id,
    nombre:      row.nombre,
    precio:      Number(row.precio),
    disponible:  row.disponible !== false,
    categoria:   row.categoria || 'Plato Principal',
    ingredientes:row.ingredientes || [],
    imagenUrl:   row.imagen_url || null,
    imagenData:  row.imagen_url || null,
    creadoEn:    row.creado_en ? new Date(row.creado_en).getTime() : Date.now(),
    remoto:      true,
  }
}

function toRow(data) {
  return {
    nombre:      data.nombre,
    precio:      data.precio,
    disponible:  data.disponible ?? true,
    categoria:   data.categoria || null,
    ingredientes:data.ingredientes || [],
    imagen_url:  data.imagenUrl || data.imagenData || null,
  }
}

export function PlatosProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync() || {}
  const [platos, setPlatos] = useState([])
  const initSent = useRef(false)

  async function cargar() {
    try {
      const rows = await db.platos.list()
      setPlatos(rows.map(mapRow))
    } catch (e) {
      console.error('[platos.cargar]', e.message)
    }
  }

  // Carga inicial
  useEffect(() => { cargar() }, [])

  // Polling
  useEffect(() => {
    const id = setInterval(cargar, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // WS legacy
  useEffect(() => {
    if (connected && !initSent.current && platos.length > 0) {
      sendMessage?.({ type: 'sync:platos', platos })
      initSent.current = true
    }
    if (!connected) initSent.current = false
  }, [connected, platos, sendMessage])

  useEffect(() => {
    if (serverState?.platos) setPlatos(serverState.platos)
  }, [serverState?.platos])

  const syncPlatos = useCallback((next) => {
    if (!connected) return
    sendMessage({ type: 'sync:platos', platos: next })
  }, [connected, sendMessage])

  const agregarPlato = useCallback(async (data) => {
    try {
      const row = await db.platos.insert(toRow(data))
      const nuevo = mapRow(row)
      setPlatos(prev => prev.some(p => p.id === nuevo.id) ? prev : [nuevo, ...prev])
      return { ok: true, plato: nuevo }
    } catch (e) {
      console.error('[platos.insert]', e.message)
      return { ok: false, error: e.message }
    }
  }, [])

  const actualizarPlato = useCallback(async (id, data) => {
    try {
      await db.platos.update(id, toRow(data))
      setPlatos(prev => prev.map(p => p.id === id ? { ...p, ...mapRow({ id, ...toRow(data), creado_en: p.creadoEn }) } : p))
      return { ok: true }
    } catch (e) {
      console.error('[platos.update]', e.message)
      return { ok: false, error: e.message }
    }
  }, [])

  const eliminarPlato = useCallback(async (id) => {
    try {
      await db.platos.delete(id)
      setPlatos(prev => prev.filter(p => p.id !== id))
      return { ok: true }
    } catch (e) {
      console.error('[platos.delete]', e.message)
      return { ok: false, error: e.message }
    }
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
