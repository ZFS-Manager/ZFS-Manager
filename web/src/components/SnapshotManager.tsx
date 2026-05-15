import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera, Trash2, RotateCcw, Search, Clock, Plus,
  X, Loader2, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';
import { ZFSDataset } from '../types';
import { api, formatUnixTimestamp, formatBytes } from '../api';

interface SnapshotManagerProps {
  snapshots: any[];
  datasets: ZFSDataset[];
  onRefresh: () => void;
}

/* ── Shared Modal ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="card"
        style={{ width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', margin: 0 }}>
            {title}
          </h3>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, background: 'transparent',
            border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)',
          }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ── Toast ── */
function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 300,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 18px', borderRadius: 8,
        border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        background: type === 'success' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
        color: type === 'success' ? 'var(--success)' : 'var(--danger)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
      }}
    >
      {type === 'success' ? <CheckCircle size={15} strokeWidth={2.5} /> : <XCircle size={15} strokeWidth={2.5} />}
      {msg}
    </motion.div>
  );
}

function buildDefaultSnapName(dataset: string): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${dataset.replace(/\//g, '-')}-${y}-${m}-${d}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '10px 14px', fontSize: 13,
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', outline: 'none', cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '10px 14px', fontSize: 13,
  color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
};

/* ── Main component ── */
export default function SnapshotManager({ snapshots, datasets, onRefresh }: SnapshotManagerProps) {
  const [search, setSearch]                   = useState('');
  const [showCreate, setShowCreate]           = useState(false);
  const [createDataset, setCreateDataset]     = useState('');
  const [createName, setCreateName]           = useState('');
  const [createRecursive, setCreateRecursive] = useState(false);
  const [creating, setCreating]               = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<string | null>(null);
  const [deleting, setDeleting]               = useState(false);
  const [rollbackTarget, setRollbackTarget]   = useState<string | null>(null);
  const [rolling, setRolling]                 = useState(false);
  const [toast, setToast]                     = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [selected, setSelected]               = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting]       = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filtered = useMemo(() =>
    snapshots.filter(s => s.name?.toLowerCase().includes(search.toLowerCase())),
    [snapshots, search]
  );

  const datasetOptions = useMemo(() => {
    const fromSnapshots = [...new Set(snapshots.map(s => s.name?.split('@')[0]).filter(Boolean))];
    const fromDatasets  = datasets.map(d => d.name);
    return [...new Set([...fromDatasets, ...fromSnapshots])].sort();
  }, [snapshots, datasets]);

  const openCreateFor = (dataset: string) => {
    setCreateDataset(dataset);
    setCreateName(buildDefaultSnapName(dataset));
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createDataset || !createName.trim()) return;
    setCreating(true);
    try {
      await api.createSnapshot(`${createDataset}@${createName.trim()}`, createRecursive);
      showToast(`Snapshot "${createName}" created`, 'success');
      setShowCreate(false);
      setCreateName('');
      setCreateRecursive(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create snapshot', 'error');
    } finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteSnapshot(deleteTarget);
      showToast('Snapshot deleted', 'success');
      setDeleteTarget(null);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete snapshot', 'error');
    } finally { setDeleting(false); }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRolling(true);
    try {
      await api.rollbackSnapshot(rollbackTarget);
      showToast(`Rolled back to "${rollbackTarget.split('@').pop()}"`, 'success');
      setRollbackTarget(null);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Rollback failed', 'error');
    } finally { setRolling(false); }
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.name)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    let deleted = 0;
    for (const name of Array.from(selected)) {
      try {
        await api.deleteSnapshot(name);
        deleted++;
      } catch {}
    }
    showToast(`${deleted} snapshot${deleted !== 1 ? 's' : ''} deleted`, 'success');
    setSelected(new Set());
    setBulkDeleting(false);
    onRefresh();
  };

  const actionBtn: React.CSSProperties = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.12s',
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div style={{ paddingBottom: 40 }}>
      <AnimatePresence>{toast && <Toast msg={toast.msg} type={toast.type} />}</AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Create Snapshot" onClose={() => setShowCreate(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Field label="Dataset">
                <select value={createDataset} onChange={e => { setCreateDataset(e.target.value); setCreateName(buildDefaultSnapName(e.target.value)); }} style={selectStyle}>
                  <option value="">Select dataset…</option>
                  {datasetOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>

              <Field label="Snapshot name">
                <input
                  type="text" placeholder="e.g. tank-data-2024-04-25"
                  value={createName} onChange={e => setCreateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  style={inputStyle}
                />
                {createDataset && createName && (
                  <p style={{ marginTop: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', opacity: 0.7 }}>
                    {createDataset}@{createName}
                  </p>
                )}
              </Field>

              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div onClick={() => setCreateRecursive(v => !v)} style={{
                  width: 40, height: 22, borderRadius: 11,
                  background: createRecursive ? 'var(--accent)' : 'var(--bg-elevated)',
                  border: '1px solid var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: createRecursive ? 19 : 2,
                    width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
                  Recursive snapshot
                </span>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={handleCreate}
                  disabled={creating || !createDataset || !createName.trim()}
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <Modal title="Delete Snapshot" onClose={() => setDeleteTarget(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.16)', borderRadius: 8 }}>
                <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', margin: '0 0 6px' }}>
                    This cannot be undone.
                  </p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', margin: 0, wordBreak: 'break-all' }}>
                    {deleteTarget}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={handleDelete} disabled={deleting}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Rollback Confirm */}
      <AnimatePresence>
        {rollbackTarget && (
          <Modal title="Rollback Dataset" onClose={() => setRollbackTarget(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.16)', borderRadius: 8 }}>
                <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', margin: '0 0 6px' }}>
                    All changes after this snapshot will be lost.
                  </p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', margin: 0, wordBreak: 'break-all' }}>
                    {rollbackTarget}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRollbackTarget(null)}>Cancel</button>
                <button
                  className="btn"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.22)', color: 'var(--warning)',
                  }}
                  onClick={handleRollback} disabled={rolling}
                >
                  {rolling ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  {rolling ? 'Rolling back…' : 'Rollback'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', letterSpacing: '-0.01em', margin: 0 }}>
            Snapshots
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {snapshots.length} point-in-time snapshot{snapshots.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text" className="input" placeholder="Filter snapshots…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34, width: 220 }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            onClick={() => {
              const d = datasetOptions[0] || '';
              setCreateDataset(d);
              setCreateName(d ? buildDefaultSnapName(d) : '');
              setShowCreate(true);
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Create Snapshot
          </button>
        </div>
      </div>

      {/* Main card */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                </th>
                <th>Snapshot</th>
                <th>Dataset</th>
                <th>Used</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((snap, idx) => {
                const snapName    = snap.name?.split('@').pop() || snap.name;
                const datasetName = snap.name?.split('@')[0] || '—';
                const usedBytes   = Number(snap.used);
                const isSelected  = selected.has(snap.name);
                return (
                  <motion.tr
                    key={snap.name || idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.015, 0.3) }}
                    style={isSelected ? { background: 'var(--accent-dim)' } : undefined}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(snap.name)}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Camera size={13} style={{ color: 'var(--accent)' }} strokeWidth={2} />
                        </div>
                        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {snapName}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {datasetName}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {usedBytes > 0 ? formatBytes(usedBytes, 1) : snap.used || '0 B'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                        <Clock size={11} />
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                          {snap.creation ? formatUnixTimestamp(snap.creation) : '—'}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button title="Create snapshot for this dataset" onClick={() => openCreateFor(datasetName)} style={actionBtn}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-mid)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <Camera size={13} strokeWidth={2} />
                        </button>
                        <button title="Rollback to this snapshot" onClick={() => setRollbackTarget(snap.name)} style={actionBtn}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--warning)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.3)'; (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.08)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <RotateCcw size={13} strokeWidth={2} />
                        </button>
                        <button title="Delete snapshot" onClick={() => setDeleteTarget(snap.name)} style={actionBtn}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ padding: '80px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <Camera size={40} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: 16 }} strokeWidth={1} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>
              {search ? 'No matching snapshots' : 'No recovery points'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', maxWidth: 280 }}>
              {search ? 'Try a different search term.' : 'Create a snapshot to begin tracking recovery points.'}
            </p>
            {!search && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  const d = datasetOptions[0] || '';
                  setCreateDataset(d);
                  setCreateName(d ? buildDefaultSnapName(d) : '');
                  setShowCreate(true);
                }}
              >
                <Plus size={14} strokeWidth={2.5} />
                Create First Snapshot
              </button>
            )}
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {filtered.length} snapshot{filtered.length !== 1 ? 's' : ''}
            {selected.size > 0 && <span style={{ color: 'var(--accent)', marginLeft: 8 }}> · {selected.size} selected</span>}
          </div>
        )}
      </div>

      {/* Floating bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            className="bulk-bar"
          >
            <span style={{ fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)', fontWeight: 500, marginRight: 4 }}>
              {selected.size} selected
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => setSelected(new Set())}
              style={{ fontSize: 11 }}
            >
              Clear
            </button>
            <button
              className="btn btn-danger"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
