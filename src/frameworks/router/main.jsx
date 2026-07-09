import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import '../../index.css'
import Login from '../ui/Login.jsx'
import AppShell from '../ui/AppShell.jsx'
import RequireAuth from '../ui/RequireAuth.jsx'
import { MesasProvider } from '../state/MesasContext.jsx'
import { PedidosProvider } from '../state/PedidosContext.jsx'
import { LiveSyncProvider } from '../state/LiveSyncContext.jsx'
import { ThemeProvider } from '../state/ThemeContext.jsx'
import { PlatosProvider } from '../state/PlatosContext.jsx'
import { AuthProvider } from '../state/AuthContext.jsx'
import { RestauranteProvider } from '../state/RestauranteContext.jsx'
import { TokensProvider } from '../state/TokensContext.jsx'
import { ToastProvider } from '../state/ToastContext.jsx'
import { rolesFor } from '../ui/roleAccess.js'

// Code-splitting por ruta: cada vista pesada (dashboard con recharts, admin,
// cocina, etc.) se descarga sólo cuando se navega a ella.
const Menu               = lazy(() => import('../ui/Menu.jsx'))
const TableroMesas       = lazy(() => import('../ui/TableroMesas.jsx'))
const MesaDetalle        = lazy(() => import('../ui/MesaDetalle.jsx'))
const AgregarPedido      = lazy(() => import('../ui/AgregarPedido.jsx'))
const CocinaPendientes   = lazy(() => import('../ui/CocinaPendientes.jsx'))
const Dashboard          = lazy(() => import('../ui/Dashboard.jsx'))
const RendimientoMeseros = lazy(() => import('../ui/RendimientoMeseros.jsx'))
const Roles              = lazy(() => import('../ui/Roles.jsx'))
const AdminPlatos        = lazy(() => import('../ui/AdminPlatos.jsx'))
const AdminUsuarios      = lazy(() => import('../ui/AdminUsuarios.jsx'))
const Join               = lazy(() => import('../ui/Join.jsx'))
const MesaCliente        = lazy(() => import('../ui/MesaCliente.jsx'))
const CajeroCobros       = lazy(() => import('../ui/CajeroCobros.jsx'))
const HistorialCobros    = lazy(() => import('../ui/HistorialCobros.jsx'))
const Reservas           = lazy(() => import('../ui/Reservas.jsx'))
const AdminPlataforma    = lazy(() => import('../ui/AdminPlataforma.jsx'))
const AdminRestaurante   = lazy(() => import('../ui/AdminRestaurante.jsx'))
const AdminActividad     = lazy(() => import('../ui/AdminActividad.jsx'))

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="w-9 h-9 rounded-full border-[3px] border-[#E2E8F0] border-t-[#4F46E5] animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Cargando…</p>
      </div>
    </div>
  )
}

// Envuelve la vista en el guard de rol + Suspense del chunk lazy.
const page = (Comp, path) => (
  <RequireAuth roles={rolesFor(path)}>
    <Suspense fallback={<PageLoader />}>
      <Comp />
    </Suspense>
  </RequireAuth>
)

const router = createBrowserRouter([
  { path: '/',     element: <Login /> },
  { path: '/join', element: <Suspense fallback={<PageLoader />}><Join /></Suspense> },
  {
    element: <AppShell />,
    children: [
      { path: '/mi-mesa',           element: page(MesaCliente, '/mi-mesa') },
      { path: '/menu',              element: page(Menu, '/menu') },
      { path: '/tablero-mesas',     element: page(TableroMesas, '/tablero-mesas') },
      { path: '/reservas',          element: page(Reservas, '/reservas') },
      { path: '/mesa/:id',          element: page(MesaDetalle, '/mesa/:id') },
      { path: '/pedidos/nuevo',     element: page(AgregarPedido, '/pedidos/nuevo') },
      { path: '/pedidos/agregar',   element: page(AgregarPedido, '/pedidos/agregar') },
      { path: '/cocina/pendientes', element: page(CocinaPendientes, '/cocina/pendientes') },
      { path: '/cajero/cobros',     element: page(CajeroCobros, '/cajero/cobros') },
      { path: '/cajero/historial',  element: page(HistorialCobros, '/cajero/historial') },
      { path: '/admin/plataforma',     element: page(AdminPlataforma, '/admin/plataforma') },
      { path: '/admin/plataforma/:id', element: page(AdminRestaurante, '/admin/plataforma/:id') },
      { path: '/admin/actividad',      element: page(AdminActividad, '/admin/actividad') },
      { path: '/admin/dashboard',   element: page(Dashboard, '/admin/dashboard') },
      { path: '/admin/meseros',     element: page(RendimientoMeseros, '/admin/meseros') },
      { path: '/admin/roles',       element: page(Roles, '/admin/roles') },
      { path: '/admin/platos',      element: page(AdminPlatos, '/admin/platos') },
      { path: '/admin/usuarios',    element: page(AdminUsuarios, '/admin/usuarios') },
    ],
  },
  // Rutas desconocidas → login (que redirige al home del rol si hay sesión)
  { path: '*', element: <Navigate to="/" replace /> },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RestauranteProvider>
          <LiveSyncProvider>
            <MesasProvider>
              <PedidosProvider>
                <PlatosProvider>
                  <TokensProvider>
                    <ToastProvider>
                      <RouterProvider router={router} />
                    </ToastProvider>
                  </TokensProvider>
                </PlatosProvider>
              </PedidosProvider>
            </MesasProvider>
          </LiveSyncProvider>
        </RestauranteProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
