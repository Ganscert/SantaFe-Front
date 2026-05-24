import { neon } from '@neondatabase/serverless'

const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const sql = neon(process.env.DATABASE_URL)

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, restaurante_id, nombre, email, role, activo, creado_en, actualizado_en
        FROM public.usuarios
        WHERE restaurante_id = ${RESTAURANTE_ID}
        ORDER BY creado_en DESC`
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { action, email, password, nombre, role } = req.body || {}

      if (action === 'login') {
        if (!email || !password) return res.json({ ok: false, error: 'Email y contraseña requeridos.' })
        const [user] = await sql`
          SELECT id, nombre, email, role
          FROM public.usuarios
          WHERE email = ${String(email).trim().toLowerCase()}
            AND password_hash = ${password}
            AND activo = true
          LIMIT 1`
        if (!user) return res.json({ ok: false, error: 'Credenciales incorrectas.' })
        return res.json({ ok: true, user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role } })
      }

      if (action === 'register') {
        if (!nombre || !email || !password) return res.json({ ok: false, error: 'Nombre, email y contraseña son requeridos.' })
        const cleanEmail = String(email).trim().toLowerCase()
        try {
          const [row] = await sql`
            INSERT INTO public.usuarios (restaurante_id, nombre, email, password_hash, role)
            VALUES (${RESTAURANTE_ID}, ${String(nombre).trim()}, ${cleanEmail}, ${password}, ${role || 'cliente'})
            RETURNING id, nombre, email, role, creado_en`
          return res.json({ ok: true, user: row })
        } catch (e) {
          if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
            return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
          }
          throw e
        }
      }

      return res.status(400).json({ error: 'action no reconocida.' })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/usuarios]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
