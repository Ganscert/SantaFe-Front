// Matriz única rol→rutas permitidas. Fuente de verdad para router y sidebar.

export const ROUTE_ACCESS = {
  '/admin/dashboard':   ['admin', 'gerente'],
  '/admin/meseros':     ['admin', 'gerente'],
  '/admin/usuarios':    ['admin', 'gerente'],
  '/admin/roles':       ['admin'],
  '/admin/platos':      ['admin', 'gerente'],
  '/tablero-mesas':     ['admin', 'gerente', 'recepcionista', 'mesero', 'cajero'],
  '/reservas':          ['admin', 'gerente', 'recepcionista', 'mesero'],
  '/cocina/pendientes': ['admin', 'gerente', 'mesero', 'cocinero'],
  '/cajero/cobros':     ['admin', 'gerente', 'cajero', 'recepcionista'],
  '/pedidos/nuevo':     ['admin', 'gerente', 'recepcionista', 'mesero'],
  '/pedidos/agregar':   ['admin', 'gerente', 'recepcionista', 'mesero'],
  '/menu':              ['admin', 'gerente', 'recepcionista', 'mesero', 'cajero', 'cliente'],
  '/mi-mesa':           ['cliente'],
  '/mesa/:id':          ['admin', 'gerente', 'recepcionista', 'mesero', 'cajero'],
}

export function rolesFor(path) {
  return ROUTE_ACCESS[path] || []
}

export const STAFF_ROLES = ['admin', 'gerente', 'recepcionista', 'mesero', 'cocinero', 'cajero']
