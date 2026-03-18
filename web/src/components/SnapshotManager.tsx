import React from 'react';
import { motion } from 'framer-motion';
import { Camera, Trash2, RotateCcw, Search, Clock, Plus, Database } from 'lucide-react';

interface SnapshotManagerProps {
  snapshots: any[];
}

export default function SnapshotManager({ snapshots }: SnapshotManagerProps) {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Snapshots</h2>
          <p className="text-white/40 text-sm">Manage dataset point-in-time recovery points</p>
        </div>
        <div className="flex gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-zfs-accent transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Filter snapshots..." 
              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-zfs-accent/50 w-64 transition-all" 
            />
          </div>
          <button className="apple-button apple-button-primary flex items-center gap-2">
            <Plus size={16} />
            <span>Create Snapshot</span>
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/[0.05]">
              <th className="px-8 py-5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Snapshot Name</th>
              <th className="px-8 py-5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Dataset</th>
              <th className="px-8 py-5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Used</th>
              <th className="px-8 py-5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Created</th>
              <th className="px-8 py-5 text-right text-[10px] font-bold text-white/30 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {snapshots.map((snap, idx) => (
              <motion.tr 
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="hover:bg-white/[0.02] transition-colors group"
              >
                <td className="px-8 py-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg group-hover:scale-110 transition-transform">
                      <Camera size={14} />
                    </div>
                    <span className="text-sm font-bold text-white">{snap.name.split('@').pop()}</span>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <span className="text-xs font-medium text-white/40">{snap.name.split('@')[0]}</span>
                </td>
                <td className="px-8 py-5">
                  <span className="text-xs font-bold text-white/60 uppercase">{snap.used}</span>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Clock size={12} />
                    <span>{snap.creation || 'Just now'}</span>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex justify-end gap-2">
                    <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/20 hover:text-emerald-400" title="Rollback">
                      <RotateCcw size={16} />
                    </button>
                    <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/20 hover:text-rose-400" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {snapshots.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-white/10 uppercase tracking-[0.2em] font-bold text-xs">
            <Camera size={40} className="mb-4 opacity-50" />
            No snapshots available
          </div>
        )}
      </div>
    </div>
  );
}
