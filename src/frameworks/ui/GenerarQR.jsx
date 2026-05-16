import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, QrCode, RotateCcw, X, Check, Wifi, WifiOff } from 'lucide-react'
import { useTokens } from '../state/TokensContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'

/**
 * Modal de generación de QR para unirse a una mesa.
 * El QR no expira por tiempo — sólo se invalida al liberar la mesa o al
 * regenerar manualmente. Esto permite que comensales rezagados se unan.
 */
export default function GenerarQR({ mesa, onClose }) {
  const { generarTokenParaMesa, tokenActivoParaMesa } = useTokens()
  const { session } = useAuth()
  const { connected } = useLiveSync() || {}

  // Guard con ref para evitar la doble generación bajo StrictMode (dev).
  const initRef = useRef(false)
  const [token, setToken] = useState(() => tokenActivoParaMesa(mesa.id))

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    if (!token) {
      setToken(generarTokenParaMesa(mesa.id, session?.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesa.id])

  const [copiado, setCopiado] = useState(false)

  const url = useMemo(() => {
    if (!token) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    return `${origin}/join?token=${token.token}`
  }, [token])

  function regenerar() {
    const nuevo = generarTokenParaMesa(mesa.id, session?.id)
    setToken(nuevo)
    setCopiado(false)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch {}
      document.body.removeChild(ta)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8e0d8] dark:border-slate-800 flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-[#C1440E] text-white flex items-center justify-center shrink-0">
            <QrCode size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="qr-title" className="font-bold text-slate-900 dark:text-slate-50 text-lg leading-tight">
              Código QR para Mesa {mesa.numeroMesa}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Muéstrale este código al cliente para que escanee
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {/* QR */}
          <div className="flex items-center justify-center mb-4">
            <div className="p-4 rounded-2xl bg-white ring-1 ring-[#e8e0d8]">
              {token ? (
                <QRCodeSVG value={url} size={220} bgColor="#FFFFFF" fgColor="#0F172A" level="M" />
              ) : (
                <div className="w-[220px] h-[220px] rounded-xl bg-slate-100 animate-pulse" />
              )}
            </div>
          </div>

          {/* Estado del sync (importante para multi-dispositivo) */}
          <div className={`flex items-center justify-center gap-2 text-xs font-bold mb-4 ${
            connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
          }`}>
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connected
              ? 'Código sincronizado · válido hasta liberar la mesa'
              : 'Sin sincronización — el QR sólo funciona en este dispositivo'}
          </div>

          {/* URL */}
          <div className="rounded-xl bg-[#FDF6EC] dark:bg-slate-800 px-3 py-2 flex items-center gap-2 mb-3">
            <code className="flex-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate" title={url}>
              {url}
            </code>
            <button
              type="button"
              onClick={copiar}
              aria-label="Copiar enlace"
              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                copiado
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {copiado ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* Código de 6 dígitos (alternativa al QR) */}
          {token?.codigo && (
            <div className="rounded-2xl bg-[#C1440E]/5 dark:bg-[#C1440E]/10 ring-1 ring-[#C1440E]/20 px-4 py-3 mb-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-[#C1440E] dark:text-[#D4A017] mb-1">
                O ingresa este código
              </p>
              <p className="text-3xl font-black tracking-[0.4em] text-slate-900 dark:text-slate-50 font-mono">
                {token.codigo}
              </p>
            </div>
          )}

          {token && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate mb-4" title={token.token}>
              token: {token.token}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={regenerar}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw size={14} /> Regenerar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C1440E] hover:bg-[#a33a0c] text-white text-sm font-bold transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
