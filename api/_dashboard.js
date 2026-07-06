// Pedidos para el dashboard. Intenta la vista v_dashboard_resumen y, si la
// migración no está aplicada en la DB (PGRST205: vista inexistente), cae a
// una consulta directa equivalente sobre pedidos + items.
const toIso = (v) => new Date(Number(v) || v).toISOString()

export async function dashboardRows(sb, restauranteId, { desde, hasta } = {}) {
  let q = sb.from('v_dashboard_resumen')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('creado_en', { ascending: false })
  if (desde) q = q.gte('creado_en', toIso(desde))
  if (hasta) q = q.lte('creado_en', toIso(hasta))
  const { data, error } = await q
  if (!error) return data || []
  if (error.code !== 'PGRST205') throw error

  let f = sb.from('pedidos')
    .select('id, restaurante_id, mesa_id, comensal_id, estado, total, creado_en, cobrado_en, mesas (numero_mesa), comensales (username), pedido_items (id, nombre, cantidad, precio_unitario, estado, subtotal)')
    .eq('restaurante_id', restauranteId)
    .order('creado_en', { ascending: false })
  if (desde) f = f.gte('creado_en', toIso(desde))
  if (hasta) f = f.lte('creado_en', toIso(hasta))
  const { data: rows, error: e2 } = await f
  if (e2) throw e2

  return (rows || []).map(({ mesas, comensales, pedido_items, ...p }) => ({
    ...p,
    numero_mesa: mesas?.numero_mesa ?? null,
    cliente_nombre: comensales?.username ?? null,
    items: (pedido_items || []).map(i => ({
      id: i.id, nombre: i.nombre, cantidad: i.cantidad,
      precio: i.precio_unitario, estado: i.estado, subtotal: i.subtotal,
    })),
  }))
}
