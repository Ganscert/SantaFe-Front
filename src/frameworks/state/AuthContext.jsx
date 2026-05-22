import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY_SESSION = 'santa-fe:session'
const STORAGE_KEY_USERS   = 'santa-fe:auth-users'

// Roles soportados por el módulo de auth de la app.
// Los roles administrativos (admin, gerente, cocinero, cajero) coexisten para
// compatibilidad con el panel de Roles, pero el QR-join sólo usa estos 3.
export const ROLES = {
  ADMIN:         'admin',
  GERENTE:       'gerente',
  RECEPCIONISTA: 'recepcionista',
  MESERO:        'mesero',
  COCINERO:      'cocinero',
  CAJERO:        'cajero',
  CLIENTE:       'cliente',
}

// Demo users que existen siempre. Password en texto plano — entorno simulado.
const DEMO_USERS = [
  { id: 'demo-admin',   name: 'Admin Demo',     email: 'admin@santafe.pe',     password: 'demo1234', role: ROLES.ADMIN },
  { id: 'demo-gerente', name: 'Gerente Demo',   email: 'gerente@santafe.pe',   password: 'demo1234', role: ROLES.GERENTE },
  { id: 'demo-recep',   name: 'Recepción Demo', email: 'recepcion@santafe.pe', password: 'demo1234', role: ROLES.RECEPCIONISTA },
  { id: 'demo-mesero',  name: 'Mesero Demo',    email: 'mesero@santafe.pe',    password: 'demo1234', role: ROLES.MESERO },
  { id: 'demo-cocinero',name: 'Cocinero Demo',  email: 'cocinero@santafe.pe', password: 'demo1234', role: ROLES.COCINERO },
  { id: 'demo-cajero',  name: 'Cajero Demo',    email: 'cajero@santafe.pe',    password: 'demo1234', role: ROLES.CAJERO },
  { id: 'demo-cli',     name: 'Cliente Demo',   email: 'cliente@santafe.pe',   password: 'demo1234', role: ROLES.CLIENTE },
]

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const nuevoUserId = () => `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

function leerSesion() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function leerUsuarios() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Asegurar que los demo siempre existan (no se borran al limpiar registros)
      const ids = new Set(parsed.map((u) => u.id))
      const merged = [...parsed]
      for (const d of DEMO_USERS) if (!ids.has(d.id)) merged.push(d)
      return merged
    }
  } catch { /* fallthrough */ }
  return DEMO_USERS
}

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [users, setUsers]     = useState(leerUsuarios)
  const [session, setSession] = useState(leerSesion)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)) } catch {}
  }, [users])

  useEffect(() => {
    try {
      if (session) localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session))
      else localStorage.removeItem(STORAGE_KEY_SESSION)
    } catch {}
  }, [session])

  const login = useCallback((email, password) => {
    const u = users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase())
    if (!u)              return { ok: false, error: 'No existe una cuenta con ese correo.' }
    if (u.password !== password) return { ok: false, error: 'Contraseña incorrecta.' }
    const safe = { id: u.id, name: u.name, email: u.email, role: u.role, issuedAt: Date.now() }
    setSession(safe)
    return { ok: true, user: safe }
  }, [users])

  const register = useCallback(({ name, email, password, role = ROLES.CLIENTE }) => {
    const cleanName  = String(name || '').trim()
    const cleanEmail = String(email || '').trim().toLowerCase()
    if (!cleanName)            return { ok: false, error: 'Ingresa tu nombre.' }
    if (!emailRegex.test(cleanEmail)) return { ok: false, error: 'Correo no válido.' }
    if (!password || password.length < 4) return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' }
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return { ok: false, error: 'Ya existe una cuenta con ese correo.' }
    }
    const nuevo = { id: nuevoUserId(), name: cleanName, email: cleanEmail, password, role }
    setUsers((prev) => [...prev, nuevo])
    const safe = { id: nuevo.id, name: nuevo.name, email: nuevo.email, role: nuevo.role, issuedAt: Date.now() }
    setSession(safe)
    return { ok: true, user: safe }
  }, [users])

  const logout = useCallback(() => setSession(null), [])

  const hasRole = useCallback((roles) => {
    if (!session) return false
    if (!roles || roles.length === 0) return true
    return roles.includes(session.role)
  }, [session])

  const value = useMemo(
    () => ({ session, users, login, register, logout, hasRole, isAuthenticated: Boolean(session) }),
    [session, users, login, register, logout, hasRole],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
