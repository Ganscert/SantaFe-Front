import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY_OVERRIDES = 'santa-fe:users-overrides'
const STORAGE_KEY_LIST      = 'santa-fe:users-list'

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

function nuevoUserId() {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function leerLista() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIST)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    /* fallthrough → seed */
  }
  return SEED_USERS
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
  const [lista, setLista]       = useState(leerLista)
  const [overrides, setOverrides] = useState(leerOverrides)

  // Persistencia
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(lista)) } catch {}
  }, [lista])

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

  /* ── CRUD de la lista de usuarios ───────────────────────────────────── */
  const agregarUsuario = useCallback((data) => {
    const limpio = {
      id: nuevoUserId(),
      name: (data.name || '').trim(),
      email: (data.email || '').trim(),
      roleId: data.roleId,
    }
    setLista((prev) => [limpio, ...prev])
    return limpio
  }, [])

  const actualizarUsuario = useCallback((id, data) => {
    setLista((prev) => prev.map((u) => (u.id === id ? {
      ...u,
      name:  (data.name  ?? u.name).trim(),
      email: (data.email ?? u.email).trim(),
      roleId: data.roleId ?? u.roleId,
    } : u)))
  }, [])

  const eliminarUsuario = useCallback((id) => {
    setLista((prev) => prev.filter((u) => u.id !== id))
    setOverrides((prev) => {
      const { [id]: _omit, ...rest } = prev
      return rest
    })
  }, [])

  return {
    users,
    setUserRole, toggleUserPerm, resetUser,
    agregarUsuario, actualizarUsuario, eliminarUsuario,
  }
}
