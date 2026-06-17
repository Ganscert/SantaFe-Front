/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)

const CFG = {
  success: { icon: CheckCircle2,  cls: 'bg-emerald-700 text-white' },
  error:   { icon: AlertTriangle, cls: 'bg-[#B3422F] text-white' },
  info:    { icon: Info,          cls: 'bg-slate-900 text-[#F6EEE3] dark:bg-[#F1E8D9] dark:text-[#2C2118]' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((tipo, mensaje, duracion = 4000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev.slice(-3), { id, tipo, mensaje }])
    if (duracion > 0) setTimeout(() => dismiss(id), duracion)
    return id
  }, [dismiss])

  const toast = useMemo(() => ({
    success: (m, d) => push('success', m, d),
    error:   (m, d) => push('error', m, d),
    info:    (m, d) => push('info', m, d),
  }), [push])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 inset-x-0 z-[90] flex flex-col items-center gap-2 px-4 pointer-events-none"
      >
        {toasts.map(t => {
          const { icon: Icon, cls } = CFG[t.tipo] ?? CFG.info
          return (
            <div
              key={t.id}
              role="status"
              className={`toast-in pointer-events-auto flex items-center gap-2.5 max-w-md w-fit px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold ${cls}`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="min-w-0">{t.mensaje}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 ml-1 opacity-70 hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
