// Catch-all de la API: enruta /api/<recurso> a un único handler por recurso.
//
// Motivo: el plan Hobby de Vercel permite máx. 12 funciones serverless por
// deployment y cada archivo suelto en /api se volvía una función (13 → build
// fallaba). Al enrutar todo por ESTE archivo, la API completa es UNA sola
// función; los handlers viven en /api/_handlers (el guion bajo los excluye de
// convertirse en funciones propias) y se importan aquí.

import actividad    from './_handlers/actividad.js'
import comensales   from './_handlers/comensales.js'
import mesas        from './_handlers/mesas.js'
import pagosAzul    from './_handlers/pagos-azul.js'
import pagos        from './_handlers/pagos.js'
import pedidos      from './_handlers/pedidos.js'
import platos       from './_handlers/platos.js'
import restaurantes from './_handlers/restaurantes.js'
import sync         from './_handlers/sync.js'
import tokens       from './_handlers/tokens.js'
import usuarios     from './_handlers/usuarios.js'
import zonas        from './_handlers/zonas.js'

const HANDLERS = {
  actividad, comensales, mesas, pagos, pedidos, platos,
  restaurantes, sync, tokens, usuarios, zonas,
  'pagos-azul': pagosAzul,
}

// Primer segmento de la ruta tras /api/ (Vercel expone [...path] en req.query.path;
// se cae a parsear la URL por si acaso).
function recurso(req) {
  const p = req.query?.path
  if (Array.isArray(p) && p.length) return p[0]
  if (typeof p === 'string' && p) return p.split('/')[0]
  // Fallback: primer segmento de la URL, tolerante al prefijo /api y a la query.
  const m = (req.url || '').split('?')[0].replace(/^\/?(api\/)?/, '').match(/^([^/]+)/)
  return m ? m[1] : ''
}

export default async function handler(req, res) {
  const fn = HANDLERS[recurso(req)]
  if (!fn) return res.status(404).json({ error: 'Recurso de API no encontrado.' })
  return fn(req, res)
}
