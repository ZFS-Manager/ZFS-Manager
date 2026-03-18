import React from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  HardDrive, 
  ShieldCheck, 
  Zap, 
  ArrowDownRight, 
  ArrowUpRight,
  TrendingUp,
  Activity,
  Server,
  Cpu
} from 'lucide-react';
import { ZFSPool, ZFSLog } from '../types';

interface DashboardProps {
  pools: ZFSPool[];
  totalCapacity: number;
  totalUsedStorage: number;
  currentStats: { read: number; write: number; iops: number };
  formatSizeLong: (bytes: number) => string;
}

export default function Dashboard({ 
  pools, 
  totalCapacity, 
  totalUsedStorage, 
  currentStats,
  formatSizeLong 
}: DashboardProps) {
  const usagePercent = totalCapacity > 0 ? (totalUsedStorage / totalCapacity) * 100 : 0;
  
  return (
    <div className="space-y-10">
      {/* Hero Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-zfs-accent font-bold uppercase tracking-[0.2em] text-[10px] mb-2"
          >
            <Server size={12} />
            <span>Node Status: Operational</span>
          </motion.div>
          <h2 className="text-4xl font-bold text-white tracking-tight">System Overview</h2>
          <p className="text-white/40 mt-2 font-medium">Real-time telemetry and storage health monitoring</p>
        </div>
        <div className="flex gap-4">
           <div className="glass-panel px-6 py-3 flex items-center gap-3 border-white/[0.05]">
             <Cpu size={18} className="text-white/20" />
             <div className="flex flex-col">
               <span className="text-[10px] font-bold text-white/20 uppercase">Load Average</span>
               <span className="text-sm font-bold text-white">0.42 / 0.38 / 0.31</span>
             </div>
           </div>
        </div>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[
          { label: 'Total Capacity', value: formatSizeLong(totalCapacity), icon: Database, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Used Storage', value: formatSizeLong(totalUsedStorage), icon: HardDrive, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'System Health', value: pools.every(p => p.health === 'ONLINE') ? 'Optimal' : 'Degraded', icon: ShieldCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'IOPS', value: `${(currentStats.iops / 1000).toFixed(2)}k`, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel p-6 border-white/[0.05] hover:bg-white/[0.03] transition-all group relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 ${stat.bg} blur-[60px] opacity-20 -mr-10 -mt-10 group-hover:opacity-40 transition-opacity`} />
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
              <TrendingUp size={16} className="text-white/10" />
            </div>
            <div>
              <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-white tracking-tight">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Grid Layout for Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Storage Usage Visualizer */}
        <div className="lg:col-span-2 glass-panel p-8 border-white/[0.05]">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-white">Storage Allocation</h3>
            <span className="text-xs font-bold text-zfs-accent bg-zfs-accent/10 px-3 py-1 rounded-full uppercase tracking-widest">{usagePercent.toFixed(1)}% Used</span>
          </div>
          
          <div className="space-y-10">
            <div className="relative h-4 bg-white/[0.03] rounded-full overflow-hidden border border-white/[0.05]">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${usagePercent}%` }}
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-zfs-accent to-indigo-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Network In</span>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                    <ArrowDownRight size={16} />
                  </div>
                  <span className="text-xl font-bold text-white tracking-tight">{currentStats.read.toFixed(2)} MB/s</span>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Network Out</span>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <ArrowUpRight size={16} />
                  </div>
                  <span className="text-xl font-bold text-white tracking-tight">{currentStats.write.toFixed(2)} MB/s</span>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Active Requests</span>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <Activity size={16} />
                  </div>
                  <span className="text-xl font-bold text-white tracking-tight">1,248 p/s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Pool Status */}
        <div className="glass-panel p-8 border-white/[0.05]">
          <h3 className="text-xl font-bold text-white mb-8">Active Pools</h3>
          <div className="space-y-4">
            {pools.map((pool, idx) => (
              <div key={idx} className="p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05] hover:bg-white/[0.04] transition-all">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-white">{pool.name}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${
                    pool.health === 'ONLINE' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                  }`}>{pool.health}</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-white/20" 
                    style={{ width: `${pool.cap}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  <span>{pool.cap}% Used</span>
                  <span>{pool.size} Total</span>
                </div>
              </div>
            ))}
            {pools.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-white/20 italic text-sm">
                No active pools found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
