import { getDB, RESTAURANTE_ID } from '../_supabase.js'
import { requireAuth, resolveRestaurante, serverError } from '../_auth.js'

// Quién gestiona reservas (coincide con roleAccess.js '/reservas').
const ROLES_RESERVAS = ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero']
const ESTADOS = ['pendiente', 'confirmada', 'sentada', 'cancelada']

const clampPersonas = (v) => Math.min(50, Math.max(1, Math.round(Number(v) || 1)))

// Sólo campos editables; ignora cualquier otra clave del body.
function sanitizePatch(body) {
  const patch = {}
  if (body.nombre      !== undefined) patch.nombre      = String(body.nombre).trim()
  if (body.telefono    !== undefined) patch.telefono    = String(body.telefono || '').trim() || null
  if (body.personas    !== undefined) patch.personas    = clampPersonas(body.personas)
  if (body.numero_mesa !== undefined) patch.numero_mesa = body.numero_mesa == null ? null : Number(body.numero_mesa)
  if (body.fecha       !== undefined) patch.fecha       = body.fecha
  if (body.hora        !== undefined) patch.hora        = body.hora
  if (body.nota        !== undefined) patch.nota        = String(body.nota || '').trim() || null
  if (body.estado      !== undefined) patch.estado      = body.estado
  return patch
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    const auth = requireAuth(req, res, ROLES_RESERVAS)
    if (!auth) return
    const RID = resolveRestaurante(req, RESTAURANTE_ID)
    const COLS = 'id, restaurante_id, nombre, telefono, personas, numero_mesa, fecha, hora, estado, nota, creada_en'

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('reservas')
        .select(COLS)
        .eq('restaurante_id', RID)
        .order('fecha', { ascending: true })
        .order('hora', { ascending: true })
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const patch = sanitizePatch(req.body || {})
      if (!patch.nombre) return res.status(400).json({ error: 'El nombre es requerido.' })
      if (!patch.fecha || !patch.hora) return res.status(400).json({ error: 'Fecha y hora son requeridas.' })
      if (patch.estado && !ESTADOS.includes(patch.estado)) return res.status(400).json({ error: 'Estado no válido.' })
      const { data, error } = await sb
        .from('reservas')
        .insert({ restaurante_id: RID, estado: 'pendiente', ...patch })
        .select(COLS)
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      const patch = sanitizePatch(req.body || {})
      if (patch.estado && !ESTADOS.includes(patch.estado)) return res.status(400).json({ error: 'Estado no válido.' })
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada que actualizar.' })
      patch.actualizado_en = new Date().toISOString()
      const { data, error } = await sb
        .from('reservas')
        .update(patch)
        .eq('id', id)
        .eq('restaurante_id', RID)
        .select(COLS)
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      const { error } = await sb
        .from('reservas')
        .delete()
        .eq('id', id)
        .eq('restaurante_id', RID)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/reservas]', e)
  }
}
