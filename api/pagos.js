import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      const { mesa_id } = req.query
      let query = sb
        .from('pagos')
        .select('id, mesa_id, monto, metodo, referencia, creado_en')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('creado_en', { ascending: false })
      if (mesa_id) query = query.eq('mesa_id', mesa_id)
      else query = query.limit(100)
      const { data, error } = await query
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { mesa_id, monto, metodo, referencia = null } = req.body
      // Idempotency: rechazar duplicado mismo mesa+monto+metodo en 60s
      const sixtySecsAgo = new Date(Date.now() - 60_000).toISOString()
      const { data: existing } = await sb
        .from('pagos')
        .select('id, mesa_id, monto, metodo, referencia, creado_en')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('mesa_id', mesa_id)
        .eq('monto', monto)
        .eq('metodo', metodo)
        .gt('creado_en', sixtySecsAgo)
        .limit(1)
        .maybeSingle()
      if (existing) return res.json(existing)

      // Validar que la mesa tenga pedidos pendientes de cobrar.
      // Esto evita transacciones fantasma si el cajero hace doble click,
      // o si se intenta cobrar una mesa cuyos pedidos ya están todos cobrados.
      const { count: pendientesCount, error: countErr } = await sb
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .eq('mesa_id', mesa_id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .is('cobrado_en', null)
      if (countErr) throw countErr
      if (!pendientesCount || pendientesCount === 0) {
        return res.status(409).json({
          error: 'No hay pedidos pendientes de cobro en esta mesa.',
          code: 'NO_PENDING_ORDERS',
        })
      }

      const { data, error } = await sb
        .from('pagos')
        .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, monto, metodo, referencia })
        .select('id, mesa_id, monto, metodo, referencia, creado_en')
        .single()
      if (error) throw error

      // Marca todos los pedidos no cobrados de la mesa como cobrados por este pago
      const { error: rpcErr } = await sb.rpc('marcar_pedidos_cobrados', {
        p_mesa_id: mesa_id, p_pago_id: data.id,
      })
      if (rpcErr) {
        console.warn('[pagos.POST] RPC marcar_pedidos_cobrados falló, usando fallback JS:', rpcErr.message)
        await sb
          .from('pedidos')
          .update({ cobrado_en: new Date().toISOString(), pago_id: data.id })
          .eq('mesa_id', mesa_id)
          .eq('restaurante_id', RESTAURANTE_ID)
          .is('cobrado_en', null)
      }

      return res.json(data)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/pagos]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
