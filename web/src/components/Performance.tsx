import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Activity, HardDrive, Edit2, Check, Plus } from 'lucide-react';
import { api } from '../api';
import { useLayout } from '../hooks/useLayout';
import WidgetShell from './WidgetShell';

interface PerformanceProps { stats: any[]; }

type Interval = '1h' | '6h' | '1d' | '7d' | '1m' | '1y';

const INTERVALS: { key: Interval; label: string; api: string }[] = [
  { key: '1h',  label: '1H',  api: '1h'  },
  { key: '6h',  label: '6H',  api: '1d'  },
  { key: '1d',  label: '24H', api: '1d'  },
  { key: '7d',  label: '7D',  api: '1w'  },
  { key: '1m',  label: '1M',  api: '1m'  },
  { key: '1y',  label: '1Y',  api: '1y'  },
];

const SECONDS_PER_POINT: Record<Interval, number> = {
  '1h': 60, '6h': 300, '1d': 300, '7d': 1800, '1m': 7200, '1y': 86400,
};

const C = {
  read: '#38bdf8', write: '#818cf8',
  iops: '#f59e0b', cpu: '#a78bfa', arc: '#34d399',
  alloc: '#6366f1', free: '#22c55e',
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#18181b', border: '1px solid #3f3f46',
    borderRadius: 6, padding: '6px 10px',
    fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  labelStyle: { color: '#71717a', fontSize: 10, marginBottom: 2 },
  itemStyle: { fontWeight: 600 },
};
const AXIS_TICK  = { fill: '#52525b', fontSize: 10 };
const GRID_PROPS = { strokeDasharray: '1 6' as const, stroke: 'rgba(255,255,255,0.04)', vertical: false };

function fmtBw(v: number) {
  if (v >= 1000) return `${(v/1000).toFixed(2)} GB/s`;
  if (v >= 1)    return `${v.toFixed(2)} MB/s`;
  return `${(v*1024).toFixed(0)} KB/s`;
}
function fmtGB(v: number) {
  if (v >= 1000) return `${(v/1000).toFixed(2)} TB`;
  if (v >= 1)    return `${v.toFixed(2)} GB`;
  return `${(v*1024).toFixed(0)} MB`;
}
function fmtGBAxis(v: number) {
  if (v >= 1000) return `${(v/1000).toFixed(1)}T`;
  if (v >= 1)    return `${v.toFixed(0)}G`;
  return `${(v*1024).toFixed(0)}M`;
}
function fmtTs(iso: string, iv: Interval) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (iv === '1h' || iv === '6h') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (iv === '1d') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (iv === '7d' || iv === '1m') return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function transformHistory(metrics: any[], interval: Interval): any[] {
  const seen = new Map<string, any>();
  for (const m of metrics) {
    const key = m.collected_at;
    if (seen.has(key)) {
      const g = seen.get(key)!;
      g.read += m.read_bw_mb; g.write += m.write_bw_mb;
      g.iops += m.iops; g.alloc += m.alloc_gb; g.free += m.free_gb;
      g.cpu += m.cpu_percent; g.arc += m.arc_hit_ratio; g.n++;
    } else {
      seen.set(key, {
        ts: fmtTs(m.collected_at, interval),
        read: m.read_bw_mb, write: m.write_bw_mb, iops: m.iops,
        alloc: m.alloc_gb, free: m.free_gb,
        cpu: m.cpu_percent, arc: m.arc_hit_ratio, n: 1,
      });
    }
  }
  return Array.from(seen.values()).map(g => ({
    timestamp: g.ts, read: g.read, write: g.write, iops: g.iops,
    alloc: g.alloc, free: g.free, cpu: g.cpu / g.n, arcHit: g.arc / g.n,
  }));
}

/* ── Skeleton ── */
function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="skeleton" style={{ height, borderRadius: 'var(--radius-lg)' }} />;
}

/* ── Panel ── */
function Panel({ title, sub, right, children }: {
  title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          {sub && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

/* ── Series toggle button ── */
function Toggle({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? color + '44' : 'var(--border)'}`,
        background: active ? color + '15' : 'transparent',
        color: active ? color : 'var(--text-muted)',
        fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? color : 'currentColor', flexShrink: 0, display: 'inline-block' }} />
      {label}
    </button>
  );
}

/* ── Live gauge card ── */
function GaugeCard({ label, value, unit, color, sub }: {
  label: string; value: string; unit: string; color: string; sub?: string;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {value}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color }}>{unit}</span>
          {sub && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}



const WIDGET_LABELS: Record<string, string> = {
  'live-gauges':     'Live I/O Gauges',
  'io-chart':        'Historical I/O Chart',
  'storage-history': 'Storage Space History',
  'smart-health':    'SMART / Disk Health',
};

/* ── Main ── */
export default function Performance({ stats }: PerformanceProps) {
  const { widgets, loaded, setVisible, reorder, toast } = useLayout('performance');
  const [editMode, setEditMode]         = useState(false);
  const [dragFrom, setDragFrom]         = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState<string | null>(null);

  const [interval, setIntervalMode]     = useState<Interval>('1d');
  const [liveMode, setLiveMode]         = useState(false);
  const [historyData, setHistoryData]   = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hidden, setHidden]             = useState<Set<string>>(new Set());
  const [smartData, setSmartData]       = useState<any[]>([]);

  // Live stats always come from props — NEVER from historyData
  const liveStats  = stats;
  const livePoint  = liveStats.length > 0 ? liveStats[liveStats.length - 1] : null;

  const chartData  = historyData;
  const secPerPt   = SECONDS_PER_POINT[interval];

  // In live mode, chart uses live stats; otherwise uses historical data
  const ioDisplayData = useMemo(() => {
    if (!liveMode) return chartData;
    return liveStats.map((s: any, i: number) => ({
      timestamp: String(i),
      read: s.read ?? 0,
      write: s.write ?? 0,
      iops: s.iops ?? 0,
    }));
  }, [liveMode, chartData, liveStats]);

  useEffect(() => {
    if (liveMode) return;
    setHistoryData([]);
    setLoadingHistory(true);
    const apiInterval = INTERVALS.find(i => i.key === interval)?.api ?? interval;
    api.getMetricsHistory(apiInterval)
      .then(res => setHistoryData(transformHistory(res.metrics, interval)))
      .catch(() => setHistoryData([]))
      .finally(() => setLoadingHistory(false));
  }, [interval, liveMode]);

  useEffect(() => {
    api.getDisks().then(async res => {
      const blockdevices = res.blockdevices || [];
      const smartResults = await Promise.allSettled(
        blockdevices.slice(0, 6).map((d: any) =>
          api.getSmartData(d.name || d.path).then(s => ({ disk: d, smart: s }))
        )
      );
      setSmartData(
        smartResults
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<any>).value)
      );
    }).catch(() => {});
  }, []);

  const toggle = useCallback((key: string) => {
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const vis = (key: string) => !hidden.has(key);

  // Stats from full chart data (for accurate totals)
  const totalR = chartData.reduce((s, d) => s + (d.read  || 0) * secPerPt / 1024, 0);
  const totalW = chartData.reduce((s, d) => s + (d.write || 0) * secPerPt / 1024, 0);
  const avgR   = chartData.length ? chartData.reduce((s, d) => s + (d.read  || 0), 0) / chartData.length : 0;
  const avgW   = chartData.length ? chartData.reduce((s, d) => s + (d.write || 0), 0) / chartData.length : 0;
  const peakR  = chartData.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const peakW  = chartData.reduce((m, d) => Math.max(m, d.write || 0), 0);

  // Live peaks for gauges (always from live data)
  const livePeakR = liveStats.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const livePeakW = liveStats.reduce((m, d) => Math.max(m, d.write || 0), 0);

  // Stats shown below chart — use live data in live mode, historical otherwise
  const displayData  = liveMode ? ioDisplayData : chartData;
  const displaySecPt = liveMode ? 5 : secPerPt;
  const dispAvgR   = displayData.length ? displayData.reduce((s, d) => s + (d.read  || 0), 0) / displayData.length : 0;
  const dispAvgW   = displayData.length ? displayData.reduce((s, d) => s + (d.write || 0), 0) / displayData.length : 0;
  const dispPeakR  = displayData.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const dispPeakW  = displayData.reduce((m, d) => Math.max(m, d.write || 0), 0);
  const dispTotalR = displayData.reduce((s, d) => s + (d.read  || 0) * displaySecPt / 1024, 0);
  const dispTotalW = displayData.reduce((s, d) => s + (d.write || 0) * displaySecPt / 1024, 0);

  const xProps = { dataKey: 'timestamp', axisLine: false, tickLine: false, tick: AXIS_TICK, minTickGap: 40 };

  const handleDragStart = useCallback((id: string) => setDragFrom(id), []);
  const handleDragOver  = useCallback((id: string) => setDragOver(id), []);
  const handleDrop      = useCallback((toId: string) => {
    if (dragFrom && dragFrom !== toId) reorder(dragFrom, toId);
    setDragFrom(null); setDragOver(null);
  }, [dragFrom, reorder]);

  const handleRemove = useCallback((id: string) => setVisible(id, false), [setVisible]);
  const handleAdd    = useCallback((id: string) => setVisible(id, true), [setVisible]);

  const renderWidget = (id: string): React.ReactNode => {
    switch (id) {

      case 'live-gauges':
        return (
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
              Live I/O — Always real-time
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <GaugeCard
                label="↑ Read Speed"
                value={livePoint ? (livePoint.read >= 1000 ? (livePoint.read/1000).toFixed(2) : livePoint.read.toFixed(1)) : '0.0'}
                unit={livePoint && livePoint.read >= 1000 ? 'GB/s' : 'MB/s'}
                color={C.read}
                sub={`Peak ${fmtBw(livePeakR)}`}
              />
              <GaugeCard
                label="↓ Write Speed"
                value={livePoint ? (livePoint.write >= 1000 ? (livePoint.write/1000).toFixed(2) : livePoint.write.toFixed(1)) : '0.0'}
                unit={livePoint && livePoint.write >= 1000 ? 'GB/s' : 'MB/s'}
                color={C.write}
                sub={`Peak ${fmtBw(livePeakW)}`}
              />
              <GaugeCard
                label="↑ Read IOPS"
                value={livePoint ? (livePoint.readIops ?? 0).toFixed(0) : '0'}
                unit="ops/s"
                color={C.read}
                sub={'Peak ' + (livePoint ? (livePoint.readIops ?? 0).toFixed(0) : '0') + ' ops/s'}
              />
              <GaugeCard
                label="↓ Write IOPS"
                value={livePoint ? (livePoint.writeIops ?? 0).toFixed(0) : '0'}
                unit="ops/s"
                color={C.write}
                sub={'Peak ' + (livePoint ? (livePoint.writeIops ?? 0).toFixed(0) : '0') + ' ops/s'}
              />
              <GaugeCard
                label="CPU Load"
                value={livePoint ? (typeof livePoint.cpu === 'number' && livePoint.cpu <= 1 ? (livePoint.cpu * 100).toFixed(1) : (livePoint.cpu || 0).toFixed(1)) : '0.0'}
                unit="%"
                color={C.cpu}
                sub={`ARC ${livePoint ? (livePoint.arcHit || 0).toFixed(0) : 0}% hit`}
              />
            </div>
          </div>
        );

      case 'io-chart':
        return (
          <div>
            {/* Interval selector + Live toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
                opacity: liveMode ? 0.4 : 1, pointerEvents: liveMode ? 'none' : 'auto',
              }}>
                {INTERVALS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setIntervalMode(key)}
                    style={{
                      height: 32, padding: '0 16px',
                      fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      borderRight: '1px solid var(--border)', cursor: 'pointer',
                      transition: 'all 0.12s', border: 'none',
                      background: interval === key ? 'var(--accent-dim)' : 'transparent',
                      color: interval === key ? 'var(--accent)' : 'var(--text-muted)',
                      borderBottom: `2px solid ${interval === key ? 'var(--accent)' : 'transparent'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Live toggle */}
              <button
                onClick={() => setLiveMode(v => !v)}
                style={{
                  height: 32, padding: '0 14px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${liveMode ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                  background: liveMode ? 'rgba(34,197,94,0.08)' : 'transparent',
                  color: liveMode ? 'var(--success)' : 'var(--text-muted)',
                  fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.05em',
                }}
              >
                <span
                  className={liveMode ? 'live-dot' : ''}
                  style={{
                    width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    background: liveMode ? 'var(--success)' : 'var(--text-muted)',
                  }}
                />
                {liveMode ? 'LIVE' : 'Live'}
              </button>

              {!liveMode && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {chartData.length} pts · {secPerPt}s/sample
                </span>
              )}
            </div>

            {loadingHistory ? <Skeleton height={220} /> : ioDisplayData.length === 0 ? (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '48px 32px', textAlign: 'center' }}>
                <Activity size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                  {liveMode ? 'Waiting for live data…' : `No data for ${interval} window`}
                </p>
              </div>
            ) : (
              <Panel
                title="Read / Write Throughput"
                sub={liveMode ? 'Real-time · live session' : `${ioDisplayData.length} of ${chartData.length} samples`}
                right={
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Toggle color={C.read}  label="↑ Read"  active={vis('read')}  onClick={() => toggle('read')}  />
                    <Toggle color={C.write} label="↓ Write" active={vis('write')} onClick={() => toggle('write')} />
                  </div>
                }
              >
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ioDisplayData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="perfR" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.read}  stopOpacity={0.15} />
                          <stop offset="95%" stopColor={C.read}  stopOpacity={0}    />
                        </linearGradient>
                        <linearGradient id="perfW" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.write} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={C.write} stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis {...xProps} />
                      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtBw} width={64} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtBw(v), n === 'read' ? '↑ Read' : '↓ Write']} />
                      <Area type="monotone" dataKey="read"  stroke={C.read}  fill="url(#perfR)" strokeWidth={vis('read')  ? 1.5 : 0} fillOpacity={vis('read')  ? 1 : 0} isAnimationActive={false} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                      <Area type="monotone" dataKey="write" stroke={C.write} fill="url(#perfW)" strokeWidth={vis('write') ? 1.5 : 0} fillOpacity={vis('write') ? 1 : 0} isAnimationActive={false} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {displayData.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 0 }}>
                    {/* Read column */}
                    <div style={{ flex: 1, paddingRight: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.read, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.read }}>Read</span>
                      </div>
                      {[
                        { label: 'Avg ↑ Read',   value: fmtBw(dispAvgR)   },
                        { label: 'Peak ↑ Read',  value: fmtBw(dispPeakR)  },
                        { label: 'Total ↑ Read', value: fmtGB(dispTotalR) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: C.read, fontWeight: 700 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    {/* Vertical divider */}
                    <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
                    {/* Write column */}
                    <div style={{ flex: 1, paddingLeft: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.write, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.write }}>Write</span>
                      </div>
                      {[
                        { label: 'Avg ↓ Write',   value: fmtBw(dispAvgW)   },
                        { label: 'Peak ↓ Write',  value: fmtBw(dispPeakW)  },
                        { label: 'Total ↓ Write', value: fmtGB(dispTotalW) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: C.write, fontWeight: 700 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            )}
          </div>
        );

      case 'throughput':
        return null;

      case 'storage-history':
        return !loadingHistory && chartData.length > 0 ? (
          <Panel
            title="Storage Space History"
            sub="Used vs free space over time"
            right={
              <div style={{ display: 'flex', gap: 6 }}>
                <Toggle color={C.alloc} label="Used" active={vis('alloc')} onClick={() => toggle('alloc')} />
                <Toggle color={C.free}  label="Free" active={vis('free')}  onClick={() => toggle('free')}  />
              </div>
            }
          >
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfAl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.alloc} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.alloc} stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="perfFr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.free}  stopOpacity={0.12} />
                      <stop offset="95%" stopColor={C.free}  stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis {...xProps} />
                  <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtGBAxis} width={44} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtGB(v), n === 'alloc' ? 'Used' : 'Free']} />
                  <Area type="monotone" dataKey="alloc" stroke={C.alloc} fill="url(#perfAl)" strokeWidth={vis('alloc') ? 1.5 : 0} fillOpacity={vis('alloc') ? 1 : 0} isAnimationActive={false} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="free"  stroke={C.free}  fill="url(#perfFr)" strokeWidth={vis('free')  ? 1.5 : 0} fillOpacity={vis('free')  ? 1 : 0} isAnimationActive={false} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Write rate + time-until-full prediction */}
            {avgW > 0 && (() => {
              const dailyWriteGB = avgW * 86400 / 1024;
              const lastPoint = chartData[chartData.length - 1];
              const freeGB = lastPoint?.free ?? 0;
              const daysLeft = freeGB > 0 && dailyWriteGB > 0 ? freeGB / dailyWriteGB : null;
              const fmtDays = (d: number) =>
                d < 14  ? `~${Math.round(d)} days`
                : d < 90  ? `~${Math.round(d / 7)} weeks`
                : d < 730 ? `~${Math.round(d / 30)} months`
                : `~${(d / 365).toFixed(1)} yrs`;
              return (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
                  <span>
                    Writing ~<span style={{ fontFamily: 'var(--font-mono)', color: C.write, fontWeight: 600 }}>{fmtGB(dailyWriteGB)}/day</span> on average based on {interval} window.
                  </span>
                  {daysLeft !== null && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                      color: daysLeft < 14 ? 'var(--danger)' : daysLeft < 30 ? 'var(--warning)' : 'var(--text-muted)',
                    }}>
                      Full in {fmtDays(daysLeft)} at current rate
                    </span>
                  )}
                </div>
              );
            })()}
          </Panel>
        ) : null;

      case 'smart-health':
        return smartData.length > 0 ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>SMART / Disk Health</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{smartData.length} disk{smartData.length !== 1 ? 's' : ''} monitored</div>
              </div>
              <HardDrive size={15} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Device</th><th>Model</th><th>Temp</th><th>Health</th>
                    <th>Power-On Hours</th><th>Realloc Sectors</th>
                  </tr>
                </thead>
                <tbody>
                  {smartData.map(({ disk, smart }, i) => {
                    const passed  = smart?.smart_status?.passed ?? smart?.passed;
                    const temp    = smart?.temperature?.current ?? smart?.temp ?? '—';
                    const hours   = smart?.power_on_time?.hours ?? smart?.power_on_hours ?? '—';
                    const realloc = smart?.ata_smart_attributes?.table?.find((a: any) => a.id === 5)?.raw?.value ?? '—';
                    return (
                      <tr key={i}>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>/dev/{disk.name || disk.path}</span></td>
                        <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{smart?.model_name || disk.model || '—'}</span></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: typeof temp === 'number' && temp > 55 ? 'var(--danger)' : typeof temp === 'number' && temp > 45 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                          {temp !== '—' ? `${temp}°C` : '—'}
                        </span></td>
                        <td><span className={passed === true ? 'badge badge-success' : passed === false ? 'badge badge-danger' : 'badge'}>{passed === true ? 'PASSED' : passed === false ? 'FAILED' : 'UNKNOWN'}</span></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{typeof hours === 'number' ? `${hours.toLocaleString()} h` : '—'}</span></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: realloc !== '—' && Number(realloc) > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>{realloc}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  const sortedWidgets  = [...widgets].sort((a, b) => a.order - b.order);
  const visibleWidgets = sortedWidgets.filter(w => w.visible);

  return (
    <div style={{ paddingBottom: 48 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 200,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '8px 14px',
          fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>{toast}</div>
      )}

      {/* Widget tray */}
      {editMode && (
        <div style={{
          position: 'fixed', right: 24, top: 100, width: 220,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 12, zIndex: 50,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Hidden widgets
          </div>
          {sortedWidgets.filter(w => !w.visible).map(w => (
            <button key={w.id} onClick={() => handleAdd(w.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', marginBottom: 4,
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 12, transition: 'all 0.12s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <Plus size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {WIDGET_LABELS[w.id] || w.id}
            </button>
          ))}
          {sortedWidgets.every(w => w.visible) && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>All widgets visible</div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => setEditMode(m => !m)}
          className="btn"
          style={{
            gap: 6,
            background: editMode ? 'var(--accent-dim)' : 'transparent',
            borderColor: editMode ? 'var(--accent-mid)' : 'var(--border)',
            color: editMode ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {editMode ? <><Check size={13} /> Done</> : <><Edit2 size={13} /> Edit Layout</>}
        </button>
      </div>

      {/* Skeleton */}
      {!loaded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={140} /><Skeleton height={280} /><Skeleton height={200} />
        </div>
      )}

      {/* Widgets */}
      {loaded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {visibleWidgets.map(w => {
            const content = renderWidget(w.id);
            if (!content) return null;
            return (
              <WidgetShell
                key={w.id} id={w.id}
                editMode={editMode}
                onRemove={handleRemove}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOver === w.id && dragFrom !== w.id}
              >
                {content}
              </WidgetShell>
            );
          })}
        </div>
      )}
    </div>
  );
}
