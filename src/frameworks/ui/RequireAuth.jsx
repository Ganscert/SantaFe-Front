import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

/**
 * Bloquea acceso a rutas si no hay sesión. Opcionalmente restringe por rol.
 *
 * Uso:
 *   <RequireAuth><Tablero /></RequireAuth>
 *   <RequireAuth roles={['recepcionista','mesero']}><GenerarQR /></RequireAuth>
 */
export default function RequireAuth({ children, roles }) {
  const { session, hasRole } = useAuth()
  const location = useLocation()

  if (!session) {
    // Redirige a login preservando la ruta destino para volver tras autenticar
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />
  }

  if (roles && roles.length > 0 && !hasRole(roles)) {
    // Sesión válida pero rol insuficiente → manda a su área por defecto
    return <Navigate to={defaultHomeForRole(session.role)} replace />
  }

  return children
}

export function defaultHomeForRole(role) {
  switch (role) {
    case 'cliente':       return '/mi-mesa'
    case 'admin':         return '/admin/dashboard'
    case 'gerente':       return '/admin/dashboard'
    case 'supervisor':    return '/tablero-mesas'
    case 'cocinero':      return '/cocina/pendientes'
    case 'cajero':        return '/cajero/cobros'
    case 'recepcionista': return '/tablero-mesas'
    case 'mesero':        return '/tablero-mesas'
    default:              return '/tablero-mesas'
  }
}
