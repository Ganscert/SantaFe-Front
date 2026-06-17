import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const sb = getDB()
    if (req.method === 'GET') {
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
        const { data: user, error } = await sb
          .from('usuarios')
          .select('id, nombre, email, role')
          .eq('email', String(email).trim().toLowerCase())
          .eq('password_hash', password)
          .eq('activo', true)
          .maybeSingle()
        if (error) throw error
        if (!user) return res.json({ ok: false, error: 'Credenciales incorrectas.' })
        return res.json({ ok: true, user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role } })
      }

      if (action === 'register') {
        if (!nombre || !email || !password) return res.json({ ok: false, error: 'Nombre, email y contraseña son requeridos.' })
        const cleanEmail = String(email).trim().toLowerCase()
        const { data: row, error } = await sb
          .from('usuarios')
          .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), email: cleanEmail, password_hash: password, role: role || 'cliente' })
          .select('id, nombre, email, role, creado_en')
          .single()
        if (error) {
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
            return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
          }
          throw error
        }
        return res.json({ ok: true, user: row })
      }

      // Alta de personal desde el panel /admin/usuarios.
      if (action === 'create') {
        if (!nombre || !email) return res.json({ ok: false, error: 'Nombre y correo son requeridos.' })
        const cleanEmail = String(email).trim().toLowerCase()
        const { data: row, error } = await sb
          .from('usuarios')
          .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), email: cleanEmail, password_hash: password || 'santafe123', role: role || 'cliente' })
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
      const { id, nombre, email, role, password } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      const patch = { actualizado_en: new Date().toISOString() }
      if (nombre !== undefined) patch.nombre = String(nombre).trim()
      if (email !== undefined) patch.email = String(email).trim().toLowerCase()
      if (role !== undefined) patch.role = role
      if (password) patch.password_hash = password
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
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
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
    console.error('[api/usuarios]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
