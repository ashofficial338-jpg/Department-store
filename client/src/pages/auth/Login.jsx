import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye, EyeOff, ArrowRight, Mail, Lock, Loader2, TrendingUp, ShieldCheck, Sparkles, Boxes, BarChart3, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'AshwinLav@gmail.com', password: 'Admin@123' },
  { role: 'Cashier', email: 'cashier@aurelia.test', password: 'Password@123' },
  { role: 'Accountant', email: 'accountant@aurelia.test', password: 'Password@123' },
];

const EASE = [0.22, 1, 0.36, 1];
const FEATURES = [
  { icon: BarChart3, label: 'Live analytics' },
  { icon: Boxes, label: 'Smart inventory' },
  { icon: ShieldCheck, label: 'Role-based security' },
  { icon: Users, label: 'Customer loyalty' },
];

// Decorative sparkline path for the preview card.
const SPARK = 'M0 38 C 18 34, 26 22, 44 25 S 70 36, 88 22 S 118 6, 136 12 S 160 20, 180 4';

function GlassCard({ className, float = 'animate-float', delay = 0, children }) {
  // Outer layer owns the entrance (framer transform); inner layer owns the idle float (CSS transform).
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      className={`absolute ${className}`}
    >
      <div className={`rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] ${float}`}>
        {children}
      </div>
    </motion.div>
  );
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputWrap = 'group relative flex items-center rounded-xl border transition-all duration-300 focus-within:border-gold-400 focus-within:shadow-[0_0_0_4px_rgba(194,154,86,0.14)]';

  return (
    <div className="min-h-screen flex bg-graphite-950">
      {/* ---------- Brand / showcase panel ---------- */}
      <div className="hidden lg:flex flex-[1.15] relative overflow-hidden flex-col justify-between p-12 xl:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#1E2028_0%,#0B0C10_60%)]" />
        <div className="absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full bg-gold-500/20 blur-[110px] animate-aurora" />
        <div className="absolute -bottom-48 -left-24 w-[30rem] h-[30rem] rounded-full bg-[#7E90B0]/15 blur-[110px] animate-aurora-slow" />
        <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full bg-gold-300/10 blur-[90px] animate-aurora" />
        {/* Fine grid, faded toward the edges. */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="relative flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-xl bg-gold-gradient flex items-center justify-center font-display font-bold text-xl text-graphite-950 shadow-gold">
            A
            <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/40" />
          </div>
          <div className="leading-none">
            <div className="font-display text-xl font-semibold text-white tracking-[0.14em]">AURELIA</div>
            <div className="text-[9px] tracking-[0.34em] uppercase text-gold-400/80 mt-1.5">Department Store</div>
          </div>
        </motion.div>

        <div className="relative grid grid-cols-[1fr] gap-10">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} className="max-w-xl">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-300/90 px-3 py-1.5 rounded-full border border-gold-400/20 bg-gold-500/10 mb-6">
              <Sparkles size={12} /> Retail intelligence platform
            </span>
            <h1 className="font-display text-5xl xl:text-[3.6rem] font-semibold text-white leading-[1.05] mb-6">
              Run your store with <em className="text-gold-gradient font-display italic pr-1">effortless</em> clarity.
            </h1>
            <p className="text-graphite-300 text-[15px] leading-relaxed max-w-md">
              Sales, inventory, purchasing, distribution, finance and customers, unified in one beautifully crafted workspace.
            </p>
            <div className="flex flex-wrap gap-2 mt-8">
              {FEATURES.map((f, i) => (
                <motion.span
                  key={f.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.35 + i * 0.08 }}
                  className="inline-flex items-center gap-2 text-xs text-graphite-200 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04]"
                >
                  <f.icon size={13} className="text-gold-400" /> {f.label}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* Floating product preview */}
          <div className="relative h-56 max-w-xl">
            <GlassCard className="left-0 top-2 w-72" delay={0.45}>
              <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] tracking-[0.18em] uppercase text-graphite-400">Today&apos;s revenue</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-md"><TrendingUp size={11} /> 17.9%</span>
              </div>
              <div className="font-display text-3xl text-white mb-3">₹2,93,799</div>
              <svg viewBox="0 0 180 42" className="w-full h-10" aria-hidden>
                <defs>
                  <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#D2AA6C" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#D2AA6C" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${SPARK} L180 42 L0 42 Z`} fill="url(#spark)" />
                <motion.path d={SPARK} fill="none" stroke="#D2AA6C" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, ease: EASE, delay: 0.8 }} />
              </svg>
              </div>
            </GlassCard>
            <GlassCard className="left-[17.5rem] top-0 w-56" float="animate-float-slow" delay={0.6}>
              <div className="p-4">
              <div className="text-[10px] tracking-[0.18em] uppercase text-graphite-400 mb-2">Inventory turnover</div>
              <div className="flex items-end gap-1.5 h-14">
                {[38, 52, 44, 66, 58, 74, 88].map((h, i) => (
                  <motion.span
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.9 + i * 0.07 }}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-gold-700/60 to-gold-300"
                  />
                ))}
              </div>
              </div>
            </GlassCard>
            <GlassCard className="left-[19rem] top-[8.5rem] w-60" delay={0.75}>
              <div className="p-4 flex items-center gap-3">
              <span className="relative w-9 h-9 rounded-xl bg-emerald-400/15 flex items-center justify-center">
                <ShieldCheck size={17} className="text-emerald-300" />
              </span>
              <div>
                <div className="text-xs text-white font-semibold">Access secured</div>
                <div className="text-[11px] text-graphite-400">Permissions enforced end-to-end</div>
              </div>
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-graphite-500">
          <span>© {new Date().getFullYear()} AURELIA Department Store</span>
          <span className="tracking-[0.24em] uppercase text-[10px]">Crafted for retail excellence</span>
        </div>
      </div>

      {/* ---------- Sign-in panel ---------- */}
      <div className="flex-1 relative flex items-center justify-center p-6 sm:p-10" style={{ background: 'var(--bg-app)' }}>
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(600px_300px_at_80%_0%,rgba(210,170,108,0.16),transparent_70%)]" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          className="relative w-full max-w-[26rem]"
        >
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center font-display font-bold text-graphite-950 shadow-gold">A</div>
            <span className="font-display text-xl font-semibold tracking-[0.12em]" style={{ color: 'var(--text-primary)' }}>AURELIA</span>
          </div>

          <div className="surface-card rounded-[1.75rem] p-8 sm:p-9 shadow-premium-lg relative overflow-hidden">
            <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
            <span className="eyebrow">Welcome back</span>
            <h2 className="font-display text-[2rem] leading-tight font-semibold mt-2 mb-1.5" style={{ color: 'var(--text-primary)' }}>Sign in</h2>
            <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>Access your AURELIA workspace.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email address</span>
                <div className={inputWrap} style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <Mail size={16} className="absolute left-3.5 text-graphite-400 transition-colors group-focus-within:text-gold-600" />
                  <input
                    type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@aurelia.test"
                    className="w-full bg-transparent pl-10 pr-3.5 py-3 text-sm rounded-xl focus:outline-none !shadow-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</span>
                <div className={inputWrap} style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <Lock size={16} className="absolute left-3.5 text-graphite-400 transition-colors group-focus-within:text-gold-600" />
                  <input
                    type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-transparent pl-10 pr-11 py-3 text-sm rounded-xl focus:outline-none !shadow-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 p-1.5 rounded-lg text-graphite-400 hover:text-gold-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <button
                type="submit" disabled={loading}
                className="sheen group w-full flex items-center justify-center gap-2 bg-gold-gradient text-graphite-950 rounded-xl py-3 text-sm font-bold shadow-gold transition-all duration-300 ease-luxe hover:-translate-y-0.5 hover:shadow-gold-glow active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0 mt-2"
              >
                <span className="relative z-[2] flex items-center gap-2">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : <>Sign in <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></>}
                </span>
              </button>
            </form>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
              <span className="eyebrow !text-[10px]">Demo accounts</span>
              <span className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc, i) => (
                <motion.button
                  key={acc.email}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.3 + i * 0.07 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setEmail(acc.email); setPassword(acc.password); }}
                  title={acc.email}
                  className={`surface-card rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors hover:border-gold-400 ${email === acc.email ? '!border-gold-400 bg-gold-50' : ''}`}
                  style={{ color: 'var(--text-primary)' }}
                >
                  {acc.role}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default Login;
