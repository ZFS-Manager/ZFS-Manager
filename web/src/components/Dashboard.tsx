import React from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  HardDrive, 
  ShieldCheck, 
  Zap, 
  Activity,
  Server,
  Cpu,
  Clock
} from 'lucide-react';
import { ZFSPool } from '../types';

interface DashboardProps {
  pools: ZFSPool[];
  totalCapacity: number;
  totalUsedStorage: number;
  currentStats: { read: number; write: number; iops: number; cpu?: number; arcHit?: number };
  systemStats?: any;
  formatSizeLong: (bytes: number) => string;
}

export default function Dashboard({ 
  pools, 
  totalCapacity, 
  totalUsedStorage, 
  currentStats,
  systemStats,
  formatSizeLong 
}: DashboardProps) {
  const usagePercent = totalCapacity > 0 ? (totalUsedStorage / totalCapacity) * 100 : 0;
  
  // Use systemStats from backend if available, fallback to currentStats from iostat
  const cpuLoad = systemStats?.cpu_load?.[0] ?? (currentStats as any).cpu ?? 0;
  const arcHit = systemStats?.arc_hit_ratio ?? (currentStats as any).arcHit ?? 0;
  const uptime = systemStats?.uptime ?? 'N/A';
  
  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10 no-scrollbar">
      {/* Refined Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-4">
        <motion.div
           initial={{ opacity: 0, x: -20 }}
           animate={{ opacity: 1, x: 0 }}
        >
          <h2 className="text-4xl font-black text-white tracking-tighter leading-none">
            Storage <span className="text-slate-500">Analytics</span>
          </h2>
        </motion.div>
        
        <div className="flex items-center gap-3">
          <div className="glass-panel px-4 h-10 flex items-center gap-3 border-white/[0.03]">
             <Activity size={16} className="text-zfs-accent" />
             <span className="text-[11px] font-black text-white/60 tracking-tight uppercase">UPTIME: {uptime.split(',')[0]}</span>
          </div>
          <div className="glass-panel px-4 h-10 flex items-center gap-3 border-white/[0.03]">
             <Server size={16} className="text-indigo-400" />
             <span className="text-[11px] font-black text-white/60 tracking-tight uppercase">NODE: ONLINE</span>
          </div>
        </div>
      </div>

      {/* Tighter Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-4 overflow-hidden">
        {[
          { label: 'Aggregate Capacity', value: formatSizeLong(totalCapacity), icon: Database, color: 'text-zfs-accent', bg: 'bg-zfs-accent/5' },
          { label: 'Utilized Space', value: formatSizeLong(totalUsedStorage), icon: HardDrive, color: 'text-indigo-400', bg: 'bg-indigo-400/5' },
          { label: 'ARC Efficiency', value: `${arcHit.toFixed(2)}%`, icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-400/5' },
          { label: 'Node Integrity', value: pools.length > 0 && pools.every(p => p.health === 'ONLINE') ? 'Healthy' : 'Check', icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-400/5' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "circOut", delay: i * 0.08 }}
            className="glass-panel p-5 flex items-center gap-5 hover:bg-white/[0.01] transition-all border-white/[0.02]"
          >
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} border border-white/[0.03]`}>
              <stat.icon size={20} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 mb-0.5">{stat.label}</p>
              <h3 className="text-xl font-black text-white tracking-tight">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-4">
        {/* Storage Analytics Card */}
        <div className="lg:col-span-8 glass-panel p-8 relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-zfs-accent/5 blur-[80px] rounded-full -mr-16 -mt-16 pointer-events-none" />
          
          <div className="relative flex justify-between items-start mb-8">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">System Utilization</h3>
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mt-1">Global Storage Pool Load</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-white tracking-tighter leading-none">{usagePercent.toFixed(1)}%</div>
              <div className="text-[9px] font-black text-zfs-accent uppercase tracking-widest mt-2">Active Demand</div>
            </div>
          </div>
          
          <div className="relative h-2.5 bg-white/[0.02] rounded-full overflow-hidden border border-white/[0.03] mb-8">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${usagePercent}%` }}
              transition={{ duration: 1, ease: "circOut" }}
              className="h-full bg-zfs-accent rounded-full shadow-[0_0_12px_rgba(56,189,248,0.2)]"
            />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/[0.03]">
            {[
              { label: 'Compute', value: `${cpuLoad.toFixed(0)}%`, icon: Cpu, color: 'text-indigo-400' },
              { label: 'ARC Hit', value: `${arcHit.toFixed(1)}%`, icon: ShieldCheck, color: 'text-emerald-400' },
              { label: 'IOPS', value: (currentStats.iops / 1000).toFixed(1) + 'k', icon: Zap, color: 'text-amber-400' },
              { label: 'Transfer', value: `${((currentStats.read + currentStats.write)).toFixed(1)} Mb/s`, icon: Activity, color: 'text-rose-400' }
            ].map((stat, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 opacity-40">
                  <stat.icon size={12} className={stat.color} />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
                </div>
                <p className="text-lg font-black text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Live Pools Card */}
        <div className="lg:col-span-4 glass-panel p-8 flex flex-col h-full bg-gradient-to-b from-white/[0.01] to-transparent">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-white tracking-tight">Active Pools</h3>
            <Database size={18} className="text-slate-700" />
          </div>
          
          <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar scroll-smooth">
            {pools.map((pool, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={idx} 
                className="p-4 bg-white/[0.01] rounded-2xl border border-white/[0.02] hover:bg-white/[0.03] hover:border-white/[0.06] transition-all group/pool"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="min-w-0">
                    <span className="text-xs font-black text-white block truncate uppercase tracking-tight">{pool.name}</span>
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-0.5 block">{pool.raidType}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                    pool.health === 'ONLINE' ? 'bg-emerald-400/5 text-emerald-400 border-emerald-400/10' : 'bg-amber-400/5 text-amber-400 border-amber-400/10'
                  }`}>{pool.health}</span>
                </div>
                
                <div className="h-1 w-full bg-white/[0.02] rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${pool.cap}%` }}
                    className={`h-full rounded-full ${pool.cap > 90 ? 'bg-rose-500' : 'bg-zfs-accent/40'}`}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          <button className="w-full mt-8 apple-button apple-button-secondary h-10">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-colors">Start Scrub</span>
          </button>
        </div>
      </div>
    </div>
  );
}
