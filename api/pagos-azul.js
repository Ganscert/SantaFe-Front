import { getDB, RESTAURANTE_ID } from './_supabase.js'
import {
  azulIsLive, buildAzulRequest, verifyAzulResponse, azulSandboxApproval, azulConfig,
} from './_azul.js'

// Registra el pago en la BD (idempotente) y marca los pedidos como cobrados.
// Reutiliza la misma lógica que /api/pagos para mantener una sola fuente de verdad.
async function registrarPago(sb, { mesa_id, monto, referencia }) {
  const sixtySecsAgo = new Date(Date.now() - 60_000).toISOString()
  const { data: existing } = await sb.from('pagos')
    .select('id, mesa_id, monto, metodo, referencia, creado_en')
    .eq('restaurante_id', RESTAURANTE_ID).eq('mesa_id', mesa_id)
    .eq('monto', monto).eq('metodo', 'tarjeta').gt('creado_en', sixtySecsAgo)
    .limit(1).maybeSingle()
  if (existing) return existing

  const { data, error } = await sb.from('pagos')
    .insert({ restaurante_id: RESTAURANTE_ID, mesa_id, monto, metodo: 'tarjeta', referencia })
    .select('id, mesa_id, monto, metodo, referencia, creado_en').single()
  if (error) throw error

  const { error: rpcErr } = await sb.rpc('marcar_pedidos_cobrados', { p_mesa_id: mesa_id, p_pago_id: data.id })
  if (rpcErr) {
    await sb.from('pedidos')
      .update({ cobrado_en: new Date().toISOString(), pago_id: data.id })
      .eq('mesa_id', mesa_id).eq('restaurante_id', RESTAURANTE_ID).is('cobrado_en', null)
  }
  return data
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const action = req.query?.action || req.body?.action
  const c = azulConfig()

  try {
    // ── Crear sesión de pago: devuelve el formulario de la Página de Pagos ──
    if (action === 'session') {
      const { mesa_id, monto } = req.body || {}
      if (!mesa_id || !(Number(monto) > 0)) {
        return res.status(400).json({ error: 'mesa_id y monto (>0) requeridos.' })
      }
      const orderNumber = 'SF' + Date.now().toString().slice(-12)
      const built = buildAzulRequest({ orderNumber, amount: monto, mesaId: mesa_id })
      return res.json({
        mode: azulIsLive() ? 'live' : 'sandbox',
        env: c.env,
        ...built,
      })
    }

    // ── Aprobación simulada (sólo sandbox) ──
    if (action === 'sandbox-approve') {
      if (azulIsLive()) return res.status(400).json({ error: 'Azul está en modo live; usa la redirección real.' })
      const { orderNumber } = req.body || {}
      const approval = azulSandboxApproval(orderNumber)
      return res.json({ ok: true, ...approval })
    }

    // ── Callback de Azul (modo live): valida hash y registra el pago ──
    if (action === 'callback') {
      const body = { ...req.query, ...req.body }
      const { valid, approved } = verifyAzulResponse(body)
      const mesa_id = body.CustomField1Value
      const monto   = (Number(body.Amount) || 0) / 100
      const estado  = req.query?.estado

      if (valid && approved && estado === 'approved' && mesa_id && monto > 0) {
        try {
          await registrarPago(getDB(), {
            mesa_id, monto,
            referencia: `AZUL:${body.OrderNumber}:${body.AuthorizationCode || ''}`,
          })
        } catch (e) {
          console.error('[pagos-azul.callback] registrar pago falló:', e.message)
        }
        return res.redirect(`${c.baseUrl}/cajero/cobros?azul=ok`)
      }
      const motivo = estado === 'cancel' ? 'cancelado' : 'rechazado'
      return res.redirect(`${c.baseUrl}/cajero/cobros?azul=${motivo}`)
    }

    return res.status(400).json({ error: 'action no reconocida (session | sandbox-approve | callback).' })
  } catch (e) {
    console.error('[api/pagos-azul]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
