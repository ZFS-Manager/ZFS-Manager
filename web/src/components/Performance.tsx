import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Activity, HardDrive, Edit2, Check, Plus } from 'lucide-react';
import { api } from '../api';
import { useLayout } from '../hooks/useLayout';
import WidgetShell from './WidgetShell';
import PageTransition from './PageTransition';
import PhysicalDisksTable from './PhysicalDisksTable';

interface PerformanceProps {
  stats: any[];
  liveMetrics?: {
    cpu_percent: number;
    arc_hit_ratio: number;
    total_read_mb: number;
    total_write_mb: number;
    read_bw_mb: number;
    write_bw_mb: number;
    read_iops: number;
    write_iops: number;
  } | null;
  serverTimeOffsetMs?: number;
  pools?: any[];
  selectedPool?: string;
  onSelectPool?: (name: string) => void;
}

type Interval = '1h' | '6h' | '1d' | '7d' | '1m' | '1y';

const INTERVALS: { key: Interval; label: string; api: string }[] = [
  { key: '1h',  label: '1H',  api: '1h'  },
  { key: '6h',  label: '6H',  api: '6h'  },
  { key: '1d',  label: '24H', api: '1d'  },
  { key: '7d',  label: '7D',  api: '1w'  },
  { key: '1m',  label: '1M',  api: '1m'  },
  { key: '1y',  label: '1Y',  api: '1y'  },
];

const SECONDS_PER_POINT: Record<Interval, number> = {
  '1h': 60, '6h': 300, '1d': 300, '7d': 1800, '1m': 7200, '1y': 86400,
};

const INTERVAL_MS: Record<Interval, number> = {
  '1h':  60   * 60 * 1000,
  '6h':  6    * 60 * 60 * 1000,
  '1d':  24   * 60 * 60 * 1000,
  '7d':  7    * 24 * 60 * 60 * 1000,
  '1m':  30   * 24 * 60 * 60 * 1000,
  '1y':  365  * 24 * 60 * 60 * 1000,
};

function getXTicks(interval: Interval, now: number): number[] {
  const cfg: Record<Interval, { step: number; count: number }> = {
    '1h': { step: 10 * 60 * 1000,           count: 7  },
    '6h': { step: 30 * 60 * 1000,           count: 13 },
    '1d': { step: 2  * 60 * 60 * 1000,      count: 13 },
    '7d': { step: 24 * 60 * 60 * 1000,      count: 8  },
    '1m': { step: 7  * 24 * 60 * 60 * 1000, count: 5  },
    '1y': { step: 30 * 24 * 60 * 60 * 1000, count: 13 },
  };
  const { step, count } = cfg[interval];
  return Array.from({ length: count }, (_, i) => now - (count - 1 - i) * step);
}

function fmtTickLabel(v: number, iv: Interval): string {
  const d = new Date(v);
  if (iv === '1h' || iv === '6h' || iv === '1d')
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

const C = {
  read: '#38bdf8', write: '#818cf8',
  iops: '#f59e0b', cpu: '#a78bfa', arc: '#34d399',
  alloc: '#6366f1', free: '#22c55e',
};

const CHART_MARGIN = { top: 24, right: 8, left: 16, bottom: 8 };

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
const GRID_PROPS = { strokeDasharray: '3 6' as const, stroke: 'rgba(255,255,255,0.15)', vertical: false };

function getBwScale(maxMB: number): { unit: string; fmt: (v: number) => string } {
  if (maxMB >= 1000) return { unit: 'GB/s', fmt: v => `${(v / 1000).toFixed(1)} GB/s` };
  if (maxMB >= 1)    return { unit: 'MB/s', fmt: v => `${v.toFixed(0)} MB/s` };
  return { unit: 'KB/s', fmt: v => `${(v * 1024).toFixed(0)} KB/s` };
}

function getGbScale(maxGB: number): { unit: string; fmt: (v: number) => string } {
  if (maxGB >= 1000) return { unit: 'TB', fmt: v => `${(v / 1000).toFixed(1)} TB` };
  return { unit: 'GB', fmt: v => `${v.toFixed(0)} GB` };
}

function fmtBw(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} GB/s`;
  if (v >= 1)    return `${v.toFixed(2)} MB/s`;
  return `${(v * 1024).toFixed(0)} KB/s`;
}
function fmtGB(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} TB`;
  if (v >= 1)    return `${v.toFixed(2)} GB`;
  return `${(v * 1024).toFixed(0)} MB`;
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

function rollingAverage(data: any[], keys: string[], window: number): any[] {
  return data.map((point, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const out = { ...point };
    for (const k of keys) {
      out[k] = slice.reduce((s: number, d: any) => s + (d[k] || 0), 0) / slice.length;
    }
    return out;
  });
}

function transformHistory(metrics: any[], interval: Interval, poolFilter?: string): any[] {
  // Client-side per-pool filter using pool_name field from backend
  const filtered = poolFilter
    ? metrics.filter((m: any) => m.pool_name === poolFilter)
    : metrics;

  const seen = new Map<string, any>();
  for (const m of filtered) {
    const key = m.collected_at;
    if (seen.has(key)) {
      const g = seen.get(key)!;
      g.read += m.read_bw_mb; g.write += m.write_bw_mb;
      g.iops += m.iops; g.alloc += m.alloc_gb; g.free += m.free_gb;
      g.cpu += m.cpu_percent; g.arc += m.arc_hit_ratio; g.n++;
    } else {
      seen.set(key, {
        ts: fmtTs(m.collected_at, interval),
        tsMs: new Date(m.collected_at).getTime(),
        read: m.read_bw_mb, write: m.write_bw_mb, iops: m.iops,
        alloc: m.alloc_gb, free: m.free_gb,
        cpu: m.cpu_percent, arc: m.arc_hit_ratio, n: 1,
      });
    }
  }
  return Array.from(seen.values())
    .map(g => ({
      timestamp: g.ts, tsMs: g.tsMs,
      read:  isNaN(g.read)  ? 0 : g.read,
      write: isNaN(g.write) ? 0 : g.write,
      iops: g.iops, alloc: g.alloc, free: g.free,
      cpu: g.cpu / g.n, arcHit: g.arc / g.n,
    }))
    .filter(d => !isNaN(d.tsMs) && d.tsMs > 0)
    .sort((a, b) => a.tsMs - b.tsMs);
}

function fmtTimeRemaining(freeGb: number, rateGbDay: string): string {
  const rate = parseFloat(rateGbDay);
  if (!rate || rate <= 0) return '–';
  const days = freeGb / rate;
  if (days < 14)  return `in ~${Math.round(days)} days`;
  if (days < 90)  return `in ~${Math.round(days / 7)} weeks`;
  if (days < 730) return `in ~${Math.round(days / 30)} months`;
  return `in ~${Math.round(days / 365)} years`;
}

function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="skeleton" style={{ height, borderRadius: 'var(--radius-lg)' }} />;
}

function fmtGrowthRate(diffGb: number, timeSec: number): string {
  if (timeSec <= 0 || diffGb === 0) return '0 B/s';
  const bytesPerSec = (diffGb * 1024 * 1024 * 1024) / timeSec;
  const sign = bytesPerSec > 0 ? '+' : '';
  const abs = Math.abs(bytesPerSec);
  if (abs >= 1024 * 1024 * 1024) return `${sign}${(abs / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
  if (abs >= 1024 * 1024) return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB/s`;
  if (abs >= 1024) return `${sign}${(abs / 1024).toFixed(0)} KB/s`;
  return `${sign}${abs.toFixed(0)} B/s`;
}

function fmtRateGbDay(gbPerDay: number): string {
  if (gbPerDay >= 1000) return `${(gbPerDay / 1024).toFixed(1)} TB/day`;
  if (gbPerDay >= 1)    return `${gbPerDay.toFixed(2)} GB/day`;
  if (gbPerDay >= 0.001) return `${(gbPerDay * 1024).toFixed(1)} MB/day`;
  return '< 1 MB/day';
}

function getIntervalLabel(iv: Interval): string {
  switch (iv) {
    case '1h': return 'last 1h';
    case '6h': return 'last 6h';
    case '1d': return 'last 24h';
    case '7d': return 'last 7d';
    case '1m': return 'last 1M';
    case '1y': return 'last 1Y';
    default: return 'last 24h';
  }
}

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

function GaugeCard({ label, value, unit, color, sub }: {
  label: string; value: string; unit: string; color: string; sub?: string;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {value}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color }}>{unit}</span>
          {sub && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, badge }: { label: string; badge: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
        color: 'var(--success)', background: 'rgba(34,197,94,0.1)',
        border: '1px solid rgba(34,197,94,0.25)',
        borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em',
      }}>{badge}</span>
    </div>
  );
}

/* ── Pool selector (compact — inline in toolbar) ── */
function PoolSelector({ pools, selected, onSelect }: {
  pools: any[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  if (pools.length <= 1) return null;

  if (pools.length > 4) {
    return (
      <select
        value={selected}
        onChange={e => onSelect(e.target.value)}
        style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '0 28px 0 10px',
          fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600,
          color: 'var(--accent)', cursor: 'pointer', outline: 'none', height: 32,
        }}
      >
        {pools.map((p: any) => (
          <option key={p.name} value={p.name}>{p.name} [{p.health}]</option>
        ))}
      </select>
    );
  }

  return (
    <div style={{
      display: 'flex', background: 'var(--bg-elevated)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {pools.map((p: any) => {
        const active = selected === p.name;
        const isOnline = p.health === 'ONLINE';
        return (
          <button
            key={p.name}
            onClick={() => onSelect(p.name)}
            style={{
              height: 32, padding: '0 14px',
              fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
              letterSpacing: '0.04em',
              background: active ? 'var(--accent-dim)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.12s',
              border: 'none',
              borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
              display: 'flex', alignItems: 'center', gap: 6,
              borderRight: '1px solid var(--border)',
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: isOnline ? 'var(--success)' : 'var(--danger)',
              display: 'inline-block', flexShrink: 0,
            }} />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

const WIDGET_LABELS: Record<string, string> = {
  'live-gauges':     'Live I/O Gauges',
  'disk-io':         'Physical Disks',
  'io-chart':        'Historical I/O Chart',
  'storage-history': 'Storage Space History',
  'smart-health':    'SMART / Disk Health',
};

export default function Performance({ stats, liveMetrics, serverTimeOffsetMs = 0, pools: poolsProp, selectedPool, onSelectPool }: PerformanceProps) {
  const { widgets, loaded, setVisible, reorder, toast } = useLayout('performance');
  const [editMode, setEditMode]         = useState(false);
  const [dragFrom, setDragFrom]         = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState<string | null>(null);

  const [interval, _setInterval]        = useState<Interval>(() => {
    const saved = localStorage.getItem('perf_interval') as Interval | null;
    return (saved && INTERVALS.some(i => i.key === saved)) ? saved : '1d';
  });
  const selectInterval = useCallback((iv: Interval) => {
    localStorage.setItem('perf_interval', iv);
    _setInterval(iv);
  }, []);
  const [capacityData, setCapacityData] = useState<any[]>([]);
  const [rawMetrics, setRawMetrics]     = useState<any[]>([]);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [liveMode, setLiveMode]         = useState(() => localStorage.getItem('perf_live') === 'true');
  const [historyData, setHistoryData]   = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hidden, setHidden]             = useState<Set<string>>(new Set());
  const [smartData, setSmartData]       = useState<any[]>([]);

  const [diskMetrics, setDiskMetrics]   = useState<Record<string, any[]>>({});
  const [diskPools, setDiskPools]       = useState<string[]>([]);

  const multiPool = (poolsProp || []).length > 1;
  const effectivePool = multiPool
    ? (selectedPool && (poolsProp || []).some((p: any) => p.name === selectedPool) ? selectedPool : (poolsProp || [])[0]?.name || '')
    : '';

  const liveStats = stats;
  const livePoint = liveStats.length > 0 ? liveStats[liveStats.length - 1] : null;

  const chartData = historyData;
  const secPerPt  = SECONDS_PER_POINT[interval];

  const liveDataWithTimestamps = useMemo(() => {
    const now = Date.now() + serverTimeOffsetMs;
    const n   = liveStats.length;
    return liveStats.map((s: any, i: number) => {
      const msAgo = (n - 1 - i) * 1000;
      const t     = new Date(now - msAgo);
      return {
        tsMs:     t.getTime(),
        timestamp: t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        hhmmss:   t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        read:  s.read  ?? 0,
        write: s.write ?? 0,
        iops:  s.iops  ?? 0,
      };
    });
  }, [liveStats, serverTimeOffsetMs]);

  const smoothedLiveData = useMemo(() =>
    rollingAverage(liveDataWithTimestamps, ['read', 'write', 'iops'], 3),
    [liveDataWithTimestamps]
  );

  const ioDisplayData = useMemo(() => {
    if (!liveMode) return chartData;
    return smoothedLiveData;
  }, [liveMode, chartData, smoothedLiveData]);

  // Fetch history — filter client-side by pool when multiPool, then restrict to window
  useEffect(() => {
    setCapacityData([]);
    setRawMetrics([]);
    setLoadingCapacity(true);
    if (!liveMode) { setHistoryData([]); setLoadingHistory(true); }
    const apiInterval = INTERVALS.find(i => i.key === interval)?.api ?? interval;
    const fetchHistory = () =>
      api.getMetricsHistory(apiInterval)
        .then(res => {
          const allMetrics: any[] = res.metrics || [];

          // Log debug info for 1h to help diagnose total calculation issues
          if (apiInterval === '1h') {
            const cutoffMs = Date.now() - INTERVAL_MS['1h'];
            const inWindow = allMetrics.filter((m: any) => new Date(m.collected_at).getTime() >= cutoffMs);
            console.debug('[1h debug] raw points:', allMetrics.length, '/ in-window:', inWindow.length,
              '/ time range:', allMetrics.length > 0 ? `${allMetrics[0].collected_at} → ${allMetrics[allMetrics.length-1].collected_at}` : 'empty');
          }

          // Pool filter applied client-side using pool_name from backend
          const poolFilter = multiPool && effectivePool ? effectivePool : undefined;
          const windowCutoff = Date.now() - INTERVAL_MS[interval];

          // transformHistory with optional pool filter
          const all = transformHistory(allMetrics, interval, poolFilter);

          // For capacity (Pool Capacity chart), also transform without pool filter to get all-pool data
          // but we keep it filtered by pool when multiPool
          const capAll = transformHistory(allMetrics, interval, poolFilter);

          // Restrict to the selected time window to prevent stale/out-of-window points
          const windowed = all.filter(d => d.tsMs >= windowCutoff);
          const capWindowed = capAll.filter(d => d.tsMs >= windowCutoff);

          setRawMetrics(allMetrics);
          setCapacityData(capWindowed);
          if (!liveMode) setHistoryData(windowed);
        })
        .catch(() => {
          setCapacityData([]);
          setRawMetrics([]);
          if (!liveMode) setHistoryData([]);
        })
        .finally(() => { setLoadingCapacity(false); setLoadingHistory(false); });
    fetchHistory();
    const id = setInterval(fetchHistory, 30_000);
    return () => clearInterval(id);
  }, [interval, liveMode, multiPool, effectivePool]);

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

  useEffect(() => {
    const names = (poolsProp || []).map((p: any) => p.name).filter(Boolean);
    if (names.length === 0) { setDiskMetrics({}); setDiskPools([]); return; }
    setDiskPools(names);
    const fetchDisks = async () => {
      try {
        const results = await Promise.all(names.map((n: string) => api.getPoolDiskMetrics(n)));
        const map: Record<string, any[]> = {};
        results.forEach((r, i) => { map[names[i]] = r.disks || []; });
        setDiskMetrics(map);
      } catch { /* ignore */ }
    };
    fetchDisks();
    const id = setInterval(fetchDisks, 1_000);
    return () => clearInterval(id);
  }, [(poolsProp || []).map((p: any) => p.name).join(',')]);

  const toggle = useCallback((key: string) => {
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const vis = (key: string) => !hidden.has(key);

  // Windowed totals: only count points within the selected time window
  const windowCutoffMs = Date.now() - INTERVAL_MS[interval];
  const windowedChartData = useMemo(
    () => chartData.filter(d => d.tsMs >= windowCutoffMs),
    [chartData, windowCutoffMs]
  );

  const dispAvgR   = windowedChartData.length ? windowedChartData.reduce((s, d) => s + (d.read  || 0), 0) / windowedChartData.length : 0;
  const dispAvgW   = windowedChartData.length ? windowedChartData.reduce((s, d) => s + (d.write || 0), 0) / windowedChartData.length : 0;
  const dispTotalR = windowedChartData.reduce((s, d) => s + (d.read  || 0) * secPerPt / 1024, 0);
  const dispTotalW = windowedChartData.reduce((s, d) => s + (d.write || 0) * secPerPt / 1024, 0);

  const displayData   = liveMode ? smoothedLiveData : windowedChartData;
  const displaySecPt  = liveMode ? 5 : secPerPt;
  const dispLiveAvgR  = displayData.length ? displayData.reduce((s, d) => s + (d.read  || 0), 0) / displayData.length : 0;
  const dispLiveAvgW  = displayData.length ? displayData.reduce((s, d) => s + (d.write || 0), 0) / displayData.length : 0;
  const dispLiveTotalR = displayData.reduce((s, d) => s + (d.read  || 0) * displaySecPt / 1024, 0);
  const dispLiveTotalW = displayData.reduce((s, d) => s + (d.write || 0) * displaySecPt / 1024, 0);

  // Pool Capacity chart: per-pool when multiPool, otherwise aggregate
  const selPoolProp = multiPool && effectivePool
    ? (poolsProp || []).find((p: any) => p.name === effectivePool)
    : null;

  const correctedCapacityData = useMemo(() => {
    const totalUsedGb  = selPoolProp
      ? (selPoolProp.used_bytes      || 0) / 1_073_741_824
      : (poolsProp || []).reduce((s: number, p: any) => s + (p.used_bytes      || 0), 0) / 1_073_741_824;
    const totalAvailGb = selPoolProp
      ? (selPoolProp.available_bytes || 0) / 1_073_741_824
      : (poolsProp || []).reduce((s: number, p: any) => s + (p.available_bytes || 0), 0) / 1_073_741_824;
    if ((totalUsedGb <= 0 && totalAvailGb <= 0) || capacityData.length === 0) return capacityData;
    return capacityData.map((d: any) => ({
      ...d,
      alloc: totalUsedGb,
      free:  totalAvailGb,
    }));
  }, [capacityData, selPoolProp?.available_bytes, selPoolProp?.used_bytes,
      (poolsProp || []).map((p: any) => `${p.available_bytes},${p.used_bytes}`).join('|')]);

  const ioMaxMB = ioDisplayData.reduce((m, d) => Math.max(m, d.read || 0, d.write || 0), 0.01);
  const bwScale = getBwScale(ioMaxMB);
  const storageMaxGB = capacityData.reduce((m, d) => Math.max(m, d.alloc || 0, d.free || 0), 0.01);
  const gbScale = getGbScale(storageMaxGB);

  const lastLivePoint = smoothedLiveData.length > 0 ? smoothedLiveData[smoothedLiveData.length - 1] : null;

  // Per-pool live metrics from disk sums; fall back to system-wide liveMetrics
  const selDiskRows = multiPool && effectivePool ? (diskMetrics[effectivePool] || []) : [];
  const poolDiskReadBw  = selDiskRows.reduce((s: number, d: any) => s + (d.read_bw_mb  || 0), 0);
  const poolDiskWriteBw = selDiskRows.reduce((s: number, d: any) => s + (d.write_bw_mb || 0), 0);
  const poolDiskReadIops  = selDiskRows.reduce((s: number, d: any) => s + (d.read_iops  || 0), 0);
  const poolDiskWriteIops = selDiskRows.reduce((s: number, d: any) => s + (d.write_iops || 0), 0);

  const ioReadBw  = multiPool && selDiskRows.length > 0
    ? poolDiskReadBw
    : (liveMode && lastLivePoint ? lastLivePoint.read  : (liveMetrics?.read_bw_mb  ?? livePoint?.read  ?? 0));
  const ioWriteBw = multiPool && selDiskRows.length > 0
    ? poolDiskWriteBw
    : (liveMode && lastLivePoint ? lastLivePoint.write : (liveMetrics?.write_bw_mb ?? livePoint?.write ?? 0));
  const ioReadIops  = multiPool && selDiskRows.length > 0 ? poolDiskReadIops  : (liveMetrics?.read_iops  ?? livePoint?.readIops  ?? 0);
  const ioWriteIops = multiPool && selDiskRows.length > 0 ? poolDiskWriteIops : (liveMetrics?.write_iops ?? livePoint?.writeIops ?? 0);

  const livePeakR = liveStats.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const livePeakW = liveStats.reduce((m, d) => Math.max(m, d.write || 0), 0);

  const totalReadGB  = (liveMetrics?.total_read_mb  ?? 0) / 1024;
  const totalWriteGB = (liveMetrics?.total_write_mb ?? 0) / 1024;

  const nowMs = Date.now();
  const histXDomain: [number, number] = [nowMs - INTERVAL_MS[interval], nowMs];
  const histXTicks = getXTicks(interval, nowMs);

  const liveXAxisProps = {
    dataKey: 'tsMs' as const,
    type: 'number' as const,
    domain: ['dataMin', 'dataMax'] as [string, string],
    tickFormatter: (v: number) => new Date(v).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    tickCount: 10,
    axisLine: false, tickLine: false, tick: AXIS_TICK,
  };
  const histXAxisProps = {
    dataKey: 'tsMs' as const,
    type: 'number' as const,
    scale: 'time' as const,
    domain: histXDomain,
    ticks: histXTicks,
    tickFormatter: (v: number) => fmtTickLabel(v, interval),
    axisLine: false, tickLine: false, tick: AXIS_TICK, minTickGap: 30,
  };

  // Disk pools filtered by selected pool when multiPool
  const selDiskPools = multiPool && effectivePool ? [effectivePool] : diskPools;

  // SMART: filter to disks belonging to the selected pool (matched by name from disk metrics)
  const poolDiskNamesForSmart = useMemo(() => {
    const src = multiPool && effectivePool ? (diskMetrics[effectivePool] || []) : diskPools.flatMap(p => diskMetrics[p] || []);
    return new Set(src.map((d: any) => d.name as string));
  }, [multiPool, effectivePool, diskMetrics, diskPools]);

  const filteredSmartData = useMemo(() =>
    poolDiskNamesForSmart.size === 0
      ? smartData
      : smartData.filter(d => poolDiskNamesForSmart.has(d.disk?.name)),
    [smartData, poolDiskNamesForSmart]
  );

  const handleDragStart = useCallback((id: string) => setDragFrom(id), []);
  const handleDragOver  = useCallback((id: string) => setDragOver(id), []);
  const handleDrop      = useCallback((toId: string) => {
    if (dragFrom && dragFrom !== toId) reorder(dragFrom, toId);
    setDragFrom(null); setDragOver(null);
  }, [dragFrom, reorder]);

  const handleRemove = useCallback((id: string) => setVisible(id, false), [setVisible]);
  const handleAdd    = useCallback((id: string) => setVisible(id, true),  [setVisible]);

  const renderWidget = (id: string): React.ReactNode => {
    switch (id) {
      case 'live-gauges': {
        const fmtTotal = (gb: number) => {
          if (gb >= 1000) return { value: (gb / 1024).toFixed(2), unit: 'TB' };
          if (gb >= 1)    return { value: gb.toFixed(2),          unit: 'GB' };
          if (gb >= 0.001) return { value: (gb * 1024).toFixed(1), unit: 'MB' };
          return { value: '0', unit: 'MB' };
        };
        const totalRead  = fmtTotal(totalReadGB);
        const totalWrite = fmtTotal(totalWriteGB);
        return (
          <div>
            <SectionHeader label={multiPool ? `Live I/O · ${effectivePool}` : 'Live I/O'} badge="1 s" />
            <div className="perf-stats-grid">
              <GaugeCard
                label="↑ Read Speed"
                value={ioReadBw >= 1000 ? (ioReadBw / 1000).toFixed(2) : ioReadBw.toFixed(1)}
                unit={ioReadBw >= 1000 ? 'GB/s' : 'MB/s'}
                color={C.read}
                sub={`Peak ${fmtBw(livePeakR)}`}
              />
              <GaugeCard
                label="↓ Write Speed"
                value={ioWriteBw >= 1000 ? (ioWriteBw / 1000).toFixed(2) : ioWriteBw.toFixed(1)}
                unit={ioWriteBw >= 1000 ? 'GB/s' : 'MB/s'}
                color={C.write}
                sub={`Peak ${fmtBw(livePeakW)}`}
              />
              <GaugeCard
                label="↑ Read IOPS"
                value={ioReadIops.toFixed(0)}
                unit="ops/s"
                color={C.read}
              />
              <GaugeCard
                label="↓ Write IOPS"
                value={ioWriteIops.toFixed(0)}
                unit="ops/s"
                color={C.write}
              />
              <GaugeCard
                label="Total Read"
                value={totalRead.value}
                unit={totalRead.unit}
                color={C.read}
                sub="all time"
              />
              <GaugeCard
                label="Total Write"
                value={totalWrite.value}
                unit={totalWrite.unit}
                color={C.write}
                sub="all time"
              />
            </div>
          </div>
        );
      }

      case 'disk-io':
        return (
          <Panel title="Physical Disks" sub={`Per-disk I/O · 1 s refresh${multiPool ? ` · ${effectivePool}` : ''}`}>
            <PhysicalDisksTable diskPools={selDiskPools} diskMetrics={diskMetrics} />
          </Panel>
        );

      case 'io-chart': {
        const ioNowMs = Date.now();
        const ioChartData = (() => {
          if (liveMode || windowedChartData.length === 0) return ioDisplayData;
          const last = windowedChartData[windowedChartData.length - 1];
          const ageSec = (ioNowMs - (last.tsMs || 0)) / 1000;
          if (ageSec > 60) {
            return [...windowedChartData, { ...last, tsMs: ioNowMs }];
          }
          return windowedChartData;
        })();
        return (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
                opacity: liveMode ? 0.4 : 1, pointerEvents: liveMode ? 'none' : 'auto',
              }}>
                {INTERVALS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => selectInterval(key)}
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

              <button
                onClick={() => setLiveMode(v => { const next = !v; localStorage.setItem('perf_live', String(next)); return next; })}
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
                  {windowedChartData.length} pts · {secPerPt}s/sample
                  {multiPool && effectivePool && ` · ${effectivePool}`}
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
                sub={liveMode ? 'Real-time · live session' : `${windowedChartData.length} samples · ${getIntervalLabel(interval)}`}
                right={
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Toggle color={C.read}  label="↑ Read"  active={vis('read')}  onClick={() => toggle('read')}  />
                    <Toggle color={C.write} label="↓ Write" active={vis('write')} onClick={() => toggle('write')} />
                  </div>
                }
              >
                <div style={{ height: 240, overflow: 'visible' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ioChartData} margin={CHART_MARGIN}>
                      <defs>
                        <linearGradient id="gRead" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.read} stopOpacity={0.15}/><stop offset="95%" stopColor={C.read} stopOpacity={0}/></linearGradient>
                        <linearGradient id="gWrite" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.write} stopOpacity={0.15}/><stop offset="95%" stopColor={C.write} stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis {...(liveMode ? liveXAxisProps : histXAxisProps)} />
                      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={bwScale.fmt} width={85} />
                      <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v, pts) => pts?.[0]?.payload?.hhmmss ?? pts?.[0]?.payload?.timestamp ?? (typeof v === 'number' ? fmtTs(new Date(v).toISOString(), interval) : String(v))} formatter={(v: number) => [fmtBw(v), '']} />
                      {vis('read') && <Area type="monotone" dataKey="read" stroke={C.read} fill="url(#gRead)" strokeWidth={2} isAnimationActive={!liveMode} animationDuration={600} />}
                      {vis('write') && <Area type="monotone" dataKey="write" stroke={C.write} fill="url(#gWrite)" strokeWidth={2} isAnimationActive={!liveMode} animationDuration={600} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Windowed totals below chart — only counts data within the selected time window */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  {[
                    { label: 'Avg Read',    value: fmtBw(liveMode ? dispLiveAvgR  : dispAvgR)  },
                    { label: 'Avg Write',   value: fmtBw(liveMode ? dispLiveAvgW  : dispAvgW)  },
                    { label: `Total Read`,  value: fmtGB(liveMode ? dispLiveTotalR : dispTotalR) },
                    { label: `Total Write`, value: fmtGB(liveMode ? dispLiveTotalW : dispTotalW) },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        );
      }

      case 'storage-history': {
        const capNowMs = Date.now();
        const capWindowStart = capNowMs - INTERVAL_MS[interval];

        const capDisplayData = (() => {
          if (correctedCapacityData.length === 0) return correctedCapacityData;
          const last = correctedCapacityData[correctedCapacityData.length - 1];
          const ageSec = (capNowMs - (last.tsMs || 0)) / 1000;
          if (ageSec > 60) {
            return [...correctedCapacityData, { ...last, tsMs: capNowMs }];
          }
          return correctedCapacityData;
        })();

        const capStorageMaxGB = capDisplayData.reduce((m, d) => Math.max(m, d.alloc || 0, d.free || 0), 0.01);
        const capGbScale = getGbScale(capStorageMaxGB);
        const capHistXAxisProps = {
          dataKey: 'tsMs' as const,
          type: 'number' as const,
          scale: 'time' as const,
          domain: [capWindowStart, capNowMs] as [number, number],
          ticks: getXTicks(interval, capNowMs),
          tickFormatter: (v: number) => fmtTickLabel(v, interval),
          axisLine: false, tickLine: false, tick: AXIS_TICK, minTickGap: 30,
        };

        const lastFreeGb = correctedCapacityData.length > 0 ? (correctedCapacityData[correctedCapacityData.length - 1].free || 0) : 0;
        const avgWriteMbPerSec = capacityData.length > 0
          ? capacityData.reduce((s, d) => s + (d.write || 0), 0) / capacityData.length
          : 0;
        const avgWriteGbPerDay = (avgWriteMbPerSec / 1024) * 86400;

        let forecastDateStr: string | null = null;
        let forecastTimeStr: string | null = null;
        let forecastColor = 'var(--text-muted)';
        if (avgWriteGbPerDay > 0.000001 && lastFreeGb > 0) {
          const daysUntilFull = lastFreeGb / avgWriteGbPerDay;
          const fillDate = new Date(Date.now() + daysUntilFull * 86400_000);
          const d = fillDate.getDate().toString().padStart(2, '0');
          const mo = (fillDate.getMonth() + 1).toString().padStart(2, '0');
          forecastDateStr = `${d}.${mo}.${fillDate.getFullYear()}`;
          forecastTimeStr = fmtTimeRemaining(lastFreeGb, avgWriteGbPerDay.toString());
          if (daysUntilFull < 30)  forecastColor = 'var(--danger)';
          else if (daysUntilFull < 180) forecastColor = 'var(--warning)';
          else forecastColor = 'var(--success)';
        }

        return (
          <Panel
            title="Pool Capacity"
            sub={`Allocation trends · ${getIntervalLabel(interval)}${multiPool && effectivePool ? ` · ${effectivePool}` : ''}`}
            right={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Toggle color={C.alloc} label="Used" active={vis('alloc')} onClick={() => toggle('alloc')} />
                <Toggle color={C.free}  label="Free" active={vis('free')}  onClick={() => toggle('free')}  />
              </div>
            }
          >
            <div style={{ height: 240 }}>
              {loadingCapacity ? <Skeleton height={240} /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={capDisplayData} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis {...capHistXAxisProps} />
                    <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={capGbScale.fmt} width={85} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtGB(v), '']} />
                    {vis('alloc') && <Area type="stepAfter" dataKey="alloc" stroke={C.alloc} fill={C.alloc + '10'} strokeWidth={2} />}
                    {vis('free')  && <Area type="stepAfter" dataKey="free"  stroke={C.free}  fill={C.free  + '10'} strokeWidth={2} />}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forecast:</span>
              {forecastDateStr && forecastTimeStr ? (
                <>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: forecastColor, fontWeight: 600 }}>
                    Full on {forecastDateStr} ({forecastTimeStr})
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    · Write rate: {fmtRateGbDay(avgWriteGbPerDay)}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>No growth detected</span>
              )}
            </div>
          </Panel>
        );
      }

      case 'smart-health':
        return (
          <Panel title="Disk SMART Status" sub={`Physical health summary${multiPool && effectivePool ? ` · ${effectivePool}` : ''}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {smartData.length === 0 ? (
                [1, 2, 3].map(i => <Skeleton key={i} height={80} />)
              ) : filteredSmartData.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-ui)' }}>
                  No SMART data for disks in this pool
                </div>
              ) : filteredSmartData.map((d, i) => {
                const passed = d.smart?.smart_status?.passed;
                const temp   = d.smart?.temperature?.current;
                const hours  = d.smart?.power_on_time?.hours;
                return (
                  <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: passed ? 'var(--success-dim)' : 'var(--danger-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <HardDrive size={16} style={{ color: passed ? 'var(--success)' : 'var(--danger)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.disk.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: passed ? 'var(--success)' : 'var(--danger)' }}>{passed ? 'PASSED' : 'FAIL'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)' }}>
                        {temp !== undefined && <span>Temp: <span style={{ color: temp > 50 ? 'var(--danger)' : 'var(--text-secondary)' }}>{temp}°C</span></span>}
                        {hours !== undefined && <span>Power-on: <span style={{ color: 'var(--text-secondary)' }}>{(hours/24).toFixed(0)}d</span></span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        );

      default:
        return null;
    }
  };

  if (!loaded) return <div style={{ padding: 24 }}><Skeleton height={400} /></div>;

  return (
    <PageTransition>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>System Performance</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {multiPool && onSelectPool && (
            <PoolSelector pools={poolsProp || []} selected={effectivePool} onSelect={onSelectPool} />
          )}
          <button className="btn btn-secondary" onClick={() => setEditMode(!editMode)}>
            {editMode ? <Check size={14} /> : <Edit2 size={14} />}
            {editMode ? 'Done' : 'Edit Layout'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {widgets.filter(w => w.visible).map(w => (
          <WidgetShell
            key={w.id}
            id={w.id}
            editMode={editMode}
            onDragStart={() => handleDragStart(w.id)}
            onDragOver={() => handleDragOver(w.id)}
            onDrop={() => handleDrop(w.id)}
            isDragOver={dragOver === w.id}
            onRemove={() => handleRemove(w.id)}
          >
            {renderWidget(w.id)}
          </WidgetShell>
        ))}
      </div>

      {editMode && (
        <div style={{ marginTop: 32, padding: 24, border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Hidden Widgets</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {widgets.filter(w => !w.visible).map(w => (
              <button key={w.id} className="btn btn-secondary" onClick={() => handleAdd(w.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> {WIDGET_LABELS[w.id]}
              </button>
            ))}
            {widgets.every(w => w.visible) && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All widgets are currently visible.</p>}
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
