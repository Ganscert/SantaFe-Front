import { useCallback, useEffect, useState } from 'react'
import { db, authToken } from '../adapters/db.js'
import { useRestaurante } from '../frameworks/state/RestauranteContext.jsx'

// Reservas persistidas server-side (tabla `reservas`, filtradas por sede).
// Antes vivían sólo en localStorage: no sincronizaban entre dispositivos y
// una única clave global mezclaba las de todas las sedes. La interfaz pública
// del hook se mantiene (crear/editar/cambiarEstado/eliminar/conflictoDe) para
// no tocar la UI; las operaciones son OPTIMISTAS (aplican local al instante y
// reconcilian con el servidor en segundo plano, con rollback si falla).

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const ESTADOS_RESERVA = {
  pendiente:  { label: 'Pendiente',  next: 'confirmada' },
  confirmada: { label: 'Confirmada', next: 'sentada' },
  sentada:    { label: 'En mesa',    next: null },
  cancelada:  { label: 'Cancelada',  next: null },
}

export const ESTADOS_ACTIVOS_RESERVA = ['pendiente', 'confirmada']

const ordenar = (lista) =>
  [...lista].sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`))

export function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Devuelve true si dos horas "HH:MM" caen dentro de una ventana de 90 min.
function seSolapan(horaA, horaB) {
  const [ha, ma] = horaA.split(':').map(Number)
  const [hb, mb] = horaB.split(':').map(Number)
  return Math.abs((ha * 60 + ma) - (hb * 60 + mb)) < 90
}

const clampPersonas = (v) => Math.min(50, Math.max(1, Math.round(Number(v) || 1)))

// Fila de DB → shape que usa la UI (mesa = numero_mesa, creadaEn en ms).
function mapRow(row) {
  return {
    id:       row.id,
    estado:   row.estado,
    creadaEn: row.creada_en ? new Date(row.creada_en).getTime() : Date.now(),
    nombre:   row.nombre,
    telefono: row.telefono || '',
    personas: row.personas,
    mesa:     row.numero_mesa ?? null,
    fecha:    row.fecha,
    hora:     row.hora,
    nota:     row.nota || '',
  }
}

// patch de la UI (campo `mesa`) → body de la API (`numero_mesa`).
function toApiPatch(patch) {
  const out = {}
  if (patch.nombre   !== undefined) out.nombre      = patch.nombre
  if (patch.telefono !== undefined) out.telefono    = patch.telefono
  if (patch.personas !== undefined) out.personas    = patch.personas
  if (patch.mesa     !== undefined) out.numero_mesa = patch.mesa ? Number(patch.mesa) : null
  if (patch.fecha    !== undefined) out.fecha       = patch.fecha
  if (patch.hora     !== undefined) out.hora        = patch.hora
  if (patch.nota     !== undefined) out.nota        = patch.nota
  if (patch.estado   !== undefined) out.estado      = patch.estado
  return out
}

export function useReservas() {
  const [reservas, setReservas] = useState([])
  // Recargar al cambiar la sede auditada (multi-tenant).
  const { restauranteId } = useRestaurante()

  const cargar = useCallback(async () => {
    if (!authToken()) return
    try {
      const rows = await db.reservas.list()
      setReservas(ordenar(rows.map(mapRow)))
    } catch (e) {
      console.error('[reservas.cargar]', e.message)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar, restauranteId])

  // Crea de forma OPTIMISTA y devuelve la reserva al instante (la UI la usa
  // sincrónicamente); persiste en background y reconcilia el id real.
  const crear = useCallback((data) => {
    const tempId = `tmp-${uid()}`
    const optimista = {
      id: tempId,
      estado: 'pendiente',
      creadaEn: Date.now(),
      nombre: String(data.nombre || '').trim(),
      telefono: String(data.telefono || '').trim(),
      personas: clampPersonas(data.personas),
      mesa: data.mesa ? Number(data.mesa) : null,
      fecha: data.fecha,
      hora: data.hora,
      nota: String(data.nota || '').trim(),
    }
    setReservas(prev => ordenar([...prev, optimista]))
    db.reservas.insert({
      nombre: optimista.nombre, telefono: optimista.telefono, personas: optimista.personas,
      numero_mesa: optimista.mesa, fecha: optimista.fecha, hora: optimista.hora, nota: optimista.nota,
    })
      .then(row => setReservas(prev => ordenar(prev.map(r => (r.id === tempId ? mapRow(row) : r)))))
      .catch(e => {
        console.error('[reservas.crear]', e.message)
        setReservas(prev => prev.filter(r => r.id !== tempId)) // rollback
      })
    return optimista
  }, [])

  // Edición (teléfono, hora, mesa, nota…) sin perder id/estado.
  const editar = useCallback((id, patch) => {
    if (String(id).startsWith('tmp-')) return // aún sin id real en servidor
    let prevSnapshot
    setReservas(prev => {
      prevSnapshot = prev
      return ordenar(prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    })
    db.reservas.update(id, toApiPatch(patch))
      .then(row => setReservas(prev => ordenar(prev.map(r => (r.id === id ? mapRow(row) : r)))))
      .catch(e => {
        console.error('[reservas.editar]', e.message)
        if (prevSnapshot) setReservas(prevSnapshot) // rollback
      })
  }, [])

  const cambiarEstado = useCallback((id, estado) => {
    if (!ESTADOS_RESERVA[estado]) return
    if (String(id).startsWith('tmp-')) return
    let prevSnapshot
    setReservas(prev => {
      prevSnapshot = prev
      return prev.map(r => (r.id === id ? { ...r, estado } : r))
    })
    db.reservas.update(id, { estado }).catch(e => {
      console.error('[reservas.estado]', e.message)
      if (prevSnapshot) setReservas(prevSnapshot)
    })
  }, [])

  const eliminar = useCallback((id) => {
    let prevSnapshot
    setReservas(prev => {
      prevSnapshot = prev
      return prev.filter(r => r.id !== id)
    })
    if (String(id).startsWith('tmp-')) return // nunca llegó al servidor
    db.reservas.remove(id).catch(e => {
      console.error('[reservas.eliminar]', e.message)
      if (prevSnapshot) setReservas(prevSnapshot)
    })
  }, [])

  // Aviso de choque: otra reserva activa para la misma mesa, mismo día,
  // dentro de una ventana de 90 minutos.
  const conflictoDe = useCallback((data, ignorarId = null) => {
    if (!data.mesa || !data.fecha || !data.hora) return null
    return reservas.find(r =>
      r.id !== ignorarId &&
      ESTADOS_ACTIVOS_RESERVA.includes(r.estado) &&
      r.mesa === Number(data.mesa) &&
      r.fecha === data.fecha &&
      seSolapan(r.hora, data.hora)
    ) || null
  }, [reservas])

  return { reservas, crear, editar, cambiarEstado, eliminar, conflictoDe }
}
