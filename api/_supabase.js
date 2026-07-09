import { createClient } from '@supabase/supabase-js'

// Restaurante por defecto de la instalación.
// IMPORTANTE: en Vercel las variables con prefijo `VITE_` son de build (cliente)
// y no siempre llegan a las Functions; por eso aceptamos también `RESTAURANTE_ID`
// (sin prefijo) y, como último recurso, usamos el id REAL de "Santa fe" en prod.
// El antiguo fallback 00000000-…-0001 NO existe en la tabla `restaurantes`, lo
// que provocaba FK 23503 (500) en mesas/actividad/registro y listas vacías.
export const RESTAURANTE_ID =
  process.env.RESTAURANTE_ID ||
  process.env.VITE_RESTAURANTE_ID ||
  'c2b2d7cd-12e0-49b0-ad46-4e3c23fbab90'

let _sb = null
export const getDB = () => {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _sb
}
