import { useEffect, useState } from 'react'
import { supabase, RESTAURANTE_ID } from '../adapters/supabase.js'

const fmtMin = (seg) => {
  if (!seg) return '—'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function useTiempoServicio() {
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data: rows, error } = await supabase
        .from('v_tiempo_servicio_platos')
        .select('plato, categoria, muestras, promedio_seg, minimo_seg, maximo_seg, mediana_seg')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('promedio_seg', { ascending: false })
        .limit(10)
      if (cancelled) return
      if (error) {
        setLoading(false); return   // view missing until migration 004 applied in Supabase
      }
      setData(rows.map(r => ({
        plato:       r.plato,
        categoria:   r.categoria || 'Plato',
        muestras:    r.muestras  || 0,
        promedio_seg: r.promedio_seg || 0,
        minimo_seg:  r.minimo_seg  || 0,
        maximo_seg:  r.maximo_seg  || 0,
        mediana_seg: r.mediana_seg  || 0,
        promedioLabel: fmtMin(r.promedio_seg),
        minimoLabel:   fmtMin(r.minimo_seg),
        maximoLabel:   fmtMin(r.maximo_seg),
      })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  return { data, loading }
}

export function useRendimientoMeseros() {
  const [data, setData]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data: rows, error } = await supabase
        .from('v_rendimiento_meseros')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('ventas_totales', { ascending: false })
      if (cancelled) return
      if (error) {
        if (!error.message?.includes('does not exist')) console.error('[useRendimientoMeseros]', error.message)
        setLoading(false); return
      }
      setData(rows.map(r => ({
        id:                    r.mesero_id,
        nombre:                r.mesero,
        totalPedidos:          r.total_pedidos        || 0,
        pedidosCompletados:    r.pedidos_completados  || 0,
        pedidosCancelados:     r.pedidos_cancelados   || 0,
        ventasTotales:         Number(r.ventas_totales)    || 0,
        ticketPromedio:        Number(r.ticket_promedio)   || 0,
        tiempoPromedioSeg:     r.tiempo_servicio_promedio_seg || null,
        tiempoPromedioLabel:   fmtMin(r.tiempo_servicio_promedio_seg),
        ultimoPedidoEn:        r.ultimo_pedido_en,
        tasaExito:             r.total_pedidos > 0
          ? Math.round((r.pedidos_completados / r.total_pedidos) * 100)
          : 0,
      })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  return { data, loading }
}
