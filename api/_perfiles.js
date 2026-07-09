// Perfil de cliente (tabla `perfiles_clientes`), compartido por la Vercel
// Function api/usuarios.js y el dev server api/server.js.
//
// Contexto: la tabla existía pero ningún flujo escribía en ella, y además su
// `id` estaba atado por FK a `auth.users` (modelo de Supabase Auth) mientras que
// esta app autentica con su propia tabla `usuarios`. Por eso NINGÚN insert era
// posible y `perfiles_clientes` quedaba vacía. La migración
// `supabase_perfiles_clientes.sql` corrige el esquema (id con default propio +
// columna `usuario_id` → usuarios). Este helper inserta el perfil de forma
// resiliente y NUNCA lanza: un fallo de perfil no debe abortar el registro.

// PostgREST/PG: columna inexistente en la tabla / schema cache.
const esColumnaFaltante = (e) =>
  e?.code === 'PGRST204' || e?.code === '42703' ||
  /could not find the .* column|column .* does not exist/i.test(e?.message || '')

export async function crearPerfilCliente(sb, { usuario_id, restaurante_id, nombre, email, telefono = null }) {
  const base = { usuario_id, nombre, email, telefono }

  // 1) Intento completo (con restaurante_id, tras la migración).
  let { error } = await sb.from('perfiles_clientes').insert({ ...base, restaurante_id })

  // 2) Si falta la columna restaurante_id, insertar sólo con el enlace usuario_id.
  if (error && esColumnaFaltante(error)) {
    ;({ error } = await sb.from('perfiles_clientes').insert(base))
  }

  if (error) {
    // Duplicado = el perfil ya existe: no es un problema para el registro.
    if (error.code === '23505') return { ok: true, yaExistia: true }
    // Esquema aún sin migrar (p. ej. id atado a auth.users) → se registra el
    // usuario igual; el perfil se poblará tras correr la migración/backfill.
    console.warn('[perfiles_clientes] no se pudo crear el perfil:', error.code, error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
