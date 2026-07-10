// Siembra las cuentas demo del login (CUENTAS DEMO (DEV)) en la tabla
// `usuarios` para que los botones de acceso rápido funcionen contra la DB real
// (login DB-first: sin fila en `usuarios` responden "Credenciales incorrectas",
// y una sesión local sin token firmado no puede unirse a mesas ni pedir).
// Idempotente: si la cuenta existe se re-activa y se restablece demo1234.
// Uso:  node scripts/seed-demo-users.mjs   (desde Frontend/)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('./.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]
}
for (const k of Object.keys(env)) if (!process.env[k]) process.env[k] = env[k]
const { hashPassword } = await import('../api/_auth.js')

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const RID = env.RESTAURANTE_ID || env.VITE_RESTAURANTE_ID

// Espeja DEMO_USERS de src/frameworks/state/AuthContext.jsx (clave demo1234).
const DEMOS = [
  ['Admin Demo',     'admin@santafe.pe',     'admin'],
  ['Gerente Demo',   'gerente@santafe.pe',   'gerente'],
  ['Recepción Demo', 'recepcion@santafe.pe', 'recepcionista'],
  ['Mesero Demo',    'mesero@santafe.pe',    'mesero'],
  ['Cocinero Demo',  'cocinero@santafe.pe',  'cocinero'],
  ['Cajero Demo',    'cajero@santafe.pe',    'cajero'],
  ['Cliente Demo',   'cliente@santafe.pe',   'cliente'],
]

for (const [nombre, email, role] of DEMOS) {
  const password_hash = hashPassword('demo1234')
  const { data: existente } = await sb.from('usuarios').select('id').eq('email', email).maybeSingle()
  if (existente) {
    const { error } = await sb.from('usuarios')
      .update({ nombre, role, password_hash, activo: true, restaurante_id: RID })
      .eq('id', existente.id)
    console.log(error ? `✗ ${email}: ${error.message}` : `↻ ${email} (${role}) — reactivada`)
  } else {
    const { error } = await sb.from('usuarios')
      .insert({ restaurante_id: RID, nombre, email, role, password_hash, activo: true })
    console.log(error ? `✗ ${email}: ${error.message}` : `+ ${email} (${role}) — creada`)
  }
}
console.log('\n✔ Cuentas demo listas (clave: demo1234)')
