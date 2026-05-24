import { createClient } from '@supabase/supabase-js'

export const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

let _sb = null
export const getDB = () => {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _sb
}
