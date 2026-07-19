// Almacén de tokens/códigos de mesa en DB (persistencia cross-device del flujo
// "unirse a mesa"), compartido por la Vercel Function api/tokens.js y el dev
// server api/server.js.
//
// Degrada suave: si la tabla `mesa_tokens` aún no existe (migración
// supabase_mesa_tokens.sql pendiente), devuelve { missingTable:true } en vez de
// romper, y el frontend cae al comportamiento anterior (localStorage/Pusher).

export const ROLES_GEN = ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero']

const esTablaFaltante = (e) =>
  e?.code === 'PGRST205' ||
  (/mesa_tokens/.test(e?.message || '') && /schema cache|does not exist/i.test(e?.message || ''))

// Crea (o re-afirma) un token para una mesa, rotando los OTROS pendientes.
// Idempotente por `token` (upsert): si el QR mostrado reusa un token cacheado
// en localStorage que nunca se persistió (o quedó expirado), esta llamada lo
// (re)asienta como 'pendiente' en la DB — necesario para que el cliente se una
// desde otro dispositivo. Antes se hacía `.insert` y, al reusar, el token no
// llegaba a la DB y el lookup cross-device devolvía null ("código no válido").
export async function crearToken(sb, RID, { mesa_id, token, codigo, generado_por }) {
  await sb.from('mesa_tokens').update({ estado: 'expirado' })
    .eq('restaurante_id', RID).eq('mesa_id', mesa_id).eq('estado', 'pendiente')
    .neq('token', token)
  const { data, error } = await sb.from('mesa_tokens')
    .upsert(
      { restaurante_id: RID, mesa_id, token, codigo: codigo ?? null, generado_por: generado_por ?? null, estado: 'pendiente' },
      { onConflict: 'token' }
    )
    .select('id, token, codigo, mesa_id, estado').single()
  if (error) { if (esTablaFaltante(error)) return { missingTable: true }; throw error }
  return data
}

// Busca un token PENDIENTE por token(uuid) o código; devuelve null si no existe.
export async function buscarToken(sb, RID, { token, codigo }) {
  let q = sb.from('mesa_tokens')
    .select('id, token, codigo, mesa_id, estado, mesas(numero_mesa)')
    .eq('restaurante_id', RID).eq('estado', 'pendiente')
  q = token ? q.eq('token', token) : q.eq('codigo', String(codigo))
  const { data, error } = await q.maybeSingle()
  if (error) { if (esTablaFaltante(error)) return { missingTable: true }; throw error }
  if (!data) return null
  return {
    id: data.id, token: data.token, codigo: data.codigo, mesa_id: data.mesa_id,
    estado: data.estado, numero_mesa: data.mesas?.numero_mesa ?? null,
  }
}

// Lista tokens pendientes del restaurante (para el staff).
export async function listTokens(sb, RID) {
  const { data, error } = await sb.from('mesa_tokens')
    .select('id, token, codigo, mesa_id, estado, generado_por, used_by, used_at, creado_en')
    .eq('restaurante_id', RID).eq('estado', 'pendiente').order('creado_en', { ascending: false })
  if (error) { if (esTablaFaltante(error)) return { rows: [], missingTable: true }; throw error }
  return { rows: data }
}

// Registra el primer uso del token (no lo invalida: varios comensales lo usan).
export async function usarTokenDB(sb, RID, { token, used_by }) {
  const { error } = await sb.from('mesa_tokens')
    .update({ used_at: new Date().toISOString(), used_by: used_by ?? null })
    .eq('restaurante_id', RID).eq('token', token).is('used_at', null)
  if (error) { if (esTablaFaltante(error)) return { missingTable: true }; throw error }
  return { ok: true }
}

// Invalida los tokens pendientes de una mesa (al liberarla / regenerar).
export async function invalidarTokensDB(sb, RID, mesa_id) {
  const { error } = await sb.from('mesa_tokens').update({ estado: 'expirado' })
    .eq('restaurante_id', RID).eq('mesa_id', mesa_id).eq('estado', 'pendiente')
  if (error) { if (esTablaFaltante(error)) return { missingTable: true }; throw error }
  return { ok: true }
}
