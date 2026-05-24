import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMesas } from '../frameworks/state/MesasContext.jsx'
import { usePedidos } from '../frameworks/state/PedidosContext.jsx'
import { db } from '../adapters/db.js'

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const defaultName = (i) => `John Doe ${i}`

/**
 * useTableManagement
 *
 * Lógica reutilizable para mesas con cuentas múltiples.
 *   - Cada mesa tiene `cuentas: [{id, nombre, abierta, creadaEn}]`.
 *   - Capacidad máxima de cuentas = mesa.capacidad (configurable).
 *   - Pedidos llevan `cuentaId` para asociarse a una cuenta específica.
 *
 * No toca el WS directamente: opera sobre los contextos existentes (MesasContext, PedidosContext)
 * que ya sincronizan vía broadcast. Pensado para portar a backend cambiando el origen de los datos.
 *
 * Si se pasa `numeroMesa`, devuelve helpers acotados a esa mesa.
 * Si no, devuelve solo las funciones globales.
 */
export function useTableManagement(numeroMesa) {
  const { mesas, actualizarMesa, cambiarEstadoA } = useMesas()
  const { pedidos } = usePedidos()

  const mesa = useMemo(
    () => mesas.find(m => m.numeroMesa === Number(numeroMesa)),
    [mesas, numeroMesa]
  )

  // Comensales activos en DB → se usan para sintetizar cuentas cuando el state
  // local no tiene info (ej. el mesero abre la app después de que el cliente
  // se unió via QR, o tras una reconexión de Pusher sin replay).
  const [comensalesDB, setComensalesDB] = useState([])
  useEffect(() => {
    if (!mesa?.id) { setComensalesDB([]); return }
    let cancelled = false
    db.comensales.listByMesa(mesa.id)
      .then(rows => { if (!cancelled) setComensalesDB((rows || []).filter(c => c.activo)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mesa?.id, mesa?.estado, mesa?.integrantes?.length])

  // Fusiona cuentas locales (state/Pusher) con comensales en DB.
  // Si hay un comensal en DB que no tiene cuenta correspondiente, se crea una sintética.
  const cuentas = useMemo(() => {
    const locales = mesa?.cuentas ?? []
    if (!comensalesDB.length) return locales
    const nombresLocales = new Set(locales.map(c => (c.nombre || '').toLowerCase().trim()))
    const sinteticas = comensalesDB
      .filter(c => !nombresLocales.has((c.username || '').toLowerCase().trim()))
      .map(c => ({
        id: `comensal-${c.id}`,
        nombre: c.username,
        abierta: c.pagado_en ? false : true,
        creadaEn: c.creado_en ? new Date(c.creado_en).getTime() : Date.now(),
        userId: c.user_id ?? null,
        fromDB: true,
      }))
    return [...locales, ...sinteticas]
  }, [mesa?.cuentas, comensalesDB])

  const cuentasAbiertas = useMemo(() => cuentas.filter(c => c.abierta !== false), [cuentas])
  const puedeAgregar = mesa ? cuentasAbiertas.length < (mesa.capacidad ?? 1) : false

  /** Crea una nueva cuenta con nombre por defecto si no se especifica. */
  const agregarCuenta = useCallback((nombre) => {
    if (!mesa) return null
    if (cuentasAbiertas.length >= (mesa.capacidad ?? 1)) return null

    const indice = (mesa.cuentas?.length ?? 0) + 1
    const nueva = {
      id: uid(),
      nombre: nombre?.trim() || defaultName(indice),
      abierta: true,
      creadaEn: Date.now(),
    }
    const nextCuentas = [...(mesa.cuentas ?? []), nueva]
    actualizarMesa(mesa.numeroMesa, { cuentas: nextCuentas })

    // Reapertura automática: si la mesa estaba disponible o por_cobrar pasa a ocupada
    if (mesa.estado === 'disponible' || mesa.estado === 'por_cobrar') {
      cambiarEstadoA(mesa.numeroMesa, 'ocupada')
    }

    return nueva
  }, [mesa, cuentasAbiertas, actualizarMesa, cambiarEstadoA])

  /** Renombra una cuenta. */
  const renombrarCuenta = useCallback((cuentaId, nombre) => {
    if (!mesa) return
    const nextCuentas = (mesa.cuentas ?? []).map(c =>
      c.id === cuentaId ? { ...c, nombre } : c
    )
    actualizarMesa(mesa.numeroMesa, { cuentas: nextCuentas })
  }, [mesa, actualizarMesa])

  /** Cierra (no elimina) una cuenta. El paso a "Por cobrar" es manual. */
  const cerrarCuenta = useCallback((cuentaId) => {
    if (!mesa) return
    const nextCuentas = (mesa.cuentas ?? []).map(c =>
      c.id === cuentaId ? { ...c, abierta: false, cerradaEn: Date.now() } : c
    )
    actualizarMesa(mesa.numeroMesa, { cuentas: nextCuentas })
  }, [mesa, actualizarMesa])

  /** Pedidos agrupados por cuentaId (solo de la mesa actual). */
  const pedidosPorCuenta = useMemo(() => {
    if (!mesa) return {}
    const acc = {}
    for (const p of pedidos) {
      if (Number(p.mesa) !== mesa.numeroMesa) continue
      const k = p.cuentaId ?? '_sin_cuenta'
      if (!acc[k]) acc[k] = []
      acc[k].push(p)
    }
    return acc
  }, [mesa, pedidos])

  /** Total acumulado por cuenta. */
  const totalesPorCuenta = useMemo(() => {
    const acc = {}
    for (const [cuentaId, lista] of Object.entries(pedidosPorCuenta)) {
      acc[cuentaId] = lista.reduce((s, p) =>
        s + (p.items ?? []).reduce((si, i) => si + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0)
      , 0)
    }
    return acc
  }, [pedidosPorCuenta])

  return {
    mesa,
    cuentas,
    cuentasAbiertas,
    puedeAgregar,
    capacidadMaxima: mesa?.capacidad ?? 0,
    pedidosPorCuenta,
    totalesPorCuenta,
    agregarCuenta,
    renombrarCuenta,
    cerrarCuenta,
  }
}

/**
 * Resolver auxiliar global: dado un pedido, devuelve el nombre de la cuenta asignada.
 * Útil en Dashboard / lista global.
 */
export function useCuentaResolver() {
  const { mesas } = useMesas()
  return useCallback((pedido) => {
    if (!pedido?.cuentaId) return null
    const mesa = mesas.find(m => m.numeroMesa === Number(pedido.mesa))
    return mesa?.cuentas?.find(c => c.id === pedido.cuentaId)?.nombre ?? null
  }, [mesas])
}
