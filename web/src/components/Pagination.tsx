import React from 'react';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({ total, page, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const btnBase: React.CSSProperties = {
    height: 28, padding: '0 10px', fontSize: 12, minWidth: 28,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 20px', borderTop: '1px solid var(--border)',
      background: 'rgba(255,255,255,0.01)', flexWrap: 'wrap', gap: 8,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
        Showing {start}–{end} of {total}
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-secondary"
          style={btnBase}
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
        >
          ‹ Prev
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} style={{ padding: '0 2px', color: 'var(--text-muted)', fontSize: 12 }}>…</span>
          ) : (
            <button
              key={p}
              className={`btn ${page === p ? 'btn-primary' : 'btn-secondary'}`}
              style={btnBase}
              onClick={() => onChange(p as number)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="btn btn-secondary"
          style={btnBase}
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
