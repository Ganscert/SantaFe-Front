import { useState } from 'react'
import {
  ShieldCheck, Plus, Trash2, RotateCcw, AlertTriangle, Lock,
  Pencil, Check, X, ChevronDown, Users, UserCog, Mail, Search,
  SlidersHorizontal,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRoles } from '../../usecases/useRoles.js'
import { useUsuarios } from '../../usecases/useUsuarios.js'

function Pill({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  )
}

/* ── RoleCard ─────────────────────────────────────────────────────────── */
function RoleCard({ role, permissionsByCategory, onTogglePerm, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ label: role.label, description: role.description })
  const [open, setOpen] = useState(true)

  const totalPerms = role.permissions.length
  const allPermsCount = Object.values(permissionsByCategory).reduce((s, arr) => s + arr.length, 0)

  const saveEdit = () => {
    onUpdate({ label: draft.label.trim() || role.label, description: draft.description })
    setEditing(false)
  }

  return (
    <article className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div
        className="px-5 py-4 flex items-start justify-between gap-3 border-l-4"
        style={{ borderLeftColor: role.color || '#C1440E' }}
      >
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:border-[#C1440E]"
              />
              <input
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Descripción"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 text-xs focus:outline-none focus:border-[#C1440E]"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900 dark:text-slate-50 truncate">{role.label}</h3>
                <Pill className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {totalPerms}/{allPermsCount} permisos
                </Pill>
                {role.system && (
                  <Pill className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    <Lock size={10} /> Sistema
                  </Pill>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{role.description || 'Sin descripción'}</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button onClick={saveEdit} className="w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center">
                <Check size={16} />
              </button>
              <button onClick={() => { setDraft({ label: role.label, description: role.description }); setEditing(false) }} className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 flex items-center justify-center">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center">
                <Pencil size={14} />
              </button>
              {!role.system && (
                <button onClick={onRemove} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center">
                  <Trash2 size={14} />
                </button>
              )}
              <button onClick={() => setOpen(o => !o)} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center">
                <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100 dark:border-slate-800">
          {Object.entries(permissionsByCategory).map(([cat, perms]) => (
            <div key={cat}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-2 mt-3">{cat}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {perms.map(p => {
                  const enabled = role.permissions.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        enabled
                          ? 'bg-[#C1440E]/8 dark:bg-[#C1440E]/15 ring-1 ring-[#C1440E]/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <input type="checkbox" checked={enabled} onChange={() => onTogglePerm(p.id)} className="mt-0.5 accent-[#C1440E]" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{p.label}</p>
                        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">{p.id}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

/* ── UserRow (vista densa) ────────────────────────────────────────────── */
function UserRow({ user, roles, totalPerms, onChangeRole, onOpenDetail, onReset }) {
  const role = roles.find(r => r.id === user.roleId)
  const effective = user.effectivePermissions.length

  return (
    <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm"
        style={{ backgroundColor: role?.color ?? '#6B7280' }}
      >
        {user.initials}
      </div>

      {/* Identidad */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-slate-900 dark:text-slate-50 truncate">{user.name}</span>
          {user.hasOverrides && (
            <Pill className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
              Override
            </Pill>
          )}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
          <Mail size={10} className="shrink-0" /> {user.email}
        </p>
      </div>

      {/* Rol chip + selector (oculto en móvil) */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
          style={{
            backgroundColor: `${role?.color ?? '#6B7280'}1A`,
            color:           role?.color ?? '#6B7280',
          }}
        >
          <ShieldCheck size={11} />
          {role?.label || user.roleId}
        </span>
      </div>

      {/* Métrica permisos */}
      <div className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
        <span className="text-[#C1440E] dark:text-[#D4A017] font-black text-base leading-none">{effective}</span>
        <span>/ {totalPerms}</span>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 shrink-0">
        <select
          value={user.roleId}
          onChange={e => onChangeRole(e.target.value)}
          aria-label={`Cambiar rol de ${user.name}`}
          className="text-xs font-bold px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#C1440E] cursor-pointer max-w-[8rem] sm:max-w-none"
        >
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {user.hasOverrides && (
          <button
            type="button"
            onClick={onReset}
            title="Resetear overrides individuales"
            aria-label="Resetear overrides"
            className="w-9 h-9 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500 dark:text-amber-400 flex items-center justify-center transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenDetail}
          title="Ver permisos individuales"
          aria-label="Ver permisos"
          className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-colors"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>
    </div>
  )
}

/* ── UserPermsModal (drawer/modal con grilla de permisos) ─────────────── */
function UserPermsModal({ user, roles, permissionsByCategory, onTogglePerm, onClose }) {
  const role = roles.find(r => r.id === user.roleId)
  const totalPerms = Object.values(permissionsByCategory).reduce((s, arr) => s + arr.length, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-sm"
            style={{ backgroundColor: role?.color ?? '#6B7280' }}
          >
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 dark:text-slate-50 truncate">{user.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email} · {role?.label}</p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <span className="text-[#C1440E] dark:text-[#D4A017] font-black text-lg leading-none">
              {user.effectivePermissions.length}
            </span>
            <span>/ {totalPerms}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-3">
            Los cambios sobreescriben al rol asignado
          </p>
          {Object.entries(permissionsByCategory).map(([cat, perms]) => (
            <div key={cat} className="mb-4 last:mb-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-2">{cat}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {perms.map(p => {
                  const fromRole   = role?.permissions.includes(p.id) ?? false
                  const isExtra    = user.extraPermissions.includes(p.id)
                  const isRemoved  = user.removedPermissions.includes(p.id)
                  const enabled    = user.effectivePermissions.includes(p.id)

                  let badge = null
                  if (isExtra)        badge = { label: '+ Individual', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
                  else if (isRemoved) badge = { label: '− Bloqueado',  cls: 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400' }
                  else if (fromRole)  badge = { label: 'Rol',           cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' }

                  return (
                    <label
                      key={p.id}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        enabled
                          ? 'bg-[#C1440E]/8 dark:bg-[#C1440E]/15 ring-1 ring-[#C1440E]/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <input type="checkbox" checked={enabled} onChange={() => onTogglePerm(p.id)} className="mt-0.5 accent-[#C1440E]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{p.label}</p>
                        {badge && (
                          <span className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#C1440E] hover:bg-[#a33a0c] text-white text-sm font-bold transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function Roles() {
  const {
    loading, error, roles, permissionsByCategory,
    isOverridden, togglePermission, updateRole, addRole, removeRole, resetToDefaults,
  } = useRoles()

  const { users, setUserRole, toggleUserPerm, resetUser } = useUsuarios(roles)

  const [tab, setTab]           = useState('roles')
  const [confirming, setConfirming] = useState(null)
  const [userDetail, setUserDetail] = useState(null)
  const [userQuery, setUserQuery]   = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('Todos')

  const totalPerms = Object.values(permissionsByCategory).reduce((s, arr) => s + arr.length, 0)

  const userDetailLive = userDetail ? users.find(u => u.id === userDetail.id) : null
  const usuariosFiltrados = (() => {
    const q = userQuery.trim().toLowerCase()
    return users.filter(u => {
      if (userRoleFilter !== 'Todos' && u.roleId !== userRoleFilter) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  })()
  const agrupados = usuariosFiltrados.reduce((acc, u) => {
    (acc[u.roleId] = acc[u.roleId] || []).push(u)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400">
        Cargando roles…
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-md mx-auto rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-5 text-red-700 dark:text-red-300">
          <AlertTriangle className="mb-2" />
          <p className="font-bold">No se pudo cargar la configuración de roles</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const usersWithOverrides = users.filter(u => u.hasOverrides).length

  return (
    <div className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 lg:pl-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 pl-12 lg:pl-0">
            <span className="w-7 h-7 rounded-xl bg-[#C1440E] flex items-center justify-center text-white">
              <ShieldCheck size={14} />
            </span>
            <h1 className="text-base font-bold truncate">Roles y permisos</h1>
            {isOverridden && tab === 'roles' && (
              <Pill className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ml-2">Modificado</Pill>
            )}
            {usersWithOverrides > 0 && tab === 'usuarios' && (
              <Pill className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ml-2">
                {usersWithOverrides} con override
              </Pill>
            )}
          </div>

          <div className="flex items-center gap-2">
            {tab === 'roles' && isOverridden && (
              <button
                onClick={() => setConfirming('reset')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <RotateCcw size={13} /> Restaurar
              </button>
            )}
            {tab === 'roles' && (
              <button
                onClick={() => addRole({ label: 'Rol nuevo' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C1440E] hover:bg-[#a33a0c] text-white text-xs font-bold transition-colors"
              >
                <Plus size={13} /> Crear rol
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 lg:pl-4 flex gap-1 pb-0">
          <button
            onClick={() => setTab('roles')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === 'roles'
                ? 'border-[#C1440E] text-[#C1440E] dark:text-[#D4A017]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck size={15} /> Roles
          </button>
          <button
            onClick={() => setTab('usuarios')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === 'usuarios'
                ? 'border-[#C1440E] text-[#C1440E] dark:text-[#D4A017]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Users size={15} /> Usuarios
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {tab === 'roles' ? (
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#C1440E] dark:text-[#D4A017]">Administración</p>
              <h2 className="text-2xl sm:text-3xl font-black mt-1">Configuración de roles</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                Edita los permisos de cada rol. Los cambios afectan a todos los usuarios con ese rol, salvo overrides individuales.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {roles.map(role => (
                <RoleCard
                  key={role.id}
                  role={role}
                  permissionsByCategory={permissionsByCategory}
                  onTogglePerm={(permId) => togglePermission(role.id, permId)}
                  onUpdate={(patch) => updateRole(role.id, patch)}
                  onRemove={() => setConfirming(role.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#C1440E] dark:text-[#D4A017]">Administración</p>
                <h2 className="text-2xl sm:text-3xl font-black mt-1">Usuarios del sistema</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                  Asigna roles y abre el panel de cada persona para editar permisos individuales.
                </p>
              </div>
              <Link
                to="/admin/usuarios"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C1440E] hover:bg-[#a33a0c] text-white text-xs font-bold transition-colors shrink-0"
              >
                <Plus size={13} /> Crear / Eliminar
              </Link>
            </div>

            {/* Resumen por rol */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {roles.map(r => {
                const n = users.filter(u => u.roleId === r.id).length
                const active = userRoleFilter === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setUserRoleFilter(active ? 'Todos' : r.id)}
                    className={`rounded-2xl px-3 py-2.5 text-left transition-all ring-1 ${
                      active
                        ? 'ring-[#C1440E] bg-white dark:bg-slate-900 shadow-sm'
                        : 'ring-slate-200 dark:ring-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{r.label}</span>
                    </div>
                    <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-50 leading-none">{n}</p>
                  </button>
                )
              })}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Buscar nombre o correo"
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C1440E]/30 focus:border-[#C1440E]"
                />
              </div>
              {userRoleFilter !== 'Todos' && (
                <button
                  type="button"
                  onClick={() => setUserRoleFilter('Todos')}
                  className="text-xs font-semibold text-slate-500 hover:text-[#C1440E] inline-flex items-center gap-1 shrink-0"
                >
                  <X size={12} /> Limpiar filtro de rol
                </button>
              )}
            </div>

            {/* Lista densa agrupada */}
            {usuariosFiltrados.length === 0 ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 px-6 py-16 text-center">
                <Users size={42} className="mx-auto text-slate-300 dark:text-slate-600" />
                <p className="mt-3 font-bold text-slate-700 dark:text-slate-200">Sin coincidencias</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Ajusta el filtro o la búsqueda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(agrupados).map(([roleId, lista]) => {
                  const r = roles.find(rr => rr.id === roleId)
                  return (
                    <div key={roleId} className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
                      <div
                        className="px-4 py-2.5 flex items-center gap-2 border-l-4"
                        style={{ borderLeftColor: r?.color ?? '#6B7280' }}
                      >
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-50">{r?.label || roleId}</span>
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">·  {lista.length}</span>
                      </div>
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {lista.map(user => (
                          <li key={user.id}>
                            <UserRow
                              user={user}
                              roles={roles}
                              totalPerms={totalPerms}
                              onChangeRole={(roleId) => setUserRole(user.id, roleId)}
                              onOpenDetail={() => setUserDetail(user)}
                              onReset={() => resetUser(user.id)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal con permisos individuales del usuario */}
      {userDetailLive && (
        <UserPermsModal
          user={userDetailLive}
          roles={roles}
          permissionsByCategory={permissionsByCategory}
          onTogglePerm={(permId) => toggleUserPerm(userDetailLive.id, permId)}
          onClose={() => setUserDetail(null)}
        />
      )}

      {/* Confirm dialog (solo para roles) */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-slate-50">
                  {confirming === 'reset' ? '¿Restaurar configuración por defecto?' : '¿Eliminar rol?'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {confirming === 'reset'
                    ? 'Se descartarán todos los cambios locales y volverá al archivo base.'
                    : 'Esta acción se puede deshacer al restaurar la configuración.'}
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirming === 'reset') resetToDefaults()
                  else removeRole(confirming)
                  setConfirming(null)
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
              >
                {confirming === 'reset' ? 'Restaurar' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
