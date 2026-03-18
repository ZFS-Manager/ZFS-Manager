import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Info, XCircle, Clock, Trash2, Download, Search } from 'lucide-react';
import { ZFSLog } from '../types';

interface SystemLogsProps {
  logs: ZFSLog[];
}

export default function SystemLogs({ logs }: SystemLogsProps) {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">System Logs</h2>
          <p className="text-white/40 text-sm">Real-time system events and operation history</p>
        </div>
        <div className="flex gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-zfs-accent transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search logs..." 
              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-zfs-accent/50 w-64 transition-all" 
            />
          </div>
          <button className="apple-button apple-button-secondary flex items-center gap-2">
            <Download size={16} />
            <span>Export CSV</span>
          </button>
          <button className="apple-button apple-button-secondary !text-rose-400 hover:bg-rose-500/10 flex items-center gap-2">
            <Trash2 size={16} />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto divide-y divide-white/[0.05]">
          {logs.map((log, idx) => (
            <motion.div 
              key={log.id || idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 hover:bg-white/[0.02] transition-colors flex items-start gap-6 group"
            >
              <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                log.level === 'error' ? 'bg-rose-500/10 text-rose-400' :
                log.level === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                'bg-blue-500/10 text-blue-400'
              }`}>
                {log.level === 'error' ? <XCircle size={18} /> : 
                 log.level === 'warning' ? <AlertTriangle size={18} /> : 
                 <Info size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    log.level === 'error' ? 'text-rose-400' :
                    log.level === 'warning' ? 'text-amber-400' :
                    'text-blue-400'
                  }`}>
                    {log.level}
                  </span>
                  <div className="w-1 h-1 rounded-full bg-white/10" />
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={10} />
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-white/80 leading-relaxed font-mono">{log.message}</p>
              </div>
              {log.pool && (
                <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-white/40 uppercase tracking-widest group-hover:border-white/10 group-hover:text-white/60 transition-all">
                  {log.pool}
                </div>
              )}
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="py-40 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-white/10 mb-6">
                <Info size={40} />
              </div>
              <h3 className="text-lg font-bold text-white/20 uppercase tracking-[0.2em]">No logs recorded</h3>
              <p className="text-white/10 mt-2 text-sm italic">System events will appear here as they occur</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
