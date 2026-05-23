import { useMemo, useRef, useState } from 'react'
import {
  ChefHat, ImageIcon, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, Upload, X, Search,
} from 'lucide-react'
import { usePlatos } from '../state/PlatosContext.jsx'
import { supabase } from '../../adapters/supabase.js'

const CATEGORIAS = ['Entrada', 'Plato Principal', 'Postre', 'Bebida']
const BUCKET = 'imagenes-menu'

const FORM_VACIO = {
  nombre: '',
  precio: '',
  categoria: 'Entrada',
  ingredientes: [],
  imagenData: null,    // preview (base64) o URL pública existente al editar
  imagenNombre: '',
  imagenFile: null,    // File real para subir a Storage (sólo en form nuevo)
}

const formatPEN = (n) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0)

const slugify = (s = '') =>
  s
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Sube un File al bucket público `imagenes-menu` y devuelve { url } o { error }.
// El path incluye timestamp para evitar colisiones cuando dos platos comparten slug.
async function subirImagen(nombre, file) {
  if (!supabase) return { error: 'Supabase no configurado.' }
  if (!file)     return { error: 'Archivo vacío.' }
  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${slugify(nombre) || 'plato'}-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (upErr) return { error: upErr.message }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data?.publicUrl, path }
}

export default function AdminPlatos() {
  const { platos, agregarPlato, actualizarPlato, eliminarPlato } = usePlatos()

  const [form, setForm] = useState(FORM_VACIO)
  const [nuevoIngrediente, setNuevoIngrediente] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const fileInputRef = useRef(null)

  const editando = Boolean(editandoId)

  function resetFormulario() {
    setForm(FORM_VACIO)
    setNuevoIngrediente('')
    setEditandoId(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function elegirImagen(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('El archivo seleccionado no es una imagen válida.')
      return
    }
    // Preview local en base64 — la subida real ocurre al hacer Submit.
    const reader = new FileReader()
    reader.onload = () => {
      setForm((f) => ({ ...f, imagenData: reader.result, imagenNombre: file.name, imagenFile: file }))
      setError('')
    }
    reader.onerror = () => setError('No se pudo leer la imagen.')
    reader.readAsDataURL(file)
  }

  function quitarImagen() {
    setForm((f) => ({ ...f, imagenData: null, imagenNombre: '', imagenFile: null }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function agregarIngrediente() {
    const valor = nuevoIngrediente.trim()
    if (!valor) return
    if (form.ingredientes.some((i) => i.toLowerCase() === valor.toLowerCase())) {
      setNuevoIngrediente('')
      return
    }
    setForm((f) => ({ ...f, ingredientes: [...f.ingredientes, valor] }))
    setNuevoIngrediente('')
  }

  function quitarIngrediente(idx) {
    setForm((f) => ({ ...f, ingredientes: f.ingredientes.filter((_, i) => i !== idx) }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const nombre = form.nombre.trim()
    const precio = parseFloat(form.precio)
    if (!nombre) return setError('El nombre del plato es obligatorio.')
    if (!Number.isFinite(precio) || precio <= 0) return setError('Ingresa un precio válido (> 0).')
    if (form.ingredientes.length === 0) return setError('Agrega al menos un ingrediente.')

    // 1) Subir imagen a Storage si hay archivo nuevo. Si el usuario sólo
    //    cambió texto al editar, conservamos la URL existente (imagenData).
    let imagenUrl = form.imagenData || null
    if (form.imagenFile) {
      setSubiendo(true)
      const up = await subirImagen(nombre, form.imagenFile)
      setSubiendo(false)
      if (up.error) {
        setError(`No se pudo subir la imagen: ${up.error}`)
        return
      }
      imagenUrl = up.url
    }

    // 2) Persistir el plato (PlatosContext decide si va a Supabase o local).
    const data = {
      nombre,
      precio,
      categoria: form.categoria,
      ingredientes: form.ingredientes,
      imagenUrl,
      imagenData: imagenUrl,  // alias legacy para componentes que aún lo leen
    }

    const res = editando
      ? await actualizarPlato(editandoId, data)
      : await agregarPlato(data)
    if (res?.ok === false) {
      setError(`No se pudo guardar: ${res.error}`)
      return
    }
    resetFormulario()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cargarParaEditar(p) {
    setForm({
      nombre: p.nombre,
      precio: String(p.precio),
      categoria: p.categoria,
      ingredientes: [...(p.ingredientes || [])],
      imagenData: p.imagenUrl ?? p.imagenData ?? null,
      imagenNombre: p.imagenNombre ?? '',
      imagenFile: null,
    })
    setEditandoId(p.id)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function confirmarEliminar() {
    if (!confirmar) return
    if (confirmar.id === editandoId) resetFormulario()
    eliminarPlato(confirmar.id)
    setConfirmar(null)
  }

  const stats = useMemo(() => {
    const porCat = platos.reduce((acc, p) => {
      acc[p.categoria] = (acc[p.categoria] || 0) + 1
      return acc
    }, {})
    return { total: platos.length, porCat }
  }, [platos])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return platos.filter((p) => {
      if (filtro !== 'Todos' && p.categoria !== filtro) return false
      if (!q) return true
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.ingredientes.some((i) => i.toLowerCase().includes(q))
      )
    })
  }, [platos, filtro, busqueda])

  return (
    <div className="min-h-screen bg-[#FDF6EC] dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-[#e8e0d8] dark:border-slate-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-5 pl-16 lg:pl-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-11 h-11 rounded-xl bg-[#C1440E] text-white flex items-center justify-center shadow-sm shrink-0">
                <ChefHat size={22} />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 truncate">Administrar Platos</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">CRUD del catálogo de cocina</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 rounded-full bg-[#6B7C4F]/10 text-[#6B7C4F] dark:text-[#a3b48a] font-bold text-sm">
                {stats.total} {stats.total === 1 ? 'plato' : 'platos'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* ============ FORMULARIO ============ */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm ring-1 ring-[#e8e0d8] dark:ring-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e8e0d8] dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-50 text-lg">
                {editando ? 'Editar plato' : 'Nuevo plato'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editando ? 'Modificando un plato del catálogo' : 'Agrega un nuevo plato al catálogo'}
              </p>
            </div>
            {editando && (
              <button
                type="button"
                onClick={resetFormulario}
                className="text-sm font-semibold text-slate-500 hover:text-[#C1440E] dark:text-slate-400 inline-flex items-center gap-1"
              >
                <RotateCcw size={14} /> Cancelar edición
              </button>
            )}
          </div>

          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-5 p-5">
            {/* Imagen */}
            <div className="md:col-span-1">
              <p className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Imagen del plato
              </p>
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#FDF6EC] dark:bg-slate-800 border-2 border-dashed border-[#e8e0d8] dark:border-slate-700 flex items-center justify-center">
                {form.imagenData ? (
                  <>
                    <img
                      src={form.imagenData}
                      alt="Previsualización"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={quitarImagen}
                      aria-label="Quitar imagen"
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <div className="text-center px-4">
                    <ImageIcon size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Sin imagen</p>
                  </div>
                )}
              </div>
              <label className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors">
                <Upload size={16} />
                <span>{form.imagenData ? 'Cambiar imagen' : 'Subir imagen'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={elegirImagen}
                />
              </label>
              {form.imagenNombre && (
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate" title={form.imagenNombre}>
                  📁 {form.imagenNombre}
                </p>
              )}
            </div>

            {/* Campos */}
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre del plato">
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej. Ceviche mixto"
                    className={inputCls}
                  />
                </Field>
                <Field label="Precio (S/)">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.10"
                    min="0"
                    value={form.precio}
                    onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Categoría">
                <select
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  className={inputCls}
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={`Ingredientes (${form.ingredientes.length})`}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nuevoIngrediente}
                    onChange={(e) => setNuevoIngrediente(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        agregarIngrediente()
                      }
                    }}
                    placeholder="Ej. Cebolla morada — presiona Enter o Agregar"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={agregarIngrediente}
                    className="px-4 py-2.5 rounded-xl bg-[#6B7C4F] text-white text-sm font-bold hover:bg-[#566437] transition-colors inline-flex items-center gap-1 shrink-0"
                  >
                    <Plus size={16} /> <span className="hidden sm:inline">Agregar</span>
                  </button>
                </div>
                {form.ingredientes.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {form.ingredientes.map((ing, i) => (
                      <li
                        key={`${ing}-${i}`}
                        className="inline-flex items-center gap-1.5 text-xs bg-[#FDF6EC] dark:bg-slate-800 text-slate-700 dark:text-slate-200 pl-2.5 pr-1.5 py-1 rounded-full border border-[#e8e0d8] dark:border-slate-700"
                      >
                        {ing}
                        <button
                          type="button"
                          onClick={() => quitarIngrediente(i)}
                          aria-label={`Quitar ${ing}`}
                          className="w-4 h-4 rounded-full bg-slate-200 hover:bg-red-500 text-slate-500 hover:text-white dark:bg-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="submit"
                  disabled={subiendo}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C1440E] text-white text-sm font-bold hover:bg-[#a33a0c] disabled:opacity-60 transition-colors shadow-sm"
                >
                  {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {subiendo ? 'Subiendo…' : (editando ? 'Guardar cambios' : 'Crear plato')}
                </button>
                <button
                  type="button"
                  onClick={resetFormulario}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* ============ TOOLBAR + GALERÍA ============ */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Catálogo</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato o ingrediente"
                  className="pl-8 pr-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-900 border border-[#e8e0d8] dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C1440E]/30 focus:border-[#C1440E]"
                />
              </div>
              <select
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-900 border border-[#e8e0d8] dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#C1440E]/30 focus:border-[#C1440E]"
              >
                <option value="Todos">Todas las categorías</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {platos.length === 0 ? (
            <EmptyState
              titulo="Aún no hay platos"
              texto="Crea el primero usando el formulario de arriba."
            />
          ) : visibles.length === 0 ? (
            <EmptyState
              titulo="Sin resultados"
              texto="Ajusta el filtro o la búsqueda para ver más platos."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibles.map((p) => (
                <article
                  key={p.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm ring-1 transition-all flex flex-col hover:-translate-y-0.5 hover:shadow-md ${
                    editandoId === p.id
                      ? 'ring-[#C1440E] dark:ring-[#D4A017]'
                      : 'ring-[#e8e0d8] dark:ring-slate-800'
                  }`}
                >
                  <div className="relative h-44 bg-[#FDF6EC] dark:bg-slate-800 flex items-center justify-center">
                    {(p.imagenUrl || p.imagenData) ? (
                      <img
                        src={p.imagenUrl || p.imagenData}
                        alt={p.nombre}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={44} className="text-slate-300 dark:text-slate-600" />
                    )}
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/95 dark:bg-slate-900/95 text-[#6B7C4F] dark:text-[#a3b48a] border border-[#e8e0d8] dark:border-slate-700">
                      {p.categoria}
                    </span>
                    {editandoId === p.id && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#C1440E] text-white">
                        Editando
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-slate-900 dark:text-slate-50 leading-tight">
                        {p.nombre}
                      </h3>
                      <span className="text-[#C1440E] dark:text-[#D4A017] font-black text-lg whitespace-nowrap">
                        {formatPEN(p.precio)}
                      </span>
                    </div>
                    <ul className="flex flex-wrap gap-1 mb-3">
                      {(p.ingredientes || []).slice(0, 4).map((ing, j) => (
                        <li
                          key={`${p.id}-ing-${j}`}
                          className="text-xs bg-[#FDF6EC] dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full border border-[#e8e0d8] dark:border-slate-700"
                        >
                          {ing}
                        </li>
                      ))}
                      {(p.ingredientes || []).length > 4 && (
                        <li className="text-xs text-slate-400 dark:text-slate-500 px-2 py-0.5">
                          +{p.ingredientes.length - 4} más
                        </li>
                      )}
                    </ul>
                    <div className="mt-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => cargarParaEditar(p)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmar(p)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ============ MODAL DE CONFIRMACIÓN ============ */}
      {confirmar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmar(null)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ring-1 ring-[#e8e0d8] dark:ring-slate-800 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center">
                  <Trash2 size={18} />
                </span>
                <h3 id="confirm-title" className="font-bold text-slate-900 dark:text-slate-50 text-lg">
                  Eliminar plato
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                ¿Seguro que quieres eliminar <strong>{confirmar.nombre}</strong> del catálogo?
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="px-5 pb-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmar(null)}
                className="px-4 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminar}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} /> Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================ helpers de UI ============================ */

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-[#e8e0d8] dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C1440E]/30 focus:border-[#C1440E] transition-colors'

function Field({ label, children }) {
  return (
    <div>
      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        {label}
      </span>
      {children}
    </div>
  )
}

function EmptyState({ titulo, texto }) {
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-[#e8e0d8] dark:ring-slate-800 px-6 py-16 text-center">
      <ChefHat size={42} className="mx-auto text-slate-300 dark:text-slate-600" />
      <p className="mt-3 font-bold text-slate-700 dark:text-slate-200">{titulo}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{texto}</p>
    </div>
  )
}
