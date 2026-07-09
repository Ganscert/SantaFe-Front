// Lógica del registro de actividad de usuarios (auditoría), compartida por la
// Vercel Function api/actividad.js y el dev server Express (api/server.js).
//
// La tabla `actividad_usuarios` se crea con `supabase_actividad.sql` (raíz del
// repo). Si aún no existe, la API degrada con { missingTable: true } en vez de
// romper la app.

const TIPOS = new Set(['navegacion', 'click', 'accion', 'sesion'])
const MAX_EVENTOS_POR_LOTE = 100
const LIMIT_DEFAULT = 500
const LIMIT_MAX = 2000

// PostgREST: tabla inexistente en el schema cache.
const esTablaFaltante = (error) =>
  error?.code === 'PGRST205' || /actividad_usuarios/.test(error?.message || '') && /schema cache|does not exist/i.test(error?.message || '')

const s = (v, max) => (v == null ? null : String(v).slice(0, max))

/**
 * Inserta un lote de eventos de actividad. La identidad (usuario, rol,
 * restaurante) sale del token verificado — el cliente sólo aporta la
 * descripción del evento (tipo, acción, ruta, detalle) y su nombre/email
 * visibles (informativos).
 */
export async function registrarActividad(sb, auth, restauranteId, eventos) {
  const lote = (Array.isArray(eventos) ? eventos : []).slice(0, MAX_EVENTOS_POR_LOTE)
  if (!lote.length) return { ok: true, insertados: 0 }

  const filas = lote.map((ev) => ({
    restaurante_id: restauranteId,
    usuario_id: auth?.sub ?? null,
    usuario_email: s(ev.usuario_email, 160),
    usuario_nombre: s(ev.usuario_nombre, 120),
    rol: s(auth?.role, 40),
    tipo: TIPOS.has(ev.tipo) ? ev.tipo : 'accion',
    accion: s(ev.accion, 200) || '(sin descripción)',
    ruta: s(ev.ruta, 200),
    detalle: ev.detalle && typeof ev.detalle === 'object' ? ev.detalle : null,
    ...(ev.ts ? { creado_en: new Date(ev.ts).toISOString() } : {}),
  }))

  const { error } = await sb.from('actividad_usuarios').insert(filas)
  if (error) {
    if (esTablaFaltante(error)) return { ok: false, missingTable: true }
    throw error
  }
  return { ok: true, insertados: filas.length }
}

/**
 * Lista actividad para el panel de auditoría (admin). Filtros opcionales:
 * restaurante_id, tipo, desde/hasta (ISO), q (busca en acción/ruta/email).
 */
export async function listActividad(sb, { restaurante_id, tipo, desde, hasta, q, limit } = {}) {
  let query = sb
    .from('actividad_usuarios')
    .select('id, restaurante_id, usuario_id, usuario_email, usuario_nombre, rol, tipo, accion, ruta, detalle, creado_en, restaurante:restaurantes(nombre)')
    .order('creado_en', { ascending: false })
    .limit(Math.min(Number(limit) || LIMIT_DEFAULT, LIMIT_MAX))

  if (restaurante_id) query = query.eq('restaurante_id', restaurante_id)
  if (tipo && TIPOS.has(tipo)) query = query.eq('tipo', tipo)
  if (desde) query = query.gte('creado_en', new Date(desde).toISOString())
  if (hasta) query = query.lte('creado_en', new Date(hasta).toISOString())
  if (q) {
    const term = String(q).replace(/[%_,()]/g, ' ').trim()
    if (term) query = query.or(`accion.ilike.%${term}%,ruta.ilike.%${term}%,usuario_email.ilike.%${term}%,usuario_nombre.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) {
    if (esTablaFaltante(error)) return { rows: [], missingTable: true }
    throw error
  }
  return {
    rows: (data || []).map(({ restaurante, ...r }) => ({ ...r, restaurante_nombre: restaurante?.nombre ?? null })),
    missingTable: false,
  }
}
