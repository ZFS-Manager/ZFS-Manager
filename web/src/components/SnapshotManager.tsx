import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 10 }}
        transition={{ duration: 0.25, ease: 'circOut' }}
        className="glass-panel w-full max-w-md p-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-black text-white tracking-tight">{title}</h3>
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
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`fixed top-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl ${
        type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
      }`}
    >
      {type === 'success' ? <CheckCircle size={15} strokeWidth={2.5} /> : <XCircle size={15} strokeWidth={2.5} />}
      <span className="text-[12px] font-black">{msg}</span>
    </motion.div>
  );
}

function buildDefaultSnapName(dataset: string): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  // Replace / with - for the name
  const safeName = dataset.replace(/\//g, '-');
  return `${safeName}-${y}-${m}-${d}`;
}

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
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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
    const fromDatasets = datasets.map(d => d.name);
    return [...new Set([...fromDatasets, ...fromSnapshots])].sort();
  }, [snapshots, datasets]);

  const openCreateFor = (dataset: string) => {
    setCreateDataset(dataset);
    setCreateName(buildDefaultSnapName(dataset));
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createDataset || !createName.trim()) return;
    const fullName = `${createDataset}@${createName.trim()}`;
    setCreating(true);
    try {
      await api.createSnapshot(fullName, createRecursive);
      showToast(`Snapshot "${createName}" created`, 'success');
      setShowCreate(false);
      setCreateName('');
      setCreateRecursive(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create snapshot', 'error');
    } finally {
      setCreating(false);
    }
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
    } finally {
      setDeleting(false);
    }
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
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10">
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Create Snapshot" onClose={() => setShowCreate(false)}>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Dataset</label>
                <select
                  value={createDataset}
                  onChange={e => {
                    setCreateDataset(e.target.value);
                    setCreateName(buildDefaultSnapName(e.target.value));
                  }}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-sky-400/40 transition-all"
                >
                  <option value="" className="bg-[#07090E]">Select dataset...</option>
                  {datasetOptions.map(d => (
                    <option key={d} value={d} className="bg-[#07090E]">{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">
                  Snapshot Name
                  <span className="normal-case font-bold text-slate-700 ml-2">Pool-Dataset-Datum</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. tank-data-2024-04-25"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40 transition-all"
                />
                {createDataset && createName && (
                  <p className="mt-2 text-[10px] font-mono text-sky-400/60">
                    {createDataset}@{createName}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setCreateRecursive(v => !v)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${createRecursive ? 'bg-sky-400' : 'bg-white/[0.06]'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${createRecursive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-[11px] font-bold text-slate-400">Recursive snapshot</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 apple-button apple-button-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createDataset || !createName.trim()}
                  className="flex-1 apple-button apple-button-primary disabled:opacity-40"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
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
          <Modal title="Delete Snapshot" onClose={() => setDeleteTarget(null)}>
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                <AlertTriangle size={20} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-bold text-white mb-1">This cannot be undone.</p>
                  <p className="text-[11px] font-mono text-slate-400 break-all">{deleteTarget}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 apple-button apple-button-secondary">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 apple-button bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {deleting ? 'Deleting...' : 'Delete'}
                  </span>
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
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-bold text-white mb-1">All changes after this snapshot will be lost.</p>
                  <p className="text-[11px] font-mono text-slate-400 break-all">{rollbackTarget}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRollbackTarget(null)} className="flex-1 apple-button apple-button-secondary">Cancel</button>
                <button
                  onClick={handleRollback}
                  disabled={rolling}
                  className="flex-1 apple-button bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
                >
                  {rolling ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {rolling ? 'Rolling back...' : 'Rollback'}
                  </span>
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Main Panel — header with search + create inside */}
      <div className="glass-panel overflow-hidden border-white/[0.02]">
        {/* Panel header */}
        <div className="p-6 border-b border-white/[0.04]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Recovery Points</h2>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">
                {snapshots.length} point-in-time snapshots
              </p>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative group flex-1 md:w-56">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-sky-400 transition-colors" size={13} />
                <input
                  type="text"
                  placeholder="Filter snapshots..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-white/[0.02] border border-white/[0.04] rounded-xl pl-10 pr-4 py-2.5 text-[12px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/30 w-full transition-all"
                />
              </div>
              <button
                onClick={() => {
                  const d = datasetOptions[0] || '';
                  setCreateDataset(d);
                  setCreateName(d ? buildDefaultSnapName(d) : '');
                  setShowCreate(true);
                }}
                className="apple-button apple-button-primary !py-2.5 !px-5 gap-2 whitespace-nowrap"
              >
                <Plus size={14} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-widest">Create</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                {['Snapshot', 'Dataset', 'Used', 'Created', ''].map((h, i) => (
                  <th key={i} className={`px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ${i === 4 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {filtered.map((snap, idx) => {
                const snapName = snap.name?.split('@').pop() || snap.name;
                const datasetName = snap.name?.split('@')[0] || '—';
                const usedBytes = Number(snap.used);

                return (
                  <motion.tr
                    key={snap.name || idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    className="hover:bg-white/[0.01] transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/[0.02] border border-white/[0.04] text-sky-400 rounded-xl flex-shrink-0">
                          <Camera size={13} strokeWidth={2.5} />
                        </div>
                        <span className="text-[13px] font-black text-white group-hover:text-sky-400 transition-colors font-mono">
                          {snapName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-bold text-slate-500 font-mono truncate max-w-[200px] block">
                        {datasetName}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-black text-white/50">
                        {usedBytes > 0 ? formatBytes(usedBytes, 1) : snap.used || '0 B'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock size={11} className="opacity-50" />
                        <span className="text-[10px] font-bold">
                          {snap.creation ? formatUnixTimestamp(snap.creation) : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openCreateFor(datasetName)}
                          title="Create new snapshot for this dataset"
                          className="w-8 h-8 flex items-center justify-center bg-white/[0.01] border border-white/[0.03] rounded-xl hover:text-sky-400 hover:border-sky-400/20 hover:bg-sky-400/5 transition-all"
                        >
                          <Camera size={13} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => setRollbackTarget(snap.name)}
                          title="Rollback to this snapshot"
                          className="w-8 h-8 flex items-center justify-center bg-white/[0.01] border border-white/[0.03] rounded-xl hover:text-amber-400 hover:border-amber-400/20 hover:bg-amber-400/5 transition-all"
                        >
                          <RotateCcw size={13} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(snap.name)}
                          title="Delete snapshot"
                          className="w-8 h-8 flex items-center justify-center bg-white/[0.01] border border-white/[0.03] rounded-xl hover:text-rose-400 hover:border-rose-400/20 hover:bg-rose-400/5 transition-all"
                        >
                          <Trash2 size={13} strokeWidth={2.5} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Camera size={40} className="text-white/5 mb-4" strokeWidth={1} />
            <h3 className="text-lg font-black text-white mb-2">
              {search ? 'No matching snapshots' : 'No Recovery Points'}
            </h3>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest max-w-sm">
              {search ? 'Try a different search term.' : 'Create your first snapshot to begin tracking recovery points.'}
            </p>
            {!search && (
              <button
                onClick={() => {
                  const d = datasetOptions[0] || '';
                  setCreateDataset(d);
                  setCreateName(d ? buildDefaultSnapName(d) : '');
                  setShowCreate(true);
                }}
                className="mt-6 apple-button apple-button-primary !px-8 !py-3"
              >
                <Plus size={14} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-widest">Create First Snapshot</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
