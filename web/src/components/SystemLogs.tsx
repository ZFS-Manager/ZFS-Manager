import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Info, XCircle, Clock, Trash2, Download, Search } from 'lucide-react';
import { ZFSLog } from '../types';

interface SystemLogsProps {
  logs: ZFSLog[];
}

export default function SystemLogs({ logs }: SystemLogsProps) {
  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">System Telemetry</h2>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">Real-time infrastructure events</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-zfs-accent transition-colors" size={14} />
            <input 
              type="text" 
              placeholder="Search telemetry..." 
              className="bg-white/[0.02] border border-white/[0.03] rounded-xl pl-10 pr-4 py-2 text-[12px] text-white placeholder:text-slate-700 focus:outline-none focus:border-zfs-accent/30 w-full transition-all" 
            />
          </div>
          <button className="apple-button apple-button-secondary !py-2.5 !px-4 flex items-center gap-2">
            <Download size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Export</span>
          </button>
          <button className="apple-button apple-button-secondary !py-2.5 !px-4 !text-rose-500/60 hover:text-rose-400 hover:bg-rose-500/5 flex items-center gap-2">
            <Trash2 size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">Wipe</span>
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden border-white/[0.02] mx-4">
        <div className="max-h-[600px] overflow-y-auto divide-y divide-white/[0.01] no-scrollbar scroll-smooth">
          {logs.map((log, idx) => (
            <motion.div 
              key={log.id || idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.01 }}
              className="p-5 hover:bg-white/[0.005] transition-all flex items-start gap-5 group cursor-default"
            >
              <div className={`p-2 rounded-xl flex-shrink-0 border ${
                log.level === 'error' ? 'bg-rose-500/5 text-rose-400 border-rose-500/10' :
                log.level === 'warning' ? 'bg-amber-500/5 text-amber-400 border-amber-500/10' :
                'bg-zfs-accent/5 text-zfs-accent border-zfs-accent/10'
              } transition-transform`}>
                {log.level === 'error' ? <XCircle size={14} strokeWidth={2.5} /> : 
                 log.level === 'warning' ? <AlertTriangle size={14} strokeWidth={2.5} /> : 
                 <Info size={14} strokeWidth={2.5} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${
                    log.level === 'error' ? 'text-rose-400' :
                    log.level === 'warning' ? 'text-amber-400' :
                    'text-zfs-accent'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Clock size={10} className="opacity-20" />
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="opacity-20 mx-1">—</span>
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[13px] font-black text-slate-400 leading-normal font-mono tracking-tight group-hover:text-white/80 transition-colors uppercase">{log.message}</p>
              </div>
              {log.pool && (
                <div className="px-3 py-1 rounded-lg bg-white/[0.01] border border-white/[0.02] text-[8px] font-black text-slate-700 uppercase tracking-widest group-hover:text-zfs-accent transition-all">
                  {log.pool}
                </div>
              )}
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-center">
              <Info size={32} strokeWidth={1} className="text-white/5 mb-4" />
              <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Telemetry Offline</h3>
              <p className="text-slate-800 mt-2 font-bold text-[9px] uppercase">Buffer is currently empty.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
