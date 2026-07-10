import { getDB, RESTAURANTE_ID } from './_supabase.js'
import { requireAuth, resolveRestaurante, serverError } from './_auth.js'
import {
  ROLES_GEN, crearToken, buscarToken, listTokens, usarTokenDB, invalidarTokensDB,
} from './_tokens.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    const RID = resolveRestaurante(req, RESTAURANTE_ID)

    if (req.method === 'GET') {
      const { codigo, token } = req.query || {}
      // Lookup por código/token: cualquier sesión válida (incluye cliente).
      if (codigo || token) {
        if (!requireAuth(req, res)) return
        const r = await buscarToken(sb, RID, { token, codigo })
        return res.json(r?.missingTable ? null : r)
      }
      // Lista de tokens pendientes: sólo staff que genera QR.
      if (!requireAuth(req, res, ROLES_GEN)) return
      const r = await listTokens(sb, RID)
      return res.json(r.rows)
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res, ROLES_GEN)) return
      const { mesa_id, token, codigo, generado_por } = req.body || {}
      if (!mesa_id || !token) return res.status(400).json({ error: 'mesa_id y token requeridos.' })
      return res.json(await crearToken(sb, RID, { mesa_id, token, codigo, generado_por }))
    }

    if (req.method === 'PATCH') {
      const auth = requireAuth(req, res)
      if (!auth) return
      const { token, mesa_id, accion, used_by } = req.body || {}
      if (accion === 'usar' && token) {
        return res.json(await usarTokenDB(sb, RID, { token, used_by: used_by ?? auth.sub }))
      }
      if (accion === 'invalidar' && mesa_id) {
        if (!ROLES_GEN.includes(auth.role)) return res.status(403).json({ error: 'Sin permiso para invalidar.' })
        return res.json(await invalidarTokensDB(sb, RID, mesa_id))
      }
      return res.status(400).json({ error: 'Acción no válida.' })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/tokens]', e)
  }
}
