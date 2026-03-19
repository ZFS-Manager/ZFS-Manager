import React from 'react';
import { motion } from 'motion/react';
import { Database, Plus, RefreshCw, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { ZFSPool } from '../types';

interface StoragePoolsProps {
  pools: ZFSPool[];
}

export default function StoragePools({ pools }: StoragePoolsProps) {
  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Storage Pools</h2>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">Resource cluster telemetry</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="apple-button apple-button-secondary !py-2.5 !px-5 group">
            <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scan</span>
          </button>
          <button className="apple-button apple-button-primary !py-2.5 !px-5">
            <Plus size={14} strokeWidth={3} />
            <span className="text-[10px] font-black uppercase tracking-widest">Provision</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4">
        {pools.map((pool, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-panel p-8 group relative overflow-hidden flex flex-col items-stretch"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-zfs-accent/5 blur-[80px] rounded-full -mr-16 -mt-16 pointer-events-none transition-colors" />
            
            <div className="flex justify-between items-start mb-8 relative">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex items-center justify-center text-zfs-accent group-hover:scale-105 transition-transform">
                  <Database size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white mb-1 leading-none tracking-tight">{pool.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">{pool.raidType}</span>
                    <span className={`status-badge !px-2 !py-0.5 !rounded-md ${
                      pool.health === 'ONLINE' ? 'status-online' : 'status-warning'
                    }`}>
                      {pool.health}
                    </span>
                  </div>
                </div>
              </div>
              <button className="p-2.5 bg-white/[0.01] hover:bg-white/[0.04] rounded-xl transition-all border border-white/[0.02] text-slate-600 hover:text-white">
                <MoreHorizontal size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative pb-8 mb-8 border-b border-white/[0.03]">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Cluster Utilization</span>
                  <span className="text-[11px] font-black text-white">{pool.cap}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.02] rounded-full overflow-hidden border border-white/[0.02]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${pool.cap}%` }}
                    className={`h-full rounded-full ${pool.cap > 90 ? 'bg-rose-500' : 'bg-zfs-accent'}`}
                  />
                </div>
              </div>

              {[
                { label: 'Raw Physical', value: pool.size, icon: Database, color: 'text-indigo-400' },
                { label: 'Allocated', value: pool.alloc, icon: ShieldCheck, color: 'text-zfs-accent' },
                { label: 'Addressable Free', value: pool.free, icon: RefreshCw, color: 'text-emerald-400' },
              ].map((stat, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest truncate">{stat.label}</span>
                  <span className="text-xl font-black text-white tracking-tight">{stat.value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 relative">
              <button className="apple-button apple-button-secondary !px-4 !py-2.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors">Topology</span>
              </button>
              <button className="apple-button apple-button-secondary !px-4 !py-2.5 text-rose-500/60 hover:text-rose-400 hover:bg-rose-500/5 transition-colors">
                <span className="text-[9px] font-black uppercase tracking-widest">Offline</span>
              </button>
              <button className="ml-auto apple-button apple-button-primary !px-5 !py-2.5">
                <span className="text-[9px] font-black uppercase tracking-widest">Initiate Scrub</span>
              </button>
            </div>
          </motion.div>
        ))}
        {pools.length === 0 && (
          <div className="glass-panel p-16 flex flex-col items-center justify-center text-center">
            <Database size={48} className="text-white/5 mb-6" strokeWidth={1} />
            <h3 className="text-xl font-black text-white mb-2">No Active Pools</h3>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest max-w-sm">Hardware scan complete. No clusters detected.</p>
            <button className="mt-8 apple-button apple-button-primary !px-8 !py-3">
               <span className="text-[10px] font-black uppercase tracking-widest">Create First Pool</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
