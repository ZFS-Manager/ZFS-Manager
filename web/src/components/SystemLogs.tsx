import React, { useState, useMemo } from 'react';
import { FileText, Search, AlertCircle, Info, AlertTriangle, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { ZFSLog, ZFSPool } from '../types';

interface SystemLogsProps {
  logs: ZFSLog[];
  pools?: ZFSPool[];
}

const LEVEL = {
  error:   { label: 'ERR', color: 'var(--danger)',  bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.20)'  },
  warning: { label: 'WRN', color: 'var(--warning)', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
  info:    { label: 'INF', color: 'var(--accent)',  bg: 'var(--accent-dim)',      border: 'var(--accent-mid)'     },
} as const;

const MAX_MSG = 120;

export default function SystemLogs({ logs }: SystemLogsProps) {
  const [search, setSearch]           = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());

  const sources = useMemo(() => {
    const all = logs.map(l => l.pool || 'system').filter(Boolean);
    return ['all', ...Array.from(new Set(all)).sort()];
  }, [logs]);

  const filtered = useMemo(() =>
    logs.filter(log => {
      const matchSearch = log.message.toLowerCase().includes(search.toLowerCase())
        || (log.pool || '').toLowerCase().includes(search.toLowerCase());
      const matchLevel  = levelFilter === 'all' || log.level === levelFilter;
      const matchSource = sourceFilter === 'all' || (log.pool || 'system') === sourceFilter;
      return matchSearch && matchLevel && matchSource;
    }),
    [logs, search, levelFilter, sourceFilter]
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

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const FILTERS: { key: 'all' | 'error' | 'warning' | 'info'; label: string; count: number }[] = [
    { key: 'all',     label: 'All',     count: logs.length },
    { key: 'error',   label: 'Error',   count: counts.error },
    { key: 'warning', label: 'Warning', count: counts.warning },
    { key: 'info',    label: 'Info',    count: counts.info },
  ];

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', letterSpacing: '-0.01em', margin: 0 }}>
            System Logs
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Pool history &amp; event telemetry
          </p>
        </div>

        {/* Level filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map(({ key, label, count }) => {
            const isActive = levelFilter === key;
            const cfg = key !== 'all' ? LEVEL[key] : null;
            return (
              <button
                key={key}
                onClick={() => setLevelFilter(key)}
                style={{
                  height: 30, padding: '0 14px', borderRadius: 6,
                  fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 600,
                  letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.12s',
                  border: isActive ? `1px solid ${cfg ? cfg.border : 'var(--border-mid)'}` : '1px solid var(--border)',
                  background: isActive ? (cfg ? cfg.bg : 'rgba(255,255,255,0.06)') : 'transparent',
                  color: isActive ? (cfg ? cfg.color : 'var(--text-primary)') : 'var(--text-muted)',
                }}
              >
                {label} <span style={{ opacity: 0.7 }}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main card */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>

        {/* Toolbar */}
        <div style={{
          padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'center',
          borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text" className="input" placeholder="Search events…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 34 }}
            />
          </div>

          {/* Source filter */}
          {sources.length > 2 && (
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="select"
              style={{ width: 140 }}
            >
              {sources.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All sources' : s}</option>
              ))}
            </select>
          )}

          <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Download size={13} />
            Export
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 170 }}>Timestamp</th>
                <th style={{ width: 60 }}>Level</th>
                <th style={{ width: 120 }}>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const lvl = log.level as keyof typeof LEVEL;
                const cfg = LEVEL[lvl] || LEVEL.info;
                const id  = log.id || String(i);
                const isExpanded = expanded.has(id);
                const isLong = log.message.length > MAX_MSG;
                return (
                  <tr
                    key={id}
                    onClick={() => isLong && toggleExpand(id)}
                    style={{ cursor: isLong ? 'pointer' : 'default', height: 'auto' }}
                  >
                    <td>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {log.timestamp}
                      </span>
                    </td>
                    <td>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 38, height: 20, background: cfg.bg, border: `1px solid ${cfg.border}`,
                        borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: cfg.color, letterSpacing: '0.05em',
                      }}>
                        {cfg.label}
                      </div>
                    </td>
                    <td>
                      {log.pool ? (
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', padding: '2px 6px', borderRadius: 4 }}>
                          {log.pool}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>system</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 0' }}>
                        {isLong && (
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }}>
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </span>
                        )}
                        <p style={{
                          fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                          lineHeight: 1.5, margin: 0, wordBreak: 'break-word',
                          ...(isLong && !isExpanded ? { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' } : {}),
                        }}>
                          {log.message}
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ padding: '80px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <FileText size={40} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: 16 }} strokeWidth={1} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>
              {search || levelFilter !== 'all' || sourceFilter !== 'all' ? 'No matching events' : 'No log events'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              Pool history events will appear here.
            </p>
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {(search || levelFilter !== 'all' || sourceFilter !== 'all') && ` · filtered from ${logs.length}`}
          </div>
        )}
      </div>
    </div>
  );
}
