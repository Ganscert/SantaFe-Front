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
      const { mesa_id } = req.query
      const rows = await sql`
        SELECT id, mesa_id, username, total_cuenta, activo
        FROM public.comensales
        WHERE mesa_id = ${mesa_id} AND activo = true
      `
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { numero_mesa, mesa_id: directMesaId, username } = req.body
      let mesa_id = directMesaId
      if (!mesa_id && numero_mesa) {
        const [mesa] = await sql`
          SELECT id FROM public.mesas
          WHERE restaurante_id = ${RESTAURANTE_ID} AND numero_mesa = ${numero_mesa}
        `
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
        mesa_id = mesa.id
      }
      const [row] = await sql`
        INSERT INTO public.comensales (mesa_id, restaurante_id, username)
        VALUES (${mesa_id}, ${RESTAURANTE_ID}, ${username})
        ON CONFLICT (mesa_id, username) DO UPDATE SET activo = true
        RETURNING id, mesa_id, username, total_cuenta, activo
      `
      return res.json(row)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/comensales]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
