import { neon } from '@neondatabase/serverless'

const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const sql = neon(process.env.DATABASE_URL)
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, nombre, precio, disponible, imagen_url, categoria, ingredientes, creado_en
        FROM public.platos
        WHERE restaurante_id = ${RESTAURANTE_ID}
          AND eliminado_en IS NULL
        ORDER BY creado_en DESC
      `
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { nombre, precio, disponible = true, imagen_url = null, categoria = null, ingredientes = [] } = req.body
      const [row] = await sql`
        INSERT INTO public.platos (restaurante_id, nombre, precio, disponible, imagen_url, categoria, ingredientes)
        VALUES (${RESTAURANTE_ID}, ${nombre}, ${precio}, ${disponible}, ${imagen_url}, ${categoria}, ${ingredientes})
        RETURNING *
      `
      return res.json(row)
    }

    if (req.method === 'PATCH') {
      const { id, nombre, precio, disponible, imagen_url, categoria, ingredientes } = req.body
      const [row] = await sql`
        UPDATE public.platos
        SET nombre      = ${nombre},
            precio      = ${precio},
            disponible  = ${disponible},
            imagen_url  = ${imagen_url ?? null},
            categoria   = ${categoria ?? null},
            ingredientes= ${ingredientes ?? []}
        WHERE id = ${id} AND restaurante_id = ${RESTAURANTE_ID} AND eliminado_en IS NULL
        RETURNING *
      `
      return res.json(row ?? null)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {}
      await sql`
        UPDATE public.platos SET eliminado_en = now()
        WHERE id = ${id} AND restaurante_id = ${RESTAURANTE_ID}
      `
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/platos]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
