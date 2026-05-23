// Cliente Supabase singleton (browser).
// Falla suave: si faltan envs, `supabase === null` → los consumidores deben verificar.
import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// Tenant activo (un único restaurante por instalación; multi-tenant ready en BD).
export const RESTAURANTE_ID =
  import.meta.env.VITE_RESTAURANTE_ID ||
  '00000000-0000-0000-0000-000000000001'

export const supabase = (url && anon)
  ? createClient(url, anon, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null

export const supabaseReady = Boolean(supabase)

if (!supabaseReady && typeof window !== 'undefined') {
  // Solo log en cliente — evita ruido en build server-side.
  console.warn('[supabase] Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY · cliente deshabilitado.')
}
