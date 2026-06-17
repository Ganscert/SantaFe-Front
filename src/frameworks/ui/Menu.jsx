import { useMemo, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, ImageIcon, Star, Search, EyeOff } from 'lucide-react'
import ingredientes from '../assets/data/ingredientes.js'
import { usePlatos } from '../state/PlatosContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'

const CATEGORIAS = ['Todos', 'Favoritos', 'Entrada', 'Plato Principal', 'Postre', 'Bebida']
const FAVORITOS_KEY = 'santa-fe:menu-favoritos'

function leerFavoritos() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITOS_KEY))
    return new Set(Array.isArray(raw) ? raw : [])
  } catch {
    return new Set()
  }
}

const formatPEN = (n) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0)

function Menu() {
  const [categoria, setCategoria] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [favoritos, setFavoritos] = useState(leerFavoritos)
  const { platos: platosAdmin } = usePlatos()
  const { session } = useAuth()
  const esCliente = session?.role === 'cliente'

  const toggleFavorito = useCallback((nombre) => {
    setFavoritos(prev => {
      const next = new Set(prev)
      if (next.has(nombre)) next.delete(nombre)
      else next.add(nombre)
      try { localStorage.setItem(FAVORITOS_KEY, JSON.stringify([...next])) } catch { /* almacenamiento no disponible */ }
      return next
    })
  }, [])

  // Mezcla: platos del catálogo estático + agregados en /admin/platos.
  // Normalizamos al mismo shape (imagen, ingredientes[], categoria, precio).
  const catalogo = useMemo(() => {
    const base = ingredientes.map((p, i) => ({
      key: `static-${i}`,
      nombre: p.nombre,
      precio: p.precio,
      categoria: p.categoria,
      imagen: p.imagen,
      ingredientes: p.ingredientes,
      origen: 'catalogo',
    }))
    const extra = (platosAdmin || []).map((p) => ({
      key: `admin-${p.id}`,
      nombre: p.nombre,
      precio: p.precio,
      categoria: p.categoria,
      imagen: p.imagenData || null,
      ingredientes: p.ingredientes,
      disponible: p.disponible !== false,
      origen: 'admin',
    }))
    // Los admin van primero para que se vean los recién agregados.
    // El cliente nunca ve platos marcados como no disponibles.
    const combinado = [...extra, ...base]
    return esCliente ? combinado.filter((p) => p.disponible !== false) : combinado
  }, [platosAdmin, esCliente])

  const filtrados = useMemo(() => {
    let lista = catalogo
    if (categoria === 'Favoritos') lista = lista.filter((p) => favoritos.has(p.nombre))
    else if (categoria !== 'Todos') lista = lista.filter((p) => p.categoria === categoria)
    const q = busqueda.trim().toLowerCase()
    if (q) {
      lista = lista.filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.ingredientes || []).some((ing) => String(ing).toLowerCase().includes(q))
      )
    }
    return lista
  }, [catalogo, categoria, favoritos, busqueda])

  // Cerrar modal con ESC
  useEffect(() => {
    if (!seleccionado) return
    const onKey = (e) => { if (e.key === 'Escape') setSeleccionado(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seleccionado])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-[#E5D9C9] dark:border-slate-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-5 pl-16 lg:pl-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Menú Santa Fe</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Gastronomía peruana de autor</p>
            </div>
            <div className="flex gap-2">
              <Link to="/tablero-mesas" className="rounded-xl bg-[#A85638] text-white px-4 py-2 text-sm font-bold hover:bg-[#8F4527] transition-colors">
                Tablero
              </Link>
              <Link to="/cocina/pendientes" className="rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cocina
              </Link>
            </div>
          </div>

          {/* Búsqueda */}
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar plato o ingrediente…"
              style={{ fontSize: '16px' }}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-[#E5D9C9] dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-[#A85638] focus:ring-2 focus:ring-[#A85638]/10 transition-all"
            />
          </div>

          {/* Filtro categorías */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                  categoria === c
                    ? 'bg-[#A85638] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {c === 'Favoritos' && <Star size={12} className={categoria === c ? 'fill-white' : 'fill-[#C99A3C] text-[#C99A3C]'} />}
                {c}
                {c === 'Favoritos' && favoritos.size > 0 && (
                  <span className="text-[10px] font-black opacity-80">({favoritos.size})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Grid de platos */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtrados.map((plato) => (
            <article
              key={plato.key}
              onClick={() => setSeleccionado(plato)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSeleccionado(plato) } }}
              className={`cursor-pointer bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm ring-1 ring-[#E5D9C9] dark:ring-slate-800 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#A85638] transition-all ${plato.disponible === false ? 'opacity-75' : ''}`}
            >
              <div className="relative w-full h-44 bg-[#F6EEE3] dark:bg-slate-800 flex items-center justify-center">
                {plato.imagen ? (
                  <img src={plato.imagen} alt={plato.nombre} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={44} className="text-slate-300 dark:text-slate-600" />
                )}
                {plato.origen === 'admin' && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#C99A3C] text-white shadow-sm">
                    Nuevo
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFavorito(plato.nombre) }}
                  aria-label={favoritos.has(plato.nombre) ? `Quitar ${plato.nombre} de favoritos` : `Agregar ${plato.nombre} a favoritos`}
                  className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                >
                  <Star
                    size={15}
                    className={favoritos.has(plato.nombre) ? 'fill-[#C99A3C] text-[#C99A3C]' : 'text-slate-400'}
                  />
                </button>
                {plato.disponible === false && (
                  <span className="absolute inset-x-0 bottom-0 bg-red-600/90 text-white text-[11px] font-bold uppercase tracking-widest py-1 inline-flex items-center justify-center gap-1">
                    <EyeOff size={12} /> No disponible
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-50">{plato.nombre}</h3>
                    <span className="text-xs text-[#7D8B6A] dark:text-[#AEBC97] font-semibold">{plato.categoria}</span>
                  </div>
                  <span className="text-[#A85638] dark:text-[#C99A3C] font-black text-lg whitespace-nowrap">
                    {formatPEN(plato.precio)}
                  </span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {plato.ingredientes.slice(0, 4).map((ing, j) => (
                    <li
                      key={j}
                      className="text-xs bg-[#F6EEE3] dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full border border-[#E5D9C9] dark:border-slate-700"
                    >
                      {ing}
                    </li>
                  ))}
                  {plato.ingredientes.length > 4 && (
                    <li className="text-xs text-slate-400 dark:text-slate-500 px-2 py-0.5">
                      +{plato.ingredientes.length - 4} más
                    </li>
                  )}
                </ul>
              </div>
            </article>
          ))}
        </div>

        {filtrados.length === 0 && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-[#E5D9C9] dark:ring-slate-800 px-6 py-16 text-center">
            <p className="font-bold text-slate-700 dark:text-slate-200">Sin platos en esta categoría</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Prueba con otra opción del filtro.</p>
          </div>
        )}
      </main>

      {/* Modal detalle */}
      {seleccionado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plato-detalle-title"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSeleccionado(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="relative h-56 bg-[#F6EEE3] dark:bg-slate-800 flex items-center justify-center shrink-0">
              {seleccionado.imagen ? (
                <img src={seleccionado.imagen} alt={seleccionado.nombre} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <ImageIcon size={56} className="text-slate-300 dark:text-slate-600" />
              )}
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                aria-label="Cerrar"
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
              <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 text-[#7D8B6A] dark:text-[#AEBC97] border border-[#E5D9C9] dark:border-slate-700">
                {seleccionado.categoria}
              </span>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 id="plato-detalle-title" className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  {seleccionado.nombre}
                </h3>
                <span className="text-[#A85638] dark:text-[#C99A3C] font-black text-2xl whitespace-nowrap">
                  {formatPEN(seleccionado.precio)}
                </span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Ingredientes ({seleccionado.ingredientes.length})
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {seleccionado.ingredientes.map((ing, i) => (
                  <li
                    key={i}
                    className="text-sm bg-[#F6EEE3] dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-1 rounded-full border border-[#E5D9C9] dark:border-slate-700"
                  >
                    {ing}
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-5 pb-5 pt-2 border-t border-[#E5D9C9] dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="px-5 py-2.5 rounded-xl bg-[#A85638] text-white text-sm font-bold hover:bg-[#8F4527] transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Menu
