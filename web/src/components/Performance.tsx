import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { Activity } from 'lucide-react';

interface PerformanceProps {
  stats: any[];
}

const chartStyle = {
  contentStyle: {
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  },
  itemStyle: { fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  labelStyle: { color: 'rgba(255,255,255,0.35)', fontWeight: 800, fontSize: '9px', marginBottom: '6px', textTransform: 'uppercase' as const },
  axisStyle: { fill: 'rgba(255,255,255,0.18)', fontSize: 9, fontWeight: 700 },
};

const gridProps = {
  strokeDasharray: '3 3' as const,
  stroke: 'rgba(255,255,255,0.025)',
  vertical: false,
};

const xAxisProps = {
  dataKey: 'timestamp',
  axisLine: false,
  tickLine: false,
  tick: chartStyle.axisStyle,
  minTickGap: 40,
};

function formatMBs(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}GB/s`;
  if (v >= 1)    return `${v.toFixed(1)} MB/s`;
  return `${(v * 1024).toFixed(0)} KB/s`;
}

function formatGB(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)} PB`;
  if (v >= 1)    return `${v.toFixed(1)} GB`;
  return `${(v * 1024).toFixed(0)} MB`;
}

// ── Clickable Legend Item ─────────────────────────────────────────────────────
function LegendItem({
  color, label, dataKey, hidden, onToggle
}: {
  color: string; label: string; dataKey: string; hidden: boolean; onToggle: (key: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(dataKey)}
      className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all select-none ${
        hidden ? 'opacity-30' : 'opacity-100 hover:bg-white/[0.04]'
      }`}
      title={hidden ? `Show ${label}` : `Hide ${label}`}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color, boxShadow: hidden ? 'none' : `0 0 8px ${color}80` }}
      />
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      {hidden && <span className="text-[8px] text-slate-700 font-bold">(hidden)</span>}
    </button>
  );
}

export default function Performance({ stats }: PerformanceProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = (key: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const h = (key: string) => hiddenSeries.has(key);

  return (
    <div className="space-y-10 pb-10 max-w-[1600px] mx-auto no-scrollbar">
      {stats.length === 0 && (
        <div className="glass-panel p-10 flex flex-col items-center justify-center text-center mx-4">
          <div className="w-12 h-12 bg-white/[0.02] rounded-xl flex items-center justify-center text-slate-700 mb-4 border border-white/[0.05]">
            <Activity size={24} />
          </div>
          <h3 className="text-lg font-black text-white mb-1">Telemetry Pending</h3>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Awaiting real-time stream from node hardware...
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-4">

        {/* Throughput */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">Throughput</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">
                Real-time IO performance · <span className="text-slate-600 normal-case font-bold">click legend to toggle</span>
              </p>
            </div>
            <div className="flex gap-1">
              <LegendItem color="#22D3EE" label="Read"  dataKey="read"  hidden={h('read')}  onToggle={toggleSeries} />
              <LegendItem color="#818CF8" label="Write" dataKey="write" hidden={h('write')} onToggle={toggleSeries} />
            </div>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats} style={{ outline: 'none' }}>
                <defs>
                  <linearGradient id="gRead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22D3EE" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gWrite" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#818CF8" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis axisLine={false} tickLine={false} tick={chartStyle.axisStyle} tickFormatter={formatMBs} width={58} />
                <Tooltip
                  contentStyle={chartStyle.contentStyle}
                  itemStyle={chartStyle.itemStyle}
                  labelStyle={chartStyle.labelStyle}
                  formatter={(v: number, name: string) => [formatMBs(v), name === 'read' ? 'Read' : 'Write']}
                />
                <Area
                  type="monotone" dataKey="read" name="read"
                  stroke="#22D3EE" fill="url(#gRead)" strokeWidth={h('read') ? 0 : 2}
                  fillOpacity={h('read') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="write" name="write"
                  stroke="#818CF8" fill="url(#gWrite)" strokeWidth={h('write') ? 0 : 2}
                  fillOpacity={h('write') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* IOPS */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">IOPS</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">Transaction rate monitoring</p>
            </div>
            <div className="flex gap-1">
              <LegendItem color="#F59E0B" label="Ops/s" dataKey="iops" hidden={h('iops')} onToggle={toggleSeries} />
            </div>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats} style={{ outline: 'none' }}>
                <defs>
                  <linearGradient id="gIops" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis
                  axisLine={false} tickLine={false} tick={chartStyle.axisStyle}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} width={40}
                />
                <Tooltip
                  contentStyle={chartStyle.contentStyle}
                  itemStyle={chartStyle.itemStyle}
                  labelStyle={chartStyle.labelStyle}
                  formatter={(v: number) => [`${v.toFixed(0)} ops/s`, 'IOPS']}
                />
                <Area
                  type="monotone" dataKey="iops"
                  stroke="#F59E0B" fill="url(#gIops)"
                  strokeWidth={h('iops') ? 0 : 2} fillOpacity={h('iops') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CPU & ARC */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">System Resources</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">CPU Load & ARC efficiency</p>
            </div>
            <div className="flex gap-1">
              <LegendItem color="#6366F1" label="CPU"     dataKey="cpu"    hidden={h('cpu')}    onToggle={toggleSeries} />
              <LegendItem color="#10B981" label="ARC Hit" dataKey="arcHit" hidden={h('arcHit')} onToggle={toggleSeries} />
            </div>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats} style={{ outline: 'none' }}>
                <defs>
                  <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gArc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10B981" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis
                  axisLine={false} tickLine={false} tick={chartStyle.axisStyle}
                  tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} width={40}
                />
                <Tooltip
                  contentStyle={chartStyle.contentStyle}
                  itemStyle={chartStyle.itemStyle}
                  labelStyle={chartStyle.labelStyle}
                  formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === 'cpu' ? 'CPU Load' : 'ARC Hit Ratio']}
                />
                <Area
                  type="monotone" dataKey="cpu" stroke="#6366F1" fill="url(#gCpu)"
                  strokeWidth={h('cpu') ? 0 : 2} fillOpacity={h('cpu') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="arcHit" stroke="#10B981" fill="url(#gArc)"
                  strokeWidth={h('arcHit') ? 0 : 2} fillOpacity={h('arcHit') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Storage Trends */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">Storage Trends</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">Pool allocation history</p>
            </div>
            <div className="flex gap-1">
              <LegendItem color="#F43F5E" label="Used" dataKey="alloc" hidden={h('alloc')} onToggle={toggleSeries} />
              <LegendItem color="#22D3EE" label="Free" dataKey="free"  hidden={h('free')}  onToggle={toggleSeries} />
            </div>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats} style={{ outline: 'none' }}>
                <defs>
                  <linearGradient id="gUsed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#F43F5E" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFree" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22D3EE" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis
                  axisLine={false} tickLine={false} tick={chartStyle.axisStyle}
                  tickFormatter={formatGB} width={55}
                />
                <Tooltip
                  contentStyle={chartStyle.contentStyle}
                  itemStyle={chartStyle.itemStyle}
                  labelStyle={chartStyle.labelStyle}
                  formatter={(v: number, name: string) => [formatGB(v), name === 'alloc' ? 'Used' : 'Free']}
                />
                <Area
                  type="monotone" dataKey="alloc" stroke="#F43F5E" fill="url(#gUsed)"
                  strokeWidth={h('alloc') ? 0 : 2} fillOpacity={h('alloc') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="free" stroke="#22D3EE" fill="url(#gFree)"
                  strokeWidth={h('free') ? 0 : 2} fillOpacity={h('free') ? 0 : 1}
                  isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
