// Matriz única rol→rutas permitidas. Fuente de verdad para router y sidebar.

export const ROUTE_ACCESS = {
  '/admin/plataforma':     ['admin'],
  '/admin/plataforma/:id': ['admin'],
  '/admin/actividad':      ['admin'],
  '/admin/dashboard':   ['admin', 'gerente'],
  '/admin/meseros':     ['admin', 'gerente'],
  '/admin/usuarios':    ['admin', 'gerente'],
  '/admin/roles':       ['admin', 'gerente'],
  '/admin/platos':      ['admin', 'gerente', 'supervisor'],
  '/tablero-mesas':     ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero', 'cajero'],
  '/reservas':          ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero'],
  '/cocina/pendientes': ['admin', 'gerente', 'supervisor', 'mesero', 'cocinero'],
  '/cajero/cobros':     ['admin', 'gerente', 'cajero', 'recepcionista'],
  '/cajero/historial':  ['admin', 'gerente', 'cajero', 'recepcionista'],
  '/pedidos/nuevo':     ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero'],
  '/pedidos/agregar':   ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero'],
  '/menu':              ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero', 'cajero', 'cliente'],
  '/mi-mesa':           ['cliente'],
  '/mesa/:id':          ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero', 'cajero'],
}

export function rolesFor(path) {
  return ROUTE_ACCESS[path] || []
}

export const STAFF_ROLES = ['admin', 'gerente', 'supervisor', 'recepcionista', 'mesero', 'cocinero', 'cajero']
