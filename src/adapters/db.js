// Adaptador HTTP para las API routes de Neon/Vercel.
// Reemplaza @supabase/supabase-js para acceso a datos.
export const RESTAURANTE_ID = import.meta.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

const SESSION_KEY = 'santa-fe:session'

export function authToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY))?.token || null } catch { return null }
}

async function req(path, method = 'GET', body) {
  const opts = { method, headers: {} }
  const token = authToken()
  if (token) opts.headers.Authorization = `Bearer ${token}`
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`/api${path}`, opts)
  if (!res.ok) {
    // Token expirado o inválido → cerrar sesión y volver al login.
    if (res.status === 401 && token) {
      try { localStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
      window.location.assign('/')
    }
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
    listByMesa:    (mesa_id) => req(`/comensales?mesa_id=${mesa_id}`),
    listTiempo:    ()        => req('/comensales?tipo=tiempo'),
    upsert:        (data)    => req('/comensales', 'POST', data),
    deactivate:    (mesa_id) => req('/comensales', 'PATCH', { mesa_id, activo: false }),
    deactivateOne: (mesa_id, username) => req('/comensales', 'PATCH', { mesa_id, username, activo: false }),
    marcarPagado:  (mesa_id) => req('/comensales', 'PATCH', { mesa_id, pagado: true }),
  },
  pagos: {
    list:   (mesa_id) => req(`/pagos${mesa_id ? `?mesa_id=${encodeURIComponent(mesa_id)}` : ''}`),
    insert: (data)    => req('/pagos', 'POST', data),
  },
  azul: {
    // Crea la sesión de pago: devuelve { mode, url, fields, orderNumber }.
    session:        (data) => req('/pagos-azul?action=session', 'POST', { action: 'session', ...data }),
    // Aprobación simulada (sólo modo sandbox).
    sandboxApprove: (data) => req('/pagos-azul?action=sandbox-approve', 'POST', { action: 'sandbox-approve', ...data }),
  },
  restaurantes: {
    list:   ()          => req('/restaurantes'),
    detail: (id)        => req(`/restaurantes?id=${encodeURIComponent(id)}`),
    create: (data)      => req('/restaurantes', 'POST', data),
    update: (id, patch) => req('/restaurantes', 'PATCH', { id, ...patch }),
    remove: (id)        => req('/restaurantes', 'DELETE', { id }),
  },
  usuarios: {
    login:    (email, password) => req('/usuarios', 'POST', { action: 'login', email, password }),
    register: (data)            => req('/usuarios', 'POST', { action: 'register', ...data }),
    list:     ()                => req('/usuarios'),
    create:   (data)            => req('/usuarios', 'POST', { action: 'create', ...data }),
    update:   (id, patch)       => req('/usuarios', 'PATCH', { id, ...patch }),
    remove:   (id)              => req('/usuarios', 'DELETE', { id }),
  },
  pedidos: {
    listByMesa: (mesa_id, opts = {}) => {
      const qs = new URLSearchParams({ mesa_id })
      if (opts.soloNoCobrados) qs.set('solo_no_cobrados', '1')
      return req(`/pedidos?${qs.toString()}`)
    },
    listDashboard: (opts = {}) => {
      const qs = new URLSearchParams({ dashboard: '1' })
      if (opts.desde) qs.set('desde', String(opts.desde))
      if (opts.hasta) qs.set('hasta', String(opts.hasta))
      return req(`/pedidos?${qs.toString()}`)
    },
    crear:      (data)    => req('/pedidos', 'POST', data),
    updateItem: (id, estado) => req('/pedidos', 'PATCH', { id, estado }),
    cancelar:   (pedido_id, opts = {}) => req('/pedidos', 'PATCH', {
      accion: 'cancelar', pedido_id,
      cancelado_por: opts.cancelado_por ?? null,
      motivo: opts.motivo ?? null,
    }),
  },
}
