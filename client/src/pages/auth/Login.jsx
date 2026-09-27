import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'AshwinLav@gmail.com', password: 'Admin@123' },
  { role: 'Cashier', email: 'cashier@aurelia.test', password: 'Password@123' },
  { role: 'Accountant', email: 'accountant@aurelia.test', password: 'Password@123' },
];

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

  return (
    <div className="min-h-screen flex" style={{ background: '#0B0C10' }}>
      <div className="hidden lg:flex flex-1 relative overflow-hidden flex-col justify-between p-14">
        <div className="absolute inset-0 bg-gradient-to-br from-graphite-950 via-graphite-900 to-graphite-950" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-gold-500/5 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold-500 flex items-center justify-center font-display font-bold text-graphite-950">A</div>
          <span className="font-display text-xl font-semibold text-white tracking-wide">AURELIA</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative max-w-lg">
          <h1 className="font-display text-4xl font-semibold text-white leading-tight mb-5">
            A smarter way to run your department store.
          </h1>
          <p className="text-graphite-300 text-base leading-relaxed">
            Sales, inventory, purchasing, distribution, finance and customer management in one intelligent platform.
          </p>
        </motion.div>

        <div className="relative text-xs text-graphite-500">© {new Date().getFullYear()} AURELIA Department Store. All rights reserved.</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6" style={{ background: 'var(--bg-surface, #FAF9F6)' }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gold-500 flex items-center justify-center font-display font-bold text-graphite-950">A</div>
            <span className="font-display text-lg font-semibold tracking-wide">AURELIA</span>
          </div>

          <h2 className="font-display text-2xl font-semibold mb-1.5 text-graphite-900">Welcome back</h2>
          <p className="text-sm text-graphite-500 mb-8">Sign in to your AURELIA workspace.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-graphite-600 mb-1.5">Email address</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@aurelia.test"
                className="w-full rounded-lg border border-graphite-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-graphite-600 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-graphite-200 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-graphite-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-graphite-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-graphite-800 transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'} {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-graphite-200">
            <p className="text-xs font-medium text-graphite-500 mb-2.5">Demo accounts (click to fill)</p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => { setEmail(acc.email); setPassword(acc.password); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-graphite-200 text-xs hover:border-gold-400 hover:bg-gold-50 transition-colors"
                >
                  <span className="font-medium text-graphite-700">{acc.role}</span>
                  <span className="text-graphite-400">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default Login;
