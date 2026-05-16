import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from './LiveSyncContext.jsx'

const STORAGE_KEY = 'santa-fe:qr-tokens'

// Estados del token: 'pendiente' | 'activo' | 'usado' | 'expirado'
// NOTA: los tokens ya no expiran por tiempo. `expires_at = null` significa
// "sin expiración"; el campo se conserva para compatibilidad con la futura
// migración a backend (donde podría usarse para revocación programada).

const TokensCtx = createContext(null)

function uuidv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function leerTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function TokensProvider({ children }) {
  const [tokens, setTokens] = useState(leerTokens)
  const { serverState, sendMessage, connected } = useLiveSync() || {}
  const initSent = useRef(false)

  // ── Sync con el server WS ────────────────────────────────────────────────
  // Al conectar, envía el estado local para mergearlo (parte importante para
  // que los tokens generados estando offline lleguen al server al reconectar).
  useEffect(() => {
    if (!connected) { initSent.current = false; return }
    if (initSent.current) return
    sendMessage?.({ type: 'sync:init', state: { tokens } })
    initSent.current = true
  }, [connected, tokens, sendMessage])

  // Cuando el server difunde `sync:state`, sobreescribimos el estado local.
  // Así un dispositivo distinto (el teléfono) recibe los tokens generados
  // en otro dispositivo (la laptop de recepción).
  useEffect(() => {
    if (Array.isArray(serverState?.tokens)) {
      setTokens(serverState.tokens)
    }
  }, [serverState?.tokens])

  // Persistencia local (cache offline)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens)) } catch {}
  }, [tokens])

  const syncTokens = useCallback((next) => {
    if (!connected) return
    sendMessage?.({ type: 'sync:tokens', tokens: next })
  }, [connected, sendMessage])

  // ── Operaciones ─────────────────────────────────────────────────────────
  const generarTokenParaMesa = useCallback((mesaId, generadoPor) => {
    const now = Date.now()
    const nuevo = {
      id: `tok-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      mesa_id: mesaId,
      token: uuidv4(),
      generado_por: generadoPor || null,
      estado: 'pendiente',
      created_at: now,
      expires_at: null,   // sin expiración
      used_at: null,
      used_by: null,
    }
    setTokens((prev) => {
      // Invalida cualquier token previo aún válido para esa misma mesa.
      // (Una mesa puede tener varios clientes uniéndose con el mismo token,
      //  pero un token nuevo "rota" al anterior para que pierda validez.)
      const cleaned = prev.map((t) => (
        t.mesa_id === mesaId && t.estado === 'pendiente'
          ? { ...t, estado: 'expirado' }
          : t
      ))
      const next = [nuevo, ...cleaned]
      syncTokens(next)
      return next
    })
    return nuevo
  }, [syncTokens])

  const buscarPorToken = useCallback((tokenStr) => {
    if (!tokenStr) return null
    return tokens.find((t) => t.token === tokenStr) || null
  }, [tokens])

  const tokenActivoParaMesa = useCallback((mesaId) => {
    return tokens.find(
      (t) => t.mesa_id === mesaId && t.estado === 'pendiente',
    ) || null
  }, [tokens])

  // Marca el token como usado y registra al primer usuario; los siguientes
  // miembros del grupo pueden seguir usándolo SI el estado sigue siendo
  // 'pendiente' (lo dejamos pendiente para reutilizar). Si quieres "un solo
  // uso por mesa", cambia la línea a `estado: 'usado'` en el map.
  const usarToken = useCallback((tokenStr, userId) => {
    const t = tokens.find((x) => x.token === tokenStr)
    if (!t)                       return { ok: false, error: 'Token no encontrado.' }
    if (t.estado === 'expirado')  return { ok: false, error: 'Este código ya fue revocado.' }
    // Permite múltiples usos mientras el estado siga pendiente.
    const now = Date.now()
    setTokens((prev) => {
      const next = prev.map((x) => x.id === t.id ? {
        ...x,
        // mantener 'pendiente' para permitir varios miembros del grupo;
        // sólo registramos el primer uso si aún no había uno.
        used_at: x.used_at || now,
        used_by: x.used_by || userId || null,
      } : x)
      syncTokens(next)
      return next
    })
    return { ok: true, token: t }
  }, [tokens, syncTokens])

  // Invalida tokens cuando la mesa se libera (cobro/limpieza). Tras esto,
  // si la mesa se reutiliza, hay que generar un token nuevo.
  const invalidarTokensDeMesa = useCallback((mesaId) => {
    setTokens((prev) => {
      const next = prev.map((t) => (
        t.mesa_id === mesaId && t.estado === 'pendiente'
          ? { ...t, estado: 'expirado' }
          : t
      ))
      syncTokens(next)
      return next
    })
  }, [syncTokens])

  const value = useMemo(() => ({
    tokens,
    generarTokenParaMesa,
    buscarPorToken,
    tokenActivoParaMesa,
    usarToken,
    invalidarTokensDeMesa,
  }), [tokens, generarTokenParaMesa, buscarPorToken, tokenActivoParaMesa, usarToken, invalidarTokensDeMesa])

  return <TokensCtx.Provider value={value}>{children}</TokensCtx.Provider>
}

export function useTokens() {
  const ctx = useContext(TokensCtx)
  if (!ctx) throw new Error('useTokens debe usarse dentro de <TokensProvider>')
  return ctx
}
