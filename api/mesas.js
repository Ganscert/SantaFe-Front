import { getDB, RESTAURANTE_ID } from './_supabase.js'
import { requireAuth, resolveRestaurante, serverError } from './_auth.js'

// Gestión estructural de mesas (número/capacidad): administración y supervisión.
const ROLES_GESTION_MESAS = ['admin', 'gerente', 'supervisor']

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    // Multi-tenant: cada request opera sobre el restaurante del caller
    // (o el auditado, si un admin manda restaurante_id explícito).
    const RID = resolveRestaurante(req, RESTAURANTE_ID)
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('mesas')
        .select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)')
        .eq('restaurante_id', RID)
        .order('numero_mesa')
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res, ROLES_GESTION_MESAS)) return
      const { numero_mesa, capacidad = 4, estado = 'disponible', zona_id = null } = req.body
      const { data, error } = await sb
        .from('mesas')
        .upsert(
          { restaurante_id: RID, numero_mesa, capacidad, estado, zona_id },
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
      const auth = requireAuth(req, res)
      if (!auth) return
      const { id, estado } = req.body
      const cambiaZona = Object.prototype.hasOwnProperty.call(req.body, 'zona_id')
      // Atributos estructurales (número/capacidad): sólo gestión.
      const cambiaEstructura = req.body.numero_mesa !== undefined || req.body.capacidad !== undefined
      if (cambiaEstructura && !ROLES_GESTION_MESAS.includes(auth.role)) {
        return res.status(403).json({ error: 'Solo administración o supervisión pueden editar nombre/número y capacidad de las mesas.' })
      }
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
          .eq('restaurante_id', RID)
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
      if (req.body.numero_mesa !== undefined) patch.numero_mesa = Number(req.body.numero_mesa)
      if (req.body.capacidad !== undefined) patch.capacidad = Math.max(1, Number(req.body.capacidad) || 1)
      const { data, error } = await sb
        .from('mesas')
        .update(patch)
        .eq('id', id)
        .eq('restaurante_id', RID)
        .select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)')
        .single()
      if (error) {
        // Choque de número de mesa dentro del restaurante.
        if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una mesa con ese número.' })
        throw error
      }
      return res.json(data)
    }

    if (req.method === 'DELETE') {
      // Solo gestión: admin, gerente y supervisor pueden eliminar mesas.
      if (!requireAuth(req, res, ROLES_GESTION_MESAS)) return
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      // No permitir borrar una mesa que no esté disponible (ocupada / por cobrar).
      const { data: mesa } = await sb
        .from('mesas')
        .select('estado')
        .eq('id', id)
        .eq('restaurante_id', RID)
        .maybeSingle()
      if (!mesa) return res.json({ ok: false, error: 'Mesa no encontrada.' })
      if (mesa.estado !== 'disponible') {
        return res.json({ ok: false, error: 'Solo se pueden eliminar mesas disponibles (sin comensales ni cobros pendientes).' })
      }
      const { error } = await sb
        .from('mesas')
        .delete()
        .eq('id', id)
        .eq('restaurante_id', RID)
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
