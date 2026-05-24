import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      const { mesa_id, tipo } = req.query

      if (tipo === 'tiempo') {
        const { data, error } = await sb
          .from('comensales')
          .select('id, username, creado_en, mesas (numero_mesa)')
          .eq('restaurante_id', RESTAURANTE_ID)
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
      const { numero_mesa, mesa_id: directMesaId, username } = req.body
      let mesa_id = directMesaId
      if (!mesa_id && numero_mesa) {
        const { data: mesa } = await sb
          .from('mesas')
          .select('id')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('numero_mesa', numero_mesa)
          .maybeSingle()
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
        mesa_id = mesa.id
      }
      const { data, error } = await sb
        .from('comensales')
        .upsert(
          { mesa_id, restaurante_id: RESTAURANTE_ID, username, activo: true },
          { onConflict: 'mesa_id,username' }
        )
        .select('id, mesa_id, username, total_cuenta, activo')
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { mesa_id, activo, pagado } = req.body
      if (pagado === true) {
        const { error } = await sb
          .from('comensales')
          .update({ pagado_en: new Date().toISOString() })
          .eq('mesa_id', mesa_id)
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('activo', true)
        if (error) throw error
        return res.json({ ok: true })
      }
      const { error } = await sb
        .from('comensales')
        .update({ activo })
        .eq('mesa_id', mesa_id)
        .eq('restaurante_id', RESTAURANTE_ID)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/comensales]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
