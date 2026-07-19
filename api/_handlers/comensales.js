import { getDB, RESTAURANTE_ID } from '../_supabase.js'
import { requireAuth, resolveRestaurante, serverError } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    // Staff y clientes logueados (unirse por QR también requiere sesión)
    if (!requireAuth(req, res)) return
    // Multi-tenant: operar sobre la sede del caller (o la auditada por un admin),
    // no sobre el RESTAURANTE_ID por defecto fijo.
    const RID = resolveRestaurante(req, RESTAURANTE_ID)
    if (req.method === 'GET') {
      const { mesa_id, tipo } = req.query

      // Limpieza perezosa: un comensal "activo" de hace más de 12 h es una
      // sesión abandonada (nadie cena tanto); desactivarlo evita fantasmas
      // en el panel de mesas.
      const staleIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      await sb.from('comensales')
        .update({ activo: false })
        .eq('restaurante_id', RID)
        .eq('activo', true)
        .lt('creado_en', staleIso)

      if (tipo === 'tiempo') {
        const { data, error } = await sb
          .from('comensales')
          .select('id, username, creado_en, mesas (numero_mesa)')
          .eq('restaurante_id', RID)
          .eq('activo', true)
        if (error) throw error
        const now = Date.now()
        const rows = data
          .map(c => ({
            id: c.id,
            username: c.username,
            creado_en: c.creado_en,
            numero_mesa: c.mesas?.numero_mesa,
            minutos_en_mesa: (now - new Date(c.creado_en).getTime()) / 60000,
          }))
          .sort((a, b) => b.minutos_en_mesa - a.minutos_en_mesa)
        return res.json(rows)
      }

      const { data, error } = await sb
        .from('comensales')
        .select('id, mesa_id, username, total_cuenta, activo, pagado_en, creado_en')
        .eq('mesa_id', mesa_id)
        .eq('activo', true)
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { numero_mesa, mesa_id: directMesaId, username, user_id = null } = req.body
      let mesa_id = directMesaId
      if (!mesa_id && numero_mesa) {
        const { data: mesa } = await sb
          .from('mesas')
          .select('id')
          .eq('restaurante_id', RID)
          .eq('numero_mesa', numero_mesa)
          .maybeSingle()
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
        mesa_id = mesa.id
      }
      const { data, error } = await sb
        .from('comensales')
        .upsert(
          // Persistimos user_id (identidad estable) además del username visible.
          // Al reactivar un comensal que vuelve, limpiamos pagado_en para no
          // heredar el "pagado" de una visita anterior.
          { mesa_id, restaurante_id: RID, username, user_id, activo: true, pagado_en: null },
          { onConflict: 'mesa_id,username' }
        )
        .select('id, mesa_id, username, total_cuenta, activo')
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { mesa_id, activo, pagado, username } = req.body
      if (pagado === true) {
        // Marca pagado SÓLO al comensal que paga (username/user_id), no a toda
        // la mesa. Antes, un pago marcaba pagados a todos los activos → otros
        // comensales podían salir sin pagar su consumo.
        let pq = sb
          .from('comensales')
          .update({ pagado_en: new Date().toISOString() })
          .eq('mesa_id', mesa_id)
          .eq('restaurante_id', RID)
          .eq('activo', true)
        if (req.body.user_id) pq = pq.eq('user_id', req.body.user_id)
        else if (username) pq = pq.eq('username', username)
        const { error } = await pq
        if (error) throw error
        return res.json({ ok: true })
      }
      // Si llega username, desactivar solo a ese comensal; si no, a todos los de la mesa
      let q = sb
        .from('comensales')
        .update({ activo })
        .eq('mesa_id', mesa_id)
        .eq('restaurante_id', RID)
      if (username) q = q.eq('username', username)
      const { error } = await q
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/comensales]', e)
  }
}
