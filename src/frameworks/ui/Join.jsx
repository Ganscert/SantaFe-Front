import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, QrCode } from 'lucide-react'
import { useAuth, ROLES } from '../state/AuthContext.jsx'
import { useTokens } from '../state/TokensContext.jsx'
import { useMesas } from '../state/MesasContext.jsx'
import { usePedidos } from '../state/PedidosContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { db } from '../../adapters/db.js'

const PENDING_TOKEN_KEY = 'santa-fe:pending-join-token'
const ACTIVE_CLIENT_MESA_KEY = 'santa-fe:client-mesa'

async function registrarComensal(mesa, session) {
  const username = (session?.name || session?.id || '').trim()
  if (!username) return { ok: false, error: 'Sesión sin nombre de usuario.' }
  try {
    await db.comensales.upsert({ numero_mesa: mesa.numeroMesa, username })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// Tiempo máximo de espera para que llegue el estado del WS antes de fallar.
// Necesario para escenarios cross-device: el teléfono del cliente no tiene
// los tokens en localStorage, así que hay que darle un momento al WS para
// sincronizar el estado desde el dispositivo que generó el QR.
const WAIT_FOR_SYNC_MS = 4000

export default function Join() {
  const [params] = useSearchParams()
  const tokenStr = params.get('token')
  const codigoParam = params.get('codigo')
  const navigate = useNavigate()

  const { session } = useAuth()
  const { tokens, buscarPorToken, buscarPorCodigo, usarToken } = useTokens()
  const { mesas, cambiarEstadoA, actualizarMesa } = useMesas()
  const { transferirPedidos } = usePedidos()
  const { connected } = useLiveSync() || {}

  const [status, setStatus] = useState('checking') // checking | success | error
  const [message, setMessage] = useState('')
  // Contador para forzar la re-evaluación del efecto tras el timeout de espera.
  const [tick, setTick] = useState(0)

  // Para asegurar que sólo aplicamos el token una vez aunque tokens cambien
  const consumidoRef = useRef(false)
  // Timestamp de cuándo empezamos a esperar — para no fallar antes del timeout
  const inicioRef = useRef(Date.now())

  // Permite reintentar sin recargar: reinicia la ventana de espera y re-evalúa.
  const reintentar = () => {
    consumidoRef.current = false
    inicioRef.current = Date.now()
    setMessage('')
    setStatus('checking')
    setTick((t) => t + 1)
  }

  useEffect(() => {
    if (consumidoRef.current) return
    if (!tokenStr && !codigoParam) {
      setStatus('error')
      setMessage('Falta el código del enlace.')
      return
    }
    if (!session) {
      // Sólo persistimos el flujo QR (URL con token); el código numérico se
      // re-ingresa en MesaCliente tras el login, no requiere pendingToken.
      if (tokenStr) {
        try { localStorage.setItem(PENDING_TOKEN_KEY, tokenStr) } catch {}
        navigate('/', { replace: true, state: { from: `/join?token=${encodeURIComponent(tokenStr)}` } })
      } else {
        navigate('/', { replace: true })
      }
      return
    }

    const token = tokenStr ? buscarPorToken(tokenStr) : buscarPorCodigo(codigoParam)

    // Aún no llegó del WS y todavía hay tiempo de espera → seguir en 'checking'.
    if (!token) {
      const transcurrido = Date.now() - inicioRef.current
      if (transcurrido < WAIT_FOR_SYNC_MS) {
        const restante = WAIT_FOR_SYNC_MS - transcurrido
        // Forzar re-evaluación tras el timeout incrementando un contador REAL.
        // (Antes se hacía setStatus al mismo valor 'checking', que no
        // re-renderiza → el efecto no volvía a correr y la pantalla quedaba
        // colgada indefinidamente en "Procesando código…".)
        const id = setTimeout(() => setTick((t) => t + 1), restante + 50)
        return () => clearTimeout(id)
      }
      setStatus('error')
      setMessage('El código no es válido o ya fue revocado.')
      return
    }

    if (token.estado === 'expirado') {
      setStatus('error')
      setMessage('Este código fue revocado al liberar la mesa. Pide uno nuevo.')
      return
    }

    const mesa = mesas.find((m) => m.id === token.mesa_id)
    if (!mesa) {
      // Igual que con tokens, espera al WS por si la lista de mesas tarda.
      const transcurrido = Date.now() - inicioRef.current
      if (transcurrido < WAIT_FOR_SYNC_MS) {
        const id = setTimeout(() => setTick((t) => t + 1), WAIT_FOR_SYNC_MS - transcurrido + 50)
        return () => clearTimeout(id)
      }
      setStatus('error')
      setMessage('La mesa asociada al código ya no existe.')
      return
    }

    // ── Validación + aplicación del token (una sola vez) ──
    // Gate de persistencia: el comensal DEBE existir en Supabase antes de
    // mutar nada en el estado local. Si falla, permitimos reintento.
    consumidoRef.current = true
    ;(async () => {
      const reg = await registrarComensal(mesa, session)
      if (!reg.ok) {
        consumidoRef.current = false
        setStatus('error')
        setMessage(reg.error)
        return
      }

      const res = usarToken(token.token, session.id)
      if (!res.ok) {
        setStatus('error')
        setMessage(res.error || 'No se pudo aplicar el código.')
        return
      }

      try {
        localStorage.removeItem(PENDING_TOKEN_KEY)
        localStorage.setItem(ACTIVE_CLIENT_MESA_KEY, JSON.stringify({
          mesaId: mesa.id,
          numeroMesa: mesa.numeroMesa,
          userId: session.id,
          joinedAt: Date.now(),
        }))
      } catch {}

      if (mesa.estado === 'disponible' || mesa.estado === 'por_cobrar') {
        cambiarEstadoA?.(mesa.numeroMesa, 'ocupada')
      }

      // Registrar el comensal en la lista de integrantes y crear su cuenta automáticamente
      const integrantes = mesa.integrantes || []
      const cuentas = mesa.cuentas || []
      const patch = {}

      if (!integrantes.some((i) => i.userId === session.id)) {
        patch.integrantes = [...integrantes, { userId: session.id, nombre: session.name, joinedAt: Date.now() }]
      }

      if (!cuentas.some((c) => c.userId === session.id)) {
        const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36)
        patch.cuentas = [...cuentas, { id: newId, nombre: session.name, abierta: true, creadaEn: Date.now(), userId: session.id }]
      }

      if (Object.keys(patch).length > 0) {
        actualizarMesa?.(mesa.numeroMesa, patch)
      }

      // Aplicar transferencia pendiente (cuando el cliente cambia de mesa)
      const newCuentaId = patch.cuentas
        ? patch.cuentas[patch.cuentas.length - 1].id
        : cuentas.find((c) => c.userId === session.id)?.id

      try {
        const raw = localStorage.getItem('santa-fe:pending-transfer')
        const transfer = raw ? JSON.parse(raw) : null
        if (transfer && newCuentaId && transfer.oldMesaNumero !== mesa.numeroMesa) {
          transferirPedidos(transfer.oldMesaNumero, transfer.cuentaId, mesa.numeroMesa, newCuentaId)
          localStorage.removeItem('santa-fe:pending-transfer')
        }
      } catch {}

      setStatus('success')
      setMessage(`Te uniste a la Mesa ${mesa.numeroMesa}`)

      const dest = session.role === ROLES.CLIENTE ? '/mi-mesa' : `/mesa/${mesa.numeroMesa}`
      setTimeout(() => navigate(dest, { replace: true }), 900)
    })()
    // tokens y mesas como deps: cuando lleguen del WS, re-evaluamos.
    // `tick` fuerza la re-evaluación tras cada timeout de espera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenStr, codigoParam, session?.id, tokens, mesas, tick])

  if (!session) return <Navigate to="/" replace />

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E2E8F0] dark:ring-slate-800 shadow-sm p-6 text-center">
        {status === 'checking' && (
          <>
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#4F46E5]/10 text-[#4F46E5] flex items-center justify-center mb-3">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">Procesando código…</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {connected ? 'Sincronizando con el servidor.' : 'Conectando…'}
            </p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">¡Listo!</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center mb-3">
              <AlertTriangle size={28} />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">No fue posible unirte</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{message}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={reintentar}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-bold"
              >
                <Loader2 size={14} /> Reintentar
              </button>
              <button
                type="button"
                onClick={() => navigate(session?.role === ROLES.CLIENTE ? '/mi-mesa' : '/tablero-mesas')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <QrCode size={14} /> {session?.role === ROLES.CLIENTE ? 'Otro código' : 'Volver'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
