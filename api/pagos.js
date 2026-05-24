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
      const rows = mesa_id
        ? await sql`
            SELECT id, mesa_id, monto, metodo, referencia, creado_en
            FROM public.pagos
            WHERE restaurante_id = ${RESTAURANTE_ID} AND mesa_id = ${mesa_id}
            ORDER BY creado_en DESC`
        : await sql`
            SELECT id, mesa_id, monto, metodo, referencia, creado_en
            FROM public.pagos
            WHERE restaurante_id = ${RESTAURANTE_ID}
            ORDER BY creado_en DESC LIMIT 100`
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { mesa_id, monto, metodo, referencia = null } = req.body
      // Idempotency: reject duplicate for same mesa+monto+metodo within 60 s
      const [existing] = await sql`
        SELECT id, mesa_id, monto, metodo, referencia, creado_en FROM public.pagos
        WHERE restaurante_id = ${RESTAURANTE_ID} AND mesa_id = ${mesa_id}
          AND monto = ${monto} AND metodo = ${metodo}
          AND creado_en > now() - interval '60 seconds'
        LIMIT 1`
      if (existing) return res.json(existing)
      const [row] = await sql`
        INSERT INTO public.pagos (restaurante_id, mesa_id, monto, metodo, referencia)
        VALUES (${RESTAURANTE_ID}, ${mesa_id}, ${monto}, ${metodo}, ${referencia})
        RETURNING id, mesa_id, monto, metodo, referencia, creado_en`
      return res.json(row)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/pagos]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
