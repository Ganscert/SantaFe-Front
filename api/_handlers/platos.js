import { getDB, RESTAURANTE_ID } from '../_supabase.js'
import { requireAuth, resolveRestaurante, serverError } from '../_auth.js'

const ROLES_GESTION = ['admin', 'gerente', 'supervisor']

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    // El menú es por restaurante: platos.restaurante_id decide qué carta se
    // sirve. RID = restaurante del caller u override de auditoría (admin).
    const RID = resolveRestaurante(req, RESTAURANTE_ID)
    // Mutaciones de la carta: sólo administración
    if (req.method !== 'GET' && !requireAuth(req, res, ROLES_GESTION)) return
    // Lectura: requiere sesión (cualquier rol). El /menu del cliente ya está
    // tras login; antes el GET respondía sin token.
    if (req.method === 'GET' && !requireAuth(req, res)) return
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('platos')
        .select('id, nombre, precio, disponible, imagen_url, categoria, ingredientes, creado_en')
        .eq('restaurante_id', RID)
        .is('eliminado_en', null)
        .order('creado_en', { ascending: false })
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { nombre, precio, disponible = true, imagen_url = null, categoria = null, ingredientes = [] } = req.body
      const { data, error } = await sb
        .from('platos')
        .insert({ restaurante_id: RID, nombre, precio, disponible, imagen_url, categoria, ingredientes })
        .select()
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { id, nombre, precio, disponible, imagen_url, categoria, ingredientes } = req.body
      const { data, error } = await sb
        .from('platos')
        .update({
          nombre,
          precio,
          disponible,
          imagen_url: imagen_url ?? null,
          categoria: categoria ?? null,
          ingredientes: ingredientes ?? [],
        })
        .eq('id', id)
        .eq('restaurante_id', RID)
        .is('eliminado_en', null)
        .select()
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {}
      const { error } = await sb
        .from('platos')
        .update({ eliminado_en: new Date().toISOString() })
        .eq('id', id)
        .eq('restaurante_id', RID)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/platos]', e)
  }
}
