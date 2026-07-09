import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { RESTAURANTE_ID } from '../../adapters/db.js'
import { useAuth } from './AuthContext.jsx'

// Contexto de auditoría multi-restaurante.
//
// Cuando el ADMIN entra a una sede desde el panel de plataforma, esa sede
// queda como "restaurante activo": el header fijo lo muestra en todo momento
// y mesas/menú/zonas se consultan contra ella (el adapter db.js agrega el
// override y el backend sólo lo honra con token de admin).

const KEY = 'santa-fe:restaurante-activo'

function leer() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return raw?.id && raw?.nombre ? { id: raw.id, nombre: raw.nombre } : null
  } catch { return null }
}

const RestauranteCtx = createContext(null)

export function RestauranteProvider({ children }) {
  const { session } = useAuth()
  // El rol REAL decide: un admin "viendo como" mesero sigue auditando.
  const esAdmin = session?.realRole === 'admin'
  const [activo, setActivo] = useState(leer)

  const setRestauranteActivo = useCallback((rest) => {
    const next = rest?.id ? { id: rest.id, nombre: rest.nombre ?? 'Restaurante' } : null
    setActivo(next)
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next))
      else localStorage.removeItem(KEY)
    } catch { /* almacenamiento no disponible */ }
  }, [])

  // Al cerrar sesión (o si el rol real deja de ser admin) se limpia el override
  // para que no "herede" la sede auditada el siguiente usuario que entre.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpieza puntual al cambiar de sesión; mismo patrón tolerado en los demás contexts
    if (!session || !esAdmin) setRestauranteActivo(null)
  }, [session, esAdmin, setRestauranteActivo])

  // Sede efectiva del override (null = sede base del env / del usuario).
  const restauranteActivo = esAdmin ? activo : null
  const auditando = Boolean(restauranteActivo && restauranteActivo.id !== RESTAURANTE_ID)
  const restauranteId = restauranteActivo?.id ?? session?.restaurante_id ?? RESTAURANTE_ID

  const value = useMemo(
    () => ({ restauranteActivo, restauranteId, auditando, esAdmin, setRestauranteActivo }),
    [restauranteActivo, restauranteId, auditando, esAdmin, setRestauranteActivo],
  )

  return <RestauranteCtx.Provider value={value}>{children}</RestauranteCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRestaurante() {
  const ctx = useContext(RestauranteCtx)
  if (!ctx) throw new Error('useRestaurante debe usarse dentro de <RestauranteProvider>')
  return ctx
}
