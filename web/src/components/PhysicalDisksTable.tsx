import React, { useState, useEffect } from 'react';
import { HardDrive } from 'lucide-react';
import { api } from '../api';

interface PhysicalDisksTableProps {
  diskPools: string[];
  diskMetrics: Record<string, any[]>;
  poolVdevs?: Record<string, any[]>;
}

interface EnrichedInfo {
  size_human?: string;
  model?: string;
}

function fmtBw(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} GB/s`;
  if (v >= 1)    return `${v.toFixed(2)} MB/s`;
  return `${(v * 1024).toFixed(0)} KB/s`;
}
function fmtGB(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} TB`;
  if (v >= 1)    return `${v.toFixed(2)} GB`;
  return `${(v * 1024).toFixed(0)} MB`;
}
function healthColor(state?: string): string {
  if (state === 'ONLINE')   return 'var(--success)';
  if (state === 'DEGRADED') return 'var(--warning)';
  if (state)                return 'var(--danger)';
  return 'var(--text-muted)';
}

const TH: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 10, fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  fontFamily: 'var(--font-ui)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
};
const TD: React.CSSProperties = {
  padding: '7px 8px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
};
const NUM:    React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const NUM_TH: React.CSSProperties = { ...TH, textAlign: 'right' };

export default function PhysicalDisksTable({ diskPools, diskMetrics, poolVdevs }: PhysicalDisksTableProps) {
  const [enrichedMap, setEnrichedMap] = useState<Record<string, EnrichedInfo>>({});

  useEffect(() => {
    api.getEnrichedDisks().then(res => {
      const map: Record<string, EnrichedInfo> = {};
      for (const d of (res.disks || [])) {
        map[d.name] = { size_human: d.size_human ?? undefined, model: d.model ?? undefined };
      }
      setEnrichedMap(map);
    }).catch(() => {});
  }, []);

  // Build disk-name → health-state map from pool vdevs
  const healthMap: Record<string, string> = {};
  if (poolVdevs) {
    for (const vdevs of Object.values(poolVdevs)) {
      for (const vdev of (vdevs || [])) {
        for (const disk of (vdev.disks || [])) {
          const raw = disk.path || disk.name || '';
          const name = raw.split('/').pop() || raw;
          if (name) healthMap[name] = disk.state || 'UNKNOWN';
        }
      }
    }
  }

  const allDisks = diskPools.flatMap(pool =>
    (diskMetrics[pool] || []).map((d: any) => ({ ...d, pool }))
  );

  if (allDisks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', minHeight: 80 }}>
        <HardDrive size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          No disk metrics available
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .pdt-iops { display: table-cell; }
        .pdt-total { display: table-cell; }
        @media (max-width: 640px) {
          .pdt-iops, .pdt-total { display: none !important; }
        }
      `}</style>
      <div style={{ width: '100%', overflowX: 'hidden', minHeight: 80 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '80px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col className="pdt-iops"  style={{ width: '75px' }} />
            <col className="pdt-iops"  style={{ width: '75px' }} />
            <col className="pdt-total" style={{ width: '100px' }} />
            <col className="pdt-total" style={{ width: '100px' }} />
            <col style={{ width: '90px' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ ...TH, textAlign: 'left' }}>Disk</th>
              <th style={NUM_TH}>Size</th>
              <th style={NUM_TH}>Read</th>
              <th style={NUM_TH}>Write</th>
              <th className="pdt-iops"  style={NUM_TH}>R IOPS</th>
              <th className="pdt-iops"  style={NUM_TH}>W IOPS</th>
              <th className="pdt-total" style={NUM_TH}>Total Read</th>
              <th className="pdt-total" style={NUM_TH}>Total Write</th>
              <th style={NUM_TH}>Health</th>
            </tr>
          </thead>
          <tbody>
            {allDisks.map((d: any, i: number) => {
              const info  = enrichedMap[d.name] || {};
              const state = healthMap[d.name];
              const dot   = healthColor(state);
              return (
                <tr
                  key={`${d.pool}-${d.name}`}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)',
                  }}
                >
                  <td style={{ ...TD, textAlign: 'left' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>
                      {d.name}
                    </span>
                    {info.model && (
                      <span style={{
                        fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 1,
                        fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {info.model}
                      </span>
                    )}
                  </td>
                  <td style={{ ...NUM, color: 'var(--text-secondary)' }}>
                    {info.size_human || '—'}
                  </td>
                  <td style={{ ...NUM, color: '#38bdf8' }}>{fmtBw(d.read_bw_mb ?? 0)}</td>
                  <td style={{ ...NUM, color: '#818cf8' }}>{fmtBw(d.write_bw_mb ?? 0)}</td>
                  <td className="pdt-iops"  style={{ ...NUM, color: '#38bdf8' }}>{(d.read_iops  ?? 0).toFixed(0)}</td>
                  <td className="pdt-iops"  style={{ ...NUM, color: '#818cf8' }}>{(d.write_iops ?? 0).toFixed(0)}</td>
                  <td className="pdt-total" style={{ ...NUM, color: 'var(--text-secondary)' }}>{fmtGB(d.total_read_gb  ?? 0)}</td>
                  <td className="pdt-total" style={{ ...NUM, color: 'var(--text-secondary)' }}>{fmtGB(d.total_write_gb ?? 0)}</td>
                  <td style={NUM}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ color: dot, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', fontFamily: 'var(--font-ui)' }}>
                        {state || '—'}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
