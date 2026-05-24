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
import { neon } from '@neondatabase/serverless'

const app = express()
app.use(express.json())

const RESTAURANTE_ID = process.env.VITE_RESTAURANTE_ID || '00000000-0000-0000-0000-000000000001'
const db = () => neon(process.env.DATABASE_URL)

// ─── MESAS ───────────────────────────────────────────────────────────────────
app.get('/api/mesas', async (req, res) => {
  try {
    const sql = db()
    const rows = await sql`
      SELECT id, numero_mesa, estado, capacidad FROM public.mesas
      WHERE restaurante_id = ${RESTAURANTE_ID} ORDER BY numero_mesa`
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/mesas', async (req, res) => {
  try {
    const sql = db()
    const { numero_mesa, capacidad = 4, estado = 'disponible' } = req.body
    const [row] = await sql`
      INSERT INTO public.mesas (restaurante_id, numero_mesa, capacidad, estado)
      VALUES (${RESTAURANTE_ID}, ${numero_mesa}, ${capacidad}, ${estado})
      ON CONFLICT (restaurante_id, numero_mesa) DO NOTHING
      RETURNING id, numero_mesa, estado, capacidad`
    res.json(row ?? null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/mesas', async (req, res) => {
  try {
    const sql = db()
    const { id, estado } = req.body
    const [row] = await sql`
      UPDATE public.mesas SET estado = ${estado}
      WHERE id = ${id} AND restaurante_id = ${RESTAURANTE_ID}
      RETURNING id, numero_mesa, estado, capacidad`
    res.json(row ?? null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── PLATOS ──────────────────────────────────────────────────────────────────
app.get('/api/platos', async (req, res) => {
  try {
    const sql = db()
    const rows = await sql`
      SELECT id, nombre, precio, disponible, imagen_url, categoria, ingredientes, creado_en
      FROM public.platos
      WHERE restaurante_id = ${RESTAURANTE_ID} AND eliminado_en IS NULL
      ORDER BY creado_en DESC`
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/platos', async (req, res) => {
  try {
    const sql = db()
    const { nombre, precio, disponible = true, imagen_url = null, categoria = null, ingredientes = [] } = req.body
    const [row] = await sql`
      INSERT INTO public.platos (restaurante_id, nombre, precio, disponible, imagen_url, categoria, ingredientes)
      VALUES (${RESTAURANTE_ID}, ${nombre}, ${precio}, ${disponible}, ${imagen_url}, ${categoria}, ${ingredientes})
      RETURNING *`
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/platos', async (req, res) => {
  try {
    const sql = db()
    const { id, nombre, precio, disponible, imagen_url, categoria, ingredientes } = req.body
    const [row] = await sql`
      UPDATE public.platos
      SET nombre=${nombre}, precio=${precio}, disponible=${disponible},
          imagen_url=${imagen_url ?? null}, categoria=${categoria ?? null}, ingredientes=${ingredientes ?? []}
      WHERE id = ${id} AND restaurante_id = ${RESTAURANTE_ID} AND eliminado_en IS NULL
      RETURNING *`
    res.json(row ?? null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/platos', async (req, res) => {
  try {
    const sql = db()
    const { id } = req.body ?? {}
    await sql`UPDATE public.platos SET eliminado_en = now() WHERE id = ${id} AND restaurante_id = ${RESTAURANTE_ID}`
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── COMENSALES ───────────────────────────────────────────────────────────────
app.get('/api/comensales', async (req, res) => {
  try {
    const sql = db()
    const { mesa_id, tipo } = req.query

    if (tipo === 'tiempo') {
      const rows = await sql`
        SELECT c.id, c.username, c.creado_en, m.numero_mesa,
          EXTRACT(EPOCH FROM (now() - c.creado_en)) / 60 AS minutos_en_mesa
        FROM public.comensales c
        JOIN public.mesas m ON m.id = c.mesa_id
        WHERE c.restaurante_id = ${RESTAURANTE_ID} AND c.activo = true
        ORDER BY minutos_en_mesa DESC`
      return res.json(rows)
    }

    const rows = await sql`
      SELECT id, mesa_id, username, total_cuenta, activo FROM public.comensales
      WHERE mesa_id = ${mesa_id} AND activo = true`
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/comensales', async (req, res) => {
  try {
    const sql = db()
    const { numero_mesa, mesa_id: directMesaId, username } = req.body
    let mesa_id = directMesaId
    if (!mesa_id && numero_mesa) {
      const [mesa] = await sql`
        SELECT id FROM public.mesas
        WHERE restaurante_id = ${RESTAURANTE_ID} AND numero_mesa = ${numero_mesa}`
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
      mesa_id = mesa.id
    }
    const [row] = await sql`
      INSERT INTO public.comensales (mesa_id, restaurante_id, username)
      VALUES (${mesa_id}, ${RESTAURANTE_ID}, ${username})
      ON CONFLICT (mesa_id, username) DO UPDATE SET activo = true
      RETURNING id, mesa_id, username, total_cuenta, activo`
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/comensales', async (req, res) => {
  try {
    const sql = db()
    const { mesa_id, activo } = req.body
    await sql`
      UPDATE public.comensales SET activo = ${activo}
      WHERE mesa_id = ${mesa_id} AND restaurante_id = ${RESTAURANTE_ID}`
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── PAGOS ────────────────────────────────────────────────────────────────────
app.get('/api/pagos', async (req, res) => {
  try {
    const sql = db()
    const { mesa_id } = req.query
    const rows = mesa_id
      ? await sql`
          SELECT id, mesa_id, monto, metodo, referencia, creado_en
          FROM public.pagos
          WHERE restaurante_id = ${RESTAURANTE_ID} AND mesa_id = ${mesa_id}
          ORDER BY creado_en DESC`
      : await sql`
          SELECT id, mesa_id, monto, metodo, referencia, creado_en
          FROM public.pagos
          WHERE restaurante_id = ${RESTAURANTE_ID}
          ORDER BY creado_en DESC LIMIT 100`
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/pagos', async (req, res) => {
  try {
    const sql = db()
    const { mesa_id, monto, metodo, referencia = null } = req.body
    const [row] = await sql`
      INSERT INTO public.pagos (restaurante_id, mesa_id, monto, metodo, referencia)
      VALUES (${RESTAURANTE_ID}, ${mesa_id}, ${monto}, ${metodo}, ${referencia})
      RETURNING id, mesa_id, monto, metodo, referencia, creado_en`
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`[api] dev server en :${PORT}`))
