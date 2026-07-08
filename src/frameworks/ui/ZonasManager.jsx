import { useEffect, useState } from 'react'
import { MapPin, Plus, Trash2, Check, X, Loader2 } from 'lucide-react'
import { db } from '../../adapters/db.js'
import { useToast } from '../state/ToastContext.jsx'

/* Modal de administración de zonas (admin/gerente).
   Al cerrar avisa con onChanged() para que el tablero recargue zonas/mesas. */
export default function ZonasManager({ zonas = [], onClose, onChanged }) {
  const toast = useToast()
  const [items, setItems] = useState(zonas)
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editNombre, setEditNombre] = useState('')

  useEffect(() => { setItems(zonas) }, [zonas])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function crear(e) {
    e.preventDefault()
    const n = nombre.trim()
    if (!n || creando) return
    setCreando(true)
    try {
      const z = await db.zonas.create({ nombre: n, orden: items.length })
      setItems(prev => [...prev, z])
      setNombre('')
      onChanged?.()
    } catch (err) { toast.error(err.message || 'No se pudo crear la zona.') }
    finally { setCreando(false) }
  }

  async function guardarNombre(id) {
    const n = editNombre.trim()
    if (!n) { setEditId(null); return }
    try {
      const z = await db.zonas.update(id, { nombre: n })
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...z } : i))
      setEditId(null)
      onChanged?.()
    } catch (err) { toast.error(err.message || 'No se pudo renombrar.') }
  }

  async function eliminar(id) {
    try {
      await db.zonas.remove(id)
      setItems(prev => prev.filter(i => i.id !== id))
      onChanged?.()
    } catch (err) { toast.error(err.message || 'No se pudo eliminar.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
            <MapPin size={16} className="text-[#A85638]" /> Zonas del salón
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300" aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={crear} className="flex gap-2 mb-4">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nueva zona (ej. Terraza, Salón, Barra)"
            className="flex-1 px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#A85638]"
          />
          <button type="submit" disabled={creando || !nombre.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#A85638] text-white text-sm font-bold hover:bg-[#8F4527] disabled:opacity-40 transition-colors">
            {creando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Añadir
          </button>
        </form>

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Aún no hay zonas. Crea la primera arriba.</p>
        ) : (
          <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
            {items.map(z => (
              <li key={z.id} className="flex items-center gap-2 px-3 py-2 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
                {editId === z.id ? (
                  <>
                    <input
                      autoFocus
                      value={editNombre}
                      onChange={e => setEditNombre(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && guardarNombre(z.id)}
                      className="flex-1 px-2 py-1 rounded-lg text-sm bg-white dark:bg-slate-950 border border-[#A85638] text-slate-800 dark:text-slate-100 focus:outline-none"
                    />
                    <button onClick={() => guardarNombre(z.id)} className="text-emerald-600 hover:text-emerald-700"><Check size={16} /></button>
                    <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                  </>
                ) : (
                  <>
                    <span className="w-6 h-6 rounded-lg bg-[#7D8B6A]/15 text-[#7D8B6A] dark:text-[#AEBC97] flex items-center justify-center shrink-0"><MapPin size={12} /></span>
                    <button onClick={() => { setEditId(z.id); setEditNombre(z.nombre) }} className="flex-1 text-left text-sm font-bold text-slate-800 dark:text-slate-100 truncate hover:text-[#A85638]">{z.nombre}</button>
                    <button onClick={() => eliminar(z.id)} title="Eliminar zona" className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">Al eliminar una zona, sus mesas quedan sin zona (no se borran).</p>
      </div>
    </div>
  )
}
