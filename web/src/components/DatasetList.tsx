import React, { useState, useMemo, useEffect } from 'react';
import { ZFSDataset, ZFSPool } from '../types';
import {
  HardDrive, Plus, Lock, Search, Trash2, X,
  Loader2, XCircle, AlertTriangle, Layers,
  ArrowUp, ArrowDown, RotateCcw,
  ChevronRight, ChevronDown, Folder, FolderOpen, Database, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatBytes } from '../api';
import { useNotifications } from '../context/NotificationContext';
import PageTransition from './PageTransition';

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

/* ── Dataset Settings Popout ─────────────────────────────────────────────────── */
type PropDef = {
  name: string;
  label: string;
  desc: string;
  group: string;
  type: 'toggle' | 'select' | 'text';
  options?: string[];
};

const DATASET_PROP_DEFS: PropDef[] = [
  // Compression & I/O
  { name: 'compression', label: 'Compression',    desc: 'Compression algorithm for new blocks — lz4 is fastest with minimal overhead', group: 'Compression & I/O', type: 'select', options: ['off', 'lz4', 'zstd', 'gzip', 'zle'] },
  { name: 'recordsize',  label: 'Record Size',    desc: 'Suggested block size; tune to workload — 4K–16K for DBs, 128K for media', group: 'Compression & I/O', type: 'select', options: ['512', '1K', '2K', '4K', '8K', '16K', '32K', '64K', '128K', '1M'] },
  { name: 'xattr',       label: 'Extended Attrs', desc: 'Storage method for extended attributes — sa avoids extra znodes on ZFS', group: 'Compression & I/O', type: 'select', options: ['on', 'off', 'sa'] },
  { name: 'sync',        label: 'Sync Mode',      desc: 'Controls fsync() behavior — disabled improves throughput at risk of data loss on crash', group: 'Compression & I/O', type: 'select', options: ['standard', 'always', 'disabled'] },
  // Access
  { name: 'atime',    label: 'Access Time',    desc: 'Update last-access timestamp on every read — disable for better read performance', group: 'Access', type: 'toggle' },
  { name: 'relatime', label: 'Relative Atime', desc: 'Only update atime if older than mtime — compromise between on and off', group: 'Access', type: 'toggle' },
  { name: 'dedup',    label: 'Deduplication',  desc: 'Eliminate duplicate blocks — requires roughly 5 GB RAM per 1 TB of data', group: 'Access', type: 'toggle' },
  { name: 'readonly', label: 'Read-Only',      desc: 'Mount dataset in read-only mode — prevents any writes or modifications', group: 'Access', type: 'toggle' },
  // Quotas
  { name: 'quota',      label: 'Quota',       desc: 'Hard size limit including descendants and snapshots (e.g. 100G)', group: 'Quotas', type: 'text' },
  { name: 'reservation',label: 'Reservation', desc: 'Minimum space guaranteed from pool free space (e.g. 10G)', group: 'Quotas', type: 'text' },
  // Visibility
  { name: 'snapdir', label: 'Snapshot Dir', desc: 'Controls visibility of the .zfs/snapshot directory to regular users', group: 'Visibility', type: 'select', options: ['hidden', 'visible'] },
];

function PopoutPropRow({ def, value, currentValue, onChange }: {
  def: PropDef; value: string; currentValue: string; onChange: (v: string) => void;
}) {
  const changed = value !== currentValue;
  const inputStyle: React.CSSProperties = {
    width: 120, height: 30, padding: '0 8px', flexShrink: 0,
    background: 'var(--bg-elevated)',
    border: `1px solid ${changed ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: changed ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
          {def.label}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 2, lineHeight: 1.4 }}>
          {def.desc}
        </div>
      </div>
      {def.type === 'toggle' ? (
        <button
          onClick={() => onChange(value === 'on' ? 'off' : 'on')}
          style={{
            width: 44, height: 22, borderRadius: 11, flexShrink: 0,
            background: value === 'on' ? 'var(--success)' : 'var(--bg-elevated)',
            border: `1px solid ${value === 'on' ? 'var(--success)' : changed ? 'var(--accent)' : 'var(--border)'}`,
            position: 'relative', cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: value === 'on' ? 22 : 2,
            width: 16, height: 16, borderRadius: 8,
            background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
      ) : def.type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {(def.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="value" style={inputStyle} />
      )}
    </div>
  );
}

function DatasetSettingsPopout({
  datasetName,
  onClose,
  onSaved,
}: {
  datasetName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [props,   setProps]   = useState<Record<string, string>>({});
  const [edits,   setEdits]   = useState<Record<string, string>>({});
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 310);
  };

  const load = () => {
    setLoading(true);
    setError(null);
    api.getDatasetProperties(datasetName)
      .then(res => {
        const map: Record<string, string> = {};
        for (const p of (res.properties || [])) map[p.name] = p.value;
        setProps(map);
        setEdits({ ...map });
      })
      .catch(err => setError(err.message || 'Failed to load properties'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [datasetName]);

  const pendingCount = Object.entries(edits).filter(([k, v]) => v !== (props[k] ?? '')).length;

  const handleSave = async () => {
    const changed = Object.entries(edits).filter(([k, v]) => v !== (props[k] ?? ''));
    if (changed.length === 0) { close(); return; }
    setSaving(true);
    try {
      for (const [k, v] of changed) {
        await api.setDatasetProperty(datasetName, k, v);
      }
      onSaved();
      close();
    } catch (err: any) {
      notify({ type: 'error', title: 'Save Failed', message: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.4)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 401,
        width: 400, maxWidth: '100vw',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 300ms ease',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
              {datasetName.split('/').pop()}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Dataset Settings · {datasetName}
            </div>
          </div>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }} className="no-scrollbar">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
              {[48, 48, 48, 48, 48, 48].map((h, i) => (
                <div key={i} className="skeleton" style={{ height: h, borderRadius: 'var(--radius)' }} />
              ))}
            </div>
          ) : error ? (
            <div style={{ paddingTop: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--danger)', fontFamily: 'var(--font-ui)', marginBottom: 16 }}>{error}</div>
              <button className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
          ) : (
            <div style={{ paddingTop: 8, paddingBottom: 20 }}>
              {Array.from(new Set(DATASET_PROP_DEFS.map(d => d.group))).map(group => (
                <div key={group}>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, marginBottom: 2, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                      {group}
                    </span>
                  </div>
                  {DATASET_PROP_DEFS.filter(d => d.group === group).map(def => (
                    <PopoutPropRow
                      key={def.name}
                      def={def}
                      value={edits[def.name] ?? ''}
                      currentValue={props[def.name] ?? ''}
                      onChange={v => setEdits(e => ({ ...e, [def.name]: v }))}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)', padding: '14px 20px', flexShrink: 0,
          background: 'var(--bg-elevated)',
        }}>
          {edits['compression'] && props['compression'] && edits['compression'] !== props['compression'] && (
            <div style={{
              background: 'rgba(234,179,8,0.06)',
              border: '1px solid rgba(234,179,8,0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              marginBottom: 12,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start'
            }}>
              <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--warning)', fontFamily: 'var(--font-ui)', lineHeight: '1.4' }}>
                <strong>Notice:</strong> Changing compression only affects newly written data. To compress existing files, you should run a <strong>Dataset Rewrite (rebalance)</strong> after saving.
              </span>
            </div>
          )}
          {pendingCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-ui)', marginBottom: 10 }}>
              {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
            </div>
          )}
          <button
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Saving…' : pendingCount > 0 ? `Save ${pendingCount} Change${pendingCount !== 1 ? 's' : ''}` : 'Save Changes'}
          </button>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

export default function DatasetList({ datasets, volumes = [], pools, onRefresh }: DatasetListProps) {
  const { notify } = useNotifications();
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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [rewriteState,  setRewriteState]  = useState<Record<string, boolean>>({});
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const animEnabled = localStorage.getItem('page_animations') !== 'false';

  useEffect(() => {
    setExpandedNodes(new Set(datasets.map(d => d.name)));
  }, [datasets.length]);

  useEffect(() => {
    const poll = () => {
      datasets.forEach(ds => {
        api.getRewriteStatus(ds.name).then(res => {
          setRewriteState(s => ({ ...s, [ds.name]: res.in_progress }));
        }).catch(() => {});
      });
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [datasets]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    notify({ type, title: type === 'success' ? 'Success' : 'Error', message: msg });
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
    setConfirmState({
      title: "Start Dataset Rewrite",
      message: `Are you sure you want to start a ZFS rewrite on dataset "${name}"? This operation sequentially rewrites all blocks to clear fragmentation or defragment the dataset. It cannot be cancelled once started and may severely degrade I/O performance until completion.`,
      onConfirm: async () => {
        setRewriteState(s => ({ ...s, [name]: true }));
        try {
          await api.rewriteDataset(name);
          showToast(`Rewrite started on "${name}"`, 'success');
        } catch (err: any) {
          showToast(err.message || 'Rewrite failed', 'error');
          setRewriteState(s => ({ ...s, [name]: false }));
        }
      }
    });
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
    <PageTransition>
    <div style={{ paddingBottom: 40 }}>
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

      {/* Dataset Settings Popout */}
      {settingsOpenFor && (
        <DatasetSettingsPopout
          datasetName={settingsOpenFor}
          onClose={() => setSettingsOpenFor(null)}
          onSaved={() => { showToast(`Settings saved for ${settingsOpenFor}`, 'success'); onRefresh(); }}
        />
      )}

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
                  <th onClick={() => handleSort('avail')} className={sortField === 'avail' ? 'sort-active' : ''} style={{ cursor: 'pointer' }}>
                    Available {sortField === 'avail' && (sortDir === 'asc' ? <ArrowUp size={10} style={{ display: 'inline' }} /> : <ArrowDown size={10} style={{ display: 'inline' }} />)}
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
                        <td colSpan={8} style={{
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
                      {items.map(({ dataset: ds, depth, hasChildren }, idx) => {
                        const dsType = (ds as any).type || 'filesystem';
                        const typeLabel = dsType === 'volume' ? 'VOL' : dsType === 'snapshot' ? 'SNAP' : 'FS';
                        const typeClass = dsType === 'volume' ? 'badge badge-vol' : dsType === 'snapshot' ? 'badge badge-snap' : 'badge badge-fs';
                        return (
                          <motion.tr
                            key={ds.id}
                            initial={animEnabled ? { opacity: 0, y: -8 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, delay: Math.min(idx, 20) * 30 / 1000 }}
                          >
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
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                                {ds.avail}
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
                                  title="Rewrite Data (rebalance)"
                                  onClick={() => handleRewrite(ds.name)}
                                  disabled={rewriteState[ds.name]}
                                  style={ACT_BTN}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--info)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.3)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                                >
                                  {rewriteState[ds.name] ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                </button>
                                <button
                                  title="Dataset Settings"
                                  onClick={() => setSettingsOpenFor(ds.name)}
                                  style={ACT_BTN}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                                >
                                  <Settings size={12} />
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
                          </motion.tr>
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

      {/* Fancy Confirmation Modal */}
      {confirmState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                <AlertTriangle size={20} />
              </div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{confirmState.title}</h4>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px 0' }}>{confirmState.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmState(null)} style={{ padding: '8px 16px', fontSize: 13 }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { confirmState.onConfirm(); setConfirmState(null); }} style={{ padding: '8px 16px', fontSize: 13, background: 'var(--danger)', borderColor: 'var(--danger)' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
