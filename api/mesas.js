import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const sb = getDB()
  try {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('mesas')
        .select('id, numero_mesa, estado, capacidad')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('numero_mesa')
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { numero_mesa, capacidad = 4, estado = 'disponible' } = req.body
      const { data, error } = await sb
        .from('mesas')
        .upsert(
          { restaurante_id: RESTAURANTE_ID, numero_mesa, capacidad, estado },
          { onConflict: 'restaurante_id,numero_mesa', ignoreDuplicates: true }
        )
        .select('id, numero_mesa, estado, capacidad')
        .maybeSingle()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { id, estado } = req.body
      const { data, error } = await sb
        .from('mesas')
        .update({ estado })
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .select('id, numero_mesa, estado, capacidad')
        .single()
      if (error) throw error
      return res.json(data)
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/mesas]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
