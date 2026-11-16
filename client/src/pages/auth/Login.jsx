import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye, EyeOff, ArrowRight, Mail, Lock, Loader2, TrendingUp, ShieldCheck, Sparkles, Boxes, BarChart3, Users, Moon, Sun,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'AshwinLav@gmail.com', password: 'Admin@123' },
  { role: 'Cashier', email: 'cashier@aurelia.test', password: 'Password@123' },
  { role: 'Accountant', email: 'accountant@aurelia.test', password: 'Password@123' },
];

const EASE = [0.22, 1, 0.36, 1];
const FEATURES = [
  { icon: BarChart3, label: 'Live analytics', text: 'Revenue, margin and turnover in real time.' },
  { icon: Boxes, label: 'Smart inventory', text: 'Racks, batches, expiry and low-stock alerts.' },
  { icon: ShieldCheck, label: 'Role-based security', text: 'Every screen and action is permissioned.' },
  { icon: Users, label: 'Customer loyalty', text: 'Points, outstanding and purchase history.' },
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
      className={className}
    >
      <div className={`rounded-2xl border border-white/15 bg-white/[0.08] backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] ${float}`}>
        {children}
      </div>
    </motion.div>
  );
}

function Logo({ size = 'md' }) {
  const box = size === 'lg' ? 'w-11 h-11 text-xl' : 'w-10 h-10 text-lg';
  return (
    <div className={`relative ${box} rounded-xl bg-brand-gradient flex items-center justify-center font-display font-extrabold text-white shadow-brand shrink-0`}>
      A
      <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/30" />
    </div>
  );
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
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

  const inputWrap = 'group relative flex items-center rounded-xl border transition-all duration-300 hover:border-[var(--border-strong)] focus-within:!border-brand-400 focus-within:shadow-[0_0_0_4px_var(--focus-ring)]';

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-app)' }}>
      {/* ---------- Brand / showcase panel ---------- */}
      <div className="hidden lg:flex flex-[1.1] relative overflow-hidden flex-col justify-between p-12 xl:p-16 m-3 rounded-[2rem] bg-[#0B0B24]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#2A237A_0%,#12103A_45%,#0A0A1F_100%)]" />
        <div className="absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full bg-brand-500/40 blur-[120px] animate-aurora" />
        <div className="absolute -bottom-48 -left-24 w-[30rem] h-[30rem] rounded-full bg-accent-500/20 blur-[120px] animate-aurora-slow" />
        <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full bg-fuchsia-500/15 blur-[100px] animate-aurora" />
        {/* Fine grid, faded toward the edges. */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="relative flex items-center gap-3">
          <Logo size="lg" />
          <div className="leading-none">
            <div className="font-display text-xl font-extrabold text-white tracking-[0.04em]">AURELIA</div>
            <div className="text-[11px] text-white/55 mt-1.5">Department Store</div>
          </div>
        </motion.div>

        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} className="max-w-xl">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-white/85 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.07] backdrop-blur mb-6">
              <Sparkles size={12} className="text-accent-300" /> Retail operations platform
            </span>
            <h1 className="font-display text-[2.75rem] xl:text-[3.4rem] font-extrabold text-white leading-[1.06] mb-5">
              Run your store with{' '}
              <span className="bg-gradient-to-r from-[#A9ADFF] via-[#D4B0FF] to-[#67E8F9] bg-clip-text text-transparent">complete clarity.</span>
            </h1>
            <p className="text-white/65 text-[15px] leading-relaxed max-w-md">
              Sales, inventory, purchasing, distribution, finance and customers, unified in one workspace.
            </p>
          </motion.div>

          {/* Product preview */}
          <div className="flex flex-wrap items-start gap-4 mt-9 max-w-xl">
            <GlassCard className="w-72" delay={0.45}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/60">Today&apos;s revenue</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-400/15 px-1.5 py-0.5 rounded-full"><TrendingUp size={11} /> 17.9%</span>
                </div>
                <div className="font-display text-3xl font-bold text-white mb-3">₹2,93,799</div>
                <svg viewBox="0 0 180 42" className="w-full h-10" aria-hidden>
                  <defs>
                    <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#A9ADFF" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#A9ADFF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${SPARK} L180 42 L0 42 Z`} fill="url(#spark)" />
                  <motion.path d={SPARK} fill="none" stroke="#A9ADFF" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, ease: EASE, delay: 0.8 }} />
                </svg>
              </div>
            </GlassCard>
            <div className="flex flex-col gap-4">
              <GlassCard className="w-56" float="animate-float-slow" delay={0.6}>
                <div className="p-4">
                  <div className="text-xs text-white/60 mb-2">Inventory turnover</div>
                  <div className="flex items-end gap-1.5 h-12">
                    {[38, 52, 44, 66, 58, 74, 88].map((h, i) => (
                      <motion.span
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ duration: 0.9, ease: EASE, delay: 0.9 + i * 0.07 }}
                        className="flex-1 rounded-t-[4px] bg-gradient-to-t from-brand-500/70 to-accent-300"
                      />
                    ))}
                  </div>
                </div>
              </GlassCard>
              <GlassCard className="w-56" delay={0.75}>
                <div className="p-3.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-emerald-400/15 flex items-center justify-center shrink-0">
                    <ShieldCheck size={17} className="text-emerald-300" />
                  </span>
                  <div>
                    <div className="text-xs text-white font-semibold">Access secured</div>
                    <div className="text-[11px] text-white/55">Permissions enforced end-to-end</div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-9 max-w-xl">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.5 + i * 0.08 }}
                className="flex items-start gap-3"
              >
                <span className="w-8 h-8 rounded-lg bg-white/[0.08] border border-white/10 flex items-center justify-center shrink-0">
                  <f.icon size={15} className="text-[#A9ADFF]" />
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-white">{f.label}</div>
                  <div className="text-xs text-white/55 leading-snug">{f.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-white/45">© {new Date().getFullYear()} AURELIA Department Store</div>
      </div>

      {/* ---------- Sign-in panel ---------- */}
      <div className="flex-1 relative flex items-center justify-center p-5 sm:p-10">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          title="Toggle theme"
          className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center border transition-colors hover:bg-[var(--hover-tint)]"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)', background: 'var(--bg-surface)' }}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          className="relative w-full max-w-[26rem]"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo />
            <div className="leading-none">
              <div className="font-display text-xl font-extrabold tracking-[0.04em]" style={{ color: 'var(--text-primary)' }}>AURELIA</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Department Store</div>
            </div>
          </div>

          <div className="glass-panel rounded-[1.75rem] p-7 sm:p-9 relative overflow-hidden">
            <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent" />
            <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-brand-400/15 blur-3xl" />
            <h2 className="relative font-display text-[1.75rem] leading-tight font-extrabold mb-1.5" style={{ color: 'var(--text-primary)' }}>Welcome back</h2>
            <p className="relative text-sm mb-7" style={{ color: 'var(--text-secondary)' }}>Sign in to your AURELIA workspace.</p>

            <form onSubmit={handleSubmit} className="relative space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email address</span>
                <div className={inputWrap} style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <Mail size={16} className="absolute left-3.5 text-graphite-400 transition-colors group-focus-within:text-brand-600" />
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
                  <Lock size={16} className="absolute left-3.5 text-graphite-400 transition-colors group-focus-within:text-brand-600" />
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
                    className="absolute right-2.5 p-1.5 rounded-lg text-graphite-400 hover:text-brand-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <button
                type="submit" disabled={loading}
                className="sheen group w-full flex items-center justify-center gap-2 bg-brand-gradient text-white rounded-xl py-3 text-sm font-semibold shadow-brand transition-all duration-300 ease-luxe hover:-translate-y-0.5 hover:shadow-brand-glow active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0 !mt-6"
              >
                <span className="relative z-[2] flex items-center gap-2">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : <>Sign in <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></>}
                </span>
              </button>
            </form>

            <p className="relative flex items-center justify-center gap-1.5 text-xs mt-5" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck size={13} className="text-emerald-500" /> Encrypted sign-in · role-based access
            </p>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Demo accounts — click to fill</span>
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
                  className={`surface-card rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors hover:border-brand-400 ${email === acc.email ? '!border-brand-400 bg-brand-50 text-brand-700' : ''}`}
                  style={email === acc.email ? undefined : { color: 'var(--text-primary)' }}
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
