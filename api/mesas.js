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
      // Cerrar TODOS los pedidos no entregados de la mesa antes de pasar a
      // por_cobrar / disponible. No dependemos de la RPC porque su filtro
      // por cobrado_en deja afuera pedidos cobrados-pero-en-estado-pendiente
      // (estado raro pero posible), y el trigger los bloquea.
      // Hacer esto desde JS es seguro e idempotente: pedidos ya entregados
      // no se tocan.
      if (estado === 'por_cobrar' || estado === 'disponible') {
        const { data: abiertos, error: selErr } = await sb
          .from('pedidos')
          .select('id')
          .eq('mesa_id', id)
          .eq('restaurante_id', RESTAURANTE_ID)
          .not('estado', 'in', '("entregado","cancelado")')
        if (selErr) console.warn('[mesas.PATCH] select pedidos abiertos:', selErr.message)
        if (abiertos?.length) {
          const pedidoIds = abiertos.map(p => p.id)
          const nowIso = new Date().toISOString()
          // Items: setear iniciado_en para que el trigger de tiempo_servicio calcule
          const { error: itemsIniErr } = await sb.from('pedido_items')
            .update({ iniciado_en: nowIso })
            .in('pedido_id', pedidoIds)
            .is('iniciado_en', null)
            .not('estado', 'in', '("entregado","cancelado")')
          if (itemsIniErr) console.warn('[mesas.PATCH] update items iniciado_en:', itemsIniErr.message)
          // Items: marcar entregado
          const { error: itemsEntErr } = await sb.from('pedido_items')
            .update({ estado: 'entregado' })
            .in('pedido_id', pedidoIds)
            .not('estado', 'in', '("entregado","cancelado")')
          if (itemsEntErr) console.warn('[mesas.PATCH] update items entregado:', itemsEntErr.message)
          // Pedidos: marcar entregado (lo que el trigger valida)
          const { error: pedEntErr } = await sb.from('pedidos')
            .update({ estado: 'entregado' })
            .in('id', pedidoIds)
          if (pedEntErr) {
            console.error('[mesas.PATCH] update pedidos entregado:', pedEntErr.message)
            throw pedEntErr
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
