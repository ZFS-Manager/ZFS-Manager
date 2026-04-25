import React, { useState, useMemo, useEffect } from 'react';
import { ZFSDataset, ZFSPool } from '../types';
import {
  HardDrive, Plus, Lock, Search, Trash2, X,
  Loader2, CheckCircle, XCircle, AlertTriangle, Layers,
  ArrowUpDown, ArrowUp, ArrowDown, Pencil, Save, RotateCcw
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

function Modal({ title, onClose, children, maxWidth = 'max-w-md' }: {
  title: string; onClose: () => void; children: React.ReactNode; maxWidth?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        transition={{ duration: 0.25, ease: 'circOut' }}
        className={`glass-panel w-full ${maxWidth} p-8 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed top-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl ${
        type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
      }`}
    >
      {type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
      <span className="text-[12px] font-black">{msg}</span>
    </motion.div>
  );
}

function UsageBar({ used, avail }: { used: string; avail: string }) {
  const parse = (s: string) => {
    const m = s.match(/([\d.]+)\s*(\w+)/);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    if (u.startsWith('T')) return v * 1e12;
    if (u.startsWith('G')) return v * 1e9;
    if (u.startsWith('M')) return v * 1e6;
    if (u.startsWith('K')) return v * 1e3;
    return v;
  };
  const u = parse(used), a = parse(avail);
  const pct = u + a > 0 ? (u / (u + a)) * 100 : 0;
  return (
    <div className="space-y-1.5 min-w-[120px]">
      <div className="flex justify-between">
        <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">Used</span>
        <span className="text-[9px] font-black text-white/50">{used}</span>
      </div>
      <div className="h-1 bg-white/[0.03] rounded-full overflow-hidden border border-white/[0.02]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'circOut' }}
          className={`h-full rounded-full ${pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-400' : 'bg-sky-400'}`}
        />
      </div>
    </div>
  );
}

// ── Quota Parser / Builder ─────────────────────────────────────────────────────
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

// ── Dataset Properties Modal ───────────────────────────────────────────────────
interface PropValues {
  compression: string;
  quotaNum: string;
  quotaUnit: QuotaUnit;
  atime: string;
  dedup: string;
  readonly: string;
}

function PropertiesModal({ dataset, onClose, onSaved }: {
  dataset: ZFSDataset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [props, setProps]       = useState<PropValues>({ compression: 'lz4', quotaNum: '', quotaUnit: 'G', atime: 'on', dedup: 'off', readonly: 'off' });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.getDatasetProperties(dataset.name, 'compression,quota,atime,dedup,readonly')
      .then(res => {
        const map: Record<string, string> = {};
        for (const p of (res.properties || [])) map[p.name] = p.value;
        const { num, unit } = parseQuotaValue(map['quota'] || '');
        setProps({
          compression: map['compression'] || 'lz4',
          quotaNum:    num,
          quotaUnit:   unit,
          atime:       map['atime'] || 'on',
          dedup:       map['dedup'] || 'off',
          readonly:    map['readonly'] || 'off',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dataset.name]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const quotaStr = buildQuotaString(props.quotaNum, props.quotaUnit);
      const ops: Promise<any>[] = [
        api.setDatasetProperty(dataset.name, 'compression', props.compression),
        api.setDatasetProperty(dataset.name, 'atime', props.atime),
        api.setDatasetProperty(dataset.name, 'dedup', props.dedup),
        api.setDatasetProperty(dataset.name, 'readonly', props.readonly),
        quotaStr
          ? api.setDatasetProperty(dataset.name, 'quota', quotaStr)
          : api.setDatasetProperty(dataset.name, 'quota', 'none'),
      ];
      await Promise.all(ops);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save properties');
    } finally {
      setSaving(false);
    }
  };

  const handleRewrite = async () => {
    setRewriting(true);
    try {
      await api.rewriteDataset(dataset.name);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Rewrite failed');
    } finally {
      setRewriting(false);
    }
  };

  const Toggle = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div
      onClick={() => onChange(value === 'on' ? 'off' : 'on')}
      className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${value === 'on' ? 'bg-sky-400' : 'bg-white/[0.06]'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value === 'on' ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </div>
  );

  return (
    <Modal title={`Properties — ${dataset.name.split('/').pop()}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="text-[9px] font-mono text-slate-600 -mt-4 mb-2">{dataset.name}</p>

        {loading ? (
          <div className="flex items-center gap-3 py-6 justify-center text-slate-600">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[12px] font-bold">Loading properties...</span>
          </div>
        ) : (
          <>
            {/* Compression */}
            <div>
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Compression</label>
              <select
                value={props.compression}
                onChange={e => setProps(p => ({ ...p, compression: e.target.value }))}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-sky-400/40 transition-all"
              >
                {['off', 'lz4', 'gzip', 'gzip-1', 'gzip-6', 'gzip-9', 'zstd', 'zstd-fast'].map(c => (
                  <option key={c} value={c} className="bg-[#07090E]">{c}</option>
                ))}
              </select>
            </div>

            {/* Quota with unit selector */}
            <div>
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">
                Quota
                <span className="ml-2 normal-case font-bold text-slate-700">(leer = kein Quota / none)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="z.B. 10"
                  value={props.quotaNum}
                  onChange={e => setProps(p => ({ ...p, quotaNum: e.target.value }))}
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-[13px] text-white font-mono placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40 transition-all"
                />
                <select
                  value={props.quotaUnit}
                  onChange={e => setProps(p => ({ ...p, quotaUnit: e.target.value as QuotaUnit }))}
                  className="w-24 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-sky-400/40 transition-all"
                >
                  <option value="M" className="bg-[#07090E]">MB</option>
                  <option value="G" className="bg-[#07090E]">GB</option>
                  <option value="T" className="bg-[#07090E]">TB</option>
                </select>
              </div>
              {props.quotaNum && (
                <p className="text-[9px] font-mono text-sky-400/60 mt-1">
                  → quota={buildQuotaString(props.quotaNum, props.quotaUnit)}
                </p>
              )}
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-4">
              {([
                { key: 'atime',    label: 'Access Time (atime)',  desc: 'Track last access time' },
                { key: 'dedup',    label: 'Deduplication',        desc: 'Data deduplication (CPU-intensive)' },
                { key: 'readonly', label: 'Read-only',            desc: 'Prevent write access' },
              ] as { key: keyof PropValues; label: string; desc: string }[]).map(({ key, label, desc }) => (
                <div key={key} className={`p-4 rounded-xl bg-white/[0.02] border border-white/[0.03] ${key === 'atime' ? 'col-span-2 sm:col-span-1' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-slate-300">{label}</span>
                    <Toggle value={props[key] as string} onChange={v => setProps(p => ({ ...p, [key]: v }))} />
                  </div>
                  <p className="text-[9px] text-slate-700">{desc}</p>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-3 p-3 bg-rose-500/8 rounded-xl border border-rose-500/15">
                <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] font-bold text-rose-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleRewrite}
                disabled={rewriting}
                title="Run scrub on parent pool to rewrite all data blocks"
                className="apple-button bg-sky-400/8 border border-sky-400/15 text-sky-400 hover:bg-sky-400/15 disabled:opacity-40 gap-2"
              >
                {rewriting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                <span className="text-[9px] font-black uppercase tracking-widest">
                  {rewriting ? 'Rewriting...' : 'Rewrite'}
                </span>
              </button>
              <button onClick={onClose} className="flex-1 apple-button apple-button-secondary">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 apple-button apple-button-primary disabled:opacity-40 gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {saving ? 'Saving...' : 'Save'}
                </span>
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

export default function DatasetList({ datasets, volumes = [], pools, onRefresh }: DatasetListProps) {
  const [search,       setSearch]      = useState('');
  const [sortField,    setSortField]   = useState<SortField>('name');
  const [sortDir,      setSortDir]     = useState<SortDir>('asc');
  const [showCreate,   setShowCreate]  = useState(false);
  const [newName,      setNewName]     = useState('');
  const [parentPool,   setParentPool]  = useState('');
  const [creating,     setCreating]    = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [canForce,     setCanForce]     = useState(false);
  const [deleting,     setDeleting]    = useState(false);
  const [editTarget,   setEditTarget]  = useState<ZFSDataset | null>(null);
  const [rewriteTarget, setRewriteTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'name' ? 'asc' : 'desc'); }
  };

  const filtered = useMemo(() => {
    const list = datasets.filter(ds => ds.name.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'used') cmp = (a._usedBytes ?? 0) - (b._usedBytes ?? 0);
      else if (sortField === 'avail') cmp = (a._availBytes ?? 0) - (b._availBytes ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [datasets, search, sortField, sortDir]);

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
    } finally {
      setCreating(false);
    }
  };

  const openDelete = (name: string) => {
    setDeleteTarget(name);
    setDeleteError('');
    setCanForce(false);
  };

  const handleDelete = async (force = false) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteDataset(deleteTarget, force, force);
      showToast('Dataset deleted', 'success');
      setDeleteTarget(null);
      setDeleteError('');
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Failed to delete dataset';
      setDeleteError(msg);
      const msgLow = msg.toLowerCase();
      setCanForce(
        msgLow.includes('busy') ||
        msgLow.includes('children') ||
        msgLow.includes('dependent') ||
        msgLow.includes('mount')
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleRewrite = async (name: string) => {
    setRewriteTarget(name);
    try {
      await api.rewriteDataset(name);
      showToast(`Rewrite started on pool "${name.split('/')[0]}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Rewrite failed', 'error');
    } finally {
      setRewriteTarget(null);
    }
  };

  return (
    <div className="max-w-[1300px] mx-auto pb-10 space-y-8">
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Create Dataset" onClose={() => setShowCreate(false)}>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Parent Pool / Dataset</label>
                <select
                  value={parentPool}
                  onChange={e => setParentPool(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-sky-400/40 transition-all"
                >
                  <option value="" className="bg-[#07090E]">Select parent...</option>
                  {parentOptions.map(o => <option key={o} value={o} className="bg-[#07090E]">{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Dataset Name</label>
                <input
                  type="text" placeholder="e.g. mydata"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40 transition-all"
                />
                {parentPool && newName && (
                  <p className="mt-2 text-[10px] font-mono text-sky-400/60">{parentPool}/{newName}</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 apple-button apple-button-secondary">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !parentPool || !newName.trim()}
                  className="flex-1 apple-button apple-button-primary disabled:opacity-40"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {creating ? 'Creating...' : 'Create'}
                  </span>
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
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                <AlertTriangle size={20} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-bold text-white mb-1">
                    This will permanently destroy the dataset and all data.
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 break-all">{deleteTarget}</p>
                </div>
              </div>

              {deleteError && (
                <div className="flex items-start gap-3 p-3 bg-rose-500/8 rounded-xl border border-rose-500/15">
                  <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-bold text-rose-300">{deleteError}</p>
                    {canForce && (
                      <p className="text-[10px] text-rose-400/70 mt-1">
                        Dataset has open file handles or children. Use Force Delete to override.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 apple-button apple-button-secondary">
                  Cancel
                </button>
                {canForce && (
                  <button
                    onClick={() => handleDelete(true)}
                    disabled={deleting}
                    className="apple-button bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40 gap-2"
                  >
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                    <span className="text-[10px] font-black uppercase tracking-widest">Force</span>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(false)}
                  disabled={deleting}
                  className="flex-1 apple-button bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {deleting ? 'Deleting...' : 'Destroy'}
                  </span>
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
            onSaved={() => {
              showToast('Properties saved', 'success');
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      {/* Main Panel */}
      <div className="glass-panel overflow-hidden border-white/[0.02]">
        <div className="p-6 flex flex-col gap-4 border-b border-white/[0.04]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Storage Volumes</h2>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">
                {datasets.length} datasets · {volumes.length} zvols
              </p>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative group flex-1 md:w-56">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-sky-400 transition-colors" size={13} />
                <input
                  type="text"
                  placeholder="Search datasets..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-white/[0.02] border border-white/[0.04] rounded-xl pl-10 pr-4 py-2.5 text-[12px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/30 w-full transition-all"
                />
              </div>
              <button
                onClick={() => { setShowCreate(true); setParentPool(pools[0]?.name || ''); }}
                className="apple-button apple-button-primary !py-2.5 !px-5 whitespace-nowrap gap-2"
              >
                <Plus size={14} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-widest">Add Dataset</span>
              </button>
            </div>
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest mr-1">Sort by:</span>
            {([
              { field: 'name' as SortField,  label: 'Name' },
              { field: 'used' as SortField,  label: 'Size Used' },
              { field: 'avail' as SortField, label: 'Available' },
            ]).map(({ field, label }) => {
              const active = sortField === field;
              const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                    active
                      ? 'bg-sky-400/12 border-sky-400/25 text-sky-400'
                      : 'bg-white/[0.02] border-white/[0.04] text-slate-600 hover:text-slate-400 hover:border-white/[0.08]'
                  }`}
                >
                  <Icon size={11} strokeWidth={2.5} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 space-y-2">
          {filtered.map((ds, i) => (
            <motion.div
              key={ds.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.01] rounded-2xl border border-white/[0.02] hover:bg-white/[0.025] hover:border-white/[0.05] transition-all group"
            >
              <div className="flex items-center gap-4 mb-3 lg:mb-0">
                <div className="w-11 h-11 bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-center justify-center text-slate-600 group-hover:text-sky-400 group-hover:border-sky-400/15 transition-all flex-shrink-0">
                  <HardDrive size={18} strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-white truncate group-hover:text-sky-400 transition-colors">
                      {ds.name.split('/').pop()}
                    </p>
                    {ds.readonly && (
                      <div className="p-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        <Lock size={9} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.15em] mt-0.5 truncate">{ds.name}</p>
                  {ds.mountpoint && ds.mountpoint !== 'none' && (
                    <p className="text-[9px] text-slate-700 font-mono mt-0.5 truncate">{ds.mountpoint}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 lg:gap-6">
                <div className="min-w-[55px]">
                  <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1">Compress</p>
                  <span className="px-2 py-0.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[10px] font-black text-white/50 uppercase">
                    {ds.compression}
                  </span>
                </div>

                <div className="min-w-[45px]">
                  <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1">Dedup</p>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                    ds.dedup === 'on'
                      ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15'
                      : 'bg-white/[0.02] text-slate-600 border-white/[0.04]'
                  }`}>
                    {ds.dedup}
                  </span>
                </div>

                <UsageBar used={ds.used} avail={ds.avail} />

                <div className="min-w-[55px]">
                  <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1">Available</p>
                  <span className="text-[11px] font-black text-emerald-400">{ds.avail}</span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRewrite(ds.name)}
                    title="Rewrite (scrub parent pool)"
                    disabled={rewriteTarget === ds.name}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.01] border border-white/[0.02] text-slate-600 hover:text-sky-400 hover:border-sky-400/20 hover:bg-sky-400/5 transition-all disabled:opacity-50"
                  >
                    {rewriteTarget === ds.name
                      ? <Loader2 size={12} className="animate-spin" />
                      : <RotateCcw size={12} strokeWidth={2.5} />
                    }
                  </button>
                  <button
                    onClick={() => setEditTarget(ds)}
                    title="Edit properties"
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.01] border border-white/[0.02] text-slate-600 hover:text-indigo-400 hover:border-indigo-400/20 hover:bg-indigo-400/5 transition-all"
                  >
                    <Pencil size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => openDelete(ds.name)}
                    title="Delete dataset"
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.01] border border-white/[0.02] text-slate-600 hover:text-rose-400 hover:border-rose-400/20 hover:bg-rose-400/5 transition-all"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <Layers size={36} className="text-white/5 mb-4" strokeWidth={1} />
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                {search ? 'No matching datasets' : 'No datasets found'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ZVOL volumes */}
      {volumes.length > 0 && (
        <div>
          <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 px-1">ZVOL Volumes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {volumes.map((v, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel p-5 border-white/[0.02] hover:bg-white/[0.02] transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="font-black text-white text-sm truncate max-w-[160px]">{v.name}</div>
                  <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest bg-sky-400/8 border border-sky-400/15 px-2 py-0.5 rounded-lg">
                    Volume
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[{ label: 'Size', value: v.volsize }, { label: 'Used', value: v.used }].map((s, j) => (
                    <div key={j}>
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-0.5">{s.label}</p>
                      <p className="text-sm font-black text-white">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRewrite(v.name)}
                    title="Rewrite (scrub parent pool)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black text-sky-400 bg-sky-400/8 border border-sky-400/15 hover:bg-sky-400/15 transition-all uppercase tracking-widest"
                  >
                    <RotateCcw size={11} />
                    Rewrite
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
