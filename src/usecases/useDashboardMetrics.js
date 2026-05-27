import { useEffect, useMemo, useState } from 'react'
import { usePedidos } from '../frameworks/state/PedidosContext.jsx'
import { useMesas } from '../frameworks/state/MesasContext.jsx'
import { db } from '../adapters/db.js'

const DAY = 86400000
const HOUR = 3600000

const startOfDay = (ts) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const periodWindow = (period) => {
  const now = Date.now()
  if (period === 'today') return { from: startOfDay(now), to: now, bucket: HOUR, fmt: (ts) => new Date(ts).getHours().toString().padStart(2, '0') + ':00' }
  if (period === 'week')  return { from: startOfDay(now - 6 * DAY), to: now, bucket: DAY,  fmt: (ts) => new Date(ts).toLocaleDateString('es-PE', { weekday: 'short' }) }
  return { from: startOfDay(now - 29 * DAY), to: now, bucket: DAY, fmt: (ts) => new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) }
}

const totalDePedido = (p) =>
  (p.items ?? []).reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0)

// Normaliza un registro de v_dashboard_resumen al shape interno de pedido local.
function dbRowToPedido(row) {
  const items = (row.items || []).map(it => ({
    id: it.id,
    nombre: it.nombre,
    cantidad: Number(it.cantidad) || 0,
    precio: Number(it.precio) || 0,
    estado: it.estado,
  }))
  return {
    id: row.id,
    dbId: row.id,
    mesa: Number(row.numero_mesa),
    cuentaId: null,
    cliente_nombre: row.cliente_nombre,
    items,
    estado: row.estado,
    creadoEn: new Date(row.creado_en).getTime(),
    hora: new Date(row.creado_en).toLocaleTimeString(),
    cobrado_en: row.cobrado_en,
  }
}

export function useDashboardMetrics(period = 'today') {
  const { pedidos } = usePedidos()
  const { mesas } = useMesas()
  const [pedidosDB, setPedidosDB] = useState([])

  // Cargar desde DB cuando cambia el período; refresca cada 30s.
  useEffect(() => {
    let cancelled = false
    const { from, to } = periodWindow(period)
    const cargar = () => {
      db.pedidos.listDashboard({ desde: from, hasta: to })
        .then(rows => { if (!cancelled) setPedidosDB((rows || []).map(dbRowToPedido)) })
        .catch(() => {})
    }
    cargar()
    const id = setInterval(cargar, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [period])

  return useMemo(() => {
    const { from, to, bucket, fmt } = periodWindow(period)
    // DB-first: si la consulta devolvió algo, úsala; si no, fallback al estado local.
    const fuente = pedidosDB.length ? pedidosDB : pedidos
    const enRango = fuente.filter(p => {
      const t = p.creadoEn ?? 0
      return t >= from && t <= to
    })

    const ventasFacturadas = enRango.filter(p => p.estado === 'entregado' || p.estado === 'listo' || p.estado === 'en_preparacion' || p.estado === 'pendiente')
    const totalVentas = ventasFacturadas.reduce((s, p) => s + totalDePedido(p), 0)
    const pedidosActivos = fuente.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length
    const ticketPromedio = ventasFacturadas.length ? totalVentas / ventasFacturadas.length : 0
    const mesasOcupadas = mesas.filter(m => m.estado === 'ocupada' || m.estado === 'por_cobrar').length

    const buckets = new Map()
    for (let t = from; t <= to; t += bucket) buckets.set(t, { time: fmt(t), ventas: 0, pedidos: 0 })
    for (const p of ventasFacturadas) {
      const k = bucket === DAY ? startOfDay(p.creadoEn) : Math.floor(p.creadoEn / bucket) * bucket
      const b = buckets.get(k) ?? buckets.get([...buckets.keys()].find(x => x <= k && k < x + bucket))
      if (b) {
        b.ventas += totalDePedido(p)
        b.pedidos += 1
      }
    }
    const salesOverTime = [...buckets.values()]

    const itemMap = new Map()
    for (const p of ventasFacturadas) {
      for (const it of p.items ?? []) {
        const key = it.nombre
        const prev = itemMap.get(key) ?? { nombre: key, cantidad: 0, total: 0, imagen: it.imagen, categoria: it.categoria }
        prev.cantidad += Number(it.cantidad) || 0
        prev.total += (Number(it.precio) || 0) * (Number(it.cantidad) || 0)
        itemMap.set(key, prev)
      }
    }
    const topItems = [...itemMap.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

    const mesaMap = new Map()
    for (const p of ventasFacturadas) {
      const key = p.mesa
      const prev = mesaMap.get(key) ?? { mesa: `Mesa ${key}`, pedidos: 0, ventas: 0 }
      prev.pedidos += 1
      prev.ventas += totalDePedido(p)
      mesaMap.set(key, prev)
    }
    const mesaPerformance = [...mesaMap.values()].sort((a, b) => b.ventas - a.ventas)

    const totalItemsVendidos = topItems.reduce((s, i) => s + i.cantidad, 0)

    // Resolver nombre de cuenta por id (cross-mesa)
    const cuentaIdToName = new Map()
    for (const m of mesas) {
      for (const c of m.cuentas ?? []) cuentaIdToName.set(c.id, c.nombre)
    }

    // Pedidos recientes (top 8) con cuenta visible
    const pedidosRecientes = [...enRango]
      .sort((a, b) => (b.creadoEn ?? 0) - (a.creadoEn ?? 0))
      .slice(0, 8)
      .map(p => ({
        id: p.id,
        mesa: p.mesa,
        cuenta: cuentaIdToName.get(p.cuentaId) ?? null,
        estado: p.estado,
        creadoEn: p.creadoEn,
        total: totalDePedido(p),
        nItems: (p.items ?? []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0),
      }))

    // Cuentas activas: nombre + total acumulado por cuenta
    const cuentasActivasMap = new Map()
    for (const m of mesas) {
      for (const c of (m.cuentas ?? []).filter(x => x.abierta !== false)) {
        cuentasActivasMap.set(c.id, { id: c.id, nombre: c.nombre, mesa: m.numeroMesa, total: 0, pedidos: 0 })
      }
    }
    for (const p of ventasFacturadas) {
      const e = cuentasActivasMap.get(p.cuentaId)
      if (e) { e.total += totalDePedido(p); e.pedidos += 1 }
    }
    const cuentasActivas = [...cuentasActivasMap.values()].sort((a, b) => b.total - a.total)

    const csv = (() => {
      const head = 'fecha,hora,mesa,cuenta,estado,items,total\n'
      const rows = enRango.map(p => {
        const d = new Date(p.creadoEn)
        const fecha = d.toLocaleDateString('es-PE')
        const hora = d.toLocaleTimeString('es-PE')
        const items = (p.items ?? []).map(i => `${i.cantidad}x ${i.nombre}`).join(' | ')
        const cuenta = cuentaIdToName.get(p.cuentaId) ?? ''
        return `${fecha},${hora},${p.mesa},"${cuenta}",${p.estado},"${items}",${totalDePedido(p).toFixed(2)}`
      }).join('\n')
      return head + rows
    })()

    return {
      kpis: { totalVentas, pedidosActivos, ticketPromedio, mesasOcupadas, totalItemsVendidos, totalPedidos: ventasFacturadas.length, cuentasActivas: cuentasActivas.length },
      salesOverTime,
      topItems,
      mesaPerformance,
      pedidosRecientes,
      cuentasActivas,
      csv,
      period,
      isEmpty: ventasFacturadas.length === 0,
    }
  }, [pedidos, mesas, period, pedidosDB])
}
