import { neon } from '@neondatabase/serverless'

const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const sql = neon(process.env.DATABASE_URL)
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, numero_mesa, estado, capacidad
        FROM public.mesas
        WHERE restaurante_id = ${RESTAURANTE_ID}
        ORDER BY numero_mesa
      `
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { numero_mesa, capacidad = 4, estado = 'disponible' } = req.body
      const [row] = await sql`
        INSERT INTO public.mesas (restaurante_id, numero_mesa, capacidad, estado)
        VALUES (${RESTAURANTE_ID}, ${numero_mesa}, ${capacidad}, ${estado})
        ON CONFLICT (restaurante_id, numero_mesa) DO NOTHING
        RETURNING id, numero_mesa, estado, capacidad
      `
      return res.json(row ?? null)
    }

    if (req.method === 'PATCH') {
      const { id, estado } = req.body
      const [row] = await sql`
        UPDATE public.mesas SET estado = ${estado}
        WHERE id = ${id} AND restaurante_id = ${RESTAURANTE_ID}
        RETURNING id, numero_mesa, estado, capacidad
      `
      return res.json(row ?? null)
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/mesas]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
