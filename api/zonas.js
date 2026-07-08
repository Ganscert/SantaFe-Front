import { getDB, RESTAURANTE_ID } from './_supabase.js'
import { requireAuth, serverError } from './_auth.js'

const ROLES_GESTION = ['admin', 'gerente']

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    // Lectura abierta (igual que mesas); mutaciones sólo administración.
    if (req.method !== 'GET' && !requireAuth(req, res, ROLES_GESTION)) return

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('zonas')
        .select('id, nombre, orden, activa')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { nombre, orden = 0, activa = true } = req.body || {}
      if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre de la zona es requerido.' })
      const { data, error } = await sb
        .from('zonas')
        .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), orden: Number(orden) || 0, activa })
        .select('id, nombre, orden, activa')
        .single()
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una zona con ese nombre.' })
        throw error
      }
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { id, nombre, orden, activa } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      const patch = {}
      if (nombre !== undefined) patch.nombre = String(nombre).trim()
      if (orden !== undefined) patch.orden = Number(orden) || 0
      if (activa !== undefined) patch.activa = activa
      const { data, error } = await sb
        .from('zonas')
        .update(patch)
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .select('id, nombre, orden, activa')
        .single()
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una zona con ese nombre.' })
        throw error
      }
      return res.json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      // Desasignar las mesas de la zona antes de borrarla (evita romper la FK).
      await sb.from('mesas').update({ zona_id: null }).eq('zona_id', id).eq('restaurante_id', RESTAURANTE_ID)
      const { error } = await sb.from('zonas').delete().eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/zonas]', e)
  }
}
