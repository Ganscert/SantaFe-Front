import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      const { numero_mesa, mesa_id, solo_no_cobrados } = req.query
      let mid = mesa_id

      if (!mid && numero_mesa) {
        const { data: mesa } = await sb
          .from('mesas')
          .select('id')
          .eq('restaurante_id', RESTAURANTE_ID)
          .eq('numero_mesa', numero_mesa)
          .maybeSingle()
        if (!mesa) return res.json([])
        mid = mesa.id
      }
      if (!mid) return res.json([])

      let pedidosQuery = sb
        .from('pedidos')
        .select('id, mesa_id, estado, total, cobrado_en, pago_id, creado_en, pedido_items (id, nombre, cantidad, precio_unitario, estado, subtotal, creado_en)')
        .eq('mesa_id', mid)
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('creado_en', { ascending: false })
      if (solo_no_cobrados === '1' || solo_no_cobrados === 'true') {
        pedidosQuery = pedidosQuery.is('cobrado_en', null)
      }

      const { data, error } = await pedidosQuery
      if (error) throw error

      const rows = data.map(p => {
        const items = (p.pedido_items || []).map(i => ({
          id: i.id,
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio: i.precio_unitario,
          estado: i.estado,
          subtotal: i.subtotal,
        }))
        const { pedido_items: _, ...rest } = p
        return { ...rest, items }
      })
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { numero_mesa, mesa_id: directMesaId, items = [] } = req.body
      if (!items.length) return res.status(400).json({ error: 'Sin ítems' })

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

      const { data: pedido, error: pedidoError } = await sb
        .from('pedidos')
        .insert({ restaurante_id: RESTAURANTE_ID, mesa_id })
        .select('id, mesa_id, estado, total, creado_en')
        .single()
      if (pedidoError) throw pedidoError

      const { error: itemsError } = await sb
        .from('pedido_items')
        .insert(items.map(item => ({
          pedido_id: pedido.id,
          nombre: item.nombre,
          precio_unitario: item.precio,
          cantidad: item.cantidad,
        })))
      if (itemsError) throw itemsError

      return res.json({ ...pedido, items })
    }

    if (req.method === 'PATCH') {
      const { id, estado } = req.body
      const { data: item, error } = await sb
        .from('pedido_items')
        .update({ estado })
        .eq('id', id)
        .select('id, estado, pedido_id')
        .single()
      if (error) throw error

      // Recalcular estado del pedido padre según sus ítems
      const { data: siblings } = await sb
        .from('pedido_items')
        .select('estado')
        .eq('pedido_id', item.pedido_id)
      if (siblings?.length) {
        const es = siblings.map(s => s.estado)
        let nuevoPedidoEstado = 'pendiente'
        if (es.every(e => e === 'entregado' || e === 'cancelado')) nuevoPedidoEstado = 'entregado'
        else if (es.some(e => e === 'listo'))          nuevoPedidoEstado = 'listo'
        else if (es.some(e => e === 'en_preparacion')) nuevoPedidoEstado = 'en_preparacion'
        await sb.from('pedidos').update({ estado: nuevoPedidoEstado }).eq('id', item.pedido_id)
      }

      return res.json({ id: item.id, estado: item.estado })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/pedidos]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
