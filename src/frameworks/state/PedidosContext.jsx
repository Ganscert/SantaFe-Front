import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useMesas } from './MesasContext.jsx'
import { useLiveSync } from './LiveSyncContext.jsx'
import { db } from '../../adapters/db.js'

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const PedidosContext = createContext(null)

// eslint-disable-next-line react-refresh/only-export-components
export const usePedidos = () => {
  const ctx = useContext(PedidosContext)
  if (!ctx) throw new Error('usePedidos must be used within PedidosProvider')
  return ctx
}

const ESTADOS_ACTIVOS = ['pendiente', 'en_preparacion', 'listo']
const isActivo = (p) => ESTADOS_ACTIVOS.includes(p.estado)

export const PedidosProvider = ({ children }) => {
  const { mesas, cambiarEstadoA } = useMesas()
  const { serverState, sendMessage, connected } = useLiveSync()
  const initSent = useRef(false)
  const [pedidos, setPedidos] = useState(() => {
    if (typeof window === 'undefined') return []
    const saved = window.localStorage.getItem('pedidos')
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    if (!connected) {
      initSent.current = false
      return
    }
    if (initSent.current) return
    sendMessage({ type: 'sync:init', state: { mesas, pedidos } })
    initSent.current = true
  }, [connected, mesas, pedidos, sendMessage])

  useEffect(() => {
    if (serverState?.pedidos) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPedidos(serverState.pedidos)
    }
  }, [serverState?.pedidos])

  useEffect(() => {
    window.localStorage.setItem('pedidos', JSON.stringify(pedidos))
  }, [pedidos])

  const syncPedidos = useCallback((nextPedidos) => {
    if (!connected) return
    sendMessage({ type: 'sync:pedidos', pedidos: nextPedidos })
  }, [connected, sendMessage])

  // Conteo de pedidos activos por mesa (memoizado) — usado por TableroMesas / MesaDetalle
  const activosPorMesa = useMemo(() => {
    const map = new Map()
    for (const p of pedidos) {
      if (!isActivo(p)) continue
      const n = Number(p.mesa)
      map.set(n, (map.get(n) ?? 0) + 1)
    }
    return map
  }, [pedidos])

  const contarActivosMesa = useCallback(
    (numeroMesa) => activosPorMesa.get(Number(numeroMesa)) ?? 0,
    [activosPorMesa]
  )

  const agregarPedido = useCallback((pedido) => {
    const nuevoPedido = {
      id: uid(),
      mesa: Number(pedido.mesa),
      cuentaId: pedido.cuentaId ?? null,
      cliente_nombre: pedido.cliente_nombre ?? null,
      items: pedido.items.map(i => ({ ...i, id: uid(), estado: 'pendiente' })),
      estado: 'pendiente',
      creadoEn: Date.now(),
      hora: new Date().toLocaleTimeString(),
    }

    setPedidos(prev => {
      const next = [...prev, nuevoPedido]
      syncPedidos(next)
      return next
    })

    const mesa = mesas.find(m => m.numeroMesa === Number(pedido.mesa))

    // Persistir en DB (fire-and-forget) — guardamos el id real en el pedido local
    // para poder cancelar/seguir desde DB.
    if (mesa?.id) {
      db.pedidos.crear({
        mesa_id: mesa.id,
        cliente_nombre: nuevoPedido.cliente_nombre,
        comensal_id: pedido.comensal_id ?? null,
        items: nuevoPedido.items.map(i => ({ nombre: i.nombre, precio: i.precio, cantidad: i.cantidad })),
      }).then(row => {
        if (!row?.id) return
        setPedidos(prev => {
          const next = prev.map(p => p.id === nuevoPedido.id ? { ...p, dbId: row.id } : p)
          syncPedidos(next)
          return next
        })
      }).catch(() => {})
    }

    // Reapertura automática: si la mesa estaba disponible o por_cobrar → pasa a ocupada
    if (mesa && (mesa.estado === 'disponible' || mesa.estado === 'por_cobrar')) {
      cambiarEstadoA(mesa.numeroMesa, 'ocupada')
    }
  }, [mesas, cambiarEstadoA, syncPedidos])

  const marcarPreparando = useCallback((id) =>
    setPedidos(prev => {
      const next = prev.map(p => p.id === id ? { ...p, estado: 'en_preparacion' } : p)
      syncPedidos(next)
      return next
    }), [syncPedidos])

  const marcarListo = useCallback((id) =>
    setPedidos(prev => {
      const next = prev.map(p => p.id === id ? { ...p, estado: 'listo' } : p)
      syncPedidos(next)
      return next
    }), [syncPedidos])

  // Ya NO pasa la mesa a por_cobrar automáticamente: ese estado es manual
  const marcarEntregado = useCallback((id) =>
    setPedidos(prev => {
      const next = prev.map(p => p.id === id ? { ...p, estado: 'entregado' } : p)
      syncPedidos(next)
      return next
    }), [syncPedidos])

  // Cancelar un pedido entero (sólo si está aún pendiente).
  // Devuelve { ok:true } u { ok:false, error }.
  const cancelarPedido = useCallback(async (id, opts = {}) => {
    const target = pedidos.find(p => p.id === id || p.dbId === id)
    if (!target) return { ok: false, error: 'Pedido no encontrado' }
    if (target.estado !== 'pendiente') {
      return { ok: false, error: 'La cocina ya empezó a preparar este pedido' }
    }
    // Optimista
    setPedidos(prev => {
      const next = prev.map(p => p.id === target.id
        ? { ...p, estado: 'cancelado', items: p.items.map(i => ({ ...i, estado: 'cancelado' })) }
        : p)
      syncPedidos(next)
      return next
    })
    // DB
    if (target.dbId) {
      try {
        await db.pedidos.cancelar(target.dbId, {
          cancelado_por: opts.cancelado_por ?? null,
          motivo: opts.motivo ?? null,
        })
      } catch (e) {
        // Rollback en caso de error (p.ej. cocina ya empezó)
        setPedidos(prev => {
          const next = prev.map(p => p.id === target.id ? target : p)
          syncPedidos(next)
          return next
        })
        return { ok: false, error: e.message || 'No se pudo cancelar' }
      }
    }
    return { ok: true }
  }, [pedidos, syncPedidos])

  // Limpieza global de cocina: NO toca el estado de las mesas
  const limpiarCocina = useCallback(() =>
    setPedidos(prev => {
      const next = prev.map(p => isActivo(p) ? { ...p, estado: 'entregado' } : p)
      syncPedidos(next)
      return next
    }), [syncPedidos])

  // Transfiere todos los pedidos de un (mesa, cuenta) origen a un (mesa, cuenta) destino.
  // Se usa cuando el cliente cambia de mesa y arrastra sus pedidos activos.
  const transferirPedidos = useCallback((oldMesaNumero, oldCuentaId, newMesaNumero, newCuentaId) => {
    setPedidos(prev => {
      const next = prev.map(p =>
        p.mesa === Number(oldMesaNumero) && p.cuentaId === oldCuentaId
          ? { ...p, mesa: Number(newMesaNumero), cuentaId: newCuentaId }
          : p
      )
      syncPedidos(next)
      return next
    })
  }, [syncPedidos])

  const pedidosPendientes    = useMemo(() => pedidos.filter(p => p.estado === 'pendiente'),      [pedidos])
  const pedidosEnPreparacion = useMemo(() => pedidos.filter(p => p.estado === 'en_preparacion'), [pedidos])
  const pedidosListos        = useMemo(() => pedidos.filter(p => p.estado === 'listo'),          [pedidos])

  const value = useMemo(() => ({
    pedidos,
    pedidosPendientes,
    pedidosEnPreparacion,
    pedidosListos,
    contarActivosMesa,
    agregarPedido,
    marcarPreparando,
    marcarListo,
    marcarEntregado,
    limpiarCocina,
    transferirPedidos,
    cancelarPedido,
  }), [
    pedidos, pedidosPendientes, pedidosEnPreparacion, pedidosListos,
    contarActivosMesa, agregarPedido, marcarPreparando, marcarListo,
    marcarEntregado, limpiarCocina, transferirPedidos, cancelarPedido,
  ])

  return <PedidosContext.Provider value={value}>{children}</PedidosContext.Provider>
}
