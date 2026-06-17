// ─── Pasarela de pago Azul (Banco Popular Dominicano) ───────────────────────
// Integración vía "Página de Pagos" (Payment Page): el navegador hace POST de un
// formulario con un AuthHash (HMAC-SHA512) calculado en el servidor con la llave
// secreta — la llave NUNCA llega al browser.
//
// Credenciales (server-side, en .env.local):
//   AZUL_MERCHANT_ID     MerchantId entregado por Azul
//   AZUL_MERCHANT_NAME   Nombre comercial mostrado en la página de pago
//   AZUL_MERCHANT_TYPE   Tipo de comercio (categoría Azul)
//   AZUL_AUTH_KEY        Llave para el AuthHash (HMAC-SHA512)
//   AZUL_CURRENCY        CurrencyCode ("$" = DOP por defecto)
//   AZUL_ENV             "prod" usa pagos.azul.com.do; cualquier otro → pruebas
//   AZUL_PUBLIC_BASE_URL Base pública para los callbacks (Approved/Declined/Cancel)
//
// Si AZUL_MERCHANT_ID o AZUL_AUTH_KEY no están configurados (o son el placeholder),
// la integración corre en modo "sandbox": misma construcción de request, pero la
// aprobación se simula localmente para poder probar el flujo de punta a punta sin
// una cuenta real.

import crypto from 'crypto'

const PLACEHOLDER = new Set(['', 'TU_MERCHANT_ID', 'changeme', 'placeholder', undefined, null])

export function azulConfig() {
  return {
    merchantId:   process.env.AZUL_MERCHANT_ID || '',
    merchantName: process.env.AZUL_MERCHANT_NAME || 'Restaurante Santa Fe',
    merchantType: process.env.AZUL_MERCHANT_TYPE || 'Restaurante',
    authKey:      process.env.AZUL_AUTH_KEY || '',
    currency:     process.env.AZUL_CURRENCY || '$',
    env:          (process.env.AZUL_ENV || 'test').toLowerCase(),
    baseUrl:      process.env.AZUL_PUBLIC_BASE_URL || 'http://localhost:5173',
  }
}

// ¿Hay credenciales reales para redirigir a la página de pago de Azul?
export function azulIsLive() {
  const c = azulConfig()
  return !PLACEHOLDER.has(c.merchantId) && !PLACEHOLDER.has(c.authKey)
}

export function azulPaymentUrl() {
  const c = azulConfig()
  return c.env === 'prod'
    ? 'https://pagos.azul.com.do/PaymentPage/Default.aspx'
    : 'https://pruebas.azul.com.do/PaymentPage/Default.aspx'
}

// Convierte un monto decimal (S/ 123.45) al formato Azul: entero en centavos sin separadores.
export function toAzulAmount(value) {
  return String(Math.round((Number(value) || 0) * 100))
}

// HMAC-SHA512 (hex) con la AuthKey sobre la concatenación de los campos en orden.
function hmac(message, key) {
  return crypto.createHmac('sha512', key).update(message, 'utf8').digest('hex')
}

// Construye los campos del formulario de la Página de Pagos + su AuthHash.
// `orderNumber` debe ser único por intento de cobro.
export function buildAzulRequest({ orderNumber, amount, mesaId = '', itbis = '000', returnTo = '' }) {
  const c = azulConfig()
  // `returnTo` viaja en las URLs de callback (Azul hace POST a estas mismas URLs,
  // preservando el query) para saber si redirigir al cliente (/mi-mesa) o al cajero.
  const rt = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''
  const approvedUrl = `${c.baseUrl}/api/pagos-azul?action=callback&estado=approved${rt}`
  const declinedUrl = `${c.baseUrl}/api/pagos-azul?action=callback&estado=declined${rt}`
  const cancelUrl   = `${c.baseUrl}/api/pagos-azul?action=callback&estado=cancel${rt}`
  const amountStr   = toAzulAmount(amount)

  // mesa_id y monto viajan en CustomFields: Azul los devuelve en el callback,
  // permitiendo registrar el pago aunque el navegador esté en la página de Azul.
  const fields = {
    MerchantId:        c.merchantId,
    MerchantName:      c.merchantName,
    MerchantType:      c.merchantType,
    CurrencyCode:      c.currency,
    OrderNumber:       orderNumber,
    Amount:            amountStr,
    ITBIS:             itbis,
    ApprovedUrl:       approvedUrl,
    DeclinedUrl:       declinedUrl,
    CancelUrl:         cancelUrl,
    UseCustomField1:   mesaId ? '1' : '0',
    CustomField1Label: 'mesa_id',
    CustomField1Value: mesaId || '',
    UseCustomField2:   '1',
    CustomField2Label: 'monto',
    CustomField2Value: amountStr,
  }

  // Orden exacto requerido por Azul para el AuthHash de la solicitud.
  const message = [
    fields.MerchantId, fields.MerchantName, fields.MerchantType, fields.CurrencyCode,
    fields.OrderNumber, fields.Amount, fields.ITBIS, fields.ApprovedUrl,
    fields.DeclinedUrl, fields.CancelUrl, fields.UseCustomField1,
    fields.CustomField1Label, fields.CustomField1Value, fields.UseCustomField2,
    fields.CustomField2Label, fields.CustomField2Value,
  ].join('') + c.authKey

  fields.AuthHash = hmac(message, c.authKey)
  return { url: azulPaymentUrl(), fields, orderNumber, amount: Number(amount) }
}

// Verifica el AuthHash que Azul devuelve en el callback de respuesta.
export function verifyAzulResponse(body = {}) {
  const c = azulConfig()
  const message = [
    body.OrderNumber, body.Amount, body.AuthorizationCode, body.DateTime,
    body.ResponseCode, body.ISOCode, body.ResponseMessage, body.ErrorDescription,
    body.RRN,
  ].map(v => v ?? '').join('') + c.authKey
  const expected = hmac(message, c.authKey)
  const approved = String(body.ResponseCode || '').toLowerCase() === 'approved' ||
                   body.IsoCode === '00' || body.ISOCode === '00'
  return { valid: expected === body.AuthHash, approved }
}

// Genera una aprobación simulada (modo sandbox) con el mismo shape que Azul.
export function azulSandboxApproval(orderNumber) {
  return {
    approved: true,
    AuthorizationCode: 'SBX' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    RRN: String(Date.now()).slice(-12),
    OrderNumber: orderNumber,
    ISOCode: '00',
    ResponseMessage: 'APROBADA (sandbox)',
  }
}
