import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LogIn, UserPlus, Eye, EyeOff, QrCode, ShieldCheck, Utensils, Users, CircleDollarSign,
  Crown, Briefcase, ChefHat,
} from 'lucide-react'
import { useAuth, ROLES } from '../state/AuthContext.jsx'
import { defaultHomeForRole } from './RequireAuth.jsx'

const PENDING_TOKEN_KEY = 'santa-fe:pending-join-token'

export default function Login() {
  const { login, register, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab, setTab]           = useState('login')   // 'login' | 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  // ¿Hay un token QR pendiente de unirse?
  const pendingToken = (() => {
    try { return localStorage.getItem(PENDING_TOKEN_KEY) || null } catch { return null }
  })()

  // Si ya hay sesión, redirige a destino apropiado (token pendiente o ruta previa)
  useEffect(() => {
    if (!session) return
    if (pendingToken) {
      navigate(`/join?token=${encodeURIComponent(pendingToken)}`, { replace: true })
      return
    }
    const from = location.state?.from
    navigate(from || defaultHomeForRole(session.role), { replace: true })
  }, [session, pendingToken, navigate, location.state])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // El registro público siempre crea cuentas de cliente; el personal
      // se da de alta desde Administración → Usuarios.
      const result = tab === 'login'
        ? await login(email, password)
        : await register({ name, email, password, role: ROLES.CLIENTE })
      if (!result.ok) setError(result.error)
      // Si ok → el efecto arriba redirige
    } catch (err) {
      setError(err?.message || 'Error inesperado.')
    } finally {
      setBusy(false)
    }
  }

  async function loginAs(demoEmail) {
    setEmail(demoEmail)
    setPassword('demo1234')
    setError('')
    const r = await login(demoEmail, 'demo1234')
    if (!r.ok) setError(r.error)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#A85638]/10 dark:bg-[#A85638]/20 text-[#A85638] dark:text-[#F6EEE3] text-xs font-bold mb-3">
            <span className="w-2 h-2 rounded-full bg-[#A85638]" />
            Restaurante Santa Fe
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-50">Bienvenido</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {pendingToken
              ? 'Inicia sesión o regístrate para unirte a la mesa'
              : 'Accede al sistema para gestionar pedidos y mesas'}
          </p>
          {pendingToken && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
              <QrCode size={12} /> Hay un código QR pendiente de aplicarse
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-[#E5D9C9] dark:ring-slate-800 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#E5D9C9] dark:border-slate-800">
            <TabBtn active={tab === 'login'}    onClick={() => { setTab('login'); setError('') }}    icon={LogIn}    label="Iniciar sesión" />
            <TabBtn active={tab === 'register'} onClick={() => { setTab('register'); setError('') }} icon={UserPlus} label="Crear cuenta" />
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-3">
            {tab === 'register' && (
              <Field label="Nombre completo">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className={inputCls}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Correo electrónico">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@santafe.pe"
                className={inputCls}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Contraseña">
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                  className={`${inputCls} pr-10`}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            {tab === 'register' && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Tu cuenta será de <strong>cliente</strong>: podrás unirte a una mesa con el código QR.
                El personal del restaurante se registra desde Administración.
              </p>
            )}

            {error && (
              <div role="alert" className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#A85638] hover:bg-[#8F4527] disabled:opacity-60 text-white text-sm font-bold transition-colors shadow-sm"
            >
              {tab === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
              {tab === 'login' ? 'Ingresar' : 'Crear y entrar'}
            </button>
          </form>

          {/* Accesos demo — sólo en build de desarrollo (en prod la DB real
              no tiene estas cuentas y los botones sólo generaban errores) */}
          {import.meta.env.DEV && (
            <div className="px-5 pb-5">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-2">
                Cuentas demo (dev)
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <DemoBtn icon={Crown}             label="Admin"     onClick={() => loginAs('admin@santafe.pe')} />
                <DemoBtn icon={Briefcase}         label="Gerente"   onClick={() => loginAs('gerente@santafe.pe')} />
                <DemoBtn icon={ShieldCheck}       label="Recepción" onClick={() => loginAs('recepcion@santafe.pe')} />
                <DemoBtn icon={Utensils}          label="Mesero"    onClick={() => loginAs('mesero@santafe.pe')} />
                <DemoBtn icon={ChefHat}           label="Cocinero"  onClick={() => loginAs('cocinero@santafe.pe')} />
                <DemoBtn icon={CircleDollarSign}  label="Cajero"    onClick={() => loginAs('cajero@santafe.pe')} />
                <DemoBtn icon={Users}             label="Cliente"   onClick={() => loginAs('cliente@santafe.pe')} />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono text-center">
                clave: demo1234
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/* ──────── helpers ──────── */

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-[#E5D9C9] dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#A85638]/30 focus:border-[#A85638] transition-colors'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-2 transition-colors ${
        active
          ? 'border-[#A85638] text-[#A85638] dark:text-[#C99A3C]'
          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function DemoBtn({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-[#E5D9C9] dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-[#A85638]/5 dark:hover:bg-[#A85638]/10 hover:border-[#A85638] transition-colors"
    >
      <Icon size={12} /> {label}
    </button>
  )
}
