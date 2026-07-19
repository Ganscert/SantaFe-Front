import { useEffect, useMemo, useState } from 'react'
import {
  Users, Plus, Pencil, Trash2, Save, RotateCcw, Mail, ShieldCheck, Search, Building2,
} from 'lucide-react'
import { useRoles } from '../../usecases/useRoles.js'
import { useUsuarios } from '../../usecases/useUsuarios.js'
import { useAuth } from '../state/AuthContext.jsx'
import { db } from '../../adapters/db.js'

const FORM_VACIO = { name: '', email: '', roleId: '', password: '' }

// Fallback capitalizado para roles que no están en la lista configurable
// (p.ej. 'cliente', 'recepcionista') y antes se mostraban en minúscula.
const capRol = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?'
}

export default function AdminUsuarios() {
  const { roles, loading } = useRoles()
  const { session } = useAuth()
  // realRole = rol real firmado en el token (no el impersonado por "ver como").
  const esAdmin = session?.realRole === 'admin'

  const [restaurantes, setRestaurantes] = useState([])
  const [restauranteId, setRestauranteId] = useState('')

  // El admin elige restaurante; se carga la lista y se fija uno por defecto
  // (el suyo si el token lo trae, si no el primero).
  useEffect(() => {
    if (!esAdmin) return
    let cancel = false
    db.restaurantes.list()
      .then((rs) => {
        if (cancel) return
        setRestaurantes(rs || [])
        setRestauranteId((prev) => prev || session?.restaurante_id || rs?.[0]?.id || '')
      })
      .catch((e) => console.error('[restaurantes.list]', e.message))
    return () => { cancel = true }
  }, [esAdmin, session?.restaurante_id])

  const { users, loading: loadingUsers, agregarUsuario, actualizarUsuario, eliminarUsuario } =
    useUsuarios(roles, esAdmin ? restauranteId : undefined)

  const [form, setForm] = useState(FORM_VACIO)
  const [editandoId, setEditandoId] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('Todos')

  const editando = Boolean(editandoId)

  function resetForm() {
    setForm(FORM_VACIO)
    setEditandoId(null)
    setError('')
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
    const password = form.password.trim()
    if (!name) return setError('El nombre es obligatorio.')
    if (!emailRegex.test(email)) return setError('Ingresa un correo válido.')
    if (!form.roleId) return setError('Selecciona un rol.')
    if (!editando && esAdmin && !restauranteId) return setError('Selecciona el restaurante al que pertenece el usuario.')
    if (password && password.length < 4) return setError('La contraseña debe tener al menos 4 caracteres.')

    const duplicado = users.some(
      (u) => u.email.toLowerCase() === email && u.id !== editandoId,
    )
    if (duplicado) return setError('Ya existe un usuario con ese correo.')

    setGuardando(true)
    const res = editando
      ? await actualizarUsuario(editandoId, { name, email, roleId: form.roleId, password })
      : await agregarUsuario({ name, email, roleId: form.roleId, password, restauranteId: esAdmin ? restauranteId : undefined })
    setGuardando(false)
    if (res?.ok === false) return setError(res.error || 'No se pudo guardar el usuario.')
    resetForm()
  }

  function cargarParaEditar(u) {
    setForm({ name: u.name, email: u.email, roleId: u.roleId, password: '' })
    setEditandoId(u.id)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function confirmarEliminar() {
    if (!confirmar) return
    if (confirmar.id === editandoId) resetForm()
    const res = await eliminarUsuario(confirmar.id)
    setConfirmar(null)
    if (res?.ok === false) setError(res.error || 'No se pudo eliminar el usuario.')
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return users.filter((u) => {
      if (filtroRol !== 'Todos' && u.roleId !== filtroRol) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, busqueda, filtroRol])

  const stats = useMemo(() => {
    const porRol = users.reduce((acc, u) => {
      acc[u.roleId] = (acc[u.roleId] || 0) + 1
      return acc
    }, {})
    return { total: users.length, porRol }
  }, [users])

  // Default del rol cuando los roles ya cargaron
  useEffect(() => {
    if (!loading && roles.length > 0 && !form.roleId) {
      setForm((f) => (f.roleId ? f : { ...f, roleId: roles[0].id }))
    }
  }, [loading, roles, form.roleId])

  if (loading || loadingUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400">
        Cargando…
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-[#E2E8F0] dark:border-slate-800 shadow-sm sticky top-[var(--sf-topbar,0px)] z-10">
        <div className="max-w-6xl mx-auto px-4 py-5 pl-16 lg:pl-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-11 h-11 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shadow-sm shrink-0">
                <Users size={22} />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 truncate">Administrar Usuarios</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Crea, edita y elimina personas del sistema</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 rounded-full bg-[#10B981]/10 text-[#10B981] dark:text-[#6EE7B7] font-bold text-sm">
                {stats.total} {stats.total === 1 ? 'usuario' : 'usuarios'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* FORMULARIO */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm ring-1 ring-[#E2E8F0] dark:ring-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-50 text-lg">
                {editando ? 'Editar usuario' : 'Nuevo usuario'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editando ? 'Modificando una persona existente' : 'Agrega una nueva persona al sistema'}
              </p>
            </div>
            {editando && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm font-semibold text-slate-500 hover:text-[#4F46E5] dark:text-slate-400 inline-flex items-center gap-1"
              >
                <RotateCcw size={14} /> Cancelar edición
              </button>
            )}
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-4">
            {esAdmin && (
              <Field label="Restaurante">
                <div className="relative">
                  <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={restauranteId}
                    onChange={(e) => setRestauranteId(e.target.value)}
                    disabled={editando}
                    className={`${inputCls} pl-9 disabled:opacity-60`}
                  >
                    {restaurantes.length === 0 && <option value="">Cargando restaurantes…</option>}
                    {restaurantes.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {editando ? 'El restaurante no se cambia al editar.' : 'El nuevo usuario se dará de alta en este restaurante.'}
                </p>
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Nombre completo">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Carlos Mamani"
                  className={inputCls}
                />
              </Field>
              <Field label="Correo electrónico">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="persona@santafe.pe"
                  className={inputCls}
                />
              </Field>
              <Field label="Rol asignado">
                <select
                  value={form.roleId}
                  onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                  className={inputCls}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={editando ? 'Contraseña (déjala en blanco para no cambiarla)' : 'Contraseña de acceso'}>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editando ? '••••••••' : 'Por defecto: santafe123'}
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>

            {error && (
              <div role="alert" className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-bold hover:bg-[#4338CA] disabled:opacity-60 transition-colors shadow-sm"
              >
                {editando ? <Save size={16} /> : <Plus size={16} />}
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Limpiar
              </button>
            </div>
          </form>
        </section>

        {/* TOOLBAR + LISTA */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Personas registradas</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar nombre o correo"
                  className="pl-8 pr-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                />
              </div>
              <select
                value={filtroRol}
                onChange={(e) => setFiltroRol(e.target.value)}
                className="px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
              >
                <option value="Todos">Todos los roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {users.length === 0 ? (
            <EmptyState titulo="Aún no hay usuarios" texto="Crea el primero usando el formulario de arriba." />
          ) : visibles.length === 0 ? (
            <EmptyState titulo="Sin resultados" texto="Ajusta el filtro o la búsqueda." />
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm ring-1 ring-[#E2E8F0] dark:ring-slate-800 overflow-hidden">
              <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {visibles.map((u) => {
                  const role = roles.find((r) => r.id === u.roleId)
                  const enEdicion = editandoId === u.id
                  return (
                    <li
                      key={u.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        enEdicion ? 'bg-[#4F46E5]/5 dark:bg-[#4F46E5]/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
                        style={{ backgroundColor: role?.color || '#6B7280' }}
                      >
                        {initials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-slate-900 dark:text-slate-50 truncate">{u.name}</p>
                          {u.hasOverrides && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              Override
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                          <Mail size={11} className="shrink-0" /> {u.email}
                        </p>
                      </div>
                      <span
                        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: `${role?.color || '#6B7280'}1A`,
                          color: role?.color || '#6B7280',
                        }}
                      >
                        <ShieldCheck size={11} />
                        {role?.label || capRol(u.roleId)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => cargarParaEditar(u)}
                          title="Editar"
                          aria-label="Editar"
                          className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmar(u)}
                          title="Eliminar"
                          aria-label="Eliminar"
                          className="w-9 h-9 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      </main>

      {/* MODAL CONFIRMACIÓN */}
      {confirmar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmar(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#E2E8F0] dark:ring-slate-800 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center">
                  <Trash2 size={18} />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-slate-50 text-lg">Eliminar usuario</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                ¿Seguro que quieres eliminar a <strong>{confirmar.name}</strong> ({confirmar.email})?
                Se borrarán también sus permisos individuales (overrides).
              </p>
            </div>
            <div className="px-5 pb-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmar(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminar}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} /> Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────── helpers ─────────── */

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-colors'

function Field({ label, children }) {
  return (
    <div>
      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        {label}
      </span>
      {children}
    </div>
  )
}

function EmptyState({ titulo, texto }) {
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-800 px-6 py-16 text-center">
      <Users size={42} className="mx-auto text-slate-300 dark:text-slate-600" />
      <p className="mt-3 font-bold text-slate-700 dark:text-slate-200">{titulo}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{texto}</p>
    </div>
  )
}
