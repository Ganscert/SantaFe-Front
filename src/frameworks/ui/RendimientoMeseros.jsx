import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  ArrowLeft, Users, TrendingUp, Clock, CheckCircle,
  XCircle, Trophy, Activity,
} from 'lucide-react'
import { useRendimientoMeseros, useTiempoServicio } from '../../usecases/useServicioMetrics.js'
import { useTheme } from '../state/ThemeContext.jsx'

const PALETA = ['#4F46E5', '#10B981', '#0EA5E9', '#3b82f6', '#8b5cf6', '#ec4899']

const fmtMoney = (n) =>
  `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.payload?.fill }}>
          {p.name}: <span className="text-slate-900 dark:text-slate-100">{formatter ? formatter(p.value, p.name) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

function StatChip({ icon: Icon, label, value, accent }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${accent} text-xs font-bold`}>
      <Icon size={14} />
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="ml-auto">{value}</span>
    </div>
  )
}

function MeseroCard({ mesero, rank }) {
  const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : null
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-base text-white flex-shrink-0"
          style={{ backgroundColor: PALETA[rank % PALETA.length] }}
        >
          {medal ?? mesero.nombre.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 dark:text-slate-50 truncate">{mesero.nombre}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Mesero</p>
        </div>
        <span className="text-lg font-black text-[#4F46E5] dark:text-[#0EA5E9]">
          {fmtMoney(mesero.ventasTotales)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatChip
          icon={CheckCircle}
          label="Completados"
          value={mesero.pedidosCompletados}
          accent="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        />
        <StatChip
          icon={XCircle}
          label="Cancelados"
          value={mesero.pedidosCancelados}
          accent="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
        />
        <StatChip
          icon={TrendingUp}
          label="Ticket prom."
          value={fmtMoney(mesero.ticketPromedio)}
          accent="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        />
        <StatChip
          icon={Clock}
          label="T. servicio"
          value={mesero.tiempoPromedioLabel}
          accent="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
        />
      </div>

      {/* Tasa de éxito */}
      <div>
        <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
          <span>Tasa de éxito</span>
          <span>{mesero.tasaExito}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${mesero.tasaExito}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function TiempoServicioChart({ data, theme }) {
  const grid = theme === 'dark' ? '#1e293b' : '#e2e8f0'
  const axis = theme === 'dark' ? '#64748b' : '#94a3b8'
  const fmtSeg = (v) => {
    const m = Math.floor(v / 60)
    const s = v % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          stroke={axis}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtSeg}
        />
        <YAxis
          type="category"
          dataKey="plato"
          stroke={axis}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={110}
          tick={{ textAnchor: 'end' }}
        />
        <Tooltip
          content={<ChartTooltip formatter={(v) => fmtSeg(v)} />}
          cursor={{ fill: theme === 'dark' ? '#0f172a' : '#f1f5f9' }}
        />
        <Bar dataKey="promedio_seg" name="Tiempo prom." radius={[0, 8, 8, 0]} animationDuration={700}>
          {data.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function EmptyState({ compact, mensaje }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-2 ${compact ? 'py-6' : 'py-12'} text-slate-400 dark:text-slate-500`}>
      <Activity size={compact ? 22 : 32} className="opacity-50" />
      <p className="text-sm font-semibold">{mensaje ?? 'Sin datos aún'}</p>
      <p className="text-xs max-w-[240px]">
        Los datos aparecen cuando se registren pedidos con meseros asignados.
      </p>
    </div>
  )
}

export default function RendimientoMeseros() {
  const { theme } = useTheme()
  const { data: meseros, loading: loadingM } = useRendimientoMeseros()
  const { data: platos,  loading: loadingP } = useTiempoServicio()

  const hayMeseros = meseros.length > 0
  const hayPlatos  = platos.length > 0

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Topbar */}
      <header className="sticky top-[var(--sf-topbar,0px)] z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to="/admin/dashboard"
            className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center gap-1 text-sm font-semibold"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="hidden sm:block text-slate-300 dark:text-slate-700">|</span>
          <span className="w-7 h-7 rounded-xl bg-[#10B981] flex items-center justify-center text-white">
            <Users size={14} />
          </span>
          <h1 className="text-base font-bold">Rendimiento de Meseros</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#10B981] dark:text-[#0EA5E9]">Supervisión</p>
          <h2 className="text-2xl sm:text-3xl font-black mt-1">Panel de meseros</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Métricas individuales · tiempos de servicio y ventas
          </p>
        </div>

        {/* KPIs resumen */}
        {hayMeseros && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Total meseros',
                value: meseros.length,
                icon: Users,
                accent: 'bg-[#10B981]/10 text-[#10B981] dark:text-[#6EE7B7]',
              },
              {
                label: 'Top ventas',
                value: fmtMoney(meseros[0]?.ventasTotales ?? 0),
                icon: Trophy,
                accent: 'bg-[#0EA5E9]/10 text-[#0EA5E9]',
              },
              {
                label: 'Pedidos totales',
                value: meseros.reduce((s, m) => s + m.totalPedidos, 0),
                icon: CheckCircle,
                accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              },
              {
                label: 'T. servicio prom.',
                value: (() => {
                  const validos = meseros.filter(m => m.tiempoPromedioSeg)
                  if (!validos.length) return '—'
                  const avg = Math.round(validos.reduce((s, m) => s + m.tiempoPromedioSeg, 0) / validos.length)
                  const mins = Math.floor(avg / 60), secs = avg % 60
                  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
                })(),
                icon: Clock,
                accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
                    <p className="mt-1.5 text-xl font-black text-slate-900 dark:text-slate-50">{kpi.value}</p>
                  </div>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${kpi.accent}`}>
                    <kpi.icon size={16} />
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Tarjetas de meseros */}
        <section>
          <h3 className="text-base font-bold mb-3 flex items-center gap-2">
            <Users size={16} className="text-[#10B981]" /> Meseros
          </h3>
          {loadingM ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
              ))}
            </div>
          ) : !hayMeseros ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <EmptyState mensaje="No hay meseros registrados" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {meseros.map((m, i) => <MeseroCard key={m.id} mesero={m} rank={i} />)}
            </div>
          )}
        </section>

        {/* Chart: tiempo de servicio por plato */}
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold flex items-center gap-2">
                <Clock size={16} className="text-amber-500" /> Tiempo de servicio por plato
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Promedio desde en preparación → entregado · top 10 más lentos
              </p>
            </div>
          </div>
          <div className="min-h-[300px]">
            {loadingP ? (
              <div className="h-72 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
            ) : !hayPlatos ? (
              <EmptyState compact mensaje="Sin datos de tiempo de servicio aún" />
            ) : (
              <TiempoServicioChart data={platos} theme={theme} />
            )}
          </div>
        </section>

        {/* Tabla detallada */}
        {hayMeseros && (
          <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold">Detalle comparativo</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {['Mesero', 'Completados', 'Cancelados', 'Ventas', 'Ticket prom.', 'T. servicio', 'Éxito'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {meseros.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-50">{m.nombre}</td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-semibold">{m.pedidosCompletados}</td>
                      <td className="px-4 py-3 text-red-500 font-semibold">{m.pedidosCancelados}</td>
                      <td className="px-4 py-3 font-bold text-[#4F46E5] dark:text-[#0EA5E9]">{fmtMoney(m.ventasTotales)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtMoney(m.ticketPromedio)}</td>
                      <td className="px-4 py-3 text-amber-600 dark:text-amber-400 font-semibold">{m.tiempoPromedioLabel}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 min-w-[60px] overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${m.tasaExito}%` }} />
                          </div>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-8 text-right">{m.tasaExito}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
