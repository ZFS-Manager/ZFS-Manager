import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, AlertCircle, Info, AlertTriangle, Download } from 'lucide-react';
import { ZFSLog, ZFSPool } from '../types';

interface SystemLogsProps {
  logs: ZFSLog[];
  pools?: ZFSPool[];
}

const levelConfig = {
  error:   { icon: AlertCircle,   color: 'text-rose-400',  bg: 'bg-rose-400/8',  border: 'border-rose-400/15' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/15' },
  info:    { icon: Info,          color: 'text-sky-400',   bg: 'bg-sky-400/8',   border: 'border-sky-400/15' },
};

export default function SystemLogs({ logs }: SystemLogsProps) {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const filtered = useMemo(() =>
    logs.filter(log => {
      const matchSearch = log.message.toLowerCase().includes(search.toLowerCase())
        || (log.pool || '').toLowerCase().includes(search.toLowerCase());
      const matchLevel = levelFilter === 'all' || log.level === levelFilter;
      return matchSearch && matchLevel;
    }),
    [logs, search, levelFilter]
  );

  const counts = useMemo(() => ({
    error:   logs.filter(l => l.level === 'error').length,
    warning: logs.filter(l => l.level === 'warning').length,
    info:    logs.filter(l => l.level === 'info').length,
  }), [logs]);

  const handleExport = () => {
    const content = filtered
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}]${l.pool ? ` [${l.pool}]` : ''} ${l.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zfs-events.txt';
    a.click();
  };

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">System Logs</h2>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">
            Pool history &amp; event telemetry
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'error', 'warning', 'info'] as const).map(lv => (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              className={`h-8 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                levelFilter === lv
                  ? lv === 'all'     ? 'bg-white/10 border-white/20 text-white'
                  : lv === 'error'   ? 'bg-rose-400/15 border-rose-400/30 text-rose-400'
                  : lv === 'warning' ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
                  :                    'bg-sky-400/15 border-sky-400/30 text-sky-400'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-600 hover:text-slate-400'
              }`}
            >
              {lv === 'all' ? `All (${logs.length})` : `${lv} (${counts[lv]})`}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel overflow-hidden border-white/[0.02]">
        <div className="p-4 flex gap-3 border-b border-white/[0.04] bg-white/[0.01]">
          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-sky-400 transition-colors" size={13} />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/[0.02] border border-white/[0.04] rounded-xl pl-10 pr-4 py-2 text-[12px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/30 transition-all"
            />
          </div>
          <button
            onClick={handleExport}
            className="apple-button apple-button-secondary !px-4 gap-2 flex-shrink-0"
          >
            <Download size={13} />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Export</span>
          </button>
        </div>

        <div className="divide-y divide-white/[0.02] max-h-[600px] overflow-y-auto no-scrollbar">
          {filtered.map((log, i) => {
            const cfg = levelConfig[log.level] || levelConfig.info;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={log.id || i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.01, 0.4) }}
                className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.01] transition-colors"
              >
                <div className={`p-1.5 rounded-lg ${cfg.bg} border ${cfg.border} flex-shrink-0 mt-0.5`}>
                  <Icon size={12} className={cfg.color} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    {log.pool && (
                      <span className="text-[9px] font-black text-sky-400 bg-sky-400/8 border border-sky-400/15 px-2 py-0.5 rounded-lg uppercase tracking-widest">
                        {log.pool}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-600">{log.timestamp}</span>
                  </div>
                  <p className="text-[12px] font-bold text-slate-300 font-mono leading-relaxed">
                    {log.message}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <FileText size={40} className="text-white/5 mb-4" strokeWidth={1} />
            <h3 className="text-lg font-black text-white mb-2">
              {search || levelFilter !== 'all' ? 'No matching events' : 'No Log Events'}
            </h3>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest max-w-xs">
              Pool history events will appear here.
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
            <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
              {search && ` · filtered from ${logs.length}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
