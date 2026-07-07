// Lógica de plataforma (multi-restaurante) compartida por la Vercel Function
// api/restaurantes.js y el dev server Express (api/server.js). Admin-only.
const DAY = 86400000
const desde30dIso = () => new Date(Date.now() - 30 * DAY).toISOString()

const contarPor = (rows, key = 'restaurante_id') => {
  const map = new Map()
  for (const r of rows || []) map.set(r[key], (map.get(r[key]) || 0) + 1)
  return map
}

/** Lista de restaurantes con estadísticas agregadas (mesas, staff, ventas 30d). */
export async function listRestaurantes(sb) {
  const desde = desde30dIso()
  const [rest, mesas, platos, usuarios, pagos, pedidos] = await Promise.all([
    sb.from('restaurantes').select('id, nombre, creado_en, actualizado_en').order('creado_en'),
    sb.from('mesas').select('restaurante_id'),
    sb.from('platos').select('restaurante_id').is('eliminado_en', null),
    sb.from('usuarios').select('restaurante_id'),
    sb.from('pagos').select('restaurante_id, monto').gte('creado_en', desde),
    sb.from('pedidos').select('restaurante_id').gte('creado_en', desde),
  ])
  for (const q of [rest, mesas, platos, usuarios, pagos, pedidos]) {
    if (q.error) throw q.error
  }

  const nMesas    = contarPor(mesas.data)
  const nPlatos   = contarPor(platos.data)
  const nUsuarios = contarPor(usuarios.data)
  const nPedidos  = contarPor(pedidos.data)
  const ventas = new Map()
  for (const p of pagos.data || []) {
    ventas.set(p.restaurante_id, (ventas.get(p.restaurante_id) || 0) + (Number(p.monto) || 0))
  }

  return (rest.data || []).map(r => ({
    ...r,
    stats: {
      mesas:      nMesas.get(r.id)    || 0,
      platos:     nPlatos.get(r.id)   || 0,
      usuarios:   nUsuarios.get(r.id) || 0,
      pedidos30d: nPedidos.get(r.id)  || 0,
      ventas30d:  ventas.get(r.id)    || 0,
    },
  }))
}

/** Detalle completo de un restaurante para la vista de administración. */
export async function detalleRestaurante(sb, id) {
  const desde = desde30dIso()
  const [rest, mesas, usuarios, platos, pagosRecientes, pagos30, pedidos30] = await Promise.all([
    sb.from('restaurantes').select('id, nombre, creado_en, actualizado_en').eq('id', id).maybeSingle(),
    sb.from('mesas').select('id, numero_mesa, estado, capacidad').eq('restaurante_id', id).order('numero_mesa'),
    sb.from('usuarios').select('id, nombre, email, role, activo, creado_en').eq('restaurante_id', id).order('creado_en', { ascending: false }),
    sb.from('platos').select('id, nombre, precio, disponible, categoria, imagen_url').eq('restaurante_id', id).is('eliminado_en', null).order('nombre'),
    sb.from('pagos').select('id, mesa_id, monto, metodo, referencia, creado_en').eq('restaurante_id', id).order('creado_en', { ascending: false }).limit(50),
    sb.from('pagos').select('monto').eq('restaurante_id', id).gte('creado_en', desde),
    sb.from('pedidos').select('id, estado').eq('restaurante_id', id).gte('creado_en', desde),
  ])
  for (const q of [rest, mesas, usuarios, platos, pagosRecientes, pagos30, pedidos30]) {
    if (q.error) throw q.error
  }
  if (!rest.data) return null

  const ventas30d = (pagos30.data || []).reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const pedidosActivos = (pedidos30.data || []).filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length

  return {
    ...rest.data,
    mesas: mesas.data || [],
    usuarios: usuarios.data || [],
    platos: platos.data || [],
    pagos: pagosRecientes.data || [],
    kpis: {
      ventas30d,
      cobros30d: (pagos30.data || []).length,
      pedidos30d: (pedidos30.data || []).length,
      pedidosActivos,
    },
  }
}

/** Crea el restaurante y, opcionalmente, sus primeras mesas (1..N). */
export async function crearRestaurante(sb, { nombre, mesas_iniciales = 0 }) {
  const { data, error } = await sb.from('restaurantes')
    .insert({ nombre: String(nombre).trim() })
    .select('id, nombre, creado_en')
    .single()
  if (error) throw error

  const n = Math.min(Math.max(Number(mesas_iniciales) || 0, 0), 50)
  if (n > 0) {
    const filas = Array.from({ length: n }, (_, i) => ({
      restaurante_id: data.id, numero_mesa: i + 1, capacidad: 4,
    }))
    const { error: mesasErr } = await sb.from('mesas').insert(filas)
    if (mesasErr) throw mesasErr
  }
  return data
}

export async function renombrarRestaurante(sb, { id, nombre }) {
  const { data, error } = await sb.from('restaurantes')
    .update({ nombre: String(nombre).trim(), actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .select('id, nombre, actualizado_en')
    .single()
  if (error) throw error
  return data
}

/** Borra el restaurante y todo lo que cuelga de él (FK on delete cascade). */
export async function eliminarRestaurante(sb, id) {
  const { error } = await sb.from('restaurantes').delete().eq('id', id)
  if (error) throw error
  return { ok: true }
}
