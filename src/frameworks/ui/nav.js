// Catálogo único de navegación — usado por Sidebar y CommandPalette.
// El acceso por rol se resuelve con rolesFor() de roleAccess.js.
import {
  LayoutDashboard, ClipboardList, ChefHat, PlusCircle, Utensils, UtensilsCrossed,
  ShieldCheck, Users, Receipt, UserCog, CalendarDays, LayoutGrid, History, Building2,
} from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/admin/plataforma',  label: 'Plataforma',     icon: Building2,       group: 'Supervisión' },
  { to: '/admin/dashboard',   label: 'Dashboard',      icon: LayoutDashboard, group: 'Supervisión' },
  { to: '/admin/meseros',     label: 'Meseros',        icon: UserCog,         group: 'Supervisión' },
  { to: '/admin/usuarios',    label: 'Usuarios',       icon: Users,           group: 'Supervisión' },
  { to: '/admin/roles',       label: 'Roles',          icon: ShieldCheck,     group: 'Supervisión' },
  { to: '/mi-mesa',           label: 'Mi mesa',        icon: ClipboardList,   group: 'Operación' },
  { to: '/tablero-mesas',     label: 'Tablero',        icon: LayoutGrid,      group: 'Operación' },
  { to: '/reservas',          label: 'Reservas',       icon: CalendarDays,    group: 'Operación' },
  { to: '/cocina/pendientes', label: 'Cocina',         icon: ChefHat,         group: 'Operación' },
  { to: '/cajero/cobros',     label: 'Cobros',         icon: Receipt,         group: 'Operación' },
  { to: '/cajero/historial',  label: 'Historial cobros', icon: History,       group: 'Operación' },
  { to: '/pedidos/nuevo',     label: 'Nuevo pedido',   icon: PlusCircle,      group: 'Operación' },
  { to: '/menu',              label: 'Menú',           icon: Utensils,        group: 'Catálogo' },
  { to: '/admin/platos',      label: 'Gestionar menú', icon: UtensilsCrossed, group: 'Catálogo' },
]

export const OPEN_PALETTE_EVENT = 'santa-fe:open-palette'
