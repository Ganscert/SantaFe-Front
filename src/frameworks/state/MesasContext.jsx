import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'
import { useRestaurante } from './RestauranteContext.jsx'
import { db } from '../../adapters/db.js'

const MesasContext = createContext(null)
const ESTADOS_VALIDOS = new Set(['disponible', 'ocupada', 'por_cobrar'])
// Polling defensivo solo como fallback cuando Pusher no está conectado.
// Si Pusher está conectado, los updates llegan en vivo y este poll no corre.
const POLL_MS = 15000
// Tras un cambio optimista local, ignorar polls por este tiempo para no pisar el estado.
const OPTIMISTIC_GUARD_MS = 3000

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
    zonaId:      row.zona_id ?? null,
    zonaNombre:  row.zona?.nombre ?? null,
    cuentas:     prev?.cuentas          ?? [],
    integrantes: prev?.integrantes      ?? [],
    solicitudesCuenta: prev?.solicitudesCuenta ?? [],
  }
}

export function MesasProvider({ children }) {
  const { serverState, sendMessage, connected } = useLiveSync()
  // `restauranteId` cambia cuando el admin audita otra sede → recargar todo.
  // `auditando` = viendo una sede distinta a la base: en ese modo NO se
  // sincroniza por WS (contaminaría el estado de los demás clientes).
  const { restauranteId, auditando } = useRestaurante()
  const [mesas, setMesas] = useState(defaultMesas)
  const [zonas, setZonas] = useState([])
  const prevRef = useRef([])
  const lastOptimisticAtRef = useRef(0)

  const cargarZonas = useCallback(async () => {
    try { setZonas(await db.zonas.list()) }
    catch (e) { console.error('[zonas.cargar]', e.message) }
  }, [])

  // Carga desde Supabase vía API
  async function cargar(prev) {
    try {
      const rows = await db.mesas.list()
      setMesas(rows.map(r => mapRow(r, prev.find(m => m.numeroMesa === r.numero_mesa))))
    } catch (e) {
      console.error('[mesas.cargar]', e.message)
    }
  }

  // Carga inicial y recarga al cambiar la sede auditada
  useEffect(() => {
    cargar([])
    cargarZonas()
  }, [cargarZonas, restauranteId])

  // Polling como fallback: solo corre cuando Pusher NO está conectado.
  // Cuando Pusher está activo, los updates llegan en vivo via sync:mesas.
  useEffect(() => {
    if (connected) return
    const id = setInterval(() => {
      if (document.hidden) return
      // No pisar estado durante una ventana de optimistic update reciente.
      if (Date.now() - lastOptimisticAtRef.current < OPTIMISTIC_GUARD_MS) return
      setMesas(prev => { prevRef.current = prev; return prev })
      cargar(prevRef.current)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [connected])

  // WS legacy (cuentas/integrantes en tiempo real) — ignorado en auditoría
  useEffect(() => {
    if (auditando) return
    if (serverState?.mesas) setMesas(serverState.mesas)
  }, [serverState?.mesas, auditando])

  const syncMesas = useCallback((next) => {
    if (!connected || auditando) return
    sendMessage({ type: 'sync:mesas', mesas: next })
  }, [connected, sendMessage, auditando])

  const cambiarEstadoA = useCallback((numeroMesa, nuevoEstado) => {
    if (!ESTADOS_VALIDOS.has(nuevoEstado)) return
    lastOptimisticAtRef.current = Date.now()
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
    lastOptimisticAtRef.current = Date.now()
    setMesas(current => {
      const next = current.map(m => m.numeroMesa === numeroMesa ? { ...m, ...patch } : m)
      syncMesas(next)
      return next
    })
  }, [syncMesas])

  // Flujo "mesero envía a caja": marca la mesa por_cobrar Y registra la
  // solicitud de cobro de todas las cuentas abiertas que aún no pidieron la
  // cuenta (las solicitudes previas de clientes via QR se conservan).
  // Así la mesa aparece en el panel principal de Cobros con todas sus cuentas.
  const enviarACobro = useCallback((numeroMesa) => {
    lastOptimisticAtRef.current = Date.now()
    setMesas(current => {
      const next = current.map(m => {
        if (m.numeroMesa !== numeroMesa) return m
        const previas = m.solicitudesCuenta ?? []
        const idsPrevios     = new Set(previas.map(s => s.userId))
        const nombresPrevios = new Set(previas.map(s => String(s.nombre || '').trim().toLowerCase()))
        const ahora = Date.now()
        const delMesero = (m.cuentas ?? [])
          .filter(c => c.abierta !== false
            && !idsPrevios.has(`cuenta-${c.id}`)
            && !nombresPrevios.has(String(c.nombre || '').trim().toLowerCase()))
          .map(c => ({ userId: `cuenta-${c.id}`, nombre: c.nombre, solicitadoEn: ahora, origen: 'mesero' }))
        let solicitudes = [...previas, ...delMesero]
        // Mesa sin cuentas registradas → solicitud genérica a nombre de la mesa
        if (solicitudes.length === 0) {
          solicitudes = [{ userId: `mesero-${m.id}`, nombre: `Mesa ${m.numeroMesa}`, solicitadoEn: ahora, origen: 'mesero' }]
        }
        return { ...m, estado: 'por_cobrar', solicitudesCuenta: solicitudes }
      })
      syncMesas(next)
      const mesa = next.find(m => m.numeroMesa === numeroMesa)
      if (mesa) db.mesas.update(mesa.id, 'por_cobrar').catch(e => console.error('[mesas.update]', e.message))
      return next
    })
  }, [syncMesas])

  // Alta de una mesa nueva. El número se autogenera (máximo actual + 1).
  const agregarMesa = useCallback(async ({ capacidad = 4, zonaId = null } = {}) => {
    const numero = mesas.reduce((max, m) => Math.max(max, m.numeroMesa || 0), 0) + 1
    try {
      const row = await db.mesas.insert({ numero_mesa: numero, capacidad, zona_id: zonaId })
      if (row) {
        setMesas(prev => [...prev, mapRow(row)].sort((a, b) => a.numeroMesa - b.numeroMesa))
      } else {
        await cargar(mesas) // número colisionó (upsert ignorado) → recargar
      }
      return { ok: true, numero }
    } catch (e) {
      console.error('[mesas.agregar]', e.message)
      return { ok: false, error: e.message }
    }
  }, [mesas])

  // Edición estructural (número/nombre y capacidad). Sólo administración,
  // gerencia o supervisión — el backend valida el rol del token.
  const editarMesa = useCallback(async (numeroMesa, { numero, capacidad } = {}) => {
    const mesa = mesas.find(m => m.numeroMesa === numeroMesa)
    if (!mesa) return { ok: false, error: 'Mesa no encontrada.' }
    const patch = {}
    if (numero !== undefined && Number(numero) !== mesa.numeroMesa) patch.numero_mesa = Number(numero)
    if (capacidad !== undefined && Number(capacidad) !== mesa.capacidad) patch.capacidad = Number(capacidad)
    if (!Object.keys(patch).length) return { ok: true }
    try {
      const row = await db.mesas.update(mesa.id, patch)
      lastOptimisticAtRef.current = Date.now()
      setMesas(prev => prev
        .map(m => m.numeroMesa === numeroMesa ? mapRow(row, m) : m)
        .sort((a, b) => a.numeroMesa - b.numeroMesa))
      return { ok: true, mesa: mapRow(row, mesa) }
    } catch (e) {
      console.error('[mesas.editar]', e.message)
      return { ok: false, error: e.message }
    }
  }, [mesas])

  // Baja de una mesa (solo si está disponible; lo valida también el backend).
  const eliminarMesa = useCallback(async (numeroMesa) => {
    const mesa = mesas.find(m => m.numeroMesa === numeroMesa)
    if (!mesa) return { ok: false, error: 'Mesa no encontrada.' }
    try {
      const res = await db.mesas.remove(mesa.id)
      if (res?.ok === false) return { ok: false, error: res.error }
      setMesas(prev => prev.filter(m => m.numeroMesa !== numeroMesa))
      return { ok: true }
    } catch (e) {
      console.error('[mesas.eliminar]', e.message)
      return { ok: false, error: e.message }
    }
  }, [mesas])

  // Asigna (o quita, zonaId=null) la zona de una mesa. Optimista + persistencia.
  const asignarZona = useCallback((numeroMesa, zonaId) => {
    lastOptimisticAtRef.current = Date.now()
    setMesas(current => {
      const zona = zonas.find(z => z.id === zonaId)
      const next = current.map(m => m.numeroMesa === numeroMesa
        ? { ...m, zonaId: zonaId ?? null, zonaNombre: zona?.nombre ?? null }
        : m)
      const mesa = next.find(m => m.numeroMesa === numeroMesa)
      if (mesa) db.mesas.update(mesa.id, { zona_id: zonaId ?? null }).catch(e => console.error('[mesas.zona]', e.message))
      return next
    })
  }, [zonas])

  const value = useMemo(
    () => ({ mesas, zonas, cargarZonas, cambiarEstadoA, actualizarMesa, enviarACobro, asignarZona, agregarMesa, editarMesa, eliminarMesa }),
    [mesas, zonas, cargarZonas, cambiarEstadoA, actualizarMesa, enviarACobro, asignarZona, agregarMesa, editarMesa, eliminarMesa],
  )

  return <MesasContext.Provider value={value}>{children}</MesasContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMesas() {
  const ctx = useContext(MesasContext)
  if (!ctx) throw new Error('useMesas must be used within MesasProvider')
  return ctx
}
