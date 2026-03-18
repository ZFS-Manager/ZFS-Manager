import React from 'react';
import { motion } from 'framer-motion';
import { Database, Plus, RefreshCw, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { ZFSPool } from '../types';

interface StoragePoolsProps {
  pools: ZFSPool[];
}

export default function StoragePools({ pools }: StoragePoolsProps) {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Storage Pools</h2>
          <p className="text-white/40 text-sm">Manage and monitor ZFS storage pools</p>
        </div>
        <div className="flex gap-4">
          <button className="apple-button apple-button-secondary flex items-center gap-2">
            <RefreshCw size={16} />
            <span>Scan for Pools</span>
          </button>
          <button className="apple-button apple-button-primary flex items-center gap-2">
            <Plus size={16} />
            <span>Create New Pool</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {pools.map((pool, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-8"
          >
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-zfs-accent">
                  <Database size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{pool.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-white/40 uppercase tracking-widest">{pool.raidType}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${
                      pool.health === 'ONLINE' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                    }`}>
                      {pool.health}
                    </span>
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/20 hover:text-white">
                <MoreHorizontal size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Utilization</span>
                  <span className="text-sm font-bold text-white">{pool.cap}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${pool.cap}%` }}
                    className="h-full bg-zfs-accent"
                  />
                </div>
              </div>

              {[
                { label: 'Total Size', value: pool.size },
                { label: 'Allocated', value: pool.alloc },
                { label: 'Free Space', value: pool.free },
              ].map((stat, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{stat.label}</span>
                  <span className="text-lg font-bold text-white">{stat.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-8 border-t border-white/[0.05] flex gap-4">
              <button className="apple-button apple-button-secondary !py-2 text-xs">
                View Devices
              </button>
              <button className="apple-button apple-button-secondary !py-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20">
                Offline Pool
              </button>
              <button className="ml-auto apple-button apple-button-primary !py-2 text-xs">
                Start Scrub
              </button>
            </div>
          </motion.div>
        ))}
        {pools.length === 0 && (
          <div className="glass-panel p-20 flex flex-col items-center justify-center text-center">
            <Database size={48} className="text-white/10 mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">No Pools Found</h3>
            <p className="text-white/40 max-w-xs transition-all">We couldn't find any active ZFS storage pools on this system.</p>
          </div>
        )}
      </div>
    </div>
  );
}
