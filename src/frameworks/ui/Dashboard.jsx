import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  LayoutDashboard, TrendingUp, TrendingDown, Receipt, Users, Utensils,
  Download, Sun, Moon, Wifi, WifiOff, ArrowLeft, Activity, Calendar,
  UserCheck, Clock, Timer, ChevronDown, FileSpreadsheet,
} from 'lucide-react'
import { useDashboardMetrics } from '../../usecases/useDashboardMetrics.js'
import { useTiempoServicio } from '../../usecases/useServicioMetrics.js'
import { downloadCSV, csvFilename } from '../../adapters/csv.js'
import { useTheme } from '../state/ThemeContext.jsx'
import { useLiveSync } from '../state/LiveSyncContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'

const PALETA = ['#4F46E5', '#10B981', '#0EA5E9', '#4D7F70', '#835D94', '#6366F1']
const PERIODOS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week',  label: 'Semana' },
  { id: 'month', label: 'Mes' },
]

const fmtMoney = (n) => `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtInt = (n) => Number(n || 0).toLocaleString('es-PE')

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      aria-label="Cambiar tema"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function ConnectionPill() {
  const { connected } = useLiveSync()
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${
      connected
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'
        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
    }`}>
      {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
      {connected ? 'En vivo' : 'Sin conexión'}
    </span>
  )
}

function DeltaBadge({ delta }) {
  if (delta == null || !isFinite(delta)) return null
  const up = delta >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-black ${
      up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    }`} title="vs período anterior">
      <Icon size={11} /> {up ? '+' : ''}{delta.toFixed(0)}%
    </span>
  )
}

function Kpi({ icon: Icon, label, value, sub, accent, delta, loading }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
          {loading ? (
            <div className="mt-3 h-7 w-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : (
            <p className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 truncate">
              {value} <DeltaBadge delta={delta} />
            </p>
          )}
          {sub && !loading && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        <span className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  )
}

const REPORTES = [
  { id: 'ventas',     label: 'Ventas detalladas',   desc: 'Un pedido por fila con sus ítems' },
  { id: 'resumen',    label: 'Resumen del período', desc: 'Ventas y pedidos por hora/día' },
  { id: 'top-platos', label: 'Top platos',          desc: 'Unidades y total por plato' },
  { id: 'mesas',      label: 'Rendimiento por mesa', desc: 'Pedidos y ventas por mesa' },
]

function ExportMenu({ getReporte, period, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const cerrar = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [open])

  const exportar = (tipo) => {
    downloadCSV(csvFilename(`santa-fe-${tipo}-${period}`), getReporte(tipo))
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
      >
        <Download size={14} /> Exportar <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 z-30 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          {REPORTES.map(r => (
            <button
              key={r.id}
              onClick={() => exportar(r.id)}
              className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <FileSpreadsheet size={15} className="mt-0.5 flex-shrink-0 text-[#10B981]" />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{r.label}</span>
                <span className="block text-[11px] text-slate-400 dark:text-slate-500">{r.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PeriodSwitch({ value, onChange }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
      {PERIODOS.map(p => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
            value === p.id
              ? 'bg-white dark:bg-slate-700 text-[#4F46E5] dark:text-[#EEF2FF] shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.payload?.fill }}>
          {p.name}: <span className="text-slate-900 dark:text-slate-100">{formatter ? formatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

// Tooltip del chart de ventas: monto + nº de pedidos del bucket.
function VentasTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const punto = payload[0]?.payload
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">{label}</p>}
      <p className="font-semibold text-[#4F46E5]">Ventas: <span className="text-slate-900 dark:text-slate-100">{fmtMoney(punto?.ventas)}</span></p>
      <p className="font-semibold text-[#10B981]">Pedidos: <span className="text-slate-900 dark:text-slate-100">{fmtInt(punto?.pedidos)}</span></p>
    </div>
  )
}

function VentasChart({ data, theme }) {
  const grid = theme === 'dark' ? '#1e293b' : '#e2e8f0'
  const axis = theme === 'dark' ? '#64748b' : '#94a3b8'
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="grad-ventas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4F46E5" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `S/${v}`} />
        <Tooltip content={<VentasTooltip />} />
        <Area type="monotone" dataKey="ventas" name="Ventas" stroke="#4F46E5" strokeWidth={2.5} fill="url(#grad-ventas)" animationDuration={700} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function MesasChart({ data, theme }) {
  const grid = theme === 'dark' ? '#1e293b' : '#e2e8f0'
  const axis = theme === 'dark' ? '#64748b' : '#94a3b8'
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -10 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mesa" stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip formatter={(v, n) => n === 'Ventas' ? fmtMoney(v) : v} />} cursor={{ fill: theme === 'dark' ? '#0f172a' : '#f1f5f9' }} />
        <Bar dataKey="ventas" name="Ventas" radius={[8, 8, 0, 0]} animationDuration={700}>
          {data.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function TopItemsDonut({ data }) {
  if (!data.length) return null
  const total = data.reduce((s, d) => s + d.cantidad, 0)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip content={<ChartTooltip formatter={(v) => `${v} ud.`} />} />
        <Pie
          data={data}
          dataKey="cantidad"
          nameKey="nombre"
          innerRadius="58%"
          outerRadius="88%"
          paddingAngle={2}
          stroke="none"
          animationDuration={700}
        >
          {data.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
        </Pie>
        <Legend
          verticalAlign="middle"
          align="right"
          layout="vertical"
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingLeft: 8 }}
          formatter={(value, entry) => {
            const cantidad = entry?.payload?.cantidad ?? 0
            const pct = total ? Math.round((cantidad / total) * 100) : 0
            return <span className="text-slate-700 dark:text-slate-300">{value} <span className="text-slate-400">· {pct}%</span></span>
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

function TiempoServicioChart({ data, theme }) {
  const grid = theme === 'dark' ? '#1e293b' : '#e2e8f0'
  const axis = theme === 'dark' ? '#64748b' : '#94a3b8'
  const fmtSeg = (v) => { const m = Math.floor(v / 60); return m > 0 ? `${m}m` : `${v}s` }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke={axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtSeg} />
        <YAxis type="category" dataKey="plato" stroke={axis} fontSize={10} tickLine={false} axisLine={false} width={100} tick={{ textAnchor: 'end' }} />
        <Tooltip content={<ChartTooltip formatter={(v) => fmtSeg(v)} />} cursor={{ fill: theme === 'dark' ? '#0f172a' : '#f1f5f9' }} />
        <Bar dataKey="promedio_seg" name="Prom." radius={[0, 8, 8, 0]} animationDuration={700}>
          {data.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState('today')
  const { theme } = useTheme()
  const { session } = useAuth()
  const { kpis, deltas, salesOverTime, topItems, mesaPerformance, pedidosRecientes, cuentasActivas, getReporte, loading, isEmpty } = useDashboardMetrics(period)
  const { data: tiempoData, loading: tiempoLoading } = useTiempoServicio()
  const puedeVerTiempo = ['admin', 'gerente'].includes(session?.role)

  const periodLabel = PERIODOS.find(p => p.id === period)?.label.toLowerCase()

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Topbar */}
      <header className="sticky top-[var(--sf-topbar,0px)] z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/tablero-mesas" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center gap-1 text-sm font-semibold">
              <ArrowLeft size={16} /> <span className="hidden sm:inline">Tablero</span>
            </Link>
            <span className="hidden sm:block text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-[#4F46E5] flex items-center justify-center text-white">
                <LayoutDashboard size={14} />
              </span>
              <h1 className="text-base font-bold truncate">Dashboard de Supervisión</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ConnectionPill />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header strip */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#4F46E5] dark:text-[#0EA5E9]">Restaurante Santa Fe</p>
            <h2 className="text-2xl sm:text-3xl font-black mt-1">Resumen operativo</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <Calendar size={13} />
              Métricas de {periodLabel} · actualización en tiempo real
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodSwitch value={period} onChange={setPeriod} />
            <ExportMenu getReporte={getReporte} period={period} disabled={isEmpty} />
          </div>
        </div>

        {/* KPI grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Kpi
            icon={TrendingUp}
            label="Ventas totales"
            value={fmtMoney(kpis.totalVentas)}
            sub={`${kpis.totalPedidos} pedidos`}
            delta={deltas.totalVentas}
            loading={loading && isEmpty}
            accent="bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/20"
          />
          <Kpi
            icon={Activity}
            label="Pedidos activos"
            value={fmtInt(kpis.pedidosActivos)}
            sub="en cocina o por cobrar"
            loading={loading && isEmpty}
            accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
          <Kpi
            icon={Receipt}
            label="Ticket promedio"
            value={fmtMoney(kpis.ticketPromedio)}
            sub="por pedido"
            delta={deltas.ticketPromedio}
            loading={loading && isEmpty}
            accent="bg-[#10B981]/15 text-[#10B981] dark:text-[#6EE7B7]"
          />
          <Kpi
            icon={Users}
            label="Mesas activas"
            value={fmtInt(kpis.mesasOcupadas)}
            sub={`${fmtInt(kpis.totalItemsVendidos)} platos vendidos`}
            loading={loading && isEmpty}
            accent="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          />
        </section>

        {/* Bento grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:auto-rows-[minmax(0,1fr)]">
          {/* Ventas (área) — span 2 cols */}
          <div className="lg:col-span-2 lg:row-span-2 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold">Evolución de ventas</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{periodLabel}</p>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <TrendingUp size={12} /> {fmtMoney(kpis.totalVentas)}
              </span>
            </div>
            <div className="flex-1 min-h-[260px]">
              {loading && isEmpty ? <ChartSkeleton /> : isEmpty ? <EmptyState /> : <VentasChart data={salesOverTime} theme={theme} />}
            </div>
          </div>

          {/* Top platos (donut) */}
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Top platos</h3>
              <Utensils size={14} className="text-slate-400" />
            </div>
            <div className="flex-1 min-h-[220px]">
              {loading && isEmpty ? <ChartSkeleton /> : isEmpty ? <EmptyState /> : <TopItemsDonut data={topItems} />}
            </div>
          </div>

          {/* Top items lista (con miniatura) */}
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Más vendidos</h3>
              <span className="text-xs text-slate-400">por unidades</span>
            </div>
            {isEmpty ? <EmptyState compact /> : (
              <ul className="space-y-2.5">
                {topItems.map((it, i) => (
                  <li key={it.nombre} className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-xl flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-black text-white"
                      style={{
                        backgroundImage: it.imagen ? `url(${it.imagen})` : undefined,
                        backgroundColor: it.imagen ? undefined : PALETA[i % PALETA.length],
                      }}
                    >
                      {!it.imagen && it.nombre.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{it.nombre}</p>
                      <p className="text-xs text-slate-400">{it.categoria ?? 'Plato'} · {fmtMoney(it.total)}</p>
                    </div>
                    <span className="text-sm font-black text-[#4F46E5] dark:text-[#0EA5E9]">×{it.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Rendimiento por mesa (bar) */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold">Rendimiento por mesa</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ventas acumuladas por mesa</p>
              </div>
            </div>
            <div className="flex-1 min-h-[220px]">
              {loading && isEmpty ? <ChartSkeleton /> : isEmpty ? <EmptyState /> : <MesasChart data={mesaPerformance} theme={theme} />}
            </div>
          </div>

          {/* Tarjeta info / accesos rápidos */}
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-[#4F46E5] to-[#4338CA] dark:from-[#10B981] dark:to-[#059669] text-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">Accesos rápidos</p>
              <h3 className="text-lg font-black mt-2">¿Listo para el siguiente turno?</h3>
              <p className="text-xs opacity-85 mt-1">Salta directo a la operación con un clic.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link to="/tablero-mesas" className="rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm py-2 text-xs font-bold text-center transition-colors">Tablero</Link>
              <Link to="/cocina/pendientes" className="rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm py-2 text-xs font-bold text-center transition-colors">Cocina</Link>
              <Link to="/pedidos/nuevo" className="rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm py-2 text-xs font-bold text-center transition-colors">+ Pedido</Link>
              <Link to="/admin/roles" className="rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm py-2 text-xs font-bold text-center transition-colors">Roles</Link>
            </div>
          </div>
        </section>

        {/* ── Tiempo de servicio por plato (admin/gerente) ── */}
        {puedeVerTiempo && (
          <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  <Timer size={15} className="text-amber-500" /> Tiempo de servicio por plato
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Promedio en_preparacion → entregado · top 10
                </p>
              </div>
              <Link
                to="/admin/meseros"
                className="text-xs font-bold text-[#4F46E5] hover:underline"
              >
                Ver panel completo →
              </Link>
            </div>
            <div className="flex-1 min-h-[280px]">
              {tiempoLoading ? (
                <div className="h-64 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
              ) : !tiempoData.length ? (
                <EmptyState />
              ) : (
                <TiempoServicioChart data={tiempoData} theme={theme} />
              )}
            </div>
          </section>
        )}

        {/* ── Cuentas activas + pedidos recientes ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cuentas activas */}
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold">Cuentas activas</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cuentasActivas?.length ?? 0} abiertas en sala</p>
              </div>
              <UserCheck size={14} className="text-slate-400" />
            </div>
            {!cuentasActivas?.length ? <EmptyState compact /> : (
              <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {cuentasActivas.map(c => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2">
                    <span className="w-9 h-9 rounded-xl bg-[#4F46E5]/10 dark:bg-[#4F46E5]/20 text-[#4F46E5] dark:text-[#EEF2FF] flex items-center justify-center font-black text-xs flex-shrink-0">
                      {c.nombre.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{c.nombre}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Mesa {c.mesa} · {c.pedidos} pedido{c.pedidos !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="text-sm font-black text-[#4F46E5] dark:text-[#0EA5E9]">{fmtMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pedidos recientes */}
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold">Pedidos recientes</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Últimos 8 con cuenta asignada</p>
              </div>
              <Clock size={14} className="text-slate-400" />
            </div>
            {!pedidosRecientes?.length ? <EmptyState compact /> : (
              <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {pedidosRecientes.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-12 flex-shrink-0">
                      {new Date(p.creadoEn).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                        {p.cuenta || <span className="text-slate-400 dark:text-slate-500 italic font-normal">Sin cuenta asignada</span>}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Mesa {p.mesa} · {p.nItems} ítem{p.nItems !== 1 ? 's' : ''} · {p.estado}</p>
                    </div>
                    <span className="text-sm font-black text-[#4F46E5] dark:text-[#0EA5E9]">{fmtMoney(p.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function ChartSkeleton() {
  return <div className="h-full min-h-[180px] rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
}

function EmptyState({ compact }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-2 ${compact ? 'py-6' : 'py-10'} text-slate-400 dark:text-slate-500`}>
      <Activity size={compact ? 22 : 28} className="opacity-60" />
      <p className="text-sm font-semibold">Aún sin datos</p>
      <p className="text-xs max-w-[220px]">Cuando se registren pedidos en el período aparecerán aquí.</p>
    </div>
  )
}
