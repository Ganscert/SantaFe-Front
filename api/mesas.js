import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('mesas')
        .select('id, numero_mesa, estado, capacidad')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('numero_mesa')
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { numero_mesa, capacidad = 4, estado = 'disponible' } = req.body
      const { data, error } = await sb
        .from('mesas')
        .upsert(
          { restaurante_id: RESTAURANTE_ID, numero_mesa, capacidad, estado },
          { onConflict: 'restaurante_id,numero_mesa', ignoreDuplicates: true }
        )
        .select('id, numero_mesa, estado, capacidad')
        .maybeSingle()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { id, estado } = req.body
      // Cerrar todos los pedidos abiertos antes de por_cobrar / disponible
      // para que el trigger de validación no bloquee el cambio de estado.
      if (estado === 'por_cobrar' || estado === 'disponible') {
        const { error: rpcErr } = await sb.rpc('cerrar_pedidos_mesa', { p_mesa_id: id })
        if (rpcErr) {
          console.warn('[mesas.PATCH] RPC cerrar_pedidos_mesa falló, usando fallback JS:', rpcErr.message)
          // Fallback: cerrar pedidos manualmente
          const { data: abiertos } = await sb
            .from('pedidos')
            .select('id')
            .eq('mesa_id', id)
            .eq('restaurante_id', RESTAURANTE_ID)
            .not('estado', 'in', '("entregado","cancelado")')
          if (abiertos?.length) {
            const pedidoIds = abiertos.map(p => p.id)
            const nowIso = new Date().toISOString()
            // Items: setear iniciado_en (para que el trigger de tiempo_servicio calcule)
            await sb.from('pedido_items')
              .update({ iniciado_en: nowIso })
              .in('pedido_id', pedidoIds)
              .is('iniciado_en', null)
              .not('estado', 'in', '("entregado","cancelado")')
            // Items: entregado
            await sb.from('pedido_items')
              .update({ estado: 'entregado' })
              .in('pedido_id', pedidoIds)
              .not('estado', 'in', '("entregado","cancelado")')
            // Pedidos: entregado
            await sb.from('pedidos')
              .update({ estado: 'entregado' })
              .in('id', pedidoIds)
          }
        }
      }
      const { data, error } = await sb
        .from('mesas')
        .update({ estado })
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .select('id, numero_mesa, estado, capacidad')
        .single()
      if (error) throw error
      return res.json(data)
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/mesas]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
