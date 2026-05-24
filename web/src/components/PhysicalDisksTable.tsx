import React from 'react';
import { motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';

const C = { read: '#38bdf8', write: '#818cf8' };

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

interface PhysicalDisksTableProps {
  diskPools: string[];
  diskMetrics: Record<string, any[]>;
}

// Fixed widths for numeric columns prevent layout shift when values change
const NUM_CELL: React.CSSProperties = {
  padding: '8px 12px',
  width: 100,
  minWidth: 100,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const NUM_HEAD: React.CSSProperties = {
  padding: '6px 12px',
  width: 100,
  minWidth: 100,
  textAlign: 'right',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export default function PhysicalDisksTable({ diskPools, diskMetrics }: PhysicalDisksTableProps) {
  const animEnabled = localStorage.getItem('page_animations') !== 'false';
  const allDisks = diskPools.flatMap(pool =>
    (diskMetrics[pool] || []).map((d: any) => ({ ...d, pool }))
  );

  if (allDisks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <HardDrive size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          No disk metrics available
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pool</th>
            <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Disk</th>
            <th style={NUM_HEAD}>Read</th>
            <th style={NUM_HEAD}>Write</th>
            <th style={NUM_HEAD}>Read IOPS</th>
            <th style={NUM_HEAD}>Write IOPS</th>
            <th style={NUM_HEAD}>Total Read</th>
            <th style={NUM_HEAD}>Total Written</th>
          </tr>
        </thead>
        <tbody>
          {allDisks.map((d: any, i: number) => (
            <motion.tr
              key={`${d.pool}-${d.name}`}
              initial={animEnabled ? { opacity: 0, y: -8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(i, 20) * 30 / 1000 }}
              style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
            >
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{d.pool}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{d.name}</td>
              <td style={{ ...NUM_CELL, color: C.read }}>{fmtBw(d.read_bw_mb ?? 0)}</td>
              <td style={{ ...NUM_CELL, color: C.write }}>{fmtBw(d.write_bw_mb ?? 0)}</td>
              <td style={{ ...NUM_CELL, color: C.read }}>{(d.read_iops ?? 0).toFixed(0)}</td>
              <td style={{ ...NUM_CELL, color: C.write }}>{(d.write_iops ?? 0).toFixed(0)}</td>
              <td style={{ ...NUM_CELL, color: 'var(--text-secondary)' }}>{fmtGB(d.total_read_gb ?? 0)}</td>
              <td style={{ ...NUM_CELL, color: 'var(--text-secondary)' }}>{fmtGB(d.total_write_gb ?? 0)}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
