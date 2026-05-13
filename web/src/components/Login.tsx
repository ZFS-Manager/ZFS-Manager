import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Lock, ArrowRight, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => Promise<void>;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError(false);
    
    try {
      await onLogin(password);
      // If success, App.tsx will re-render and Login will unmount
    } catch (err) {
      setIsError(true);
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex bg-[#070B14]">
      {/* LEFT PANEL - visible only on lg+ screens */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between p-16 border-r border-white/[0.04] relative overflow-hidden">
        {/* Subtle dot grid background */}
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#070B14]/80" />

        {/* Top: Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-500/20 border border-sky-500/30 rounded-xl flex items-center justify-center">
            <HardDrive size={18} className="text-sky-400" />
          </div>
          <span className="text-sm font-bold text-white/50 tracking-widest uppercase">ZFS Manager</span>
        </div>

        {/* Middle: Headline */}
        <div className="relative">
          <p className="text-[11px] font-black text-sky-400/60 uppercase tracking-[0.3em] mb-6">Infrastructure Control</p>
          <h1 className="text-6xl font-black text-white tracking-tighter leading-[1.05] mb-8">
            Storage<br />
            <span className="text-white/25">at scale.</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
            Real-time ZFS pool management, performance telemetry, and storage analytics for production infrastructure.
          </p>
        </div>

        {/* Bottom: Stats row */}
        <div className="relative flex items-center gap-10">
          <div>
            <p className="text-xl font-black text-white tabular-nums">ZFS</p>
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] mt-0.5">Native</p>
          </div>
          <div className="h-10 w-px bg-white/[0.05]" />
          <div>
            <p className="text-xl font-black text-white tabular-nums">OpenZFS</p>
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] mt-0.5">Compatible</p>
          </div>
          <div className="h-10 w-px bg-white/[0.05]" />
          <div>
            <p className="text-xl font-black text-white tabular-nums">REST</p>
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] mt-0.5">API</p>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - login form */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div className="absolute top-8 right-8 hidden lg:flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">System Online</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          {/* Mobile-only logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-sky-500/20 border border-sky-500/30 rounded-xl flex items-center justify-center">
              <HardDrive size={16} className="text-sky-400" />
            </div>
            <span className="text-sm font-bold text-white/50 tracking-widest uppercase">ZFS Manager</span>
          </div>

          <h2 className="text-3xl font-black text-white tracking-tight mb-1">Welcome back</h2>
          <p className="text-sm text-slate-500 mb-10">Enter your API access token to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Access Token</label>
              <div className={`flex items-center gap-3 border ${isError ? 'border-rose-500/50 bg-rose-500/5' : 'border-white/[0.08] bg-white/[0.03]'} rounded-xl px-4 py-3.5 focus-within:border-sky-500/40 focus-within:bg-white/[0.04] transition-all`}>
                <Lock size={16} className={isError ? 'text-rose-400' : 'text-slate-600'} />
                <input
                  type="password"
                  placeholder="tok_••••••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-transparent border-none outline-none text-white placeholder:text-slate-700 w-full text-sm font-mono tracking-wider"
                  autoFocus
                />
              </div>
              <AnimatePresence>
                {isError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-2 text-[11px] text-rose-400 font-bold flex items-center gap-1.5"
                  >
                    <AlertCircle size={11} />
                    Invalid token — authentication failed
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full mt-2 py-3.5 px-6 rounded-xl font-black text-[13px] tracking-wide bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-slate-700">
            Protected by API key authentication · TLS encrypted
          </p>
        </motion.div>
      </div>
    </div>
  );
}
