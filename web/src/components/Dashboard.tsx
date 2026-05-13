import React from 'react';
import { motion } from 'framer-motion';
import {
  Database, HardDrive, ShieldCheck, Zap, Activity,
  Server, Cpu, Camera, Layers, CircuitBoard, Clock,
  AlertCircle, Info, CheckCircle2, Settings
} from 'lucide-react';
import { ZFSPool, ZFSDataset, ZFSLog } from '../types';
import { formatBytes } from '../api';

interface DashboardProps {
  pools: ZFSPool[];
  datasets: ZFSDataset[];
  snapshots: any[];
  totalCapacity: number;
  totalUsedStorage: number;
  currentStats: { read: number; write: number; iops: number; cpu?: number; arcHit?: number };
  systemStats?: any;
  logs?: ZFSLog[];
  loading?: boolean;
}

function MetricCard({ label, value, sub, icon: Icon, color, bg, delay = 0 }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.02 }}
      transition={{ duration: 0.6, ease: 'circOut', delay, type: 'spring', stiffness: 400, damping: 20 }}
      className="glass-panel p-5 flex items-center gap-4 hover:bg-white/[0.02] transition-all border-white/[0.02] group"
    >
      <div className={`p-3 rounded-2xl ${bg} border border-white/[0.04] flex-shrink-0 group-hover:scale-110 transition-transform`}>
        <Icon size={20} strokeWidth={2} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 mb-0.5">{label}</p>
        <h3 className="text-xl font-black text-white tracking-tight truncate">{value}</h3>
        {sub && <p className="text-[10px] text-slate-600 font-bold mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Event type styling ────────────────────────────────────────────────────────
function eventStyle(type: string) {
  switch (type) {
    case 'scrub':   return { icon: ShieldCheck, color: 'text-sky-400', bg: 'bg-sky-400/8 border-sky-400/15' };
    case 'create':  return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/8 border-emerald-400/15' };
    case 'destroy': return { icon: AlertCircle,  color: 'text-rose-400', bg: 'bg-rose-400/8 border-rose-400/15' };
    case 'import':  return { icon: Database,     color: 'text-indigo-400', bg: 'bg-indigo-400/8 border-indigo-400/15' };
    case 'set':     return { icon: Settings,     color: 'text-amber-400', bg: 'bg-amber-400/8 border-amber-400/15' };
    default:        return { icon: Info,         color: 'text-slate-400', bg: 'bg-white/[0.03] border-white/[0.05]' };
  }
}

export default function Dashboard({
  pools, datasets, snapshots,
  totalCapacity, totalUsedStorage,
  currentStats, systemStats, logs = [], loading
}: DashboardProps) {
  const usagePercent = totalCapacity > 0 ? (totalUsedStorage / totalCapacity) * 100 : 0;
  const cpuLoad   = systemStats?.cpu_load?.[0] ?? currentStats.cpu ?? 0;
  const arcHit    = systemStats?.arc_hit_ratio ?? currentStats.arcHit ?? 0;
  const uptime    = systemStats?.uptime ?? '—';
  const arcSize   = systemStats?.arc_size ?? 0;
  const memTotal  = systemStats?.memory?.total ?? 0;
  const memUsed   = systemStats?.memory?.used ?? 0;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const allOnline  = pools.length > 0 && pools.every(p => p.health === 'ONLINE');

  const iops       = currentStats.iops > 0 ? currentStats.iops.toFixed(0) : '0';
  const throughput = (currentStats.read + currentStats.write) > 0
    ? `${(currentStats.read + currentStats.write).toFixed(1)} MB/s`
    : '0 MB/s';

  const metrics = [
    {
      label: 'Total Capacity',
      value: formatBytes(totalCapacity, 1),
      sub: `${pools.length} pool${pools.length !== 1 ? 's' : ''}`,
      icon: Database, color: 'text-sky-400', bg: 'bg-sky-400/8'
    },
    {
      label: 'Utilized Space',
      value: formatBytes(totalUsedStorage, 1),
      sub: `${formatBytes(totalUsedStorage, 1)} von ${formatBytes(totalCapacity, 1)}`,
      icon: HardDrive, color: 'text-indigo-400', bg: 'bg-indigo-400/8'
    },
    {
      label: 'ARC Cache',
      value: arcSize ? formatBytes(arcSize, 1) : '0 B',
      sub: `${arcHit.toFixed(1)}% hit ratio`,
      icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-400/8'
    },
    {
      label: 'Pool Health',
      value: allOnline ? 'Healthy' : pools.length === 0 ? 'No Pools' : 'Check',
      sub: pools.map(p => p.health).join(', ') || 'none',
      icon: ShieldCheck,
      color: allOnline ? 'text-emerald-400' : 'text-amber-400',
      bg: allOnline ? 'bg-emerald-400/8' : 'bg-amber-400/8'
    },
    {
      label: 'Datasets',
      value: String(datasets.length),
      sub: `filesystems`,
      icon: Layers, color: 'text-violet-400', bg: 'bg-violet-400/8'
    },
    {
      label: 'Snapshots',
      value: String(snapshots.length),
      sub: 'recovery points',
      icon: Camera, color: 'text-rose-400', bg: 'bg-rose-400/8'
    },
    {
      label: 'Memory Used',
      value: memTotal ? formatBytes(memUsed, 1) : '0 B',
      sub: memTotal ? `${formatBytes(memUsed, 1)} von ${formatBytes(memTotal, 1)}` : 'unavailable',
      icon: CircuitBoard, color: 'text-amber-400', bg: 'bg-amber-400/8'
    },
    {
      label: 'System Uptime',
      value: uptime,
      sub: 'node active',
      icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-400/8'
    },
  ];

  return (
    <div className="space-y-8 max-w-[1500px] mx-auto pb-10 no-scrollbar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-4xl font-black text-white tracking-tighter leading-none">
            Storage <span className="text-slate-500">Analytics</span>
          </h2>
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.25em] mt-2">
            ZFS Infrastructure Dashboard
          </p>
        </motion.div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="glass-panel px-4 h-9 flex items-center gap-2 border-white/[0.03]">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
            <span className="text-[10px] font-black text-white/50 tracking-widest uppercase">
              {loading ? 'Syncing...' : 'Live'}
            </span>
          </div>
          <div className="glass-panel px-4 h-9 flex items-center gap-2 border-white/[0.03]">
            <Server size={13} className="text-indigo-400" />
            <span className="text-[10px] font-black text-white/50 tracking-widest uppercase">
              {uptime !== '—' ? `Up ${uptime}` : 'Node Online'}
            </span>
          </div>
          <div className="glass-panel px-4 h-9 flex items-center gap-2 border-white/[0.03]">
            <Cpu size={13} className="text-sky-400" />
            <span className="text-[10px] font-black text-white/50 tracking-widest uppercase">
              Load {cpuLoad.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <MetricCard key={i} {...m} delay={i * 0.05} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Utilization Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-8 glass-panel p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-sky-400/4 blur-[100px] rounded-full -mr-20 -mt-20 pointer-events-none" />

          <div className="relative flex justify-between items-start mb-8">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">System Utilization</h3>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">
                Global Storage Pool Load
              </p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-black text-white tracking-tighter leading-none">
                {usagePercent.toFixed(1)}
                <span className="text-2xl text-slate-600">%</span>
              </div>
              <div className="text-[9px] font-black text-sky-400 uppercase tracking-widest mt-2">
                {formatBytes(totalUsedStorage, 1)} von {formatBytes(totalCapacity, 1)}
              </div>
            </div>
          </div>

          {/* Storage progress bar */}
          <div className="mb-2">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Storage</span>
              <div className="flex items-center gap-3 text-[9px] font-black">
                {usagePercent > 90 && <span className="text-rose-400">Critical (&gt;90%)</span>}
                {usagePercent > 75 && usagePercent <= 90 && <span className="text-amber-400">Warning (&gt;75%)</span>}
                {usagePercent <= 75 && <span className="text-sky-400">Healthy</span>}
              </div>
            </div>
            <div className="relative h-2 bg-white/[0.03] rounded-full overflow-hidden mb-1 border border-white/[0.03]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usagePercent}%` }}
                transition={{ duration: 1.2, ease: 'circOut' }}
                className={`h-full rounded-full transition-all ${
                  usagePercent > 90 ? 'bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                  : usagePercent > 75 ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                  : 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                }`}
              />
            </div>
            {/* Color legend */}
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-1.5 rounded-full bg-sky-400" />
                <span className="text-[8px] font-bold text-slate-700">0–75% Normal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[8px] font-bold text-slate-700">75–90% Warnung</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-1.5 rounded-full bg-rose-500" />
                <span className="text-[8px] font-bold text-slate-700">&gt;90% Kritisch</span>
              </div>
            </div>
          </div>

          {/* Memory bar */}
          {memTotal > 0 && (
            <div className="mb-8 mt-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Memory</span>
                <span className="text-[10px] font-black text-white/60">
                  {formatBytes(memUsed, 1)} von {formatBytes(memTotal, 1)} ({memPercent.toFixed(1)}%)
                </span>
              </div>
              <div className="relative h-1.5 bg-white/[0.03] rounded-full overflow-hidden border border-white/[0.03]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${memPercent}%` }}
                  transition={{ duration: 1.2, ease: 'circOut', delay: 0.2 }}
                  className="h-full rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.2)]"
                />
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/[0.04]">
            {[
              { label: 'CPU Load',   value: `${(cpuLoad * 100).toFixed(1)}%`, icon: Cpu,       color: 'text-indigo-400' },
              { label: 'ARC Hit',    value: `${arcHit.toFixed(1)}%`,          icon: ShieldCheck, color: 'text-emerald-400' },
              { label: 'IOPS',       value: iops,                             icon: Zap,       color: 'text-amber-400' },
              { label: 'Throughput', value: throughput,                       icon: Activity,  color: 'text-rose-400' },
            ].map((s, i) => (
              <motion.div key={i} whileHover={{ scale: 1.05 }} className="flex flex-col gap-1.5 cursor-default">
                <div className="flex items-center gap-1.5 opacity-40">
                  <s.icon size={11} className={s.color} />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</span>
                </div>
                <p className="text-lg font-black text-white">{s.value}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Active Pools */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-4 glass-panel p-8 flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-white tracking-tight">Active Pools</h3>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
              {pools.length} total
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar">
            {pools.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Database size={32} className="text-white/5 mb-3" strokeWidth={1} />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No pools detected</p>
              </div>
            )}
            {pools.map((pool, i) => {
              const pct = pool.cap;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ x: 2 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  className="p-4 bg-white/[0.01] rounded-2xl border border-white/[0.03] hover:border-white/[0.07] hover:bg-white/[0.02] transition-all duration-200 group"
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-black text-white block truncate tracking-tight">{pool.name}</span>
                      <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-0.5 block">
                        {pool.alloc} von {pool.size} · {(pool as any).frag ?? 0}% frag
                      </span>
                    </div>
                    <span className={`ml-3 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border flex-shrink-0 ${
                      pool.health === 'ONLINE'
                        ? 'bg-emerald-400/8 text-emerald-400 border-emerald-400/15'
                        : 'bg-amber-400/8 text-amber-400 border-amber-400/15'
                    }`}>
                      {pool.health}
                    </span>
                  </div>

                  <div className="flex justify-between text-[9px] font-black mb-2 text-slate-600 uppercase tracking-widest">
                    <span>{pool.alloc}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/[0.03] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1, ease: 'circOut', delay: 0.5 + i * 0.05 }}
                      className={`h-full rounded-full ${pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-400' : 'bg-sky-400/60'}`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {pools.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/[0.04] grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">Datasets</p>
                <p className="text-2xl font-black text-white">{datasets.length}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">Snapshots</p>
                <p className="text-2xl font-black text-white">{snapshots.length}</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Event Bubble */}
      {logs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-panel p-6 border-white/[0.02]"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">Recent Events</h3>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                Pool activity timeline
              </p>
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
              {logs.length} events
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
            {logs.slice(0, 20).map((log, i) => {
              const style = eventStyle(log.level === 'error' ? 'destroy' : log.level === 'warning' ? 'set' : 'create');
              const Icon = style.icon;
              return (
                <motion.div
                  key={log.id || i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${style.bg}`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon size={13} className={style.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white/80 truncate">{log.message}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1 text-slate-700">
                        <Clock size={9} />
                        <span className="text-[9px] font-bold">{log.timestamp}</span>
                      </div>
                      {log.pool && (
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">
                          {log.pool}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg flex-shrink-0 ${
                    log.level === 'error'   ? 'text-rose-400 bg-rose-400/10' :
                    log.level === 'warning' ? 'text-amber-400 bg-amber-400/10' :
                    'text-emerald-400 bg-emerald-400/10'
                  }`}>
                    {log.level}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
