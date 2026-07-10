import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { useRestaurante } from './RestauranteContext.jsx'
import { db } from '../../adapters/db.js'

// La carta cambia poco; 30s de refresco es suficiente como respaldo del
// sync en vivo (sync:platos) y evita martillar la API con cada usuario.
const POLL_MS = 30000
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
  // El menú es POR RESTAURANTE: al cambiar la sede auditada se recarga la
  // carta; en modo auditoría no se participa del sync WS (es de la sede base).
  const { restauranteId, auditando } = useRestaurante()
  const [platos, setPlatos] = useState([])
  // Distingue "aún cargando" de "el restaurante no tiene platos": las vistas
  // usan el catálogo estático de demo SÓLO cuando cargado && platos vacíos
  // (evita el parpadeo del menú demo durante la carga inicial).
  const [cargado, setCargado] = useState(false)
  const initSent = useRef(false)

  async function cargar() {
    try {
      const rows = await db.platos.list()
      setPlatos(rows.map(mapRow))
      setCargado(true)
    } catch (e) {
      console.error('[platos.cargar]', e.message)
    }
  }

  // Carga inicial y recarga al cambiar la sede
  useEffect(() => { cargar() }, [restauranteId])

  // Polling (pausado con la pestaña oculta)
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) cargar() }, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // WS legacy
  useEffect(() => {
    if (auditando) return
    if (connected && !initSent.current && platos.length > 0) {
      sendMessage?.({ type: 'sync:platos', platos })
      initSent.current = true
    }
    if (!connected) initSent.current = false
  }, [connected, platos, sendMessage, auditando])

  useEffect(() => {
    if (auditando) return
    if (serverState?.platos) {
      setPlatos(serverState.platos)
      setCargado(true)
    }
  }, [serverState?.platos, auditando])

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

  // Cambia sólo la disponibilidad conservando el resto de campos del plato.
  // (El PATCH reescribe la fila, así que reenviamos todos los datos actuales.)
  const setDisponible = useCallback(async (id, disponible) => {
    const actual = platos.find(p => p.id === id)
    if (!actual) return { ok: false, error: 'Plato no encontrado' }
    // Optimista
    setPlatos(prev => prev.map(p => p.id === id ? { ...p, disponible } : p))
    try {
      await db.platos.update(id, toRow({
        nombre: actual.nombre, precio: actual.precio, categoria: actual.categoria,
        ingredientes: actual.ingredientes, imagenUrl: actual.imagenUrl, disponible,
      }))
      return { ok: true }
    } catch (e) {
      console.error('[platos.setDisponible]', e.message)
      setPlatos(prev => prev.map(p => p.id === id ? { ...p, disponible: actual.disponible } : p))
      return { ok: false, error: e.message }
    }
  }, [platos])

  const value = useMemo(
    () => ({ platos, cargado, agregarPlato, actualizarPlato, eliminarPlato, setDisponible }),
    [platos, cargado, agregarPlato, actualizarPlato, eliminarPlato, setDisponible],
  )

  return <PlatosCtx.Provider value={value}>{children}</PlatosCtx.Provider>
}

export function usePlatos() {
  const ctx = useContext(PlatosCtx)
  if (!ctx) throw new Error('usePlatos debe usarse dentro de <PlatosProvider>')
  return ctx
}
