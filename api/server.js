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

const app = express()
app.use(express.json())

const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'
let _sb = null
const db = () => {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _sb
}

// ─── MESAS ───────────────────────────────────────────────────────────────────
app.get('/api/mesas', async (req, res) => {
  try {
    const { data, error } = await db().from('mesas').select('id, numero_mesa, estado, capacidad').eq('restaurante_id', RESTAURANTE_ID).order('numero_mesa')
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/mesas', async (req, res) => {
  try {
    const { numero_mesa, capacidad = 4, estado = 'disponible' } = req.body
    const { data, error } = await db().from('mesas')
      .upsert({ restaurante_id: RESTAURANTE_ID, numero_mesa, capacidad, estado }, { onConflict: 'restaurante_id,numero_mesa', ignoreDuplicates: true })
      .select('id, numero_mesa, estado, capacidad').maybeSingle()
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/mesas', async (req, res) => {
  try {
    const { id, estado } = req.body
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
    const { data, error } = await db().from('mesas').update({ estado }).eq('id', id).eq('restaurante_id', RESTAURANTE_ID).select('id, numero_mesa, estado, capacidad').single()
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── PLATOS ──────────────────────────────────────────────────────────────────
app.get('/api/platos', async (req, res) => {
  try {
    const { data, error } = await db().from('platos')
      .select('id, nombre, precio, disponible, imagen_url, categoria, ingredientes, creado_en')
      .eq('restaurante_id', RESTAURANTE_ID).is('eliminado_en', null).order('creado_en', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/platos', async (req, res) => {
  try {
    const { nombre, precio, disponible = true, imagen_url = null, categoria = null, ingredientes = [] } = req.body
    const { data, error } = await db().from('platos')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre, precio, disponible, imagen_url, categoria, ingredientes })
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/platos', async (req, res) => {
  try {
    const { id, nombre, precio, disponible, imagen_url, categoria, ingredientes } = req.body
    const { data, error } = await db().from('platos')
      .update({ nombre, precio, disponible, imagen_url: imagen_url ?? null, categoria: categoria ?? null, ingredientes: ingredientes ?? [] })
      .eq('id', id).eq('restaurante_id', RESTAURANTE_ID).is('eliminado_en', null).select().single()
    if (error) throw error
    res.json(data ?? null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/platos', async (req, res) => {
  try {
    const { id } = req.body ?? {}
    const { error } = await db().from('platos').update({ eliminado_en: new Date().toISOString() }).eq('id', id).eq('restaurante_id', RESTAURANTE_ID)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── COMENSALES ───────────────────────────────────────────────────────────────
app.get('/api/comensales', async (req, res) => {
  try {
    const { mesa_id, tipo } = req.query

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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
app.get('/api/usuarios', async (req, res) => {
  try {
    const { data, error } = await db().from('usuarios')
      .select('id, restaurante_id, nombre, email, role, activo, creado_en, actualizado_en')
      .eq('restaurante_id', RESTAURANTE_ID).order('creado_en', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/usuarios', async (req, res) => {
  try {
    const { action, email, password, nombre, role } = req.body || {}

    if (action === 'login') {
      if (!email || !password) return res.json({ ok: false, error: 'Email y contraseña requeridos.' })
      const { data: user, error } = await db().from('usuarios')
        .select('id, nombre, email, role')
        .eq('email', String(email).trim().toLowerCase()).eq('password_hash', password).eq('activo', true).maybeSingle()
      if (error) throw error
      if (!user) return res.json({ ok: false, error: 'Credenciales incorrectas.' })
      return res.json({ ok: true, user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role } })
    }

    if (action === 'register') {
      if (!nombre || !email || !password) return res.json({ ok: false, error: 'Nombre, email y contraseña son requeridos.' })
      const cleanEmail = String(email).trim().toLowerCase()
      const { data: row, error } = await db().from('usuarios')
        .insert({ restaurante_id: RESTAURANTE_ID, nombre: String(nombre).trim(), email: cleanEmail, password_hash: password, role: role || 'cliente' })
        .select('id, nombre, email, role, creado_en').single()
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return res.json({ ok: false, error: 'Ya existe una cuenta con ese correo.' })
        }
        throw error
      }
      return res.json({ ok: true, user: row })
    }

    return res.status(400).json({ error: 'action no reconocida.' })
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── PEDIDOS ─────────────────────────────────────────────────────────────────
app.get('/api/pedidos', async (req, res) => {
  try {
    const { numero_mesa, mesa_id, solo_no_cobrados, dashboard, desde, hasta } = req.query

    if (dashboard === '1' || dashboard === 'true') {
      let q = db().from('v_dashboard_resumen').select('*').eq('restaurante_id', RESTAURANTE_ID).order('creado_en', { ascending: false })
      if (desde) q = q.gte('creado_en', new Date(Number(desde) || desde).toISOString())
      if (hasta) q = q.lte('creado_en', new Date(Number(hasta) || hasta).toISOString())
      const { data, error } = await q
      if (error) throw error
      return res.json(data || [])
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
    res.json(data.map(p => {
      const items = (p.pedido_items || []).map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio_unitario, estado: i.estado, subtotal: i.subtotal }))
      const { pedido_items: _, ...rest } = p
      return { ...rest, items }
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/pedidos', async (req, res) => {
  try {
    const { numero_mesa, mesa_id: directMesaId, items = [], cliente_nombre = null, comensal_id = null } = req.body
    if (!items.length) return res.status(400).json({ error: 'Sin ítems' })
    let mesa_id = directMesaId
    if (!mesa_id && numero_mesa) {
      const { data: m } = await db().from('mesas').select('id').eq('restaurante_id', RESTAURANTE_ID).eq('numero_mesa', numero_mesa).maybeSingle()
      if (!m) return res.status(404).json({ error: 'Mesa no encontrada' })
      mesa_id = m.id
    }
    const { data: pedido, error: pedidoError } = await db().from('pedidos')
      .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, cliente_nombre, comensal_id })
      .select('id, mesa_id, estado, total, cliente_nombre, creado_en').single()
    if (pedidoError) throw pedidoError
    const { error: itemsError } = await db().from('pedido_items')
      .insert(items.map(item => ({ pedido_id: pedido.id, nombre: item.nombre, precio_unitario: item.precio, cantidad: item.cantidad })))
    if (itemsError) throw itemsError
    res.json({ ...pedido, items })
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
})

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`[api] dev server en :${PORT}`))
