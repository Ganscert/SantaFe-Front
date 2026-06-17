import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../adapters/db.js'

const STORAGE_KEY_OVERRIDES = 'santa-fe:users-overrides'

// Fallback offline: sólo se usa si la DB no responde, para que el panel no
// quede vacío. La fuente de verdad real es la tabla `usuarios` de Supabase.
const SEED_USERS = [
  { id: 'u1', name: 'Carlos Mamani',  email: 'carlos@santafe.pe',  roleId: 'mesero'   },
  { id: 'u2', name: 'Ana Quispe',     email: 'ana@santafe.pe',     roleId: 'cocinero' },
  { id: 'u3', name: 'Luis Torres',    email: 'luis@santafe.pe',    roleId: 'cajero'   },
  { id: 'u4', name: 'María Flores',   email: 'maria@santafe.pe',   roleId: 'gerente'  },
  { id: 'u5', name: 'Pedro Salas',    email: 'pedro@santafe.pe',   roleId: 'mesero'   },
  { id: 'u6', name: 'Rosa Huanca',    email: 'rosa@santafe.pe',    roleId: 'cocinero' },
]

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
}

// Fila de la DB (`usuarios`) → shape que consume la UI.
function mapUser(row) {
  return {
    id:     row.id,
    name:   row.nombre ?? '',
    email:  row.email ?? '',
    roleId: row.role ?? 'cliente',
  }
}

function leerOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OVERRIDES)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function useUsuarios(roles) {
  const [lista, setLista]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [overrides, setOverrides] = useState(leerOverrides)

  // Carga inicial desde la base de datos.
  useEffect(() => {
    let cancel = false
    db.usuarios.list()
      .then((rows) => {
        if (cancel) return
        setLista(Array.isArray(rows) ? rows.map(mapUser) : [])
        setLoading(false)
      })
      .catch((e) => {
        if (cancel) return
        console.error('[usuarios.list]', e.message)
        setLista(SEED_USERS) // fallback offline
        setLoading(false)
      })
    return () => { cancel = true }
  }, [])

  // Persistencia sólo de los overrides de permisos (la lista vive en la DB).
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides)) } catch {}
  }, [overrides])

  const users = useMemo(() => lista.map((u) => {
    const ov         = overrides[u.id] || {}
    const roleId     = ov.roleId ?? u.roleId
    const role       = roles.find((r) => r.id === roleId)
    const basePerms  = new Set(role?.permissions ?? [])
    const extra      = new Set(ov.extraPermissions ?? [])
    const removed    = new Set(ov.removedPermissions ?? [])
    const effective  = new Set([...basePerms, ...extra].filter((p) => !removed.has(p)))
    const roleChanged = ov.roleId && ov.roleId !== u.roleId
    return {
      ...u,
      initials: initials(u.name),
      roleId,
      defaultRoleId: u.roleId,
      extraPermissions: [...extra],
      removedPermissions: [...removed],
      effectivePermissions: [...effective],
      hasOverrides: extra.size > 0 || removed.size > 0 || Boolean(roleChanged),
    }
  }), [lista, overrides, roles])

  /* ── overrides de permisos por usuario (compatibilidad anterior) ────── */
  const setUserRole = useCallback((userId, roleId) => {
    setOverrides((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), roleId } }))
  }, [])

  const toggleUserPerm = useCallback((userId, permId) => {
    setOverrides((prev) => {
      const userActual = users.find((u) => u.id === userId)
      if (!userActual) return prev
      const ov      = prev[userId] || {}
      const role    = roles.find((r) => r.id === userActual.roleId)
      const base    = new Set(role?.permissions ?? [])
      const extra   = new Set(ov.extraPermissions ?? [])
      const removed = new Set(ov.removedPermissions ?? [])
      const enabled = (base.has(permId) || extra.has(permId)) && !removed.has(permId)
      if (enabled) {
        if (base.has(permId)) { removed.add(permId); extra.delete(permId) }
        else extra.delete(permId)
      } else {
        if (base.has(permId)) removed.delete(permId)
        else extra.add(permId)
      }
      return { ...prev, [userId]: { ...ov, extraPermissions: [...extra], removedPermissions: [...removed] } }
    })
  }, [users, roles])

  const resetUser = useCallback((userId) => {
    setOverrides((prev) => {
      const { [userId]: _omit, ...rest } = prev
      return rest
    })
  }, [])

  /* ── CRUD de la lista de usuarios (persiste en Supabase) ────────────── */
  const agregarUsuario = useCallback(async (data) => {
    try {
      const res = await db.usuarios.create({
        nombre: (data.name || '').trim(),
        email: (data.email || '').trim().toLowerCase(),
        role: data.roleId,
        password: data.password || undefined,
      })
      if (res?.ok === false) return { ok: false, error: res.error }
      const nuevo = mapUser(res.user)
      setLista((prev) => [nuevo, ...prev])
      return { ok: true, user: nuevo }
    } catch (e) {
      console.error('[usuarios.create]', e.message)
      return { ok: false, error: e.message }
    }
  }, [])

  const actualizarUsuario = useCallback(async (id, data) => {
    try {
      const res = await db.usuarios.update(id, {
        nombre: data.name,
        email: data.email != null ? data.email.toLowerCase() : undefined,
        role: data.roleId,
        password: data.password || undefined,
      })
      if (res?.ok === false) return { ok: false, error: res.error }
      const actualizado = mapUser(res.user)
      setLista((prev) => prev.map((u) => (u.id === id ? { ...u, ...actualizado } : u)))
      return { ok: true, user: actualizado }
    } catch (e) {
      console.error('[usuarios.update]', e.message)
      return { ok: false, error: e.message }
    }
  }, [])

  const eliminarUsuario = useCallback(async (id) => {
    try {
      await db.usuarios.remove(id)
      setLista((prev) => prev.filter((u) => u.id !== id))
      setOverrides((prev) => {
        const { [id]: _omit, ...rest } = prev
        return rest
      })
      return { ok: true }
    } catch (e) {
      console.error('[usuarios.remove]', e.message)
      return { ok: false, error: e.message }
    }
  }, [])

  return {
    users,
    loading,
    setUserRole, toggleUserPerm, resetUser,
    agregarUsuario, actualizarUsuario, eliminarUsuario,
  }
}
