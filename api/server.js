// Servidor local para desarrollo — equivalente a las Vercel API routes.
// Uso: node api/server.js (arrancado automáticamente por `pnpm dev`)
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Cargar .env.local manualmente antes de cualquier acceso a process.env
try {
  const envPath = resolve(process.cwd(), '.env.local')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local opcional */ }

import express from 'express'
import { createClient } from '@supabase/supabase-js'
import {
  azulIsLive, buildAzulRequest, verifyAzulResponse, azulSandboxApproval, azulConfig,
} from './_azul.js'
import {
  signToken, requireAuth, hashPassword, verifyPassword,
  loginRateLimited, loginRateClear, serverError,
} from './_auth.js'
import { dashboardRows } from './_dashboard.js'
import {
  listRestaurantes, detalleRestaurante, crearRestaurante,
  renombrarRestaurante, eliminarRestaurante,
} from './_restaurantes.js'

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true })) // Azul postea el callback como form-urlencoded

// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
// Espeja los requireAuth de las funciones de Vercel (api/*.js).
const ROLES_ADMIN  = ['admin', 'gerente']
const ROLES_COBROS = ['admin', 'gerente', 'cajero', 'recepcionista']

app.use('/api', (req, res, next) => {
  const { path, method } = req
  const action = req.query?.action || req.body?.action

  const isOpen =
    (method === 'GET' && ['/mesas', '/platos', '/zonas'].includes(path)) ||
    (path === '/usuarios' && method === 'POST' && (action === 'login' || action === 'register')) ||
    (path === '/pagos-azul' && action === 'callback')
  if (isOpen) return next()

  const esDashboard = req.query.dashboard === '1' || req.query.dashboard === 'true'
  let roles = null
  if (path === '/usuarios') roles = ROLES_ADMIN
  else if (path === '/platos') roles = ROLES_ADMIN
  else if (path === '/restaurantes') roles = ['admin']
  else if (path === '/mesas' && method === 'POST') roles = ROLES_ADMIN
  else if (path === '/zonas' && method !== 'GET') roles = ROLES_ADMIN
  else if (path === '/pagos' && method === 'GET') roles = ROLES_COBROS
  else if (path === '/pedidos' && method === 'GET' && esDashboard) roles = ROLES_ADMIN

  const user = requireAuth(req, res, roles)
  if (!user) return
  req.auth = user
  next()
})

const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'
let _sb = null
const db = () => {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _sb
}

// Restaurante del caller: del token si lo lleva, si no de su fila; fallback env.
async function resolverRestauranteCaller(auth) {
  if (auth?.restaurante_id) return auth.restaurante_id
  if (auth?.sub) {
    const { data } = await db().from('usuarios').select('restaurante_id').eq('id', auth.sub).maybeSingle()
    if (data?.restaurante_id) return data.restaurante_id
  }
  return RESTAURANTE_ID
}

// ─── MESAS ───────────────────────────────────────────────────────────────────
app.get('/api/mesas', async (req, res) => {
  try {
    const { data, error } = await db().from('mesas').select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)').eq('restaurante_id', RESTAURANTE_ID).order('numero_mesa')
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/mesas', async (req, res) => {
  try {
    const { numero_mesa, capacidad = 4, estado = 'disponible', zona_id = null } = req.body
    const { data, error } = await db().from('mesas')
      .upsert({ restaurante_id: RESTAURANTE_ID, numero_mesa, capacidad, estado, zona_id }, { onConflict: 'restaurante_id,numero_mesa', ignoreDuplicates: true })
      .select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)').maybeSingle()
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/mesas', async (req, res) => {
  try {
    const { id, estado } = req.body
    const cambiaZona = Object.prototype.hasOwnProperty.call(req.body, 'zona_id')
    // Siempre cerrar pedidos abiertos desde JS (no depender de la RPC).
    if (estado === 'por_cobrar' || estado === 'disponible') {
      const { data: abiertos } = await db().from('pedidos').select('id')
        .eq('mesa_id', id).eq('restaurante_id', RESTAURANTE_ID)
        .not('estado', 'in', '("entregado","cancelado")')
      if (abiertos?.length) {
        const ids = abiertos.map(p => p.id)
        const nowIso = new Date().toISOString()
        await db().from('pedido_items').update({ iniciado_en: nowIso })
          .in('pedido_id', ids).is('iniciado_en', null).not('estado', 'in', '("entregado","cancelado")')
        await db().from('pedido_items').update({ estado: 'entregado' })
          .in('pedido_id', ids).not('estado', 'in', '("entregado","cancelado")')
        const { error: pedErr } = await db().from('pedidos').update({ estado: 'entregado' }).in('id', ids)
        if (pedErr) throw pedErr
      }
    }
    const patch = {}
    if (estado !== undefined) patch.estado = estado
    if (cambiaZona) patch.zona_id = req.body.zona_id ?? null
    const { data, error } = await db().from('mesas').update(patch).eq('id', id).eq('restaurante_id', RESTAURANTE_ID).select('id, numero_mesa, estado, capacidad, zona_id, zona:zonas(id, nombre)').single()
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── ZONAS ───────────────────────────────────────────────────────────────────
app.get('/api/zonas', async (req, res) => {
  try {
    const { data, error } = await db().from('zonas')
      .select('id, nombre, orden, activa').eq('restaurante_id', RESTAURANTE_ID)
      .order('orden', { ascending: true }).order('nombre', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/zonas', async (req, res) => {
  try {
    const { nombre, orden = 0, activa = true } = req.body || {}
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre de la zona es requerido.' })
    const { data, error } = await db().from('zonas')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), orden: Number(orden) || 0, activa })
      .select('id, nombre, orden, activa').single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una zona con ese nombre.' })
      throw error
    }
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/zonas', async (req, res) => {
  try {
    const { id, nombre, orden, activa } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id requerido.' })
    const patch = {}
    if (nombre !== undefined) patch.nombre = String(nombre).trim()
    if (orden !== undefined) patch.orden = Number(orden) || 0
    if (activa !== undefined) patch.activa = activa
    const { data, error } = await db().from('zonas')
      .update(patch).eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
      .select('id, nombre, orden, activa').single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una zona con ese nombre.' })
      throw error
    }
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.delete('/api/zonas', async (req, res) => {
  try {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id requerido.' })
    await db().from('mesas').update({ zona_id: null }).eq('zona_id', id).eq('restaurante_id', RESTAURANTE_ID)
    const { error } = await db().from('zonas').delete().eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── PLATOS ──────────────────────────────────────────────────────────────────
app.get('/api/platos', async (req, res) => {
  try {
    const { data, error } = await db().from('platos')
      .select('id, nombre, precio, disponible, imagen_url, categoria, ingredientes, creado_en')
      .eq('restaurante_id', RESTAURANTE_ID).is('eliminado_en', null).order('creado_en', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/platos', async (req, res) => {
  try {
    const { nombre, precio, disponible = true, imagen_url = null, categoria = null, ingredientes = [] } = req.body
    const { data, error } = await db().from('platos')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre, precio, disponible, imagen_url, categoria, ingredientes })
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/platos', async (req, res) => {
  try {
    const { id, nombre, precio, disponible, imagen_url, categoria, ingredientes } = req.body
    const { data, error } = await db().from('platos')
      .update({ nombre, precio, disponible, imagen_url: imagen_url ?? null, categoria: categoria ?? null, ingredientes: ingredientes ?? [] })
      .eq('id', id).eq('restaurante_id', RESTAURANTE_ID).is('eliminado_en', null).select().single()
    if (error) throw error
    res.json(data ?? null)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.delete('/api/platos', async (req, res) => {
  try {
    const { id } = req.body ?? {}
    const { error } = await db().from('platos').update({ eliminado_en: new Date().toISOString() }).eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── COMENSALES ───────────────────────────────────────────────────────────────
app.get('/api/comensales', async (req, res) => {
  try {
    const { mesa_id, tipo } = req.query

    // Limpieza perezosa de comensales abandonados (activos > 12 h)
    const staleIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    await db().from('comensales')
      .update({ activo: false })
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('activo', true)
      .lt('creado_en', staleIso)

    if (tipo === 'tiempo') {
      const { data, error } = await db().from('comensales')
        .select('id, username, creado_en, mesas (numero_mesa)')
        .eq('restaurante_id', RESTAURANTE_ID).eq('activo', true)
      if (error) throw error
      const now = Date.now()
      return res.json(
        data
          .map(c => ({ id: c.id, username: c.username, creado_en: c.creado_en, numero_mesa: c.mesas?.numero_mesa, minutos_en_mesa: (now - new Date(c.creado_en).getTime()) / 60000 }))
          .sort((a, b) => b.minutos_en_mesa - a.minutos_en_mesa)
      )
    }

    const { data, error } = await db().from('comensales')
      .select('id, mesa_id, username, total_cuenta, activo, pagado_en, creado_en')
      .eq('mesa_id', mesa_id).eq('activo', true)
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/comensales', async (req, res) => {
  try {
    const { numero_mesa, mesa_id: directMesaId, username } = req.body
    let mesa_id = directMesaId
    if (!mesa_id && numero_mesa) {
      const { data: mesa } = await db().from('mesas').select('id').eq('restaurante_id', RESTAURANTE_ID).eq('numero_mesa', numero_mesa).maybeSingle()
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
      mesa_id = mesa.id
    }
    const { data, error } = await db().from('comensales')
      .upsert({ mesa_id, restaurante_id: RESTAURANTE_ID, username, activo: true }, { onConflict: 'mesa_id,username' })
      .select('id, mesa_id, username, total_cuenta, activo').single()
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/comensales', async (req, res) => {
  try {
    const { mesa_id, activo, pagado, username } = req.body
    if (pagado === true) {
      const { error } = await db().from('comensales').update({ pagado_en: new Date().toISOString() }).eq('mesa_id', mesa_id).eq('restaurante_id', RESTAURANTE_ID).eq('activo', true)
      if (error) throw error
      return res.json({ ok: true })
    }
    let q = db().from('comensales').update({ activo }).eq('mesa_id', mesa_id).eq('restaurante_id', RESTAURANTE_ID)
    if (username) q = q.eq('username', username)
    const { error } = await q
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
app.get('/api/usuarios', async (req, res) => {
  try {
    const propio = await resolverRestauranteCaller(req.auth)
    const rid = (req.auth?.role === 'admin' && req.query?.restaurante_id) ? req.query.restaurante_id : propio
    const { data, error } = await db().from('usuarios')
      .select('id, restaurante_id, nombre, email, role, activo, creado_en, actualizado_en')
      .eq('restaurante_id', rid).order('creado_en', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/usuarios', async (req, res) => {
  try {
    const { action, email, password, nombre, role } = req.body || {}

    if (action === 'login') {
      if (!email || !password) return res.json({ ok: false, error: 'Email y contraseña requeridos.' })
      const cleanEmail = String(email).trim().toLowerCase()
      const rateKey = `${req.ip}|${cleanEmail}`
      if (loginRateLimited(rateKey)) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera unos minutos.' })
      const { data: user, error } = await db().from('usuarios')
        .select('id, restaurante_id, nombre, email, role, password_hash')
        .eq('email', cleanEmail).eq('activo', true).maybeSingle()
      if (error) throw error
      const check = user ? verifyPassword(password, user.password_hash) : { ok: false }
      if (!user || !check.ok) return res.json({ ok: false, error: 'Credenciales incorrectas.' })
      loginRateClear(rateKey)
      if (check.legacy) {
        const { error: upErr } = await db().from('usuarios').update({ password_hash: hashPassword(password) }).eq('id', user.id)
        if (upErr) console.warn('[usuarios.login] upgrade hash:', upErr.message)
      }
      const safe = { id: user.id, nombre: user.nombre, email: user.email, role: user.role, restaurante_id: user.restaurante_id }
      return res.json({ ok: true, user: safe, token: signToken(safe) })
    }

    if (action === 'register') {
      if (!nombre || !email || !password) return res.json({ ok: false, error: 'Nombre, email y contraseña son requeridos.' })
      if (String(password).length < 6) return res.json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' })
      const cleanEmail = String(email).trim().toLowerCase()
      // El registro público SIEMPRE crea clientes.
      const { data: row, error } = await db().from('usuarios')
        .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), email: cleanEmail, password_hash: hashPassword(password), role: 'cliente' })
        .select('id, restaurante_id, nombre, email, role, creado_en').single()
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
        }
        throw error
      }
      return res.json({ ok: true, user: row, token: signToken(row) })
    }

    if (action === 'create') {
      if (!nombre || !email) return res.json({ ok: false, error: 'Nombre y correo son requeridos.' })
      const cleanEmail = String(email).trim().toLowerCase()

      // Restaurante destino: admin lo elige; gerente (supervisor) usa el suyo.
      let restauranteDestino = await resolverRestauranteCaller(req.auth)
      if (req.auth?.role === 'admin') {
        const solicitado = req.body?.restaurante_id
        if (!solicitado) return res.json({ ok: false, error: 'Selecciona el restaurante al que pertenece el usuario.' })
        const { data: rest } = await db().from('restaurantes').select('id').eq('id', solicitado).maybeSingle()
        if (!rest) return res.json({ ok: false, error: 'Restaurante no válido.' })
        restauranteDestino = solicitado
      }

      const { data: row, error } = await db().from('usuarios')
        .insert({ restaurante_id: restauranteDestino, nombre: String(nombre).trim(), email: cleanEmail, password_hash: hashPassword(password || 'santafe123'), role: role || 'cliente' })
        .select('id, restaurante_id, nombre, email, role, activo, creado_en').single()
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
        }
        throw error
      }
      return res.json({ ok: true, user: row })
    }

    return res.status(400).json({ error: 'action no reconocida.' })
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/usuarios', async (req, res) => {
  try {
    const { id, nombre, email, role, password } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id requerido.' })
    const patch = { actualizado_en: new Date().toISOString() }
    if (nombre !== undefined) patch.nombre = String(nombre).trim()
    if (email !== undefined) patch.email = String(email).trim().toLowerCase()
    if (role !== undefined) patch.role = role
    if (password) patch.password_hash = hashPassword(password)
    const { data, error } = await db().from('usuarios')
      .update(patch).eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
      .select('id, nombre, email, role, activo').single()
    if (error) {
      if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
      }
      throw error
    }
    return res.json({ ok: true, user: data })
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.delete('/api/usuarios', async (req, res) => {
  try {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id requerido.' })
    if (id === req.auth?.sub) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' })
    const { error } = await db().from('usuarios').delete().eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
    if (error) throw error
    return res.json({ ok: true })
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── PAGOS ────────────────────────────────────────────────────────────────────
app.get('/api/pagos', async (req, res) => {
  try {
    const { mesa_id } = req.query
    let query = db().from('pagos').select('id, mesa_id, monto, metodo, referencia, creado_en').eq('restaurante_id', RESTAURANTE_ID).order('creado_en', { ascending: false })
    if (mesa_id) query = query.eq('mesa_id', mesa_id)
    else query = query.limit(100)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/pagos', async (req, res) => {
  try {
    const { mesa_id, monto, metodo, referencia = null } = req.body
    const sixtySecsAgo = new Date(Date.now() - 60_000).toISOString()
    const { data: existing } = await db().from('pagos')
      .select('id, mesa_id, monto, metodo, referencia, creado_en')
      .eq('restaurante_id', RESTAURANTE_ID).eq('mesa_id', mesa_id).eq('monto', monto).eq('metodo', metodo).gt('creado_en', sixtySecsAgo).limit(1).maybeSingle()
    if (existing) return res.json(existing)

    // Abortar si no hay pedidos pendientes (evita doble cobro fantasma)
    const { count: pendientesCount, error: countErr } = await db().from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('mesa_id', mesa_id).eq('restaurante_id', RESTAURANTE_ID).is('cobrado_en', null)
    if (countErr) throw countErr
    if (!pendientesCount) {
      return res.status(409).json({ error: 'No hay pedidos pendientes de cobro en esta mesa.', code: 'NO_PENDING_ORDERS' })
    }

    const { data, error } = await db().from('pagos')
      .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, monto, metodo, referencia })
      .select('id, mesa_id, monto, metodo, referencia, creado_en').single()
    if (error) throw error
    const { error: rpcErr } = await db().rpc('marcar_pedidos_cobrados', { p_mesa_id: mesa_id, p_pago_id: data.id })
    if (rpcErr) {
      console.warn('[pagos.POST] RPC marcar_pedidos_cobrados falló, fallback JS:', rpcErr.message)
      await db().from('pedidos')
        .update({ cobrado_en: new Date().toISOString(), pago_id: data.id })
        .eq('mesa_id', mesa_id).eq('restaurante_id', RESTAURANTE_ID).is('cobrado_en', null)
    }
    res.json(data)
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── PEDIDOS ─────────────────────────────────────────────────────────────────
app.get('/api/pedidos', async (req, res) => {
  try {
    const { numero_mesa, mesa_id, solo_no_cobrados, dashboard, desde, hasta } = req.query

    if (dashboard === '1' || dashboard === 'true') {
      return res.json(await dashboardRows(db(), RESTAURANTE_ID, { desde, hasta }))
    }

    let mid = mesa_id
    if (!mid && numero_mesa) {
      const { data: m } = await db().from('mesas').select('id').eq('restaurante_id', RESTAURANTE_ID).eq('numero_mesa', numero_mesa).maybeSingle()
      if (!m) return res.json([])
      mid = m.id
    }
    if (!mid) return res.json([])

    let pedidosQuery = db().from('pedidos')
      .select('id, mesa_id, estado, total, cobrado_en, pago_id, creado_en, pedido_items (id, nombre, cantidad, precio_unitario, estado, subtotal, creado_en)')
      .eq('mesa_id', mid).eq('restaurante_id', RESTAURANTE_ID).order('creado_en', { ascending: false })
    if (solo_no_cobrados === '1' || solo_no_cobrados === 'true') pedidosQuery = pedidosQuery.is('cobrado_en', null)

    const { data, error } = await pedidosQuery
    if (error) throw error
    res.json(data.map(({ pedido_items: rawItems = [], ...rest }) => ({
      ...rest,
      items: rawItems.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio_unitario, estado: i.estado, subtotal: i.subtotal })),
    })))
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/pedidos', async (req, res) => {
  try {
    const { numero_mesa, mesa_id: directMesaId, items = [], comensal_id = null } = req.body
    if (!items.length) return res.status(400).json({ error: 'Sin ítems' })
    let mesa_id = directMesaId
    if (!mesa_id && numero_mesa) {
      const { data: m } = await db().from('mesas').select('id').eq('restaurante_id', RESTAURANTE_ID).eq('numero_mesa', numero_mesa).maybeSingle()
      if (!m) return res.status(404).json({ error: 'Mesa no encontrada' })
      mesa_id = m.id
    }
    const { data: pedido, error: pedidoError } = await db().from('pedidos')
      .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, comensal_id })
      .select('id, mesa_id, estado, total, creado_en').single()
    if (pedidoError) throw pedidoError
    const { error: itemsError } = await db().from('pedido_items')
      .insert(items.map(item => ({ pedido_id: pedido.id, nombre: item.nombre, precio_unitario: item.precio, cantidad: item.cantidad })))
    if (itemsError) throw itemsError
    res.json({ ...pedido, items })
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/pedidos', async (req, res) => {
  try {
    const { id, estado, accion, pedido_id, cancelado_por, motivo } = req.body

    if (accion === 'cancelar' && pedido_id) {
      const { data, error } = await db().rpc('cancelar_pedido', {
        p_pedido_id: pedido_id,
        p_cancelado_por: cancelado_por ?? null,
        p_motivo: motivo ?? null,
      })
      if (error) {
        const code = error.message?.includes('cocina ya empezó') ? 409 : 400
        return res.status(code).json({ error: error.message })
      }
      return res.json({ ok: true, pedido: data })
    }

    const { data: item, error } = await db().from('pedido_items').update({ estado }).eq('id', id).select('id, estado, pedido_id').single()
    if (error) throw error

    const { data: siblings } = await db().from('pedido_items').select('estado').eq('pedido_id', item.pedido_id)
    if (siblings?.length) {
      const es = siblings.map(s => s.estado)
      let nuevoPedidoEstado = 'pendiente'
      if (es.every(e => e === 'entregado' || e === 'cancelado')) nuevoPedidoEstado = 'entregado'
      else if (es.some(e => e === 'listo'))          nuevoPedidoEstado = 'listo'
      else if (es.some(e => e === 'en_preparacion')) nuevoPedidoEstado = 'en_preparacion'
      await db().from('pedidos').update({ estado: nuevoPedidoEstado }).eq('id', item.pedido_id)
    }

    res.json({ id: item.id, estado: item.estado })
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── RESTAURANTES (panel de plataforma, admin) ───────────────────────────────
app.get('/api/restaurantes', async (req, res) => {
  try {
    const { id } = req.query
    if (id) {
      const detalle = await detalleRestaurante(db(), id)
      if (!detalle) return res.status(404).json({ error: 'Restaurante no encontrado.' })
      return res.json(detalle)
    }
    res.json(await listRestaurantes(db()))
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.post('/api/restaurantes', async (req, res) => {
  try {
    const { nombre, mesas_iniciales } = req.body || {}
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es requerido.' })
    res.json(await crearRestaurante(db(), { nombre, mesas_iniciales }))
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.patch('/api/restaurantes', async (req, res) => {
  try {
    const { id, nombre } = req.body || {}
    if (!id || !nombre || !String(nombre).trim()) return res.status(400).json({ error: 'id y nombre son requeridos.' })
    res.json(await renombrarRestaurante(db(), { id, nombre }))
  } catch (e) { serverError(res, '[api dev]', e) }
})

app.delete('/api/restaurantes', async (req, res) => {
  try {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id requerido.' })
    if (id === RESTAURANTE_ID) return res.status(400).json({ error: 'No puedes eliminar el restaurante activo de la plataforma.' })
    res.json(await eliminarRestaurante(db(), id))
  } catch (e) { serverError(res, '[api dev]', e) }
})

// ─── PAGOS · AZUL (Página de Pagos) ───────────────────────────────────────────
async function registrarPagoAzul({ mesa_id, monto, referencia }) {
  const sixtySecsAgo = new Date(Date.now() - 60_000).toISOString()
  const { data: existing } = await db().from('pagos')
    .select('id, mesa_id, monto, metodo, referencia, creado_en')
    .eq('restaurante_id', RESTAURANTE_ID).eq('mesa_id', mesa_id)
    .eq('monto', monto).eq('metodo', 'tarjeta').gt('creado_en', sixtySecsAgo)
    .limit(1).maybeSingle()
  if (existing) return existing
  const { data, error } = await db().from('pagos')
    .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, monto, metodo: 'tarjeta', referencia })
    .select('id, mesa_id, monto, metodo, referencia, creado_en').single()
  if (error) throw error
  const { error: rpcErr } = await db().rpc('marcar_pedidos_cobrados', { p_mesa_id: mesa_id, p_pago_id: data.id })
  if (rpcErr) {
    await db().from('pedidos').update({ cobrado_en: new Date().toISOString(), pago_id: data.id })
      .eq('mesa_id', mesa_id).eq('restaurante_id', RESTAURANTE_ID).is('cobrado_en', null)
  }
  return data
}

app.all('/api/pagos-azul', async (req, res) => {
  const action = req.query?.action || req.body?.action
  const c = azulConfig()
  try {
    if (action === 'session') {
      const { mesa_id, monto, returnTo } = req.body || {}
      if (!mesa_id || !(Number(monto) > 0)) return res.status(400).json({ error: 'mesa_id y monto (>0) requeridos.' })
      const orderNumber = 'SF' + Date.now().toString().slice(-12)
      const built = buildAzulRequest({ orderNumber, amount: monto, mesaId: mesa_id, returnTo })
      return res.json({ mode: azulIsLive() ? 'live' : 'sandbox', env: c.env, ...built })
    }
    if (action === 'sandbox-approve') {
      if (azulIsLive()) return res.status(400).json({ error: 'Azul está en modo live; usa la redirección real.' })
      const approval = azulSandboxApproval(req.body?.orderNumber)
      return res.json({ ok: true, ...approval })
    }
    if (action === 'callback') {
      const body = { ...req.query, ...req.body }
      const { valid, approved } = verifyAzulResponse(body)
      const mesa_id = body.CustomField1Value
      const monto   = (Number(body.Amount) || 0) / 100
      const destBase = req.query?.returnTo === 'cliente' ? '/mi-mesa' : '/cajero/cobros'
      if (valid && approved && req.query?.estado === 'approved' && mesa_id && monto > 0) {
        try {
          await registrarPagoAzul({ mesa_id, monto, referencia: `AZUL:${body.OrderNumber}:${body.AuthorizationCode || ''}` })
        } catch (e) { console.error('[pagos-azul.callback]', e.message) }
        return res.redirect(`${c.baseUrl}${destBase}?azul=ok`)
      }
      const motivo = req.query?.estado === 'cancel' ? 'cancelado' : 'rechazado'
      return res.redirect(`${c.baseUrl}${destBase}?azul=${motivo}`)
    }
    return res.status(400).json({ error: 'action no reconocida (session | sandbox-approve | callback).' })
  } catch (e) {
    return serverError(res, '[api/pagos-azul]', e)
  }
})

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`[api] dev server en :${PORT}`))
