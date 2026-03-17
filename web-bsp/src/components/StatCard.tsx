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
      whileHover={{ y: -4 }}
      className="glass-panel p-6 flex flex-col gap-4"
    >
      <div className="flex justify-between items-start">
        <div className="p-3 rounded-xl bg-white/5 text-zfs-accent">
          <Icon size={24} />
        </div>
        {trend && (
          <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${trend.isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {trend.value}
          </div>
        )}
      </div>
      <div>
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subValue && (
          <p className="text-[10px] text-white/20 font-medium mt-1">{subValue}</p>
        )}
      </div>
    </motion.div>
  );
}
