import { getDB, RESTAURANTE_ID } from './_supabase.js'
import { requireAuth, serverError } from './_auth.js'
import {
  listRestaurantes, detalleRestaurante, crearRestaurante,
  renombrarRestaurante, eliminarRestaurante,
} from './_restaurantes.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()

  // Panel de plataforma: sólo el administrador informático.
  if (!requireAuth(req, res, ['admin'])) return

  try {
    const sb = getDB()

    if (req.method === 'GET') {
      const { id } = req.query
      if (id) {
        const detalle = await detalleRestaurante(sb, id)
        if (!detalle) return res.status(404).json({ error: 'Restaurante no encontrado.' })
        return res.json(detalle)
      }
      return res.json(await listRestaurantes(sb))
    }

    if (req.method === 'POST') {
      const { nombre, mesas_iniciales } = req.body || {}
      if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es requerido.' })
      return res.json(await crearRestaurante(sb, { nombre, mesas_iniciales }))
    }

    if (req.method === 'PATCH') {
      const { id, nombre } = req.body || {}
      if (!id || !nombre || !String(nombre).trim()) return res.status(400).json({ error: 'id y nombre son requeridos.' })
      return res.json(await renombrarRestaurante(sb, { id, nombre }))
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido.' })
      if (id === RESTAURANTE_ID) {
        return res.status(400).json({ error: 'No puedes eliminar el restaurante activo de la plataforma.' })
      }
      return res.json(await eliminarRestaurante(sb, id))
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return serverError(res, '[api/restaurantes]', e)
  }
}
