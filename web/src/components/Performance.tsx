import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Activity, HardDrive, Edit2, Check, Plus } from 'lucide-react';
import { api } from '../api';
import { useLayout } from '../hooks/useLayout';
import WidgetShell from './WidgetShell';

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
    total_read_gb_db?: number;
    total_write_gb_db?: number;
  } | null;
  serverTimeOffsetMs?: number;
}

type Interval = '1h' | '6h' | '1d' | '7d' | '1m' | '1y';

const INTERVALS: { key: Interval; label: string; api: string }[] = [
  { key: '1h',  label: '1H',  api: '1h'  },
  { key: '6h',  label: '6H',  api: '1d'  },
  { key: '1d',  label: '24H', api: '1d'  },
  { key: '7d',  label: '7D',  api: '1w'  },
  { key: '1m',  label: '1M',  api: '1m'  },
  { key: '1y',  label: '1Y',  api: '1y'  },
];

// Mapping from UI interval to API window for fill-prediction endpoint
const INTERVAL_TO_WINDOW: Record<Interval, string> = {
  '1h': '1h', '6h': '6h', '1d': '1d', '7d': '1w', '1m': '1m', '1y': '1y',
};

const INTERVAL_TO_HISTORY: Record<Interval, { api: string; hoursBack?: number }> = {
  '1h': { api: '1h' },
  '6h': { api: '1d', hoursBack: 6 },
  '1d': { api: '1d' },
  '7d': { api: '1w' },
  '1m': { api: '1m' },
  '1y': { api: '1y' },
};

const SECONDS_PER_POINT: Record<Interval, number> = {
  '1h': 60, '6h': 300, '1d': 300, '7d': 1800, '1m': 7200, '1y': 86400,
};

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
const GRID_PROPS = { strokeDasharray: '1 6' as const, stroke: 'rgba(255,255,255,0.04)', vertical: false };

function getBwScale(maxMB: number): { unit: string; fmt: (v: number) => string } {
  if (maxMB >= 1000) return { unit: 'GB/s', fmt: v => `${(v / 1000).toFixed(1)}\u00A0GB/s` };
  if (maxMB >= 1)    return { unit: 'MB/s', fmt: v => `${v.toFixed(0)}\u00A0MB/s` };
  return { unit: 'KB/s', fmt: v => `${(v * 1024).toFixed(0)}\u00A0KB/s` };
}

function getGbScale(maxGB: number): { unit: string; fmt: (v: number) => string } {
  if (maxGB >= 1000) return { unit: 'TB', fmt: v => `${(v / 1000).toFixed(1)}\u00A0TB` };
  return { unit: 'GB', fmt: v => `${v.toFixed(0)}\u00A0GB` };
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

// Color variable names from the backend to CSS variables
function colorVar(c: string): string {
  if (c === 'danger')    return 'var(--danger)';
  if (c === 'warning')   return 'var(--warning)';
  if (c === 'secondary') return 'var(--text-secondary)';
  return 'var(--text-muted)';
}

// Human-readable "in ~X" countdown from free space and daily write rate
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

function getIntervalLabel(iv: Interval): string {
  switch (iv) {
    case '1h': return 'letzte 1h';
    case '6h': return 'letzte 6h';
    case '1d': return 'letzte 24h';
    case '7d': return 'letzte 7d';
    case '1m': return 'letzter 1M';
    case '1y': return 'letztes 1Y';
    default: return 'letzte 24h';
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

const WIDGET_LABELS: Record<string, string> = {
  'live-gauges':     'Live I/O Gauges',
  'io-chart':        'Historical I/O Chart',
  'storage-history': 'Storage Space History',
  'smart-health':    'SMART / Disk Health',
};

export default function Performance({ stats, liveMetrics, serverTimeOffsetMs = 0 }: PerformanceProps) {
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

  // Fill predictions — loaded on mount (longest window) and on interval change
  const [fillPredictions, setFillPredictions] = useState<any[]>([]);
  const [fillWindowLabel, setFillWindowLabel] = useState('');
  const [loadingFill, setLoadingFill]         = useState(false);
  // Keep last computed predictions to show in live mode
  const lastFillRef = useRef<{ predictions: any[]; windowLabel: string }>({ predictions: [], windowLabel: '' });

  const liveStats = stats;
  const livePoint = liveStats.length > 0 ? liveStats[liveStats.length - 1] : null;

  const chartData = historyData;
  const secPerPt  = SECONDS_PER_POINT[interval];

  // Live timestamps based on server time
  const liveDataWithTimestamps = useMemo(() => {
    const now = Date.now() + serverTimeOffsetMs;
    const n   = liveStats.length;
    return liveStats.map((s: any, i: number) => {
      const msAgo = (n - 1 - i) * 5000;
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

  // Smooth live data with 3-point rolling average
  const smoothedLiveData = useMemo(() =>
    rollingAverage(liveDataWithTimestamps, ['read', 'write', 'iops'], 3),
    [liveDataWithTimestamps]
  );

  const ioDisplayData = useMemo(() => {
    if (!liveMode) return chartData;
    return smoothedLiveData;
  }, [liveMode, chartData, smoothedLiveData]);

  // Fetch chart history when interval changes (and not in live mode); poll every 10s
  useEffect(() => {
    if (liveMode) return;
    setHistoryData([]);
    setLoadingHistory(true);
    const apiInterval = INTERVALS.find(i => i.key === interval)?.api ?? interval;
    const fetch = () =>
      api.getMetricsHistory(apiInterval)
        .then(res => setHistoryData(transformHistory(res.metrics, interval)))
        .catch(() => setHistoryData([]))
        .finally(() => setLoadingHistory(false));
    fetch();
    const id = setInterval(fetch, 10_000);
    return () => clearInterval(id);
  }, [interval, liveMode]);

  // Fetch fill predictions — on mount use auto (longest window), on interval change use that window
  const fetchFillPredictions = useCallback(async (windowParam: string) => {
    setLoadingFill(true);
    try {
      const res = await api.getFillPrediction(windowParam);
      if (res.predictions.length > 0) {
        setFillPredictions(res.predictions);
        setFillWindowLabel(res.window_used ?? '');
        lastFillRef.current = { predictions: res.predictions, windowLabel: res.window_used ?? '' };
      } else if (lastFillRef.current.predictions.length > 0) {
        // Keep previous data if no result
        setFillPredictions(lastFillRef.current.predictions);
        setFillWindowLabel(lastFillRef.current.windowLabel);
      }
    } catch {
      if (lastFillRef.current.predictions.length > 0) {
        setFillPredictions(lastFillRef.current.predictions);
        setFillWindowLabel(lastFillRef.current.windowLabel);
      }
    } finally {
      setLoadingFill(false);
    }
  }, []);

  // Load on mount with auto window
  useEffect(() => {
    fetchFillPredictions('auto');
  }, []);

  // Re-fetch when interval changes (unless in live mode)
  useEffect(() => {
    if (liveMode) return;
    const w = INTERVAL_TO_WINDOW[interval];
    fetchFillPredictions(w);
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

  // Stats from chart data
  const dispAvgR   = chartData.length ? chartData.reduce((s, d) => s + (d.read  || 0), 0) / chartData.length : 0;
  const dispAvgW   = chartData.length ? chartData.reduce((s, d) => s + (d.write || 0), 0) / chartData.length : 0;
  const dispTotalR = chartData.reduce((s, d) => s + (d.read  || 0) * secPerPt / 1024, 0);
  const dispTotalW = chartData.reduce((s, d) => s + (d.write || 0) * secPerPt / 1024, 0);

  const displayData   = liveMode ? smoothedLiveData : chartData;
  const displaySecPt  = liveMode ? 5 : secPerPt;
  const dispLiveAvgR  = displayData.length ? displayData.reduce((s, d) => s + (d.read  || 0), 0) / displayData.length : 0;
  const dispLiveAvgW  = displayData.length ? displayData.reduce((s, d) => s + (d.write || 0), 0) / displayData.length : 0;
  const dispLiveTotalR = displayData.reduce((s, d) => s + (d.read  || 0) * displaySecPt / 1024, 0);
  const dispLiveTotalW = displayData.reduce((s, d) => s + (d.write || 0) * displaySecPt / 1024, 0);

  // Compute scales for charts
  const ioMaxMB = ioDisplayData.reduce((m, d) => Math.max(m, d.read || 0, d.write || 0), 0.01);
  const bwScale = getBwScale(ioMaxMB);
  const storageMaxGB = chartData.reduce((m, d) => Math.max(m, d.alloc || 0, d.free || 0), 0.01);
  const gbScale = getGbScale(storageMaxGB);

  // Live values: use last smoothed live point to match chart in live mode
  const lastLivePoint = smoothedLiveData.length > 0 ? smoothedLiveData[smoothedLiveData.length - 1] : null;
  const ioReadBw  = liveMode && lastLivePoint ? lastLivePoint.read  : (liveMetrics?.read_bw_mb  ?? livePoint?.read  ?? 0);
  const ioWriteBw = liveMode && lastLivePoint ? lastLivePoint.write : (liveMetrics?.write_bw_mb ?? livePoint?.write ?? 0);
  const ioReadIops  = liveMetrics?.read_iops  ?? livePoint?.readIops  ?? 0;
  const ioWriteIops = liveMetrics?.write_iops ?? livePoint?.writeIops ?? 0;

  // Peak from session data
  const livePeakR = liveStats.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const livePeakW = liveStats.reduce((m, d) => Math.max(m, d.write || 0), 0);

  // DB totals: backend returns cumulative MB counters, convert to GB
  const totalReadGB  = (liveMetrics?.total_read_mb  ?? 0) / 1024;
  const totalWriteGB = (liveMetrics?.total_write_mb ?? 0) / 1024;

  // XAxis config
  const liveXAxisProps = {
    dataKey: 'tsMs' as const,
    type: 'number' as const,
    domain: ['dataMin', 'dataMax'] as [string, string],
    tickFormatter: (v: number) => new Date(v).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    tickCount: 10,
    axisLine: false, tickLine: false, tick: AXIS_TICK,
  };
  const histXAxisProps = {
    dataKey: 'timestamp' as const,
    axisLine: false, tickLine: false, tick: AXIS_TICK, minTickGap: 40,
  };

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
        // Format DB totals
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
            <SectionHeader label="Live I/O" badge="1 s" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
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
                label="Total ↑ Read"
                value={totalRead.value}
                unit={totalRead.unit}
                color={C.read}
                sub="all time"
              />
              <GaugeCard
                label="Total ↓ Write"
                value={totalWrite.value}
                unit={totalWrite.unit}
                color={C.write}
                sub="all time"
              />
            </div>
          </div>
        );
      }

      case 'io-chart':
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
                <div style={{ height: 240, marginLeft: 8, overflow: 'visible' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ioDisplayData} margin={CHART_MARGIN}>
                      <defs>
                        <linearGradient id="gRead" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.read} stopOpacity={0.15}/><stop offset="95%" stopColor={C.read} stopOpacity={0}/></linearGradient>
                        <linearGradient id="gWrite" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.write} stopOpacity={0.15}/><stop offset="95%" stopColor={C.write} stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis {...(liveMode ? liveXAxisProps : histXAxisProps)} />
                      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={bwScale.fmt} width={85} />
                      <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v, pts) => pts?.[0]?.payload?.hhmmss ?? v} formatter={(v: number) => [fmtBw(v), '']} />
                      {vis('read') && <Area type="monotone" dataKey="read" stroke={C.read} fill="url(#gRead)" strokeWidth={2} isAnimationActive={!liveMode} animationDuration={600} />}
                      {vis('write') && <Area type="monotone" dataKey="write" stroke={C.write} fill="url(#gWrite)" strokeWidth={2} isAnimationActive={!liveMode} animationDuration={600} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Stats below chart */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  {[
                    { label: 'Avg Read',   value: fmtBw(liveMode ? dispLiveAvgR  : dispAvgR)  },
                    { label: 'Avg Write',  value: fmtBw(liveMode ? dispLiveAvgW  : dispAvgW)  },
                    { label: 'Total Read',  value: fmtGB(liveMode ? dispLiveTotalR : dispTotalR) },
                    { label: 'Total Write', value: fmtGB(liveMode ? dispLiveTotalW : dispTotalW) },
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

      case 'storage-history': {
        const firstAlloc = chartData.length > 0 ? (chartData[0].alloc || 0) : 0;
        const lastAlloc = chartData.length > 0 ? (chartData[chartData.length - 1].alloc || 0) : 0;
        const diffGb = lastAlloc - firstAlloc;
        const timeSec = chartData.length * secPerPt;
        const rateStr = fmtGrowthRate(diffGb, timeSec);
        const rateLabel = getIntervalLabel(interval);

        return (
          <Panel
            title="Pool Capacity"
            sub={`Allocation trends · Ø ${rateStr} (${rateLabel})`}
            right={
              <div style={{ display: 'flex', gap: 6 }}>
                <Toggle color={C.alloc} label="Used" active={vis('alloc')} onClick={() => toggle('alloc')} />
                <Toggle color={C.free}  label="Free" active={vis('free')}  onClick={() => toggle('free')}  />
              </div>
            }
          >
            <div style={{ height: 240 }}>
              {loadingHistory ? <Skeleton height={240} /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis {...histXAxisProps} />
                    <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={gbScale.fmt} width={85} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtGB(v), '']} />
                    {vis('alloc') && <Area type="stepAfter" dataKey="alloc" stroke={C.alloc} fill={C.alloc + '10'} strokeWidth={2} />}
                    {vis('free')  && <Area type="stepAfter" dataKey="free"  stroke={C.free}  fill={C.free  + '10'} strokeWidth={2} />}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Fill predictions integrated below chart */}
            {fillPredictions.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {fillPredictions.map((p, i) => {
                    const totalGB = (p.alloc_gb ?? 0) + (p.free_gb ?? 0);
                    const usedPct = totalGB > 0 ? Math.min(100, (p.alloc_gb / totalGB) * 100) : 0;
                    const capColor = usedPct > 90 ? 'var(--danger)' : usedPct > 80 ? 'var(--warning)' : 'var(--accent)';
                    const lineColor = colorVar(p.color);
                    return (
                      <div key={i} style={{ paddingBottom: i < fillPredictions.length - 1 ? 12 : 0, borderBottom: i < fillPredictions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                        {/* Pool name */}
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                          {p.pool}
                        </div>
                        {/* Storage bar */}
                        {totalGB > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden', marginBottom: 4 }}>
                              <div style={{ height: '100%', width: `${usedPct}%`, background: capColor, borderRadius: 9999 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              <span>{fmtGB(p.alloc_gb)} used</span>
                              <span>{fmtGB(p.free_gb)} free of {fmtGB(totalGB)}</span>
                            </div>
                          </div>
                        )}
                        {/* Line 1: fill date */}
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: lineColor }}>
                          {p.fill_date === '–' ? '–' : `Full on ${p.fill_date}`}
                        </div>
                        {/* Line 2: time until full — same color, no fallback window note */}
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: lineColor, marginTop: 2 }}>
                          {fmtTimeRemaining(p.free_gb, p.rate_gb_day)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!loadingFill && fillPredictions.length === 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data available</p>
              </div>
            )}
          </Panel>
        );
      }

      case 'smart-health':
        return (
          <Panel title="Disk SMART Status" sub="Physical health summary">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {smartData.length === 0 ? (
                [1, 2, 3].map(i => <Skeleton key={i} height={80} />)
              ) : smartData.map((d, i) => {
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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>System Performance</h1>
        <div style={{ display: 'flex', gap: 8 }}>
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
  );
}
