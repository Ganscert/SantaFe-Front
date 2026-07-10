import { getDB, RESTAURANTE_ID } from '../_supabase.js'
import { requireAuth, serverError } from '../_auth.js'
import { dashboardRows } from '../_dashboard.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      const { numero_mesa, mesa_id, solo_no_cobrados, dashboard, desde, hasta } = req.query

      // Modo dashboard: lista todos los pedidos del restaurante en una ventana.
      if (dashboard === '1' || dashboard === 'true') {
        if (!requireAuth(req, res, ['admin', 'gerente'])) return
        return res.json(await dashboardRows(sb, RESTAURANTE_ID, { desde, hasta }))
      }

      // Pedidos por mesa: cualquier sesión válida (staff o cliente en mesa)
      if (!requireAuth(req, res)) return

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

      const rows = data.map(({ pedido_items: rawItems = [], ...rest }) => ({
        ...rest,
        items: rawItems.map(i => ({
          id: i.id,
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio: i.precio_unitario,
          estado: i.estado,
          subtotal: i.subtotal,
        })),
      }))
      return res.json(rows)
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res)) return
      const {
        numero_mesa, mesa_id: directMesaId, items = [],
        comensal_id = null,
      } = req.body
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
        .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, comensal_id })
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
      if (!requireAuth(req, res)) return
      const { id, estado, accion, pedido_id, cancelado_por, motivo } = req.body

      // Cancelar pedido entero (bloquea si la cocina ya empezó)
      if (accion === 'cancelar' && pedido_id) {
        const { data, error } = await sb.rpc('cancelar_pedido', {
          p_pedido_id: pedido_id,
          p_cancelado_por: cancelado_por ?? null,
          p_motivo: motivo ?? null,
        })
        if (error) {
          const code = error.message?.includes('cocina ya empezó') ? 409 : 400
          return res.status(code).json({ error: error.message })
        }
        return res.json({ ok: true, pedido: data })
      }

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
    return serverError(res, '[api/pedidos]', e)
  }
}
