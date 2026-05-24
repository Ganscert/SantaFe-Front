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
    listByMesa:  (mesa_id) => req(`/comensales?mesa_id=${mesa_id}`),
    listTiempo:  ()        => req('/comensales?tipo=tiempo'),
    upsert:      (data)    => req('/comensales', 'POST', data),
    deactivate:  (mesa_id) => req('/comensales', 'PATCH', { mesa_id, activo: false }),
    marcarPagado:(mesa_id) => req('/comensales', 'PATCH', { mesa_id, pagado: true }),
  },
  pagos: {
    list:   (mesa_id) => req(`/pagos${mesa_id ? `?mesa_id=${encodeURIComponent(mesa_id)}` : ''}`),
    insert: (data)    => req('/pagos', 'POST', data),
  },
  usuarios: {
    login:    (email, password) => req('/usuarios', 'POST', { action: 'login', email, password }),
    register: (data)            => req('/usuarios', 'POST', { action: 'register', ...data }),
    list:     ()                => req('/usuarios'),
  },
  pedidos: {
    listByMesa: (mesa_id, opts = {}) => {
      const qs = new URLSearchParams({ mesa_id })
      if (opts.soloNoCobrados) qs.set('solo_no_cobrados', '1')
      return req(`/pedidos?${qs.toString()}`)
    },
    crear:      (data)    => req('/pedidos', 'POST', data),
    updateItem: (id, estado) => req('/pedidos', 'PATCH', { id, estado }),
  },
}
