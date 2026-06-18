import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import '../../index.css'
import Login from '../ui/Login.jsx'
import Menu from '../ui/Menu.jsx'
import TableroMesas from '../ui/TableroMesas.jsx'
import MesaDetalle from '../ui/MesaDetalle.jsx'
import AgregarPedido from '../ui/AgregarPedido.jsx'
import CocinaPendientes from '../ui/CocinaPendientes.jsx'
import Dashboard from '../ui/Dashboard.jsx'
import RendimientoMeseros from '../ui/RendimientoMeseros.jsx'
import Roles from '../ui/Roles.jsx'
import AdminPlatos from '../ui/AdminPlatos.jsx'
import AdminUsuarios from '../ui/AdminUsuarios.jsx'
import AppShell from '../ui/AppShell.jsx'
import Join from '../ui/Join.jsx'
import MesaCliente from '../ui/MesaCliente.jsx'
import CajeroCobros from '../ui/CajeroCobros.jsx'
import HistorialCobros from '../ui/HistorialCobros.jsx'
import Reservas from '../ui/Reservas.jsx'
import RequireAuth from '../ui/RequireAuth.jsx'
import { MesasProvider } from '../state/MesasContext.jsx'
import { PedidosProvider } from '../state/PedidosContext.jsx'
import { LiveSyncProvider } from '../state/LiveSyncContext.jsx'
import { ThemeProvider } from '../state/ThemeContext.jsx'
import { PlatosProvider } from '../state/PlatosContext.jsx'
import { AuthProvider } from '../state/AuthContext.jsx'
import { TokensProvider } from '../state/TokensContext.jsx'
import { ToastProvider } from '../state/ToastContext.jsx'
import { rolesFor } from '../ui/roleAccess.js'

const router = createBrowserRouter([
  { path: '/',     element: <Login /> },
  { path: '/join', element: <Join /> },
  {
    element: <AppShell />,
    children: [
      { path: '/mi-mesa',           element: <RequireAuth roles={rolesFor('/mi-mesa')}><MesaCliente /></RequireAuth> },
      { path: '/menu',              element: <RequireAuth roles={rolesFor('/menu')}><Menu /></RequireAuth> },
      { path: '/tablero-mesas',     element: <RequireAuth roles={rolesFor('/tablero-mesas')}><TableroMesas /></RequireAuth> },
      { path: '/reservas',          element: <RequireAuth roles={rolesFor('/reservas')}><Reservas /></RequireAuth> },
      { path: '/mesa/:id',          element: <RequireAuth roles={rolesFor('/mesa/:id')}><MesaDetalle /></RequireAuth> },
      { path: '/pedidos/nuevo',     element: <RequireAuth roles={rolesFor('/pedidos/nuevo')}><AgregarPedido /></RequireAuth> },
      { path: '/pedidos/agregar',   element: <RequireAuth roles={rolesFor('/pedidos/agregar')}><AgregarPedido /></RequireAuth> },
      { path: '/cocina/pendientes', element: <RequireAuth roles={rolesFor('/cocina/pendientes')}><CocinaPendientes /></RequireAuth> },
      { path: '/cajero/cobros',     element: <RequireAuth roles={rolesFor('/cajero/cobros')}><CajeroCobros /></RequireAuth> },
      { path: '/cajero/historial',  element: <RequireAuth roles={rolesFor('/cajero/historial')}><HistorialCobros /></RequireAuth> },
      { path: '/admin/dashboard',   element: <RequireAuth roles={rolesFor('/admin/dashboard')}><Dashboard /></RequireAuth> },
      { path: '/admin/meseros',     element: <RequireAuth roles={rolesFor('/admin/meseros')}><RendimientoMeseros /></RequireAuth> },
      { path: '/admin/roles',       element: <RequireAuth roles={rolesFor('/admin/roles')}><Roles /></RequireAuth> },
      { path: '/admin/platos',      element: <RequireAuth roles={rolesFor('/admin/platos')}><AdminPlatos /></RequireAuth> },
      { path: '/admin/usuarios',    element: <RequireAuth roles={rolesFor('/admin/usuarios')}><AdminUsuarios /></RequireAuth> },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
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
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
