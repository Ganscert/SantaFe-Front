import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { db } from '../../adapters/db.js'

const STORAGE_KEY_SESSION = 'santa-fe:session'
const STORAGE_KEY_USERS   = 'santa-fe:auth-users'
const STORAGE_KEY_VIEW_AS = 'santa-fe:view-as'

export const ROLES = {
  ADMIN:         'admin',
  GERENTE:       'gerente',
  SUPERVISOR:    'supervisor',
  RECEPCIONISTA: 'recepcionista',
  MESERO:        'mesero',
  COCINERO:      'cocinero',
  CAJERO:        'cajero',
  CLIENTE:       'cliente',
}

const DEMO_USERS = [
  { id: 'demo-admin',    name: 'Admin Demo',     email: 'admin@santafe.pe',     password: 'demo1234', role: ROLES.ADMIN },
  { id: 'demo-gerente',  name: 'Gerente Demo',   email: 'gerente@santafe.pe',   password: 'demo1234', role: ROLES.GERENTE },
  { id: 'demo-recep',    name: 'Recepción Demo', email: 'recepcion@santafe.pe', password: 'demo1234', role: ROLES.RECEPCIONISTA },
  { id: 'demo-mesero',   name: 'Mesero Demo',    email: 'mesero@santafe.pe',    password: 'demo1234', role: ROLES.MESERO },
  { id: 'demo-cocinero', name: 'Cocinero Demo',  email: 'cocinero@santafe.pe',  password: 'demo1234', role: ROLES.COCINERO },
  { id: 'demo-cajero',   name: 'Cajero Demo',    email: 'cajero@santafe.pe',    password: 'demo1234', role: ROLES.CAJERO },
  { id: 'demo-cli',      name: 'Cliente Demo',   email: 'cliente@santafe.pe',   password: 'demo1234', role: ROLES.CLIENTE },
]

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION)) } catch { return null }
}

function leerUsuariosLocales() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) {
      const ids = new Set(parsed.map(u => u.id))
      return [...parsed, ...DEMO_USERS.filter(d => !ids.has(d.id))]
    }
  } catch {}
  return DEMO_USERS
}

const AuthCtx = createContext(null)

function leerViewAs() {
  try { return localStorage.getItem(STORAGE_KEY_VIEW_AS) || null } catch { return null }
}

export function AuthProvider({ children }) {
  const [users, setUsers]     = useState(leerUsuariosLocales)
  // rawSession = sesión real (la que se persiste y firma el token).
  // session (derivada) puede llevar otro rol cuando el admin usa "ver como".
  const [rawSession, setSession] = useState(leerSesion)
  const [viewAs, setViewAsState] = useState(leerViewAs)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)) } catch {}
  }, [users])

  useEffect(() => {
    try {
      if (rawSession) localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(rawSession))
      else localStorage.removeItem(STORAGE_KEY_SESSION)
    } catch {}
  }, [rawSession])

  const canImpersonate = rawSession?.role === ROLES.ADMIN

  // Sesión efectiva: el resto de la app (router, sidebar, vistas) sólo ve ésta.
  const session = useMemo(() => {
    if (!rawSession) return null
    if (canImpersonate && viewAs && viewAs !== rawSession.role) {
      return { ...rawSession, role: viewAs, realRole: rawSession.role }
    }
    return { ...rawSession, realRole: rawSession.role }
  }, [rawSession, viewAs, canImpersonate])

  const setViewAs = useCallback((role) => {
    const next = role && role !== ROLES.ADMIN && Object.values(ROLES).includes(role) ? role : null
    setViewAsState(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY_VIEW_AS, next)
      else localStorage.removeItem(STORAGE_KEY_VIEW_AS)
    } catch {}
  }, [])

  const login = useCallback(async (email, password) => {
    setViewAs(null)
    // Try DB first
    try {
      const result = await db.usuarios.login(email, password)
      if (result.ok) {
        const safe = { id: result.user.id, name: result.user.nombre, email: result.user.email, role: result.user.role, restaurante_id: result.user.restaurante_id, issuedAt: Date.now(), token: result.token }
        setSession(safe)
        return { ok: true, user: safe }
      }
      return { ok: false, error: result.error }
    } catch {
      // DB unavailable → fallback local
      const cleanEmail = String(email || '').trim().toLowerCase()
      const match = users.find(u => u.email.toLowerCase() === cleanEmail)
      if (!match) return { ok: false, error: 'No existe una cuenta con ese correo.' }
      if (match.password !== password) return { ok: false, error: 'Contraseña incorrecta.' }
      const safe = { id: match.id, name: match.name, email: match.email, role: match.role, issuedAt: Date.now() }
      setSession(safe)
      return { ok: true, user: safe }
    }
  }, [users, setViewAs])

  const register = useCallback(async ({ name, email, password, role = ROLES.CLIENTE }) => {
    const cleanName  = String(name || '').trim()
    const cleanEmail = String(email || '').trim().toLowerCase()
    if (!cleanName)                       return { ok: false, error: 'Ingresa tu nombre.' }
    if (!emailRegex.test(cleanEmail))     return { ok: false, error: 'Correo no válido.' }
    if (!password || password.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' }

    // Try DB first
    try {
      const result = await db.usuarios.register({ nombre: cleanName, email: cleanEmail, password, role })
      if (!result.ok) return { ok: false, error: result.error }
      const safe = { id: result.user.id, name: result.user.nombre, email: result.user.email, role: result.user.role, restaurante_id: result.user.restaurante_id, issuedAt: Date.now(), token: result.token }
      setSession(safe)
      return { ok: true, user: safe }
    } catch {
      // DB unavailable → fallback local
      if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
        return { ok: false, error: 'Ya existe una cuenta con ese correo.' }
      }
      const nuevo = { id: `user-${Date.now().toString(36)}`, name: cleanName, email: cleanEmail, password, role }
      setUsers(prev => [...prev, nuevo])
      const safe = { id: nuevo.id, name: nuevo.name, email: nuevo.email, role: nuevo.role, issuedAt: Date.now() }
      setSession(safe)
      return { ok: true, user: safe }
    }
  }, [users])

  const logout = useCallback(() => {
    setViewAs(null)
    setSession(null)
  }, [setViewAs])

  const hasRole = useCallback((roles) => {
    if (!session) return false
    if (!roles || roles.length === 0) return true
    return roles.includes(session.role)
  }, [session])

  const value = useMemo(
    () => ({ session, users, login, register, logout, hasRole, isAuthenticated: Boolean(session), viewAs, setViewAs, canImpersonate }),
    [session, users, login, register, logout, hasRole, viewAs, setViewAs, canImpersonate],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
