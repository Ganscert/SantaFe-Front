import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'santa-fe:roles-overrides'

/**
 * useRoles — Carga roles_permissions.json desde /public y aplica overrides locales.
 *
 * Datos crudos:
 *   { permissions: { id: {label, category} }, roles: [{id, label, description, system, color, permissions: [permId]}] }
 *
 * Persistencia:
 *   - El archivo base (servido como /roles_permissions.json) es la plantilla de fábrica.
 *   - Los cambios del panel se guardan en localStorage como override:
 *       { roles: [...]  }   (mergeado al cargar)
 *   - Reset elimina el override y vuelve al archivo base.
 */
export function useRoles() {
  const [base, setBase]     = useState(null)
  const [override, setOver] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancel = false
    fetch('/roles_permissions.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { if (!cancel) { setBase(data); setLoading(false) } })
      .catch(err => { if (!cancel) { setError(err.message); setLoading(false) } })
    return () => { cancel = true }
  }, [])

  const data = useMemo(() => {
    if (!base) return null
    if (!override?.roles) return base
    const ovById = new Map(override.roles.map(r => [r.id, r]))
    const mergedRoles = base.roles.map(r => ovById.has(r.id) ? { ...r, ...ovById.get(r.id) } : r)
    for (const ovRole of override.roles) {
      if (!mergedRoles.find(r => r.id === ovRole.id)) mergedRoles.push(ovRole)
    }
    return { ...base, roles: mergedRoles }
  }, [base, override])

  const persist = useCallback((next) => {
    setOver(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [])

  const togglePermission = useCallback((roleId, permId) => {
    if (!data) return
    const role = data.roles.find(r => r.id === roleId)
    if (!role) return
    const has = role.permissions.includes(permId)
    const nextPerms = has ? role.permissions.filter(p => p !== permId) : [...role.permissions, permId]
    const nextRole = { ...role, permissions: nextPerms }
    const nextOver = { ...(override || {}), roles: [...(override?.roles?.filter(r => r.id !== roleId) || []), nextRole] }
    persist(nextOver)
  }, [data, override, persist])

  const updateRole = useCallback((roleId, patch) => {
    if (!data) return
    const role = data.roles.find(r => r.id === roleId)
    if (!role) return
    const nextRole = { ...role, ...patch }
    const nextOver = { ...(override || {}), roles: [...(override?.roles?.filter(r => r.id !== roleId) || []), nextRole] }
    persist(nextOver)
  }, [data, override, persist])

  const addRole = useCallback((role) => {
    const id = role.id || `rol-${Date.now()}`
    const newRole = { id, label: role.label || 'Rol nuevo', description: '', system: false, color: '#6B7C4F', permissions: [], ...role }
    const nextOver = { ...(override || {}), roles: [...(override?.roles || []), newRole] }
    persist(nextOver)
    return id
  }, [override, persist])

  const removeRole = useCallback((roleId) => {
    if (!data) return
    const role = data.roles.find(r => r.id === roleId)
    if (!role || role.system) return
    const nextOver = {
      ...(override || {}),
      roles: [
        ...(override?.roles?.filter(r => r.id !== roleId) || []),
        { ...role, _deleted: true },
      ],
    }
    persist(nextOver)
  }, [data, override, persist])

  const resetToDefaults = useCallback(() => persist(null), [persist])

  const visibleRoles = useMemo(
    () => (data?.roles ?? []).filter(r => !r._deleted),
    [data]
  )

  const permissionsByCategory = useMemo(() => {
    if (!data) return {}
    const acc = {}
    for (const [id, def] of Object.entries(data.permissions)) {
      const cat = def.category || 'Otros'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push({ id, ...def })
    }
    return acc
  }, [data])

  return {
    loading, error,
    permissions: data?.permissions ?? {},
    permissionsByCategory,
    roles: visibleRoles,
    isOverridden: Boolean(override),
    togglePermission, updateRole, addRole, removeRole, resetToDefaults,
  }
}
