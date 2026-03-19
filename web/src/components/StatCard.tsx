import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export default function StatCard({ label, value, subValue, icon: Icon, trend }: StatCardProps) {
  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.01 }}
      className="glass-panel p-6 flex items-center gap-5 hover:bg-white/[0.01] transition-all border-white/[0.02] hover:border-zfs-accent/20"
    >
      <div className={`p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-zfs-accent transition-colors shadow-lg`}>
        <Icon size={20} strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.2em] mb-1 group-hover:text-slate-400 transition-colors">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-black text-white tracking-tight">{value}</p>
          {subValue && (
            <p className="text-[10px] text-slate-700 font-bold uppercase tracking-wider">{subValue}</p>
          )}
        </div>
      </div>
      {trend && (
        <div className={`ml-auto px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${trend.isPositive ? 'bg-emerald-500/5 text-emerald-400/80 border-emerald-500/10' : 'bg-rose-500/5 text-rose-400/80 border-rose-500/10'}`}>
          {trend.value}
        </div>
      )}
    </motion.div>
  );
}
