import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line,
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
const MAX_TICKS = 6;

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
  if (maxMB >= 1000) return { unit: 'GB/s', fmt: v => (v / 1000).toFixed(1) };
  if (maxMB >= 1)    return { unit: 'MB/s', fmt: v => v.toFixed(0) };
  return { unit: 'KB/s', fmt: v => (v * 1024).toFixed(0) };
}

function getGbScale(maxGB: number): { unit: string; fmt: (v: number) => string } {
  if (maxGB >= 1000) return { unit: 'TB', fmt: v => (v / 1000).toFixed(1) };
  return { unit: 'GB', fmt: v => v.toFixed(0) };
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

function fmtTotalMB(mb: number): { value: string; unit: string } {
  if (mb >= 1024 * 1024) return { value: (mb / 1024 / 1024).toFixed(2), unit: 'TB' };
  if (mb >= 1024)        return { value: (mb / 1024).toFixed(2), unit: 'GB' };
  if (mb >= 1)           return { value: mb.toFixed(1), unit: 'MB' };
  return { value: (mb * 1024).toFixed(0), unit: 'KB' };
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

function computeFillDate(dailyGB: number, freeGB: number): { text: string; color: string } {
  if (dailyGB < 0.001 || freeGB <= 0) return { text: '–', color: 'var(--text-muted)' };
  const days = freeGB / dailyGB;
  if (days > 730) return { text: '–', color: 'var(--text-muted)' };
  const fillDate = new Date();
  fillDate.setDate(fillDate.getDate() + Math.round(days));
  const dd   = String(fillDate.getDate()).padStart(2, '0');
  const mm   = String(fillDate.getMonth() + 1).padStart(2, '0');
  const yyyy = fillDate.getFullYear();
  const dateStr = `${dd}.${mm}.${yyyy}`;
  if (days < 14) return { text: dateStr, color: 'var(--danger)' };
  if (days < 90) return { text: dateStr, color: 'var(--warning)' };
  return { text: dateStr, color: 'var(--text-secondary)' };
}

function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="skeleton" style={{ height, borderRadius: 'var(--radius-lg)' }} />;
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

  const [storagePredictions, setStoragePredictions] = useState<any[]>([]);
  const [storageInsufficient, setStorageInsufficient] = useState(false);
  const [storageFallbackLabel, setStorageFallbackLabel] = useState('');
  const [loadingStoragePred, setLoadingStoragePred] = useState(false);

  const liveStats = stats;
  const livePoint = liveStats.length > 0 ? liveStats[liveStats.length - 1] : null;

  // IO values from 1s liveMetrics (backend reads Redis at 1s)
  const ioReadBw    = liveMetrics?.read_bw_mb  ?? livePoint?.read      ?? 0;
  const ioWriteBw   = liveMetrics?.write_bw_mb ?? livePoint?.write     ?? 0;
  const ioReadIops  = liveMetrics?.read_iops   ?? livePoint?.readIops  ?? 0;
  const ioWriteIops = liveMetrics?.write_iops  ?? livePoint?.writeIops ?? 0;

  const chartData = historyData;
  const secPerPt  = SECONDS_PER_POINT[interval];

  // Fix #1 — live timestamps based on server time
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

  // Fix #4 — smooth live data with 3-point rolling average
  const smoothedLiveData = useMemo(() =>
    rollingAverage(liveDataWithTimestamps, ['read', 'write', 'iops'], 3),
    [liveDataWithTimestamps]
  );

  const ioDisplayData = useMemo(() => {
    if (!liveMode) return chartData;
    return smoothedLiveData;
  }, [liveMode, chartData, smoothedLiveData]);

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

  // Storage predictions tied to main chart interval (fix new#6)
  useEffect(() => {
    setLoadingStoragePred(true);
    setStorageInsufficient(false);
    setStorageFallbackLabel('');

    const cfg = INTERVAL_TO_HISTORY[interval];
    if (!cfg) { setLoadingStoragePred(false); return; }

    async function fetchForInterval(iv: Interval): Promise<any[]> {
      const c = INTERVAL_TO_HISTORY[iv];
      if (!c) return [];
      const res = await api.getMetricsHistory(c.api);
      let metrics: any[] = res.metrics || [];
      if (c.hoursBack) {
        const cutoff = Date.now() - c.hoursBack * 3600 * 1000;
        metrics = metrics.filter(m => new Date(m.collected_at).getTime() >= cutoff);
      }
      return metrics;
    }

    function buildPredictions(metrics: any[], windowLabel: string): any[] {
      const poolMap = new Map<string, { writes: number[]; latestFreeGb: number }>();
      for (const m of metrics) {
        const name = m.pool_name || 'default';
        if (!poolMap.has(name)) poolMap.set(name, { writes: [], latestFreeGb: 0 });
        const p = poolMap.get(name)!;
        p.writes.push(m.write_bw_mb || 0);
        if (m.free_gb > 0) p.latestFreeGb = m.free_gb;
      }
      const result: any[] = [];
      for (const [name, data] of poolMap) {
        if (data.writes.length < 2) continue;
        const avgWrite = data.writes.reduce((a, b) => a + b, 0) / data.writes.length;
        const dailyGB  = avgWrite * 86400 / 1024;
        const { text, color } = computeFillDate(dailyGB, data.latestFreeGb);
        const rateStr = dailyGB < 0.001 ? '0' : dailyGB < 1 ? dailyGB.toFixed(2) : dailyGB.toFixed(1);
        result.push({ pool: name, text, color, rate: rateStr, windowLabel, points: data.writes.length });
      }
      return result;
    }

    (async () => {
      try {
        const metrics = await fetchForInterval(interval);
        const intervalLabel = INTERVALS.find(i => i.key === interval)?.label ?? interval;
        const preds = buildPredictions(metrics, intervalLabel);

        if (preds.length > 0) {
          setStoragePredictions(preds);
        } else {
          setStorageInsufficient(true);
          const fallbackOrder: Interval[] = (['1y', '1m', '7d', '1d', '6h', '1h'] as Interval[]).filter(k => k !== interval);
          let found = false;
          for (const fb of fallbackOrder) {
            try {
              const fbMetrics = await fetchForInterval(fb);
              const fbLabel = INTERVALS.find(i => i.key === fb)?.label ?? fb;
              const fbPreds = buildPredictions(fbMetrics, fbLabel);
              if (fbPreds.length > 0) {
                setStoragePredictions(fbPreds);
                setStorageFallbackLabel(fbLabel);
                found = true;
                break;
              }
            } catch { /* continue */ }
          }
          if (!found) setStoragePredictions([]);
        }
      } catch {
        setStoragePredictions([]);
      } finally {
        setLoadingStoragePred(false);
      }
    })();
  }, [interval]);

  const toggle = useCallback((key: string) => {
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const vis = (key: string) => !hidden.has(key);

  // Stats from chart data
  const dispAvgR   = chartData.length ? chartData.reduce((s, d) => s + (d.read  || 0), 0) / chartData.length : 0;
  const dispAvgW   = chartData.length ? chartData.reduce((s, d) => s + (d.write || 0), 0) / chartData.length : 0;
  const dispPeakR  = chartData.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const dispPeakW  = chartData.reduce((m, d) => Math.max(m, d.write || 0), 0);
  const dispTotalR = chartData.reduce((s, d) => s + (d.read  || 0) * secPerPt / 1024, 0);
  const dispTotalW = chartData.reduce((s, d) => s + (d.write || 0) * secPerPt / 1024, 0);

  const livePeakR = liveStats.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const livePeakW = liveStats.reduce((m, d) => Math.max(m, d.write || 0), 0);

  const displayData  = liveMode ? smoothedLiveData : chartData;
  const displaySecPt = liveMode ? 5 : secPerPt;
  const dispLiveAvgR  = displayData.length ? displayData.reduce((s, d) => s + (d.read  || 0), 0) / displayData.length : 0;
  const dispLiveAvgW  = displayData.length ? displayData.reduce((s, d) => s + (d.write || 0), 0) / displayData.length : 0;
  const dispLivePeakR = displayData.reduce((m, d) => Math.max(m, d.read  || 0), 0);
  const dispLivePeakW = displayData.reduce((m, d) => Math.max(m, d.write || 0), 0);
  const dispLiveTotalR = displayData.reduce((s, d) => s + (d.read  || 0) * displaySecPt / 1024, 0);
  const dispLiveTotalW = displayData.reduce((s, d) => s + (d.write || 0) * displaySecPt / 1024, 0);

  // Fix #3 — compute scales for charts
  const ioMaxMB = ioDisplayData.reduce((m, d) => Math.max(m, d.read || 0, d.write || 0), 0.01);
  const bwScale = getBwScale(ioMaxMB);
  const storageMaxGB = chartData.reduce((m, d) => Math.max(m, d.alloc || 0, d.free || 0), 0.01);
  const gbScale = getGbScale(storageMaxGB);

  // Fix #1 — XAxis config for live mode (numeric ms timestamps)
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
        const totalRead  = fmtTotalMB(liveMetrics?.total_read_mb  ?? 0);
        const totalWrite = fmtTotalMB(liveMetrics?.total_write_mb ?? 0);
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
                sub="since reset"
              />
              <GaugeCard
                label="Total ↓ Write"
                value={totalWrite.value}
                unit={totalWrite.unit}
                color={C.write}
                sub="since reset"
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
                      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} unit={bwScale.unit} tickFormatter={bwScale.fmt} width={40} />
                      <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v, pts) => pts?.[0]?.payload?.hhmmss ?? v} formatter={(v: number) => [fmtBw(v), '']} />
                      {vis('read') && <Area type="monotone" dataKey="read" stroke={C.read} fill="url(#gRead)" strokeWidth={2} isAnimationActive={!liveMode} animationDuration={600} />}
                      {vis('write') && <Area type="monotone" dataKey="write" stroke={C.write} fill="url(#gWrite)" strokeWidth={2} isAnimationActive={!liveMode} animationDuration={600} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Stats below chart */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  {[
                    { label: 'Avg Read',  value: fmtBw(liveMode ? dispLiveAvgR : dispAvgR) },
                    { label: 'Avg Write', value: fmtBw(liveMode ? dispLiveAvgW : dispAvgW) },
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

      case 'storage-history':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Panel
              title="Pool Capacity"
              sub="Allocation trends"
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
                      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} unit={gbScale.unit} tickFormatter={gbScale.fmt} width={40} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmtGB(v), '']} />
                      {vis('alloc') && <Area type="stepAfter" dataKey="alloc" stroke={C.alloc} fill={C.alloc + '10'} strokeWidth={2} />}
                      {vis('free')  && <Area type="stepAfter" dataKey="free"  stroke={C.free}  fill={C.free  + '10'} strokeWidth={2} />}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel title="Depletion Prediction" sub={storageFallbackLabel ? `Based on ${storageFallbackLabel} data` : `Based on ${interval} window`}>
              {loadingStoragePred ? <Skeleton height={240} /> : storagePredictions.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not enough historical write data to calculate.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {storagePredictions.map((p, i) => (
                    <div key={i} style={{ paddingBottom: 16, borderBottom: i < storagePredictions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{p.pool}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Est. Fill Date</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: p.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                        {p.text}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        Avg. write rate: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{p.rate} GB/day</span>
                      </div>
                    </div>
                  ))}
                  {storageInsufficient && !storageFallbackLabel && (
                    <p style={{ fontSize: 10, color: 'var(--warning)', opacity: 0.8, marginTop: 8 }}>
                      Warning: Prediction based on limited data points.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </div>
        );

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
          <div
            key={w.id}
            onDragOver={e => { e.preventDefault(); handleDragOver(w.id); }}
            onDrop={() => handleDrop(w.id)}
            className={`widget-shell ${dragOver === w.id ? 'drag-over' : ''}`}
          >
            <WidgetShell
              id={w.id}
              label={WIDGET_LABELS[w.id]}
              editMode={editMode}
              onDragStart={() => handleDragStart(w.id)}
              onRemove={() => handleRemove(w.id)}
            >
              {renderWidget(w.id)}
            </WidgetShell>
          </div>
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
