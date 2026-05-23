// Adaptador HTTP para las API routes de Neon/Vercel.
// Reemplaza @supabase/supabase-js para acceso a datos.
export const RESTAURANTE_ID = import.meta.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

async function req(path, method = 'GET', body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`/api${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const db = {
  mesas: {
    list:   ()           => req('/mesas'),
    insert: (data)       => req('/mesas', 'POST', data),
    update: (id, estado) => req('/mesas', 'PATCH', { id, estado }),
  },
  platos: {
    list:   ()           => req('/platos'),
    insert: (data)       => req('/platos', 'POST', data),
    update: (id, patch)  => req('/platos', 'PATCH', { id, ...patch }),
    delete: (id)         => req('/platos', 'DELETE', { id }),
  },
  comensales: {
    listByMesa: (mesa_id)  => req(`/comensales?mesa_id=${mesa_id}`),
    upsert:     (data)     => req('/comensales', 'POST', data),
  },
}
