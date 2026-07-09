// Seguimiento de actividad para auditoría (/admin/actividad).
//
// Acumula eventos (navegación, clics, acciones) y los manda por lotes a
// /api/actividad. Sólo trackea sesiones autenticadas; si la tabla aún no
// existe en Supabase la API responde { missingTable } y el tracker se apaga
// solo para no hacer ruido.

import { authToken, db } from './db.js'

const FLUSH_MS = 5000
const MAX_BUFFER = 40
const SESSION_KEY = 'santa-fe:session'

let buffer = []
let timer = null
let apagado = false // la tabla no existe → dejar de intentar en esta sesión

function sesion() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}

export async function flushActividad() {
  if (timer) { clearTimeout(timer); timer = null }
  if (apagado || !buffer.length || !authToken()) return
  const lote = buffer
  buffer = []
  try {
    const res = await db.actividad.registrar(lote)
    if (res?.missingTable) apagado = true
  } catch { /* sin red o sesión caída: se pierde el lote, no es crítico */ }
}

/**
 * Registra un evento de actividad.
 * @param {'navegacion'|'click'|'accion'|'sesion'} tipo
 * @param {string} accion  descripción corta ("Clic: Cobrar", "Visitó /menu")
 * @param {{ruta?: string, detalle?: object}} [extra]
 */
export function track(tipo, accion, extra = {}) {
  if (apagado || !authToken()) return
  const s = sesion()
  buffer.push({
    tipo,
    accion,
    ruta: extra.ruta ?? window.location.pathname,
    detalle: extra.detalle ?? null,
    usuario_email: s?.email ?? null,
    usuario_nombre: s?.name ?? null,
    ts: Date.now(),
  })
  if (buffer.length >= MAX_BUFFER) flushActividad()
  else if (!timer) timer = setTimeout(flushActividad, FLUSH_MS)
}

// Al ocultar/cerrar la pestaña, intentar entregar lo pendiente
// (fetch keepalive dentro de db.js no aplica; este flush es best-effort).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushActividad() })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushActividad()
  })
}

/** Texto legible del elemento clickeado, para la columna "Acción". */
export function describirClick(el) {
  const label = el.getAttribute?.('aria-label') || el.title || ''
  const texto = (label || el.textContent || '').replace(/\s+/g, ' ').trim()
  return texto.slice(0, 80)
}
