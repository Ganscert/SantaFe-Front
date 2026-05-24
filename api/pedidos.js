import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const sb = getDB()
  try {
    if (req.method === 'GET') {
      const { numero_mesa, mesa_id } = req.query
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

      const { data, error } = await sb
        .from('pedidos')
        .select('id, mesa_id, estado, total, creado_en, pedido_items (id, nombre, cantidad, precio_unitario, estado, subtotal, creado_en)')
        .eq('mesa_id', mid)
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('creado_en', { ascending: false })
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
      const { data, error } = await sb
        .from('pedido_items')
        .update({ estado })
        .eq('id', id)
        .select('id, estado')
        .single()
      if (error) throw error
      return res.json(data)
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/pedidos]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
