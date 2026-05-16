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
import Roles from '../ui/Roles.jsx'
import AdminPlatos from '../ui/AdminPlatos.jsx'
import AdminUsuarios from '../ui/AdminUsuarios.jsx'
import AppShell from '../ui/AppShell.jsx'
import Join from '../ui/Join.jsx'
import MesaCliente from '../ui/MesaCliente.jsx'
import CajeroCobros from '../ui/CajeroCobros.jsx'
import RequireAuth from '../ui/RequireAuth.jsx'
import { MesasProvider } from '../state/MesasContext.jsx'
import { PedidosProvider } from '../state/PedidosContext.jsx'
import { LiveSyncProvider } from '../state/LiveSyncContext.jsx'
import { ThemeProvider } from '../state/ThemeContext.jsx'
import { PlatosProvider } from '../state/PlatosContext.jsx'
import { AuthProvider } from '../state/AuthContext.jsx'
import { TokensProvider } from '../state/TokensContext.jsx'

// Roles que pueden ver el área administrativa/operativa (todo lo que no sea cliente)
const STAFF = ['recepcionista', 'mesero', 'admin', 'gerente', 'cocinero', 'cajero']
const ADMIN = ['admin', 'gerente', 'recepcionista']

const router = createBrowserRouter([
  { path: '/',     element: <Login /> },
  { path: '/join', element: <Join /> },
  {
    element: <AppShell />,
    children: [
      // Cliente — vista propia de mesa
      { path: '/mi-mesa', element: <RequireAuth roles={['cliente']}><MesaCliente /></RequireAuth> },

      // Staff — operación
      { path: '/menu',              element: <RequireAuth><Menu /></RequireAuth> },
      { path: '/tablero-mesas',     element: <RequireAuth roles={STAFF}><TableroMesas /></RequireAuth> },
      { path: '/mesa/:id',          element: <RequireAuth roles={STAFF}><MesaDetalle /></RequireAuth> },
      { path: '/pedidos/nuevo',     element: <RequireAuth roles={STAFF}><AgregarPedido /></RequireAuth> },
      { path: '/pedidos/agregar',   element: <RequireAuth roles={STAFF}><AgregarPedido /></RequireAuth> },
      { path: '/cocina/pendientes', element: <RequireAuth roles={STAFF}><CocinaPendientes /></RequireAuth> },
      { path: '/cajero/cobros',    element: <RequireAuth roles={['cajero','recepcionista','admin','gerente']}><CajeroCobros /></RequireAuth> },

      // Administración
      { path: '/admin/dashboard', element: <RequireAuth roles={ADMIN}><Dashboard /></RequireAuth> },
      { path: '/admin/roles',     element: <RequireAuth roles={ADMIN}><Roles /></RequireAuth> },
      { path: '/admin/platos',    element: <RequireAuth roles={ADMIN}><AdminPlatos /></RequireAuth> },
      { path: '/admin/usuarios',  element: <RequireAuth roles={ADMIN}><AdminUsuarios /></RequireAuth> },
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
                  <RouterProvider router={router} />
                </TokensProvider>
              </PlatosProvider>
            </PedidosProvider>
          </MesasProvider>
        </LiveSyncProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
