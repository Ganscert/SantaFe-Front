// Adaptador HTTP para las API routes de Neon/Vercel.
// Reemplaza @supabase/supabase-js para acceso a datos.
export const RESTAURANTE_ID = import.meta.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'

const SESSION_KEY = 'santa-fe:session'
const ACTIVO_KEY  = 'santa-fe:restaurante-activo'

export function authToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY))?.token || null } catch { return null }
}

// Restaurante en auditoría (lo fija RestauranteContext cuando el admin audita
// otra sede). El backend sólo honra el override con token de admin, así que
// un valor viejo en localStorage es inocuo para el resto de roles.
export function restauranteActivoId() {
  try {
    const activo = JSON.parse(localStorage.getItem(ACTIVO_KEY))
    return activo?.id && activo.id !== RESTAURANTE_ID ? activo.id : null
  } catch { return null }
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

// Variante multi-tenant: agrega el restaurante auditado al request (query en
// GET, body en mutaciones) para que la API opere sobre esa sede.
function reqTenant(path, method = 'GET', body) {
  const rid = restauranteActivoId()
  if (!rid) return req(path, method, body)
  if (method === 'GET') {
    const sep = path.includes('?') ? '&' : '?'
    return req(`${path}${sep}restaurante_id=${encodeURIComponent(rid)}`)
  }
  return req(path, method, { restaurante_id: rid, ...body })
}

export const db = {
  mesas: {
    list:   ()           => reqTenant('/mesas'),
    insert: (data)       => reqTenant('/mesas', 'POST', data),
    // `patch` puede ser un string (estado, retrocompat) o un objeto
    // { estado?, zona_id?, numero_mesa?, capacidad? }.
    update: (id, patch)  => reqTenant('/mesas', 'PATCH', { id, ...(typeof patch === 'string' ? { estado: patch } : patch) }),
    remove: (id)         => reqTenant('/mesas', 'DELETE', { id }),
  },
  zonas: {
    list:   ()          => reqTenant('/zonas'),
    create: (data)      => reqTenant('/zonas', 'POST', data),
    update: (id, patch) => reqTenant('/zonas', 'PATCH', { id, ...patch }),
    remove: (id)        => reqTenant('/zonas', 'DELETE', { id }),
  },
  platos: {
    list:   ()           => reqTenant('/platos'),
    insert: (data)       => reqTenant('/platos', 'POST', data),
    update: (id, patch)  => reqTenant('/platos', 'PATCH', { id, ...patch }),
    delete: (id)         => reqTenant('/platos', 'DELETE', { id }),
  },
  actividad: {
    list: (filtros = {}) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v)
      const s = qs.toString()
      return req(`/actividad${s ? `?${s}` : ''}`)
    },
    registrar: (eventos) => req('/actividad', 'POST', { eventos }),
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
    list:     (restauranteId)   => req(`/usuarios${restauranteId ? `?restaurante_id=${encodeURIComponent(restauranteId)}` : ''}`),
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
