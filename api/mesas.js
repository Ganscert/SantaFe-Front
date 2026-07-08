import { getDB, RESTAURANTE_ID } from './_supabase.js'
import { requireAuth, serverError } from './_auth.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('mesas')
        .select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('numero_mesa')
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res, ['admin', 'gerente'])) return
      const { numero_mesa, capacidad = 4, estado = 'disponible', zona_id = null } = req.body
      const { data, error } = await sb
        .from('mesas')
        .upsert(
          { restaurante_id: RESTAURANTE_ID, numero_mesa, capacidad, estado, zona_id },
          { onConflict: 'restaurante_id,numero_mesa', ignoreDuplicates: true }
        )
        .select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)')
        .maybeSingle()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      // Cualquier sesión válida: el staff opera el tablero y el cliente
      // ocupa la mesa al unirse por QR.
      if (!requireAuth(req, res)) return
      const { id, estado } = req.body
      const cambiaZona = Object.prototype.hasOwnProperty.call(req.body, 'zona_id')
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
      const patch = {}
      if (estado !== undefined) patch.estado = estado
      if (cambiaZona) patch.zona_id = req.body.zona_id ?? null
      const { data, error } = await sb
        .from('mesas')
        .update(patch)
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)')
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'DELETE') {
      // Solo gestión: admin y gerente (supervisor) pueden eliminar mesas.
      if (!requireAuth(req, res, ['admin', 'gerente'])) return
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      // No permitir borrar una mesa que no esté disponible (ocupada / por cobrar).
      const { data: mesa } = await sb
        .from('mesas')
        .select('estado')
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .maybeSingle()
      if (!mesa) return res.json({ ok: false, error: 'Mesa no encontrada.' })
      if (mesa.estado !== 'disponible') {
        return res.json({ ok: false, error: 'Solo se pueden eliminar mesas disponibles (sin comensales ni cobros pendientes).' })
      }
      const { error } = await sb
        .from('mesas')
        .delete()
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
      if (error) {
        // FK: hay pedidos/pagos históricos referenciando la mesa.
        if (error.code === '23503') return res.json({ ok: false, error: 'La mesa tiene pedidos o pagos asociados y no se puede eliminar.' })
        throw error
      }
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/mesas]', e)
  }
}
