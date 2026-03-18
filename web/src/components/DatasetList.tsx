import React from 'react';
import { ZFSDataset } from '../types';
import { MoreVertical, HardDrive, Settings, Plus, Shield, Zap, Lock } from 'lucide-react';
import { motion } from 'motion/react';

interface DatasetListProps {
  datasets: ZFSDataset[];
}

export default function DatasetList({ datasets }: DatasetListProps) {
  return (
    <div className="glass-panel overflow-hidden">
      <div className="p-8 flex justify-between items-center border-b border-white/[0.05]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Storage Volumes</h2>
          <p className="text-xs text-white/40 mt-1">Manage your ZFS datasets and mountpoints</p>
        </div>
        <button className="apple-button apple-button-primary !py-2 !px-4 text-xs">
          <Plus size={16} /> Add Volume
        </button>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3">
          {datasets.map((ds, i) => (
            <motion.div 
              key={ds.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between p-6 bg-white/[0.02] rounded-2xl hover:bg-white/[0.05] transition-all group border border-white/[0.05]"
            >
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-white/40 group-hover:bg-zfs-accent group-hover:text-white transition-all">
                  <HardDrive size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <p className="text-base font-bold text-white">{ds.name}</p>
                    {ds.readonly && <Lock size={12} className="text-amber-400" />}
                  </div>
                  <p className="text-[10px] text-white/30 font-mono mt-0.5">{ds.mountpoint}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-12">
                <div className="hidden md:flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1">Compression</p>
                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-white/60">{ds.compression}</span>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1">Dedup</p>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono ${ds.dedup === 'on' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/40'}`}>{ds.dedup}</span>
                  </div>
                </div>

                <div className="text-right min-w-[120px]">
                  <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5 text-left">Usage</p>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-zfs-accent rounded-full" style={{ width: '45%' }} />
                    </div>
                    <p className="text-xs font-bold text-white/80">{ds.used}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-white/30 hover:text-white hover:bg-white/10 transition-all">
                    <Settings size={16} />
                  </button>
                  <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-white/30 hover:text-white hover:bg-white/10 transition-all">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
