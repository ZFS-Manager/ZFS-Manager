import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  HardDrive, ShieldCheck, Layers, Activity,
  Camera, TrendingUp, AlertTriangle, Database,
  ArrowUp, ArrowDown, Edit2, Check, Plus,
} from 'lucide-react';
import { ZFSPool, ZFSDataset, ZFSLog } from '../types';
import { formatBytes, api } from '../api';
import { useLayout } from '../hooks/useLayout';
import WidgetShell from './WidgetShell';

interface DashboardProps {
  pools: ZFSPool[];
  datasets: ZFSDataset[];
  snapshots: any[];
  totalCapacity: number;
  totalUsedStorage: number;
  totalRawCapacity?: number;
  totalRawUsed?: number;
  currentStats: { read: number; write: number; iops: number; readIops?: number; writeIops?: number; cpu?: number; arcHit?: number };
  systemStats?: any;
  logs?: ZFSLog[];
  loading?: boolean;
  historicalStats?: any[];
}

/* ── Animated counter ── */
function useCounter(target: number, duration = 600) {
  const [val, setVal]    = useState(0);
  const rafRef           = useRef<number>(0);
  const startRef         = useRef<number>(0);
  const fromRef          = useRef<number>(0);
  useEffect(() => {
    fromRef.current  = val;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const t    = Math.min((now - startRef.current) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(fromRef.current + (target - fromRef.current) * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return val;
}

function fmtDays(d: number): string {
  if (d < 14)  return `~${Math.round(d)} days`;
  if (d < 90)  return `~${Math.round(d / 7)} weeks`;
  if (d < 730) return `~${Math.round(d / 30)} months`;
  return `~${(d / 365).toFixed(1)} yrs`;
}

function fmtTimeUntilFull(days: number): string {
  if (!days || !isFinite(days) || days <= 0) return '–';
  if (days < 14)  return `in ~${Math.round(days)} days`;
  if (days < 90)  return `in ~${Math.round(days / 7)} weeks`;
  if (days < 730) return `in ~${Math.round(days / 30)} months`;
  return `in ~${Math.round(days / 365)} years`;
}

function fmtUsableSpace(bytes: number): string {
  if (!bytes) return '—';
  const tb = bytes / (1024 ** 4);
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

function colorVar(c: string): string {
  if (c === 'danger')    return 'var(--danger)';
  if (c === 'warning')   return 'var(--warning)';
  if (c === 'secondary') return 'var(--text-secondary)';
  return 'var(--text-muted)';
}

// Fill prediction from the shared backend endpoint (longest window auto-selected)
function useFillPrediction() {
  const [prediction, setPrediction] = React.useState<{
    text: string; color: string; timeText: string;
  } | null>(null);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api.getFillPrediction('auto').then(res => {
      if (res.predictions.length > 0) {
        // Find the pool that will fill up soonest
        const earliest = res.predictions.reduce((min, pred) => {
          if (pred.fill_date === '–') return min;
          if (!min || pred.fill_date < min.fill_date) return pred;
          return min;
        }, null as any);
        if (earliest) {
          const rate = parseFloat(earliest.rate_gb_day);
          const days = rate > 0 ? earliest.free_gb / rate : 0;
          setPrediction({
            text: `Full on ${earliest.fill_date}`,
            color: colorVar(earliest.color),
            timeText: fmtTimeUntilFull(days),
          });
        } else {
          setPrediction({ text: '–', color: 'var(--text-muted)', timeText: '' });
        }
      } else {
        setPrediction({ text: '–', color: 'var(--text-muted)', timeText: '' });
      }
    }).catch(() => {
      setPrediction({ text: '–', color: 'var(--text-muted)', timeText: '' });
    });
  }, []);

  return prediction;
}

/* ── Chart config ── */
const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#18181b', border: '1px solid #3f3f46',
    borderRadius: 6, padding: '6px 10px',
    fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
  },
  labelStyle: { color: '#71717a', fontSize: 10 },
};
const AXIS_TICK   = { fill: '#52525b', fontSize: 10 };
const GRID_PROPS  = { strokeDasharray: '1 6' as const, stroke: 'rgba(255,255,255,0.04)', vertical: false };
const CHART_MARGIN = { top: 24, right: 8, left: 16, bottom: 8 };
const MAX_TICKS    = 6;

/* ── Capacity warning banner ── */
function CapacityBanner({ pool, daysUntilFull }: { pool: ZFSPool; daysUntilFull: number | null }) {
  const pct      = pool.cap;
  const isCrit   = pct >= 95;
  const isDanger = pct >= 90;
  const color    = isCrit || isDanger ? 'var(--danger)' : 'var(--warning)';
  const bg       = isCrit || isDanger ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)';
  const border   = isCrit || isDanger ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)';
  const daysStr  = daysUntilFull !== null && daysUntilFull < 365
    ? ` · ${fmtDays(daysUntilFull)} at current rate` : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 8, background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius)' }}>
      <AlertTriangle size={14} style={{ color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color, fontFamily: 'var(--font-ui)', fontWeight: 500, flex: 1 }}>
        {isCrit
          ? `CRITICAL: Pool "${pool.name}" at ${pct}% — ZFS may become read-only.${daysStr}`
          : isDanger
          ? `Pool "${pool.name}" at ${pct}% — ZFS performance degrades above 80%${daysStr}`
          : `Pool "${pool.name}" is at ${pct}% — consider freeing space${daysStr}`}
      </span>
      <a
        href="/pools"
        onClick={e => { e.preventDefault(); window.location.href = '/pools'; }}
        style={{ fontSize: 11, color, fontFamily: 'var(--font-ui)', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'underline', opacity: 0.8 }}
      >
        Manage Pool →
      </a>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, opacity: 0.6 }}>
        {pool.alloc} / {pool.size}
      </span>
    </div>
  );
}

/* ── Stat card ── */
function StatCard({ label, value, sub, fillLine, icon: Icon, color, minHeight = 130 }: {
  label: string; value: string; sub?: string;
  fillLine?: { text: string; color: string; timeText?: string };
  icon: any; color?: string; minHeight?: number;
}) {
  const c = color || 'var(--accent)';
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', minHeight, position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 28, height: 28,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 25%, transparent)`,
        borderRadius: 'var(--radius)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} color={c} strokeWidth={1.75} />
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
        height: '100%', padding: '0 20px',
      }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {label}
        </span>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em', margin: 0, marginTop: 4 }}>
          {value}
        </div>
        {fillLine && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: fillLine.color, marginTop: 3, fontWeight: 500 }}>
              {fillLine.text}
            </div>
            {fillLine.timeText && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: fillLine.color, marginTop: 2 }}>
                {fillLine.timeText}
              </div>
            )}
          </>
        )}
        {sub && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: fillLine ? 2 : 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Pool card ── */
function PoolCard({ pool, daysUntilFull }: { pool: ZFSPool; daysUntilFull: number | null }) {
  const animCap  = useCounter(pool.cap);
  const isOnline = pool.health === 'ONLINE';
  const capColor = pool.cap > 90 ? 'var(--danger)' : pool.cap > 80 ? 'var(--warning)' : 'var(--success)';

  const [scrubState,  setScrubState]  = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [showSnap,    setShowSnap]    = useState(false);
  const [snapName,    setSnapName]    = useState('');
  const [snapError,   setSnapError]   = useState('');
  const [snapWorking, setSnapWorking] = useState(false);
  const [cardToast,   setCardToast]   = useState('');
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const popRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getScrubStatus(pool.name).then(res => {
      if (res.in_progress) { setScrubState('running'); startPoll(); }
    }).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pool.name]);

  useEffect(() => {
    if (!showSnap) return;
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowSnap(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showSnap]);

  const startPoll = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getScrubStatus(pool.name);
        if (!res.in_progress) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setScrubState('success');
          setTimeout(() => setScrubState('idle'), 4000);
        }
      } catch {
        clearInterval(pollRef.current!); pollRef.current = null;
        setScrubState('idle');
      }
    }, 2000);
  };

  const handleScrub = async () => {
    if (scrubState === 'running') return;
    if (!window.confirm(`Start ZFS scrub on pool "${pool.name}"? This may impact performance.`)) return;
    setScrubState('running');
    try {
      await api.startScrub(pool.name);
      startPoll();
    } catch {
      setScrubState('error');
      setTimeout(() => setScrubState('idle'), 3000);
    }
  };

  const openSnapshot = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setSnapName(`${pool.name}@${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`);
    setSnapError(''); setShowSnap(true);
  };

  const handleCreateSnapshot = async () => {
    setSnapWorking(true); setSnapError('');
    try {
      await api.createSnapshot(snapName);
      setCardToast('Snapshot created'); setShowSnap(false);
      setTimeout(() => setCardToast(''), 3000);
    } catch (err: any) {
      setSnapError(err.message || 'Failed to create snapshot');
    } finally { setSnapWorking(false); }
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${isOnline ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 'var(--radius-lg)', padding: '20px 22px', position: 'relative',
    }}>
      {cardToast && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--success-dim)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius)', padding: '5px 12px',
          fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--success)',
          whiteSpace: 'nowrap', zIndex: 10,
        }}>
          {cardToast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            {pool.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 2 }}>
            {(pool as any).dedup || '1.00x'} dedup · {(pool as any).frag ?? 0}% frag
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 9px', borderRadius: 9999,
          border: `1px solid ${isOnline ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.25)'}`,
          background: isOnline ? 'var(--success-dim)' : 'var(--danger-dim)',
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          color: isOnline ? 'var(--success)' : 'var(--danger)',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isOnline ? 'var(--success)' : 'var(--danger)', display: 'inline-block' }} />
          {pool.health}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>Storage usage</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: capColor, fontWeight: 600 }}>
            {animCap.toFixed(0)}%
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.min(pool.cap, 100)}%`, background: capColor }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{pool.alloc} used</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{pool.free} free of {pool.size}</span>
        </div>
      </div>

      {/* Time-until-full prediction */}
      {daysUntilFull !== null && (
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-ui)', marginBottom: 14,
          color: daysUntilFull < 14 ? 'var(--danger)' : daysUntilFull < 30 ? 'var(--warning)' : 'var(--text-muted)',
        }}>
          Full in <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtDays(daysUntilFull)}</span> at current write rate
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 14, borderTop: '1px solid var(--border)', position: 'relative' }}>
        {/* Scrub button */}
        <button
          className="btn btn-secondary"
          style={{ height: 26, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, opacity: scrubState === 'running' ? 0.65 : 1 }}
          onClick={handleScrub}
          disabled={scrubState === 'running'}
        >
          {scrubState === 'running' && (
            <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.2)', borderTopColor: 'currentColor', animation: 'spin 0.7s linear infinite' }} />
          )}
          {scrubState === 'running' ? 'Scrubbing…' : scrubState === 'success' ? 'Done ✓' : 'Scrub'}
        </button>

        {/* Snapshot button + popover */}
        <div style={{ position: 'relative' }} ref={popRef}>
          <button
            className="btn btn-secondary"
            style={{ height: 26, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={openSnapshot}
          >
            <Camera size={11} /> Snapshot
          </button>
          {showSnap && (
            <div style={{
              position: 'absolute', bottom: 32, right: 0, zIndex: 20,
              width: 260,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                New Snapshot
              </div>
              <input
                value={snapName}
                onChange={e => setSnapName(e.target.value)}
                autoFocus
                style={{
                  width: '100%', height: 32, padding: '0 10px',
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
                  boxSizing: 'border-box', marginBottom: snapError ? 6 : 12,
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSnapshot(); if (e.key === 'Escape') setShowSnap(false); }}
              />
              {snapError && (
                <div style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>{snapError}</div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, height: 28, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleCreateSnapshot}
                  disabled={snapWorking || !snapName.trim()}
                >
                  {snapWorking && <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />}
                  {snapWorking ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => setShowSnap(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', padding: '0 4px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Log row ── */
function LogRow({ log }: { log: ZFSLog }) {
  const cfg = {
    error:   { label: 'ERR', color: 'var(--danger)',  bg: 'var(--danger-dim)',  border: 'rgba(239,68,68,0.22)'  },
    warning: { label: 'WRN', color: 'var(--warning)', bg: 'var(--warning-dim)', border: 'rgba(245,158,11,0.22)' },
    info:    { label: 'INF', color: 'var(--info)',    bg: 'var(--info-dim)',    border: 'rgba(56,189,248,0.18)' },
  }[log.level] || { label: 'LOG', color: 'var(--text-muted)', bg: 'transparent', border: 'var(--border)' };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{
        flexShrink: 0, marginTop: 1, width: 36, height: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 3,
        fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
        color: cfg.color, letterSpacing: '0.04em',
      }}>
        {cfg.label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {log.message}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          {log.timestamp}
          {log.pool && <span style={{ marginLeft: 8, color: 'var(--accent)', opacity: 0.7 }}>{log.pool}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Panel wrapper ── */
function Panel({ title, sub, right, children, style }: {
  title?: string; sub?: string; right?: React.ReactNode;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
            {sub && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Skeleton ── */
function Skeleton({ height = 120 }: { height?: number }) {
  return <div className="skeleton" style={{ height, borderRadius: 'var(--radius-lg)' }} />;
}

/* ── Widget tray ── */
function WidgetTray({ allWidgets, onAdd }: { allWidgets: Array<{ id: string; label: string; visible: boolean }>; onAdd: (id: string) => void }) {
  const hidden = allWidgets.filter(w => !w.visible);
  return (
    <div style={{ position: 'fixed', right: 24, top: 100, width: 220, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: hidden.length ? 12 : 16, zIndex: 50, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
      {hidden.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>All widgets visible</div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Hidden widgets
          </div>
          {hidden.map(w => (
            <button key={w.id} onClick={() => onAdd(w.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', marginBottom: 4,
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 12, transition: 'all 0.12s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <Plus size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {w.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Widget label map ── */
const WIDGET_LABELS: Record<string, string> = {
  'stats-row':        'Stats Row',
  'io-activity':      'I/O Activity',
  'pool-cards':       'Pool Cards',
  'system-resources': 'System Resources',
  'activity-log':     'Activity Log',
};

/* ── Main Dashboard ── */
export default function Dashboard({
  pools, datasets, snapshots,
  totalCapacity, totalUsedStorage, totalRawCapacity = 0, totalRawUsed = 0,
  currentStats, systemStats, logs = [], loading,
  historicalStats = [],
}: DashboardProps) {
  const { widgets, loaded, setVisible, reorder, toast } = useLayout('dashboard');
  const [editMode, setEditMode] = useState(false);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [histData1d, setHistData1d] = useState<any[]>([]);
  const [histData7d, setHistData7d] = useState<any[]>([]);
  const [scrubLive,  setScrubLive]  = useState<Record<string, {inProgress: boolean; progress: number; timeRemaining: string}>>({});
  const [ioShowRead,  setIoShowRead]  = useState(true);
  const [ioShowWrite, setIoShowWrite] = useState(true);

  const usagePct = totalCapacity > 0 ? (totalUsedStorage / totalCapacity) * 100 : 0;
  const animPct  = useCounter(usagePct);
  const cpuLoad  = systemStats?.cpu_load?.[0] ?? currentStats.cpu ?? 0;
  const cpuPct   = typeof cpuLoad === 'number' && cpuLoad <= 1 ? cpuLoad * 100 : cpuLoad;
  const arcHit   = systemStats?.arc_hit_ratio ?? currentStats.arcHit ?? 0;
  const memTotal = systemStats?.memory?.total ?? 0;
  const memUsed  = systemStats?.memory?.used ?? 0;
  const memPct   = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const uptime   = systemStats?.uptime ?? '—';
  const allOnline = pools.length > 0 && pools.every(p => p.health === 'ONLINE');
  const freeBytes = totalCapacity - totalUsedStorage;

  // Usable free space: ZFS-reported available bytes, percentage against available+alloc
  const totalAvailableBytes = pools.reduce((s, p) => s + (p.available_bytes || 0), 0);
  const totalUsedBytes      = pools.reduce((s, p) => s + (p.used_bytes      || 0), 0);
  const pctFree = totalAvailableBytes > 0
    ? (totalAvailableBytes / (totalAvailableBytes + totalUsedBytes)) * 100
    : 0;

  // Fill prediction from shared backend endpoint
  const fillPrediction = useFillPrediction();
  const daysUntilFull  = null; // legacy, kept for capacity banner only

  useEffect(() => {
    const fetchChartData = () => {
      api.getMetricsHistory('1d').then(res => {
        const seen = new Map<string, any>();
        for (const m of (res.metrics || [])) {
          if (!seen.has(m.collected_at)) {
            seen.set(m.collected_at, {
              timestamp: new Date(m.collected_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
              read: m.read_bw_mb, write: m.write_bw_mb, alloc: m.alloc_gb,
            });
          }
        }
        setHistData1d(Array.from(seen.values()));
      }).catch(() => {});

      api.getMetricsHistory('1w').then(res => {
        const seen = new Map<string, any>();
        for (const m of (res.metrics || [])) {
          if (!seen.has(m.collected_at)) {
            seen.set(m.collected_at, { write: m.write_bw_mb });
          }
        }
        setHistData7d(Array.from(seen.values()));
      }).catch(() => {});
    };

    fetchChartData();
    const id = setInterval(fetchChartData, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (pools.length === 0) return;
    const poll = () => {
      pools.forEach(p => {
        api.getScrubStatus(p.name).then(res => {
          setScrubLive(prev => ({
            ...prev,
            [p.name]: { inProgress: res.in_progress, progress: res.progress || 0, timeRemaining: res.time_remaining || '' },
          }));
        }).catch(() => {});
      });
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [pools.length]);

  const ioData      = histData1d.length > 2 ? histData1d : historicalStats;
  const bannerPools = [...pools].filter(p => p.cap >= 80).sort((a, b) => b.cap - a.cap);

  const handleDragStart = useCallback((id: string) => setDragFrom(id), []);
  const handleDragOver  = useCallback((id: string) => setDragOver(id), []);
  const handleDrop      = useCallback((toId: string) => {
    if (dragFrom && dragFrom !== toId) reorder(dragFrom, toId);
    setDragFrom(null);
    setDragOver(null);
  }, [dragFrom, reorder]);

  const handleRemove = useCallback((id: string) => setVisible(id, false), [setVisible]);
  const handleAdd    = useCallback((id: string) => setVisible(id, true), [setVisible]);

  const sortedWidgets  = [...widgets].sort((a, b) => a.order - b.order);
  const visibleWidgets = sortedWidgets.filter(w => w.visible);

  const renderWidget = (id: string) => {
    switch (id) {
      case 'stats-row':
        const rawPct = totalRawCapacity > 0 ? (totalRawUsed / totalRawCapacity) * 100 : 0;
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'stretch' }}>
            <StatCard
              label="Total Storage"
              value={formatBytes(totalCapacity, 1)}
              sub={`${formatBytes(totalUsedStorage, 1)} used · Raw: ${formatBytes(totalRawUsed, 1)} / ${formatBytes(totalRawCapacity, 1)} (${rawPct.toFixed(1)}%)`}
              icon={HardDrive}
              color={usagePct > 90 ? 'var(--danger)' : usagePct > 80 ? 'var(--warning)' : 'var(--accent)'}
            />
            <StatCard
              label="Pool Health"
              value={pools.length === 0 ? 'No pools' : allOnline ? 'Healthy' : 'Degraded'}
              sub={pools.length === 0 ? 'Add a pool to get started'
                : allOnline ? `${pools.length}/${pools.length} online`
                : `${pools.filter(p => p.health !== 'ONLINE').length} need attention`}
              icon={ShieldCheck}
              color={pools.length === 0 ? 'var(--text-muted)' : allOnline ? 'var(--success)' : 'var(--danger)'}
            />
            <StatCard
              label="Datasets"
              value={String(datasets.length)}
              sub={`${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}`}
              icon={Layers}
              color="var(--info)"
            />
            <StatCard
              label="Available Space"
              value={fmtUsableSpace(totalAvailableBytes)}
              fillLine={fillPrediction
                ? { text: fillPrediction.text, color: fillPrediction.color, timeText: fillPrediction.timeText }
                : undefined}
              sub={`${pctFree.toFixed(1)}% free`}
              icon={TrendingUp}
              minHeight={160}
              color={
                fillPrediction?.color === 'var(--danger)'  ? 'var(--danger)'  :
                fillPrediction?.color === 'var(--warning)' ? 'var(--warning)' : 'var(--success)'
              }
            />
          </div>
        );

      case 'io-activity':
        return (
          <Panel
            title="I/O Activity"
            sub={histData1d.length > 2 ? 'Last 24 hours' : 'Current session · 5s resolution'}
            right={
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setIoShowRead(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${ioShowRead ? '#38bdf844' : 'var(--border)'}`,
                    background: ioShowRead ? '#38bdf815' : 'var(--bg-elevated)',
                    color: ioShowRead ? '#38bdf8' : 'var(--text-muted)',
                    fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <ArrowUp size={10} /> Read
                </button>
                <button
                  onClick={() => setIoShowWrite(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${ioShowWrite ? '#818cf844' : 'var(--border)'}`,
                    background: ioShowWrite ? '#818cf815' : 'var(--bg-elevated)',
                    color: ioShowWrite ? '#818cf8' : 'var(--text-muted)',
                    fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <ArrowDown size={10} /> Write
                </button>
              </div>
            }
          >
            <div style={{ padding: '16px 20px' }}>
              {ioData.length > 1 ? (
                <>
                  <div style={{ height: 180, marginLeft: 8, overflow: 'visible' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ioData} margin={CHART_MARGIN}>
                        <CartesianGrid {...GRID_PROPS} />
                        <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={AXIS_TICK} minTickGap={48} />
                        <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK}
                          tickFormatter={v => {
                            const maxV = ioData.reduce((m: number, d: any) => Math.max(m, d.read || 0, d.write || 0), 0);
                            return maxV >= 1000 ? `${(v/1000).toFixed(1)}` : `${v.toFixed(0)}`;
                          }}
                          tickCount={MAX_TICKS}
                          width={60}
                          label={{
                            value: ioData.reduce((m: number, d: any) => Math.max(m, d.read||0, d.write||0), 0) >= 1000 ? 'GB/s' : 'MB/s',
                            angle: -90, position: 'insideLeft', offset: 4,
                            style: { fill: '#52525b', fontSize: 9, textAnchor: 'middle' }
                          }}
                        />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, n: string) => [
                          v >= 1000 ? `${(v/1000).toFixed(2)} GB/s` : `${v.toFixed(2)} MB/s`,
                          n === 'read' ? '↑ Read' : '↓ Write',
                        ]} />
                        {ioShowRead  && <Line type="monotone" dataKey="read"  stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 3, strokeWidth: 0 }} />}
                        {ioShowWrite && <Line type="monotone" dataKey="write" stroke="#818cf8" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 3, strokeWidth: 0 }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {(() => {
                    const totalR = ioData.reduce((s, d) => s + (d.read  || 0), 0);
                    const totalW = ioData.reduce((s, d) => s + (d.write || 0), 0);
                    const peakW  = ioData.reduce((m, d) => Math.max(m, d.write || 0), 0);
                    const fmtData = (v: number) => v >= 1024 ? `${(v/1024).toFixed(1)} TB` : `${v.toFixed(1)} GB`;
                    const fmtBw   = (v: number) => v >= 1000 ? `${(v/1000).toFixed(2)} GB/s` : `${v.toFixed(0)} MB/s`;
                    return (
                      <div style={{ display: 'flex', gap: 32, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        {[
                          { label: '↑ Read total',  value: fmtData(totalR / 1024), color: '#38bdf8' },
                          { label: '↓ Write total', value: fmtData(totalW / 1024), color: '#818cf8' },
                          { label: 'Peak write',    value: fmtBw(peakW),           color: 'var(--text-muted)' },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color, fontWeight: 600 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Collecting I/O data…</span>
                </div>
              )}
            </div>
          </Panel>
        );

      case 'pool-cards':
        return pools.length > 0 ? (
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
              Storage Pools
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {pools.map((pool, i) => <PoolCard key={i} pool={pool} daysUntilFull={daysUntilFull} />)}
            </div>
          </div>
        ) : null;

      case 'system-resources':
        return (
          <div className="two-col">
            <Panel title="Live I/O" sub="Current throughput · 5s refresh">
              <div style={{ display: 'flex' }}>
                {[
                  { label: '↑ Read',       value: currentStats.read.toFixed(1),               unit: 'MB/s',  color: '#38bdf8' },
                  { label: '↓ Write',      value: currentStats.write.toFixed(1),              unit: 'MB/s',  color: '#818cf8' },
                  { label: '↑ Read IOPS',  value: (currentStats.readIops ?? 0).toFixed(0),    unit: 'ops/s', color: '#38bdf8' },
                  { label: '↓ Write IOPS', value: (currentStats.writeIops ?? 0).toFixed(0),   unit: 'ops/s', color: '#818cf8' },
                ].map(({ label, value, unit, color }, i, arr) => (
                  <div key={label} style={{ flex: 1, padding: '16px 18px', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, marginTop: 4 }}>{unit}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="System Resources">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'CPU',    pct: cpuPct, value: `${cpuPct.toFixed(1)}%`,  color: cpuPct > 80 ? 'var(--danger)' : 'var(--accent)' },
                  { label: 'Memory', pct: memPct, value: memTotal ? `${formatBytes(memUsed, 1)} / ${formatBytes(memTotal, 1)}` : '—', color: memPct > 85 ? 'var(--danger)' : 'var(--info)' },
                  { label: 'ARC Hit', pct: arcHit, value: `${arcHit.toFixed(1)}%`, color: 'var(--success)' },
                ].map(({ label, pct, value, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>{label}</div>
                    <div className="progress-track" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', width: 96, textAlign: 'right', flexShrink: 0 }}>{value}</div>
                  </div>
                ))}

                {/* ARC Detailed Breakdown */}
                {systemStats?.arc_size > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ARC Breakdown</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                        {formatBytes(systemStats.arc_size)} / {formatBytes(systemStats.arc_target || 0)}
                      </span>
                    </div>
                    <div className="progress-track" style={{ display: 'flex', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(systemStats.arc_data / systemStats.arc_target) * 100}%`,
                        height: '100%', background: '#3b82f6', transition: 'width 0.3s ease'
                      }} title="Data" />
                      <div style={{
                        width: `${(systemStats.arc_metadata / systemStats.arc_target) * 100}%`,
                        height: '100%', background: '#a855f7', transition: 'width 0.3s ease'
                      }} title="Metadata" />
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Data: {formatBytes(systemStats.arc_data)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Meta: {formatBytes(systemStats.arc_metadata)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        );

      case 'activity-log': {
        const liveEntries = Object.entries(scrubLive).filter(([, s]) => s.inProgress);
        const totalEvents = liveEntries.length + logs.length;
        return totalEvents > 0 ? (
          <Panel
            title="Recent Activity"
            right={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{totalEvents} events</span>}
          >
            <div style={{ padding: '0 20px', maxHeight: 280, overflowY: 'auto' }} className="no-scrollbar">
              {liveEntries.map(([poolName, s]) => (
                <div key={`scrub-${poolName}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{
                    flexShrink: 0, marginTop: 1, width: 36, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', borderRadius: 3,
                    fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: 'var(--accent)', letterSpacing: '0.04em',
                  }}>
                    <span className="live-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', marginRight: 3 }} />
                    RUN
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>
                      Scrubbing {poolName} — {s.progress.toFixed(1)}% complete{s.timeRemaining ? ` · ${s.timeRemaining} remaining` : ''}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Live · {poolName}
                    </div>
                  </div>
                </div>
              ))}
              {logs.slice(0, 20 - liveEntries.length).map((log, i) => <LogRow key={log.id || i} log={log} />)}
            </div>
          </Panel>
        ) : null;
      }

      default:
        return null;
    }
  };

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
        }}>
          {toast}
        </div>
      )}

      {/* Edit mode tray */}
      {editMode && (
        <WidgetTray
          allWidgets={widgets.map(w => ({ id: w.id, label: WIDGET_LABELS[w.id] || w.id, visible: w.visible }))}
          onAdd={handleAdd}
        />
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
          {editMode ? <><Check size={13} /> Done</> : <><Edit2 size={13} /> Edit Dashboard</>}
        </button>
      </div>

      {/* Capacity banners */}
      {bannerPools.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {bannerPools.map(p => <CapacityBanner key={p.name} pool={p} daysUntilFull={daysUntilFull} />)}
        </div>
      )}

      {/* Skeleton */}
      {!loaded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={120} /><Skeleton height={220} /><Skeleton height={220} />
        </div>
      )}

      {/* Widget grid */}
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

      {/* Empty state */}
      {loaded && pools.length === 0 && !loading && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '64px 32px', textAlign: 'center', marginTop: 16 }}>
          <Database size={40} color="var(--text-muted)" strokeWidth={1} style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No storage pools configured
          </h3>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)' }}>
            Navigate to Storage Pools to create or import a pool.
          </p>
        </div>
      )}
    </div>
  );
}
