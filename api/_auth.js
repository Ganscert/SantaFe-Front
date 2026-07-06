// Utilidades de autenticación compartidas por las Vercel Functions y el
// dev server Express: tokens firmados (HMAC), hash de contraseñas (scrypt)
// y rate-limit del login.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 h

// AUTH_TOKEN_SECRET dedicado si existe; si no, deriva del service role key
// (server-side only, nunca llega al browser).
const secret = () =>
  process.env.AUTH_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'santa-fe-dev-secret'

export function signToken(user) {
  const payload = { sub: user.id, role: user.role, exp: Date.now() + TOKEN_TTL_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret()).update(body).digest()
  let given
  try { given = Buffer.from(sig, 'base64url') } catch { return null }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload?.sub || !payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

/**
 * Verifica el Bearer token y (opcional) el rol. Si falla responde 401/403
 * y devuelve null; si pasa, devuelve el payload { sub, role, exp }.
 */
export function requireAuth(req, res, roles = null) {
  const header = req.headers?.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const user = verifyToken(token)
  if (!user) {
    res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' })
    return null
  }
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    res.status(403).json({ error: 'No tienes permisos para esta acción.' })
    return null
  }
  return user
}

// ── Contraseñas ───────────────────────────────────────────────────────────────
// Formato nuevo: "scrypt:<salt hex>:<hash hex>". Las filas legacy guardan la
// contraseña en claro; verifyPassword las acepta (legacy:true) para que el
// login las re-hashee al vuelo sin migración manual.
export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(password), salt, 32)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  if (!stored) return { ok: false, legacy: false }
  if (String(stored).startsWith('scrypt:')) {
    const [, saltHex, hashHex] = String(stored).split(':')
    try {
      const hash = scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32)
      const expected = Buffer.from(hashHex, 'hex')
      return { ok: hash.length === expected.length && timingSafeEqual(hash, expected), legacy: false }
    } catch { return { ok: false, legacy: false } }
  }
  const a = Buffer.from(String(password))
  const b = Buffer.from(String(stored))
  return { ok: a.length === b.length && timingSafeEqual(a, b), legacy: true }
}

// ── Rate limit del login (en memoria, por instancia) ────────────────────────
const attempts = new Map()
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 10

export function loginRateLimited(key) {
  const now = Date.now()
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k)
  }
  const entry = attempts.get(key)
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

export function loginRateClear(key) { attempts.delete(key) }

/** Log completo en server, mensaje genérico al cliente. */
export function serverError(res, tag, e) {
  console.error(tag, e)
  return res.status(500).json({ error: 'Error interno del servidor.' })
}
