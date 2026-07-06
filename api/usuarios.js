import { getDB, RESTAURANTE_ID } from './_supabase.js'
import {
  signToken, requireAuth, hashPassword, verifyPassword,
  loginRateLimited, loginRateClear, serverError,
} from './_auth.js'

const ROLES_ADMIN = ['admin', 'gerente']
const ROLES_VALIDOS = ['admin', 'gerente', 'recepcionista', 'mesero', 'cocinero', 'cajero', 'cliente']

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
      if (!requireAuth(req, res, ROLES_ADMIN)) return
      const { data, error } = await sb
        .from('usuarios')
        .select('id, restaurante_id, nombre, email, role, activo, creado_en, actualizado_en')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('creado_en', { ascending: false })
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { action, email, password, nombre, role } = req.body || {}

      if (action === 'login') {
        if (!email || !password) return res.json({ ok: false, error: 'Email y contraseña requeridos.' })
        const cleanEmail = String(email).trim().toLowerCase()
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || ''
        const rateKey = `${ip}|${cleanEmail}`
        if (loginRateLimited(rateKey)) {
          return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera unos minutos.' })
        }
        const { data: user, error } = await sb
          .from('usuarios')
          .select('id, nombre, email, role, password_hash')
          .eq('email', cleanEmail)
          .eq('activo', true)
          .maybeSingle()
        if (error) throw error
        const check = user ? verifyPassword(password, user.password_hash) : { ok: false }
        if (!user || !check.ok) return res.json({ ok: false, error: 'Credenciales incorrectas.' })
        loginRateClear(rateKey)
        // Fila legacy (contraseña en claro) → re-hashear al vuelo
        if (check.legacy) {
          const { error: upErr } = await sb.from('usuarios').update({ password_hash: hashPassword(password) }).eq('id', user.id)
          if (upErr) console.warn('[usuarios.login] upgrade hash:', upErr.message)
        }
        const safe = { id: user.id, nombre: user.nombre, email: user.email, role: user.role }
        return res.json({ ok: true, user: safe, token: signToken(safe) })
      }

      if (action === 'register') {
        if (!nombre || !email || !password) return res.json({ ok: false, error: 'Nombre, email y contraseña son requeridos.' })
        if (String(password).length < 6) return res.json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' })
        const cleanEmail = String(email).trim().toLowerCase()
        // El registro público SIEMPRE crea clientes; el personal se da de alta
        // desde /admin/usuarios (action:'create', protegido por rol).
        const { data: row, error } = await sb
          .from('usuarios')
          .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), email: cleanEmail, password_hash: hashPassword(password), role: 'cliente' })
          .select('id, nombre, email, role, creado_en')
          .single()
        if (error) {
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
            return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
          }
          throw error
        }
        return res.json({ ok: true, user: row, token: signToken(row) })
      }

      // Alta de personal desde el panel /admin/usuarios.
      if (action === 'create') {
        if (!requireAuth(req, res, ROLES_ADMIN)) return
        if (!nombre || !email) return res.json({ ok: false, error: 'Nombre y correo son requeridos.' })
        if (role && !ROLES_VALIDOS.includes(role)) return res.json({ ok: false, error: 'Rol no válido.' })
        const cleanEmail = String(email).trim().toLowerCase()
        const { data: row, error } = await sb
          .from('usuarios')
          .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), email: cleanEmail, password_hash: hashPassword(password || 'santafe123'), role: role || 'cliente' })
          .select('id, nombre, email, role, activo, creado_en')
          .single()
        if (error) {
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
            return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
          }
          throw error
        }
        return res.json({ ok: true, user: row })
      }

      return res.status(400).json({ error: 'action no reconocida.' })
    }

    if (req.method === 'PATCH') {
      if (!requireAuth(req, res, ROLES_ADMIN)) return
      const { id, nombre, email, role, password } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      if (role !== undefined && !ROLES_VALIDOS.includes(role)) return res.json({ ok: false, error: 'Rol no válido.' })
      const patch = { actualizado_en: new Date().toISOString() }
      if (nombre !== undefined) patch.nombre = String(nombre).trim()
      if (email !== undefined) patch.email = String(email).trim().toLowerCase()
      if (role !== undefined) patch.role = role
      if (password) patch.password_hash = hashPassword(password)
      const { data, error } = await sb
        .from('usuarios')
        .update(patch)
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .select('id, nombre, email, role, activo')
        .single()
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
        }
        throw error
      }
      return res.json({ ok: true, user: data })
    }

    if (req.method === 'DELETE') {
      const auth = requireAuth(req, res, ROLES_ADMIN)
      if (!auth) return
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      if (id === auth.sub) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' })
      const { error } = await sb
        .from('usuarios')
        .delete()
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/usuarios]', e)
  }
}
