import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../adapters/supabase.js'

const STORAGE_KEY_SESSION = 'santa-fe:session'
const STORAGE_KEY_USERS   = 'santa-fe:auth-users'

// Roles soportados por la app.
export const ROLES = {
  ADMIN:         'admin',
  GERENTE:       'gerente',
  RECEPCIONISTA: 'recepcionista',
  MESERO:        'mesero',
  COCINERO:      'cocinero',
  CAJERO:        'cajero',
  CLIENTE:       'cliente',
}

// Demo users (sólo staff). Los clientes ahora se registran vía Supabase Auth.
// El password aquí es texto plano porque NUNCA llega a un endpoint — es un
// short-circuit local para entornos de demo.
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

function leerSesion() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function leerUsuariosLocales() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) {
      const ids = new Set(parsed.map((u) => u.id))
      const merged = [...parsed]
      for (const d of DEMO_USERS) if (!ids.has(d.id)) merged.push(d)
      return merged
    }
  } catch { /* fallthrough */ }
  return DEMO_USERS
}

// Mapea un objeto User de Supabase a la forma "session" interna.
function supaUserToSession(u) {
  if (!u) return null
  return {
    id:       u.id,
    name:     u.user_metadata?.nombre || u.email?.split('@')[0] || 'Cliente',
    email:    u.email,
    role:     u.user_metadata?.role || ROLES.CLIENTE,
    issuedAt: Date.now(),
    supabase: true,
  }
}

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [users, setUsers]     = useState(leerUsuariosLocales)
  const [session, setSession] = useState(leerSesion)
  // Necesitamos leer la sesión más reciente dentro del listener sin re-suscribir.
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)) } catch {}
  }, [users])

  useEffect(() => {
    try {
      if (session) localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session))
      else localStorage.removeItem(STORAGE_KEY_SESSION)
    } catch {}
  }, [session])

  // ── Bootstrap + escuchar cambios de auth en Supabase ──
  // Si ya hay una sesión de Supabase válida (cookie/local), la promovemos a
  // session de la app. Los logouts de Supabase limpian sólo si la sesión
  // actual provenía de Supabase (no tocar demos).
  useEffect(() => {
    if (!supabase) return
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const u = data?.session?.user
      if (u && !sessionRef.current?.supabase) setSession(supaUserToSession(u))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (sess?.user) {
        setSession(supaUserToSession(sess.user))
      } else if (sessionRef.current?.supabase) {
        setSession(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // ── Login: 1º demo (sync), 2º Supabase (async) ──
  const login = useCallback(async (email, password) => {
    const cleanEmail = String(email || '').trim().toLowerCase()
    const demo = users.find((x) => x.email.toLowerCase() === cleanEmail)
    if (demo) {
      if (demo.password !== password) return { ok: false, error: 'Contraseña incorrecta.' }
      const safe = { id: demo.id, name: demo.name, email: demo.email, role: demo.role, issuedAt: Date.now() }
      setSession(safe)
      return { ok: true, user: safe }
    }
    if (!supabase) return { ok: false, error: 'No existe una cuenta con ese correo.' }
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) return { ok: false, error: error.message }
    const safe = supaUserToSession(data?.user)
    if (safe) setSession(safe)
    return { ok: true, user: safe }
  }, [users])

  // ── Register: clientes pasan por Supabase; staff (no-cliente) sigue local. ──
  const register = useCallback(async ({ name, email, password, role = ROLES.CLIENTE }) => {
    const cleanName  = String(name || '').trim()
    const cleanEmail = String(email || '').trim().toLowerCase()
    if (!cleanName)                       return { ok: false, error: 'Ingresa tu nombre.' }
    if (!emailRegex.test(cleanEmail))     return { ok: false, error: 'Correo no válido.' }
    if (!password || password.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' }

    if (role !== ROLES.CLIENTE) {
      // Staff (mesero, recepción) → registro local. Producción debería usar
      // un panel admin que cree la cuenta en auth.users vía service_role.
      if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        return { ok: false, error: 'Ya existe una cuenta con ese correo.' }
      }
      const nuevo = { id: `user-${Date.now().toString(36)}`, name: cleanName, email: cleanEmail, password, role }
      setUsers((prev) => [...prev, nuevo])
      const safe = { id: nuevo.id, name: nuevo.name, email: nuevo.email, role: nuevo.role, issuedAt: Date.now() }
      setSession(safe)
      return { ok: true, user: safe }
    }

    if (!supabase) return { ok: false, error: 'Registro de clientes deshabilitado (sin Supabase).' }
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { nombre: cleanName, role: ROLES.CLIENTE } },
    })
    if (error) return { ok: false, error: error.message }
    // Si el proyecto exige confirmación de email, no habrá session todavía.
    if (!data?.session) {
      return { ok: false, error: 'Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.' }
    }
    const safe = supaUserToSession(data.user)
    if (safe) setSession(safe)
    return { ok: true, user: safe }
  }, [users])

  // ── Logout: limpia ambos (demo + Supabase). ──
  const logout = useCallback(async () => {
    if (supabase && session?.supabase) {
      try { await supabase.auth.signOut() } catch {}
    }
    setSession(null)
  }, [session?.supabase])

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
