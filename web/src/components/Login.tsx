import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Lock, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError(false);
    
    // Simulate slight delay for premium feel
    setTimeout(() => {
      onLogin(password);
      setIsLoading(false);
      // Parent will handle actual verification and set error if it fails
    }, 800);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#070B14] overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zfs-accent/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md p-10 glass-panel border-white/[0.08] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-20 h-20 bg-zfs-accent rounded-[28px] flex items-center justify-center shadow-[0_20px_40px_rgba(59,130,246,0.4)] mb-8"
          >
            <HardDrive className="text-white" size={40} />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-3">ZFS Manager</h1>
          <p className="text-white/40 text-sm font-medium tracking-wide">Enter your security credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div className={`relative flex items-center bg-white/[0.03] border ${isError ? 'border-rose-500/50' : 'border-white/[0.08]'} rounded-2xl px-5 py-4 focus-within:bg-white/[0.06] focus-within:border-zfs-accent/50 transition-all group`}>
              <Lock className={`mr-4 ${isError ? 'text-rose-400' : 'text-white/20 group-focus-within:text-zfs-accent'} transition-colors`} size={20} />
              <input 
                type="password"
                placeholder="Manager Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-transparent border-none outline-none text-white placeholder:text-white/20 w-full font-medium"
                autoFocus
              />
            </div>
            <AnimatePresence>
              {isError && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 px-2 text-rose-400"
                >
                  <AlertCircle size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Invalid Authentication</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full apple-button apple-button-primary !py-4 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="font-bold">Access Dashboard</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-white/[0.05] flex justify-center items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Secure Node: Online</span>
        </div>
      </motion.div>

      <div className="absolute bottom-8 text-[10px] font-bold text-white/10 uppercase tracking-[0.3em]">
        Enterprise ZFS Management Interface • v1.0.4
      </div>
    </div>
  );
}
