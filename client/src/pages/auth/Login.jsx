import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, animate, motion, useAnimationControls } from 'framer-motion';
import {
  AlertCircle, ArrowRight, BarChart3, Boxes, Check, CheckCircle2, ChevronDown, Eye, EyeOff, Info, KeyRound,
  Loader2, Lock, Mail, Moon, ShieldCheck, Sparkles, Sun, TrendingUp, Truck, Users, Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import useServerStatus from '../../hooks/useServerStatus.js';
import useNow, { greetingFor } from '../../hooks/useNow.js';
import StatusPill from '../../components/ui/StatusPill.jsx';

// ---------------------------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------------------------

// Seeded demo logins (see server/seed/seed.js). The first four are shown by default.
const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'ashwinlav@gmail.com', password: 'Admin@123', tone: 'from-gold-300 to-gold-600' },
  { role: 'Cashier', email: 'cashier@aurelia.test', password: 'Password@123', tone: 'from-emerald-300 to-emerald-600' },
  { role: 'Accountant', email: 'accountant@aurelia.test', password: 'Password@123', tone: 'from-sky-300 to-sky-600' },
  { role: 'Admin', email: 'admin@aurelia.test', password: 'Password@123', tone: 'from-amber-300 to-orange-500' },
  { role: 'Store Manager', email: 'storemanager@aurelia.test', password: 'Password@123', tone: 'from-violet-300 to-violet-600' },
  { role: 'DC Manager', email: 'dcmanager@aurelia.test', password: 'Password@123', tone: 'from-teal-300 to-teal-600' },
  { role: 'Purchase Manager', email: 'purchasemanager@aurelia.test', password: 'Password@123', tone: 'from-rose-300 to-rose-600' },
  { role: 'Inventory Manager', email: 'inventorymanager@aurelia.test', password: 'Password@123', tone: 'from-lime-300 to-lime-600' },
  { role: 'Sales Manager', email: 'salesmanager@aurelia.test', password: 'Password@123', tone: 'from-fuchsia-300 to-fuchsia-600' },
  { role: 'Auditor', email: 'auditor@aurelia.test', password: 'Password@123', tone: 'from-slate-300 to-slate-600' },
];

const ROTATING_WORDS = ['clarity', 'confidence', 'precision', 'control'];

const FEATURES = [
  { icon: BarChart3, label: 'Live analytics' },
  { icon: Boxes, label: 'Smart inventory' },
  { icon: Truck, label: 'Distribution' },
  { icon: ShieldCheck, label: 'Role-based security' },
  { icon: Users, label: 'Customer loyalty' },
];

const HIGHLIGHTS = [
  { icon: Zap, title: 'Billing in seconds', text: 'Barcode-first POS with GST, discounts and split payments built in.' },
  { icon: TrendingUp, title: 'Decisions, not guesswork', text: 'ITR, holding period, EBITDA and product ROI on one live dashboard.' },
  { icon: Boxes, title: 'Stock that finds itself', text: 'Batches, expiry, rack locator and DC transfers tracked end to end.' },
];

const EASE = [0.22, 1, 0.36, 1];
const REMEMBER_KEY = 'aurelia_remember_email';
const SPARK = 'M0 38 C 18 34, 26 22, 44 25 S 70 36, 88 22 S 118 6, 136 12 S 160 20, 180 4';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};

const initials = (label) => label.split(' ').map((w) => w[0]).slice(0, 2).join('');

// ---------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------

const formatInr = (v) => Math.round(v).toLocaleString('en-IN');

// Animates once per `to` value; formatting changes never restart it.
function CountUp({ to, prefix = '', duration = 1.8, delay = 0.6, format = formatInr }) {
  const ref = useRef(null);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const controls = animate(0, to, {
      duration, delay, ease: EASE,
      onUpdate: (v) => { if (ref.current) ref.current.textContent = prefix + fmt.current(v); },
    });
    return () => controls.stop();
  }, [to, prefix, duration, delay]);
  return <span ref={ref}>{prefix}0</span>;
}

// ---------------------------------------------------------------------------------------------
// Small UI pieces
// ---------------------------------------------------------------------------------------------

function Logo({ light = false, size = 'md' }) {
  const box = size === 'sm' ? 'w-10 h-10 text-lg' : 'w-11 h-11 text-xl';
  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${box} rounded-xl bg-gold-gradient flex items-center justify-center font-display font-bold text-graphite-950 shadow-gold`}>
        A
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/40" />
      </div>
      <div className="leading-none">
        <div className={`font-display text-xl font-semibold tracking-[0.14em] ${light ? 'text-white' : ''}`} style={light ? undefined : { color: 'var(--text-primary)' }}>AURELIA</div>
        <div className={`text-[9px] tracking-[0.34em] uppercase mt-1.5 ${light ? 'text-gold-400/80' : 'text-gold-600'}`}>Department Store</div>
      </div>
    </div>
  );
}

function GlassCard({ className, float = 'animate-float', delay = 0, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      className={`absolute ${className}`}
    >
      <div className={`rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] ${float} motion-reduce:animate-none`}>
        {children}
      </div>
    </motion.div>
  );
}

// Input with a floating label, leading icon and optional trailing slot.
function Field({ id, label, icon: Icon, value, invalid, valid, trailing, inputRef, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;
  return (
    <div
      className={`group relative flex items-center rounded-2xl border transition-all duration-300 ${
        invalid
          ? '!border-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]'
          : 'focus-within:!border-gold-400 focus-within:shadow-[0_0_0_4px_rgba(194,154,86,0.16)]'
      }`}
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}
    >
      <Icon size={17} className={`absolute left-4 transition-colors duration-300 ${invalid ? 'text-rose-400' : focused ? 'text-gold-500' : 'text-graphite-400'}`} />
      <label
        htmlFor={id}
        className={`absolute left-11 pointer-events-none transition-all duration-200 ease-luxe ${
          raised ? 'top-2 text-[10px] font-bold tracking-[0.08em] uppercase' : 'top-1/2 -translate-y-1/2 text-sm'
        }`}
        style={{ color: raised && focused ? '#A67F42' : 'var(--text-muted)' }}
      >
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        aria-invalid={invalid || undefined}
        className="peer w-full bg-transparent pl-11 pr-12 pt-6 pb-2 text-sm rounded-2xl focus:outline-none !shadow-none !border-0"
        style={{ color: 'var(--text-primary)' }}
        {...props}
      />
      <div className="absolute right-3 flex items-center gap-1">
        <AnimatePresence>
          {valid && !trailing && (
            <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check size={12} className="text-emerald-500" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
        {trailing}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Showcase (desktop left panel)
// ---------------------------------------------------------------------------------------------

function Showcase({ status, recheck }) {
  const panelRef = useRef(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const a = setInterval(() => setWordIndex((i) => (i + 1) % ROTATING_WORDS.length), 2600);
    const b = setInterval(() => setHighlight((i) => (i + 1) % HIGHLIGHTS.length), 5200);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  // Spotlight follows the cursor; written to CSS variables so it never re-renders React.
  function onMove(e) {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }

  const H = HIGHLIGHTS[highlight];

  return (
    <div
      ref={panelRef}
      onMouseMove={onMove}
      className="hidden lg:flex flex-[1.15] relative overflow-hidden flex-col justify-between gap-8 px-12 py-10 xl:px-16 xl:py-12 bg-graphite-950"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#1E2028_0%,#0B0C10_60%)]" />
      <div className="absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full bg-gold-500/20 blur-[110px] animate-aurora motion-reduce:animate-none" />
      <div className="absolute -bottom-48 -left-24 w-[30rem] h-[30rem] rounded-full bg-[#7E90B0]/15 blur-[110px] animate-aurora-slow motion-reduce:animate-none" />
      <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full bg-gold-300/10 blur-[90px] animate-aurora motion-reduce:animate-none" />
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{ background: 'radial-gradient(420px circle at var(--mx, 70%) var(--my, 30%), rgba(210,170,108,0.13), transparent 60%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="relative flex items-center justify-between">
        <Logo light />
        <StatusPill status={status} onRetry={recheck} tone="dark" />
      </motion.div>

      <div className="relative grid gap-8 [@media(min-height:880px)]:gap-10">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} className="max-w-xl">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-300/90 px-3 py-1.5 rounded-full border border-gold-400/20 bg-gold-500/10 mb-6">
            <Sparkles size={12} /> Retail intelligence platform
          </span>
          <h1 className="font-display text-[2.9rem] xl:text-[3.4rem] font-semibold text-white leading-[1.08] mb-5">
            Run your store with{' '}
            <span className="relative inline-flex overflow-hidden align-bottom pb-1">
              <AnimatePresence mode="wait">
                <motion.em
                  key={ROTATING_WORDS[wordIndex]}
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '-100%', opacity: 0 }}
                  transition={{ duration: 0.55, ease: EASE }}
                  className="text-gold-gradient font-display italic pr-1 inline-block"
                >
                  {ROTATING_WORDS[wordIndex]}.
                </motion.em>
              </AnimatePresence>
            </span>
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
                whileHover={{ y: -2, borderColor: 'rgba(210,170,108,0.45)' }}
                className="inline-flex items-center gap-2 text-xs text-graphite-200 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] cursor-default"
              >
                <f.icon size={13} className="text-gold-400" /> {f.label}
              </motion.span>
            ))}
          </div>
        </motion.div>

        <div className="relative h-56 max-w-xl">
          <GlassCard className="left-0 top-2 w-72" delay={0.45}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] tracking-[0.18em] uppercase text-graphite-400">Today&apos;s revenue</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-md"><TrendingUp size={11} /> 17.9%</span>
              </div>
              <div className="font-display text-3xl text-white mb-3 tabular-nums"><CountUp to={293799} prefix="₹" /></div>
              <svg viewBox="0 0 180 42" className="w-full h-10" aria-hidden>
                <defs>
                  <linearGradient id="login-spark" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#D2AA6C" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#D2AA6C" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <motion.path d={`${SPARK} L180 42 L0 42 Z`} fill="url(#login-spark)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.6 }} />
                <motion.path d={SPARK} fill="none" stroke="#D2AA6C" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, ease: EASE, delay: 0.8 }} />
              </svg>
            </div>
          </GlassCard>
          <GlassCard className="left-[17.5rem] top-0 w-56" float="animate-float-slow" delay={0.6}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-[0.18em] uppercase text-graphite-400">Inventory turnover</span>
                <span className="text-[11px] font-semibold text-gold-300 tabular-nums"><CountUp to={3.4} delay={1} format={(v) => `${v.toFixed(1)}×`} /></span>
              </div>
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
                <span className="absolute inset-0 rounded-xl bg-emerald-400/20 animate-pulse-ring motion-reduce:animate-none" />
                <ShieldCheck size={17} className="relative text-emerald-300" />
              </span>
              <div>
                <div className="text-xs text-white font-semibold">Access secured</div>
                <div className="text-[11px] text-graphite-400">Permissions enforced end-to-end</div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Rotating product highlight (only when there is vertical room) */}
        <div className="max-w-md hidden [@media(min-height:940px)]:block">
          <div className="relative h-[4.5rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={H.title}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0 flex gap-3"
              >
                <span className="shrink-0 w-9 h-9 rounded-xl border border-gold-400/25 bg-gold-500/10 flex items-center justify-center">
                  <H.icon size={16} className="text-gold-300" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{H.title}</div>
                  <div className="text-[13px] text-graphite-400 leading-relaxed">{H.text}</div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex gap-1.5 mt-2">
            {HIGHLIGHTS.map((h, i) => (
              <button
                key={h.title}
                type="button"
                aria-label={`Show highlight: ${h.title}`}
                onClick={() => setHighlight(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ease-luxe ${i === highlight ? 'w-8 bg-gold-400' : 'w-3 bg-white/20 hover:bg-white/40'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-between text-xs text-graphite-500">
        <span>© {new Date().getFullYear()} AURELIA Department Store</span>
        <span className="tracking-[0.24em] uppercase text-[10px]">Crafted for retail excellence</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export function Login() {
  const rememberedEmail = useMemo(() => storage.get(REMEMBER_KEY) || '', []);
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!rememberedEmail);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [phase, setPhase] = useState('idle'); // idle | loading | success
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [welcomeName, setWelcomeName] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(false);

  const { user, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { status, recheck } = useServerStatus();
  const now = useNow(30000);
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const destination = location.state?.from?.pathname || '/dashboard';
  const shakeControls = useAnimationControls();

  useEffect(() => {
    if (shake) shakeControls.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.45, ease: 'easeInOut' } });
  }, [shake, shakeControls]);

  useEffect(() => {
    (rememberedEmail ? passwordRef : emailRef).current?.focus();
  }, [rememberedEmail]);

  const emailValid = EMAIL_RE.test(email.trim());
  const emailError = touched.email && email && !emailValid ? 'Enter a valid email address.' : '';
  const passwordError = touched.password && !password ? 'Password is required.' : '';

  const signIn = useCallback(async (em, pw) => {
    setError('');
    setPhase('loading');
    try {
      const u = await login(em.trim(), pw);
      if (remember) storage.set(REMEMBER_KEY, em.trim()); else storage.remove(REMEMBER_KEY);
      setWelcomeName(u?.name?.split(' ')[0] || '');
      setPhase('success');
      setTimeout(() => navigate(destination, { replace: true }), 1100);
    } catch (err) {
      setPhase('idle');
      setError(status === 'offline' && /unable to complete/i.test(err.message)
        ? 'Cannot reach the server. Make sure the API is running, then try again.'
        : err.message);
      setShake((n) => n + 1);
      passwordRef.current?.select();
    }
  }, [login, remember, navigate, destination, status]);

  function handleSubmit(e) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!emailValid || !password) {
      setShake((n) => n + 1);
      (!emailValid ? emailRef : passwordRef).current?.focus();
      return;
    }
    signIn(email, password);
  }

  function fillDemo(acc, submit = false) {
    setEmail(acc.email);
    setPassword(acc.password);
    setTouched({ email: false, password: false });
    setError('');
    if (submit) signIn(acc.email, acc.password);
    else passwordRef.current?.focus();
  }

  const onKey = (e) => setCapsLock(!!e.getModifierState?.('CapsLock'));

  // Already signed in (and not in the middle of the success animation): skip the form.
  if (user && phase === 'idle') return <Navigate to={destination} replace />;

  const busy = phase !== 'idle';
  const roles = showAllRoles ? DEMO_ACCOUNTS : DEMO_ACCOUNTS.slice(0, 4);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen min-h-[100dvh] flex bg-graphite-950">
        <Showcase status={status} recheck={recheck} />

        {/* ---------- Sign-in panel ---------- */}
        <div className="flex-1 relative flex flex-col min-w-0" style={{ background: 'var(--bg-app)' }}>
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(600px_300px_at_80%_0%,rgba(210,170,108,0.16),transparent_70%)]" />

          {/* Mobile / tablet hero */}
          <div className="lg:hidden relative overflow-hidden bg-graphite-950 px-5 sm:px-10 pt-6 pb-16">
            <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-gold-500/25 blur-[80px] animate-aurora motion-reduce:animate-none" />
            <div className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-[#7E90B0]/20 blur-[80px] animate-aurora-slow motion-reduce:animate-none" />
            <div className="relative flex items-center justify-between gap-3">
              <Logo light size="sm" />
              <button
                type="button" onClick={toggleTheme} aria-label="Toggle colour theme"
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.06] text-graphite-200 flex items-center justify-center"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}
              className="relative font-display text-[1.9rem] sm:text-4xl font-semibold text-white leading-tight mt-8"
            >
              Run your store with <em className="text-gold-gradient italic">clarity.</em>
            </motion.h1>
            <p className="relative text-graphite-300 text-sm mt-2 max-w-sm">Sales, stock, finance and customers in one workspace.</p>
          </div>

          {/* Desktop top bar */}
          <div className="hidden lg:flex relative justify-end items-center gap-3 px-10 pt-8">
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              type="button" onClick={toggleTheme} aria-label="Toggle colour theme" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="surface-card w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:!border-gold-400"
              style={{ color: 'var(--text-secondary)' }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.25 }}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>

          <div className="relative flex-1 flex items-start lg:items-center justify-center px-4 sm:px-10 pb-10 -mt-10 lg:mt-0 lg:py-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
              className="relative w-full max-w-[27rem]"
            >
              <motion.div
                animate={shakeControls}
                className="surface-card rounded-[1.75rem] p-6 sm:p-9 shadow-premium-lg relative overflow-hidden"
              >
                <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" />

                {/* Success overlay */}
                <AnimatePresence>
                  {phase === 'success' && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-8"
                      style={{ background: 'var(--bg-surface)' }}
                    >
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                        className="relative w-20 h-20 rounded-full bg-gold-gradient flex items-center justify-center shadow-gold-glow"
                      >
                        <span className="absolute inset-0 rounded-full bg-gold-400/40 animate-pulse-ring motion-reduce:animate-none" />
                        <svg viewBox="0 0 24 24" className="relative w-10 h-10 text-graphite-950" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.2, ease: EASE }} />
                        </svg>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, ease: EASE }}>
                        <div className="font-display text-2xl font-semibold mt-6" style={{ color: 'var(--text-primary)' }}>
                          Welcome{welcomeName ? `, ${welcomeName}` : ''}!
                        </div>
                        <div className="text-sm mt-1 flex items-center justify-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                          <Loader2 size={14} className="animate-spin" /> Preparing your workspace…
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="eyebrow">{greetingFor(now)}</span>
                    <h2 className="font-display text-[1.9rem] sm:text-[2rem] leading-tight font-semibold mt-2 mb-1.5" style={{ color: 'var(--text-primary)' }}>Sign in</h2>
                  </div>
                  <div className="lg:hidden pt-1"><StatusPill status={status} onRetry={recheck} /></div>
                </div>
                <p className="text-sm mb-7" style={{ color: 'var(--text-secondary)' }}>Access your AURELIA workspace.</p>

                <AnimatePresence>
                  {(error || status === 'offline') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="overflow-hidden"
                      role="alert"
                    >
                      <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] ${
                        error ? 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      }`}>
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          {error || 'The API server is not responding. Start it with "npm run dev" from the project folder.'}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <div>
                    <Field
                      id="login-email" label="Email address" icon={Mail} type="email" autoComplete="username" inputMode="email"
                      value={email} inputRef={emailRef} disabled={busy}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                      invalid={!!emailError} valid={emailValid}
                    />
                    <FieldHint text={emailError} />
                  </div>

                  <div>
                    <Field
                      id="login-password" label="Password" icon={Lock} type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                      value={password} inputRef={passwordRef} disabled={busy}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      onKeyDown={onKey} onKeyUp={onKey}
                      onBlur={() => { setTouched((t) => ({ ...t, password: true })); setCapsLock(false); }}
                      invalid={!!passwordError}
                      trailing={(
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="p-1.5 rounded-lg text-graphite-400 hover:text-gold-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      )}
                    />
                    <AnimatePresence>
                      {capsLock && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400 mt-1.5 ml-1">
                          <KeyRound size={13} /> Caps Lock is on
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <FieldHint text={passwordError} />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="relative">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
                        <span className="block w-9 h-5 rounded-full transition-colors duration-300 bg-graphite-200 peer-checked:bg-gold-500 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400 peer-focus-visible:ring-offset-2" />
                        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ease-luxe peer-checked:translate-x-4" />
                      </span>
                      Remember me
                    </label>
                    <button type="button" onClick={() => setShowForgot((s) => !s)} className="text-[13px] font-semibold text-gold-600 hover:text-gold-500 transition-colors">
                      Forgot password?
                    </button>
                  </div>

                  <AnimatePresence>
                    {showForgot && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden"
                      >
                        <div className="flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-snug" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
                          <Info size={16} className="shrink-0 mt-0.5 text-gold-600" />
                          <span>For security, passwords are reset by an administrator. Ask your Admin to reset it from <b>Settings → Users</b>, then change it after signing in.</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit" disabled={busy}
                    whileTap={busy ? undefined : { scale: 0.985 }}
                    className="sheen group w-full flex items-center justify-center gap-2 bg-gold-gradient text-graphite-950 rounded-2xl py-3.5 text-sm font-bold shadow-gold transition-all duration-300 ease-luxe hover:-translate-y-0.5 hover:shadow-gold-glow active:translate-y-0 disabled:opacity-80 disabled:hover:translate-y-0 !mt-6"
                  >
                    <span className="relative z-[2] flex items-center gap-2">
                      {phase === 'loading' && <><Loader2 size={16} className="animate-spin" /> Signing in…</>}
                      {phase === 'success' && <><CheckCircle2 size={16} /> Signed in</>}
                      {phase === 'idle' && <>Sign in <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></>}
                    </span>
                  </motion.button>
                </form>

                <div className="flex items-center justify-center gap-1.5 text-[11px] mt-5" style={{ color: 'var(--text-muted)' }}>
                  <ShieldCheck size={12} className="text-emerald-500" /> Encrypted session · Signs out automatically after 8 hours
                </div>
              </motion.div>

              {/* Quick access */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
                  <span className="eyebrow !text-[10px]">Quick demo access</span>
                  <span className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
                </div>
                <motion.div layout className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2">
                  <AnimatePresence initial={false}>
                    {roles.map((acc, i) => {
                      const active = email.toLowerCase() === acc.email;
                      return (
                        <motion.div
                          key={acc.email}
                          layout
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.35, ease: EASE, delay: i < 4 ? 0.3 + i * 0.06 : (i - 4) * 0.035 }}
                          className={`surface-card group relative rounded-xl flex items-center transition-colors hover:!border-gold-400 ${active ? '!border-gold-400 ring-2 ring-gold-400/20' : ''}`}
                        >
                          <button
                            type="button" disabled={busy}
                            onClick={() => fillDemo(acc)}
                            title={`Fill in ${acc.email}`}
                            className="flex-1 min-w-0 flex items-center gap-2 pl-2 pr-1 py-2 text-left"
                          >
                            <span className={`shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${acc.tone} text-[10px] font-bold text-white flex items-center justify-center`}>
                              {initials(acc.role)}
                            </span>
                            <span className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{acc.role}</span>
                          </button>
                          <button
                            type="button" disabled={busy}
                            onClick={() => fillDemo(acc, true)}
                            aria-label={`Sign in as ${acc.role}`}
                            title={`Sign in as ${acc.role}`}
                            className="shrink-0 mr-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-graphite-400 transition-all hover:bg-gold-500 hover:text-graphite-950 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
                <button
                  type="button"
                  onClick={() => setShowAllRoles((s) => !s)}
                  className="mx-auto mt-3 flex items-center gap-1 text-xs font-semibold text-gold-600 hover:text-gold-500 transition-colors"
                >
                  {showAllRoles ? 'Show fewer roles' : `Show all ${DEMO_ACCOUNTS.length} roles`}
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showAllRoles ? 'rotate-180' : ''}`} />
                </button>
              </div>

              <p className="lg:hidden text-center text-[11px] mt-8" style={{ color: 'var(--text-muted)' }}>
                © {now.getFullYear()} AURELIA Department Store
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

function FieldHint({ text }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-[12px] font-medium text-rose-500 mt-1.5 ml-1">
          {text}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export default Login;
