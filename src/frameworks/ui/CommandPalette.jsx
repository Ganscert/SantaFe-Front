import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { useAuth } from '../state/AuthContext.jsx'
import { rolesFor } from './roleAccess.js'
import { NAV_ITEMS, OPEN_PALETTE_EVENT } from './nav.js'

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function CommandPalette() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const items = useMemo(() => {
    const role = session?.role
    if (!role) return []
    const visibles = NAV_ITEMS.filter(it => rolesFor(it.to).includes(role))
    const q = norm(query.trim())
    if (!q) return visibles
    return visibles.filter(it => norm(it.label).includes(q) || norm(it.to).includes(q))
  }, [session?.role, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }, [])

  // Atajo ⌘K / Ctrl+K + evento custom (botón del sidebar)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') close()
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [close])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  if (!open || !session) return null

  const go = (to) => {
    close()
    navigate(to)
  }

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && items[active]) go(items[active].to)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[14vh] px-4" role="dialog" aria-modal="true" aria-label="Buscador de secciones">
      <div className="absolute inset-0 bg-[#0F172A]/55 backdrop-blur-sm" onClick={close} />
      <div className="palette-in relative w-full max-w-lg rounded-3xl bg-[#FFFFFF] dark:bg-slate-900 ring-1 ring-[#E2E8F0] dark:ring-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-[#E2E8F0] dark:border-slate-800">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onInputKey}
            placeholder="Ir a… (tablero, cocina, reservas)"
            className="flex-1 py-4 bg-transparent outline-none text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400"
          />
          <kbd>esc</kbd>
        </div>

        <ul className="max-h-[46vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-400">Sin coincidencias para “{query}”.</li>
          )}
          {items.map((it, i) => {
            const Icon = it.icon
            return (
              <li key={it.to}>
                <button
                  onClick={() => go(it.to)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${
                    i === active
                      ? 'bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#EEF2FF]'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1 truncate">{it.label}</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-400">{it.group}</span>
                  {i === active && <CornerDownLeft size={13} className="text-slate-400" />}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="px-4 py-2.5 border-t border-[#E2E8F0] dark:border-slate-800 flex items-center gap-3 text-[11px] text-slate-400">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span className="ml-auto font-display italic text-[#0EA5E9]">Santa Fe</span>
        </div>
      </div>
    </div>
  )
}
