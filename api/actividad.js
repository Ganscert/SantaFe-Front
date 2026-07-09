import { getDB, RESTAURANTE_ID } from './_supabase.js'
import { requireAuth, resolveRestaurante, serverError } from './_auth.js'
import { registrarActividad, listActividad } from './_actividad.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()

    // POST: cualquier sesión válida reporta su propia actividad. El evento se
    // atribuye al restaurante del usuario (token), no a un override.
    if (req.method === 'POST') {
      const auth = requireAuth(req, res)
      if (!auth) return
      const rid = auth.restaurante_id || RESTAURANTE_ID
      const result = await registrarActividad(sb, auth, rid, req.body?.eventos)
      return res.json(result)
    }

    // GET: panel de auditoría — sólo administración de plataforma.
    if (req.method === 'GET') {
      if (!requireAuth(req, res, ['admin'])) return
      const { tipo, desde, hasta, q, limit } = req.query || {}
      // restaurante_id explícito filtra; ausente = toda la plataforma.
      const restaurante_id = req.query?.restaurante_id
        ? resolveRestaurante(req, RESTAURANTE_ID)
        : null
      const result = await listActividad(sb, { restaurante_id, tipo, desde, hasta, q, limit })
      return res.json(result)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/actividad]', e)
  }
}
