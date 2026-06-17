import { useCallback, useEffect, useState } from 'react'

const KEY = 'santa-fe:reservas'
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

function leer() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

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

export function useReservas() {
  const [reservas, setReservas] = useState(leer)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(reservas)) } catch { /* almacenamiento no disponible */ }
  }, [reservas])

  const crear = useCallback((data) => {
    const reserva = {
      id: uid(),
      estado: 'pendiente',
      creadaEn: Date.now(),
      nombre: String(data.nombre || '').trim(),
      telefono: String(data.telefono || '').trim(),
      personas: Math.max(1, Number(data.personas) || 1),
      mesa: data.mesa ? Number(data.mesa) : null,
      fecha: data.fecha,
      hora: data.hora,
      nota: String(data.nota || '').trim(),
    }
    setReservas(prev => ordenar([...prev, reserva]))
    return reserva
  }, [])

  const cambiarEstado = useCallback((id, estado) => {
    setReservas(prev => prev.map(r => (r.id === id ? { ...r, estado } : r)))
  }, [])

  const eliminar = useCallback((id) => {
    setReservas(prev => prev.filter(r => r.id !== id))
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

  return { reservas, crear, cambiarEstado, eliminar, conflictoDe }
}
