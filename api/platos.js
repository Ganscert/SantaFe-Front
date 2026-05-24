import { getDB, RESTAURANTE_ID } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const sb = getDB()
  try {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('platos')
        .select('id, nombre, precio, disponible, imagen_url, categoria, ingredientes, creado_en')
        .eq('restaurante_id', RESTAURANTE_ID)
        .is('eliminado_en', null)
        .order('creado_en', { ascending: false })
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'POST') {
      const { nombre, precio, disponible = true, imagen_url = null, categoria = null, ingredientes = [] } = req.body
      const { data, error } = await sb
        .from('platos')
        .insert({ restaurante_id: RESTAURANTE_ID, nombre, precio, disponible, imagen_url, categoria, ingredientes })
        .select()
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'PATCH') {
      const { id, nombre, precio, disponible, imagen_url, categoria, ingredientes } = req.body
      const { data, error } = await sb
        .from('platos')
        .update({
          nombre,
          precio,
          disponible,
          imagen_url: imagen_url ?? null,
          categoria: categoria ?? null,
          ingredientes: ingredientes ?? [],
        })
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
        .is('eliminado_en', null)
        .select()
        .single()
      if (error) throw error
      return res.json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {}
      const { error } = await sb
        .from('platos')
        .update({ eliminado_en: new Date().toISOString() })
        .eq('id', id)
        .eq('restaurante_id', RESTAURANTE_ID)
      if (error) throw error
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[api/platos]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
