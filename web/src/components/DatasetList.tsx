import React, { useState, useMemo, useEffect } from 'react';
import { ZFSDataset, ZFSPool } from '../types';
import {
  HardDrive, Plus, Lock, Search, Trash2, X,
  Loader2, CheckCircle, XCircle, AlertTriangle, Layers,
  ArrowUpDown, ArrowUp, ArrowDown, Pencil, Save, RotateCcw,
  ChevronRight, ChevronDown, Folder, FolderOpen, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatBytes } from '../api';

interface DatasetListProps {
  datasets: ZFSDataset[];
  volumes?: any[];
  pools: ZFSPool[];
  onRefresh: () => void;
  selectedName?: string;
  onSelect?: (name: string) => void;
}

/* ── Shared modal ── */
function Modal({ title, onClose, children, maxWidth = 440 }: {
  title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number;
}) {
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
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="card"
        style={{ width: '100%', maxWidth, padding: 28, borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.4)', overflowY: 'auto', maxHeight: '90vh' }}
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
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
        borderRadius: 8,
        border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        background: type === 'success' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
        color: type === 'success' ? 'var(--success)' : 'var(--danger)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
      }}
    >
      {type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
      {msg}
    </motion.div>
  );
}

type QuotaUnit = 'M' | 'G' | 'T';

function parseQuotaValue(quota: string): { num: string; unit: QuotaUnit } {
  if (!quota || quota === 'none' || quota === '0') return { num: '', unit: 'G' };
  const m = quota.match(/^(\d+(?:\.\d+)?)([MGT])/i);
  if (m) return { num: m[1], unit: m[2].toUpperCase() as QuotaUnit };
  return { num: quota, unit: 'G' };
}

function buildQuotaString(num: string, unit: QuotaUnit): string {
  if (!num.trim() || parseFloat(num) === 0) return '';
  return `${num}${unit}`;
}

interface PropValues {
  compression: string;
  quotaNum: string;
  quotaUnit: QuotaUnit;
  atime: string;
  dedup: string;
  readonly: string;
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', display: 'block', marginBottom: 8,
};

const fieldInput: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 13,
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', outline: 'none', boxSizing: 'border-box',
};

const fieldSelect: React.CSSProperties = {
  ...fieldInput,
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
};

function PropertiesModal({ dataset, onClose, onSaved }: {
  dataset: ZFSDataset; onClose: () => void; onSaved: () => void;
}) {
  const [props, setProps] = useState<PropValues>({
    compression: 'lz4', quotaNum: '', quotaUnit: 'G', atime: 'on', dedup: 'off', readonly: 'off',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDatasetProperties(dataset.name, 'compression,quota,atime,dedup,readonly')
      .then(res => {
        const map: Record<string, string> = {};
        for (const p of (res.properties || [])) map[p.name] = p.value;
        const { num, unit } = parseQuotaValue(map['quota'] || '');
        setProps({
          compression: map['compression'] || 'lz4',
          quotaNum: num,
          quotaUnit: unit,
          atime: map['atime'] || 'on',
          dedup: map['dedup'] || 'off',
          readonly: map['readonly'] || 'off',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dataset.name]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const quotaStr = buildQuotaString(props.quotaNum, props.quotaUnit);
      await Promise.all([
        api.setDatasetProperty(dataset.name, 'compression', props.compression),
        api.setDatasetProperty(dataset.name, 'atime', props.atime),
        api.setDatasetProperty(dataset.name, 'dedup', props.dedup),
        api.setDatasetProperty(dataset.name, 'readonly', props.readonly),
        quotaStr
          ? api.setDatasetProperty(dataset.name, 'quota', quotaStr)
          : api.setDatasetProperty(dataset.name, 'quota', 'none'),
      ]);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save properties');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div
      onClick={() => onChange(value === 'on' ? 'off' : 'on')}
      style={{
        width: 40, height: 20, borderRadius: 10, position: 'relative',
        cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
        background: value === 'on' ? 'var(--info)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: value === 'on' ? 21 : 2,
        width: 14, height: 14, borderRadius: 7,
        background: '#fff', transition: 'left 0.18s',
      }} />
    </div>
  );

  return (
    <Modal title={`Properties — ${dataset.name.split('/').pop()}`} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', margin: '-12px 0 0' }}>
          {dataset.name}
        </p>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={16} className="animate-spin" />
            <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)' }}>Loading properties...</span>
          </div>
        ) : (
          <>
            <div>
              <label style={fieldLabel}>Compression</label>
              <select value={props.compression} onChange={e => setProps(p => ({ ...p, compression: e.target.value }))} style={fieldSelect}>
                {['off', 'lz4', 'gzip', 'gzip-1', 'gzip-6', 'gzip-9', 'zstd', 'zstd-fast'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={fieldLabel}>
                Quota <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(empty = no quota)</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number" min="0" placeholder="e.g. 10"
                  value={props.quotaNum}
                  onChange={e => setProps(p => ({ ...p, quotaNum: e.target.value }))}
                  style={{ ...fieldInput, flex: 1, fontFamily: 'var(--font-mono)' }}
                />
                <select value={props.quotaUnit} onChange={e => setProps(p => ({ ...p, quotaUnit: e.target.value as QuotaUnit }))} style={{ ...fieldSelect, width: 80 }}>
                  <option value="M">MB</option>
                  <option value="G">GB</option>
                  <option value="T">TB</option>
                </select>
              </div>
              {props.quotaNum && (
                <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: 4, opacity: 0.7 }}>
                  → quota={buildQuotaString(props.quotaNum, props.quotaUnit)}
                </p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([
                { key: 'atime',    label: 'Access Time',   desc: 'Track last access time' },
                { key: 'dedup',    label: 'Deduplication', desc: 'Data dedup (CPU-intensive)' },
                { key: 'readonly', label: 'Read-only',     desc: 'Prevent write access' },
              ] as { key: keyof PropValues; label: string; desc: string }[]).map(({ key, label, desc }) => (
                <div key={key} style={{
                  padding: '12px 14px', borderRadius: 'var(--radius)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  gridColumn: key === 'atime' ? 'span 2' : undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{label}</span>
                    <Toggle value={props[key] as string} onChange={v => setProps(p => ({ ...p, [key]: v }))} />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', margin: 0 }}>{desc}</p>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--radius)' }}>
                <XCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0, fontFamily: 'var(--font-ui)' }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

type SortField = 'name' | 'used' | 'avail';
type SortDir   = 'asc' | 'desc';

interface TreeNode {
  dataset: ZFSDataset;
  depth: number;
  children: TreeNode[];
  expanded: boolean;
}

function buildTree(datasets: ZFSDataset[]): TreeNode[] {
  const sorted = [...datasets].sort((a, b) => a.name.localeCompare(b.name));
  const nodeMap = new Map<string, TreeNode>();
  for (const ds of sorted) {
    nodeMap.set(ds.name, { dataset: ds, depth: 0, children: [], expanded: true });
  }
  const roots: TreeNode[] = [];
  for (const ds of sorted) {
    const node = nodeMap.get(ds.name)!;
    const parts = ds.name.split('/');
    parts.pop();
    const parentName = parts.join('/');
    if (parentName && nodeMap.has(parentName)) {
      const parent = nodeMap.get(parentName)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function flattenTree(nodes: TreeNode[], expandedSet: Set<string>): Array<{ dataset: ZFSDataset; depth: number; hasChildren: boolean }> {
  const result: Array<{ dataset: ZFSDataset; depth: number; hasChildren: boolean }> = [];
  for (const node of nodes) {
    const isExpanded = expandedSet.has(node.dataset.name);
    result.push({ dataset: node.dataset, depth: node.depth, hasChildren: node.children.length > 0 });
    if (isExpanded && node.children.length > 0) {
      result.push(...flattenTree(node.children, expandedSet));
    }
  }
  return result;
}

const ACT_BTN: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 'var(--radius-sm)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)',
  cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.12s',
};

export default function DatasetList({ datasets, volumes = [], pools, onRefresh }: DatasetListProps) {
  const [search,        setSearch]        = useState('');
  const [sortField,     setSortField]     = useState<SortField>('name');
  const [sortDir,       setSortDir]       = useState<SortDir>('asc');
  const [showCreate,    setShowCreate]    = useState(false);
  const [newName,       setNewName]       = useState('');
  const [parentPool,    setParentPool]    = useState('');
  const [creating,      setCreating]      = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<string | null>(null);
  const [deleteError,   setDeleteError]   = useState('');
  const [canForce,      setCanForce]      = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [editTarget,    setEditTarget]    = useState<ZFSDataset | null>(null);
  const [rewriteTarget, setRewriteTarget] = useState<string | null>(null);
  const [toast,         setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedNodes(new Set(datasets.map(d => d.name)));
  }, [datasets.length]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const toggleExpand = (name: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'name' ? 'asc' : 'desc'); }
  };

  const filtered = useMemo(() => {
    if (search) return datasets.filter(ds => ds.name.toLowerCase().includes(search.toLowerCase()));
    return datasets;
  }, [datasets, search]);

  const treeNodes = useMemo(() => buildTree(filtered), [filtered]);
  const flatItems = useMemo(() => flattenTree(treeNodes, expandedNodes), [treeNodes, expandedNodes]);

  const sortedFlat = useMemo(() => {
    if (!search) return flatItems;
    return [...flatItems].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.dataset.name.localeCompare(b.dataset.name);
      else if (sortField === 'used') cmp = (a.dataset._usedBytes ?? 0) - (b.dataset._usedBytes ?? 0);
      else if (sortField === 'avail') cmp = (a.dataset._availBytes ?? 0) - (b.dataset._availBytes ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [flatItems, search, sortField, sortDir]);

  const parentOptions = useMemo(() => {
    const poolNames    = pools.map(p => p.name);
    const datasetNames = datasets.map(d => d.name);
    return [...new Set([...poolNames, ...datasetNames])].sort();
  }, [pools, datasets]);

  const handleCreate = async () => {
    if (!parentPool || !newName.trim()) return;
    const fullName = `${parentPool}/${newName.trim()}`;
    setCreating(true);
    try {
      await api.createDataset(fullName);
      showToast(`Dataset "${fullName}" created`, 'success');
      setShowCreate(false);
      setNewName('');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create dataset', 'error');
    } finally { setCreating(false); }
  };

  const openDelete = (name: string) => {
    setDeleteTarget(name);
    setDeleteError('');
    setCanForce(false);
  };

  const handleDelete = async (force = false) => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError('');
    try {
      await api.deleteDataset(deleteTarget, force, force);
      showToast('Dataset deleted', 'success');
      setDeleteTarget(null);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Failed to delete dataset';
      setDeleteError(msg);
      const msgLow = msg.toLowerCase();
      setCanForce(msgLow.includes('busy') || msgLow.includes('children') || msgLow.includes('dependent') || msgLow.includes('mount'));
    } finally { setDeleting(false); }
  };

  const handleRewrite = async (name: string) => {
    if (!window.confirm(`Start rewrite (scrub) on "${name}"? This will impact performance.`)) return;
    setRewriteTarget(name);
    try {
      await api.rewriteDataset(name);
      showToast(`Rewrite started on pool "${name.split('/')[0]}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Rewrite failed', 'error');
    } finally { setRewriteTarget(null); }
  };

  const poolMap = useMemo(() => {
    const m = new Map<string, ZFSPool>();
    for (const p of pools) m.set(p.name, p);
    return m;
  }, [pools]);

  const poolGroups = useMemo(() => {
    const groups = new Map<string, typeof sortedFlat>();
    for (const item of sortedFlat) {
      const poolName = item.dataset.name.split('/')[0];
      if (!groups.has(poolName)) groups.set(poolName, []);
      groups.get(poolName)!.push(item);
    }
    return Array.from(groups.entries());
  }, [sortedFlat]);

  return (
    <div style={{ paddingBottom: 40 }}>
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Create Dataset" onClose={() => setShowCreate(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={fieldLabel}>Parent Pool / Dataset</label>
                <select value={parentPool} onChange={e => setParentPool(e.target.value)} style={fieldSelect}>
                  <option value="">Select parent...</option>
                  {parentOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Dataset Name</label>
                <input
                  type="text" placeholder="e.g. mydata"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  style={{ ...fieldInput, fontFamily: 'var(--font-mono)' }}
                />
                {parentPool && newName && (
                  <p style={{ marginTop: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', opacity: 0.7 }}>
                    {parentPool}/{newName}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleCreate}
                  disabled={creating || !parentPool || !newName.trim()}
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <Modal title="Delete Dataset" onClose={() => setDeleteTarget(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)' }}>
                <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', margin: '0 0 4px' }}>
                    This will permanently destroy the dataset and all data.
                  </p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', margin: 0, wordBreak: 'break-all' }}>{deleteTarget}</p>
                </div>
              </div>
              {deleteError && (
                <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)' }}>
                  <XCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{deleteError}</p>
                    {canForce && <p style={{ fontSize: 10, color: 'var(--danger)', opacity: 0.7, margin: '4px 0 0' }}>Has open handles or children — use Force Delete to override.</p>}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>Cancel</button>
                {canForce && (
                  <button
                    className="btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--warning-dim)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning)' }}
                    onClick={() => handleDelete(true)} disabled={deleting}
                  >
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                    Force
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => handleDelete(false)} disabled={deleting}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Deleting...' : 'Destroy'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Properties Modal */}
      <AnimatePresence>
        {editTarget && (
          <PropertiesModal
            dataset={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={() => { showToast('Properties saved', 'success'); onRefresh(); }}
          />
        )}
      </AnimatePresence>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', letterSpacing: '-0.01em', margin: 0 }}>
            Datasets
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {datasets.length} filesystem{datasets.length !== 1 ? 's' : ''} · {volumes.length} zvol{volumes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Search datasets..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="input"
              style={{ paddingLeft: 34, width: 220 }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            onClick={() => { setShowCreate(true); setParentPool(pools[0]?.name || ''); }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Dataset
          </button>
        </div>
      </div>

      {/* Main table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {poolGroups.length === 0 ? (
          <div style={{ padding: '80px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Layers size={36} style={{ color: 'var(--text-muted)', opacity: 0.2, marginBottom: 16 }} strokeWidth={1} />
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              {search ? 'No matching datasets' : 'No datasets found'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 240 }}>Name</th>
                  <th>Type</th>
                  <th onClick={() => handleSort('used')} className={sortField === 'used' ? 'sort-active' : ''} style={{ cursor: 'pointer' }}>
                    Used {sortField === 'used' && (sortDir === 'asc' ? <ArrowUp size={10} style={{ display: 'inline' }} /> : <ArrowDown size={10} style={{ display: 'inline' }} />)}
                  </th>
                  <th>Referenced</th>
                  <th>Compression</th>
                  <th style={{ minWidth: 180 }}>Mount Point</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {poolGroups.map(([poolName, items]) => {
                  const pool = poolMap.get(poolName);
                  return (
                    <React.Fragment key={poolName}>
                      {/* Pool header row */}
                      <tr>
                        <td colSpan={7} style={{
                          padding: '8px 16px',
                          background: 'var(--bg-elevated)',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Database size={13} style={{ color: 'var(--info)', flexShrink: 0 }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {poolName}
                            </span>
                            {pool && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                                {pool.alloc} / {pool.size} · {pool.cap}% used
                              </span>
                            )}
                            {pool && (
                              <span className={pool.health === 'ONLINE' ? 'badge badge-success' : 'badge badge-warning'}>
                                {pool.health}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Dataset rows */}
                      {items.map(({ dataset: ds, depth, hasChildren }) => {
                        const dsType = (ds as any).type || 'filesystem';
                        const typeLabel = dsType === 'volume' ? 'VOL' : dsType === 'snapshot' ? 'SNAP' : 'FS';
                        const typeClass = dsType === 'volume' ? 'badge badge-vol' : dsType === 'snapshot' ? 'badge badge-snap' : 'badge badge-fs';
                        return (
                          <tr key={ds.id}>
                            <td style={{ paddingLeft: `${8 + depth * 18}px` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {/* Depth connector */}
                                {depth > 0 && (
                                  <div style={{ width: 10, height: 1, background: 'var(--border)', flexShrink: 0 }} />
                                )}
                                {/* Expand toggle */}
                                {hasChildren ? (
                                  <button
                                    onClick={() => toggleExpand(ds.name)}
                                    style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, flexShrink: 0 }}
                                  >
                                    {expandedNodes.has(ds.name) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                  </button>
                                ) : (
                                  <div style={{ width: 16, flexShrink: 0 }} />
                                )}
                                {/* Icon */}
                                <div style={{
                                  width: 24, height: 24, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                }}>
                                  {hasChildren
                                    ? (expandedNodes.has(ds.name) ? <FolderOpen size={12} strokeWidth={1.5} /> : <Folder size={12} strokeWidth={1.5} />)
                                    : <HardDrive size={12} strokeWidth={1.5} />}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                                      {ds.name.split('/').pop()}
                                    </span>
                                    {ds.readonly && <Lock size={9} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                                    {ds.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td><span className={typeClass}>{typeLabel}</span></td>
                            <td>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                {ds.used}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                {ds.refer}
                              </span>
                            </td>
                            <td>
                              <span className="badge">{ds.compression}</span>
                            </td>
                            <td>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                                {ds.mountpoint && ds.mountpoint !== 'none' ? ds.mountpoint : '—'}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                <button
                                  title="Scrub pool"
                                  onClick={() => handleRewrite(ds.name)}
                                  disabled={rewriteTarget === ds.name}
                                  style={ACT_BTN}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--info)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.3)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                                >
                                  {rewriteTarget === ds.name ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                </button>
                                <button
                                  title="Properties"
                                  onClick={() => setEditTarget(ds)}
                                  style={ACT_BTN}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-mid)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  title="Destroy"
                                  onClick={() => openDelete(ds.name)}
                                  style={ACT_BTN}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ZVOL volumes */}
      {volumes.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-ui)' }}>
            ZVOL Volumes
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {volumes.map((v, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="card"
                style={{ padding: '16px 18px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{v.name}</span>
                  <span className="badge badge-vol">VOL</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[{ label: 'Size', value: v.volsize }, { label: 'Used', value: v.used }].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-ui)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className="progress-track" style={{ height: 4, marginBottom: 4 }}>
                  <div className="progress-fill" style={{
                    width: `${Math.min((parseFloat(v.used) / parseFloat(v.volsize)) * 100, 100) || 0}%`,
                    background: 'var(--info)'
                  }} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
