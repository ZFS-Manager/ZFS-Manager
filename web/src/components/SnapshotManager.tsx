import React from 'react';
import { motion } from 'motion/react';
import { Camera, Trash2, RotateCcw, Search, Clock, Plus, Database } from 'lucide-react';

interface SnapshotManagerProps {
  snapshots: any[];
}

export default function SnapshotManager({ snapshots }: SnapshotManagerProps) {
  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Recovery Points</h2>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">Point-in-time dataset snapshots</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-zfs-accent transition-colors" size={14} />
            <input 
              type="text" 
              placeholder="Filter snapshots..." 
              className="bg-white/[0.02] border border-white/[0.03] rounded-xl pl-10 pr-4 py-2 text-[12px] text-white placeholder:text-slate-700 focus:outline-none focus:border-zfs-accent/30 w-full transition-all" 
            />
          </div>
          <button className="apple-button apple-button-primary !py-2.5 !px-5">
            <Plus size={14} strokeWidth={3} />
            <span className="text-[10px] font-black uppercase tracking-widest">Create</span>
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden border-white/[0.02] mx-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.01] border-b border-white/[0.03]">
                <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Signature</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Source</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Size</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Created</th>
                <th className="px-6 py-4 text-right text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.01]">
              {snapshots.map((snap, idx) => (
                <motion.tr 
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="hover:bg-white/[0.005] transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/[0.02] border border-white/[0.04] text-zfs-accent rounded-lg">
                        <Camera size={14} strokeWidth={2.5} />
                      </div>
                      <span className="text-[13px] font-black text-white group-hover:text-zfs-accent transition-colors">{snap.name.split('@').pop()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[200px] block">{snap.name.split('@')[0]}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-tighter">{snap.used}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock size={12} className="opacity-30" />
                      <span className="text-[10px] font-bold">{snap.creation || 'Historical'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-8 h-8 flex items-center justify-center bg-white/[0.01] border border-white/[0.02] rounded-lg hover:text-emerald-400 transition-all">
                        <RotateCcw size={14} strokeWidth={2.5} />
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center bg-white/[0.01] border border-white/[0.02] rounded-lg hover:text-rose-400 transition-all">
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshots.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Camera size={48} className="text-white/5 mb-6" strokeWidth={1} />
            <h3 className="text-xl font-black text-white mb-2">No Recovery Points</h3>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest max-w-sm">System recovery telemetry is currently offline.</p>
            <button className="mt-8 apple-button apple-button-primary !py-3 !px-8 text-[11px]">
               Generate Point
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
