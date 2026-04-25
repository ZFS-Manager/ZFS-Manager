import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, RefreshCw, ShieldCheck, ChevronDown,
  CheckCircle, XCircle, Loader2, Plus, Trash2, AlertTriangle, X,
  HardDrive, Zap, Expand, RotateCcw, ChevronRight, Monitor,
  Activity, Info, Download, ArrowLeftRight, Cpu
} from 'lucide-react';
import { ZFSPool } from '../types';
import { api, formatBytes } from '../api';

interface StoragePoolsProps {
  pools: ZFSPool[];
  onRefresh: () => void;
}

type ScrubState = 'idle' | 'running' | 'success' | 'error';
type VdevType = 'stripe' | 'mirror' | 'raidz1' | 'raidz2' | 'raidz3';

interface ScrubProgress {
  inProgress: boolean;
  done: boolean;
  progress: number;
  timeRemaining: string;
  scan: string;
}

const VDEV_INFO: Record<VdevType, { min: number; label: string; desc: string; color: string }> = {
  stripe:  { min: 1, label: 'Stripe',   desc: 'Max performance, no redundancy',             color: 'text-rose-400 border-rose-400/30 bg-rose-400/8' },
  mirror:  { min: 2, label: 'Mirror',   desc: 'Full redundancy, survives 1 disk loss',       color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/8' },
  raidz1:  { min: 3, label: 'RAIDZ-1',  desc: 'Single parity, min 3 devices',               color: 'text-sky-400 border-sky-400/30 bg-sky-400/8' },
  raidz2:  { min: 4, label: 'RAIDZ-2',  desc: 'Double parity, min 4 devices',               color: 'text-indigo-400 border-indigo-400/30 bg-indigo-400/8' },
  raidz3:  { min: 5, label: 'RAIDZ-3',  desc: 'Triple parity, min 5 devices',               color: 'text-violet-400 border-violet-400/30 bg-violet-400/8' },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      className={`fixed top-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl ${
        type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
      }`}
    >
      {type === 'success' ? <CheckCircle size={16} strokeWidth={2.5} /> : <XCircle size={16} strokeWidth={2.5} />}
      <span className="text-[12px] font-black">{msg}</span>
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100 text-lg leading-none">&times;</button>
    </motion.div>
  );
}

// ── Device Picker ─────────────────────────────────────────────────────────────
function DevicePicker({ onSelect, onClose }: { onSelect: (path: string) => void; onClose: () => void }) {
  const [disks, setDisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDisks()
      .then(res => setDisks(res.blockdevices || []))
      .catch(() => setDisks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        transition={{ duration: 0.22, ease: 'circOut' }}
        className="glass-panel w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-base font-black text-white">Available Block Devices</h4>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">lsblk output</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white">
            <X size={15} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center text-slate-600">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[12px] font-bold">Scanning devices...</span>
          </div>
        ) : disks.length === 0 ? (
          <div className="py-8 text-center">
            <Monitor size={32} className="text-white/5 mx-auto mb-3" strokeWidth={1} />
            <p className="text-[11px] font-bold text-slate-600">No block devices found</p>
            <p className="text-[10px] text-slate-700 mt-1">Enter device path manually</p>
          </div>
        ) : (
          <div className="space-y-2">
            {disks.map((disk, i) => (
              <button
                key={i}
                onClick={() => { onSelect(`/dev/${disk.name}`); onClose(); }}
                className="w-full flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-sky-400/8 hover:border-sky-400/20 transition-all text-left group"
              >
                <div className="w-9 h-9 bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-center justify-center text-slate-600 group-hover:text-sky-400 flex-shrink-0">
                  <HardDrive size={16} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-black text-white font-mono">/dev/{disk.name}</span>
                    <span className="text-[10px] font-black text-sky-400 ml-2">{formatBytes(disk.size, 1)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {disk.model && <span className="text-[9px] font-bold text-slate-600 truncate">{disk.model}</span>}
                    {disk.tran && <span className="text-[9px] font-black text-slate-700 uppercase bg-white/[0.02] px-1.5 py-0.5 rounded">{disk.tran}</span>}
                    <span className="text-[9px] font-bold text-slate-700">{disk.rota ? 'HDD' : 'SSD'}</span>
                  </div>
                </div>
                <ChevronRight size={12} className="text-slate-700 group-hover:text-sky-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── SMART Data Modal ──────────────────────────────────────────────────────────
function SmartModal({ device, onClose }: { device: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSmartData(device)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [device]);

  const passed = data?.smart_status?.passed;
  const temp = data?.temperature?.current;
  const hours = data?.power_on_time?.hours;
  const attrs = data?.ata_smart_attributes?.table || [];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        transition={{ duration: 0.22, ease: 'circOut' }}
        className="glass-panel w-full max-w-lg p-6 shadow-2xl overflow-y-auto max-h-[80vh] no-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-base font-black text-white">SMART Data</h4>
            <p className="text-[10px] font-mono text-slate-600 mt-0.5">{device}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white">
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center text-slate-600">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[12px] font-bold">Reading SMART data...</span>
          </div>
        ) : !data || passed === null ? (
          <div className="py-8 text-center">
            <Activity size={32} className="text-white/5 mx-auto mb-3" strokeWidth={1} />
            <p className="text-[11px] font-bold text-slate-600">No SMART data available</p>
            <p className="text-[10px] text-slate-700 mt-1">smartctl not installed or device not supported</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className={`p-3 rounded-xl border text-center ${passed ? 'bg-emerald-400/8 border-emerald-400/20' : 'bg-rose-400/8 border-rose-400/20'}`}>
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Status</p>
                <p className={`text-[13px] font-black ${passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {passed ? 'PASSED' : 'FAILED'}
                </p>
              </div>
              {temp !== undefined && (
                <div className="p-3 rounded-xl border bg-white/[0.02] border-white/[0.04] text-center">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Temp</p>
                  <p className={`text-[13px] font-black ${temp > 55 ? 'text-rose-400' : temp > 45 ? 'text-amber-400' : 'text-white'}`}>
                    {temp}°C
                  </p>
                </div>
              )}
              {hours !== undefined && (
                <div className="p-3 rounded-xl border bg-white/[0.02] border-white/[0.04] text-center">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Power-On</p>
                  <p className="text-[13px] font-black text-white">
                    {hours >= 8760 ? `${(hours / 8760).toFixed(1)}y` : `${(hours / 24).toFixed(0)}d`}
                  </p>
                </div>
              )}
            </div>

            {attrs.length > 0 && (
              <div>
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-2">Attributes</p>
                <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
                  {attrs.slice(0, 12).map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.01] border border-white/[0.02]">
                      <span className="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">{a.name}</span>
                      <span className={`text-[10px] font-black ml-2 ${a.thresh > 0 && a.value <= a.thresh ? 'text-rose-400' : 'text-white/60'}`}>
                        {a.raw?.value ?? a.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Replace Disk Modal ────────────────────────────────────────────────────────
function ReplaceDiskModal({
  poolName, oldDisk, onClose, onSuccess
}: { poolName: string; oldDisk: string; onClose: () => void; onSuccess: () => void }) {
  const [newDisk, setNewDisk] = useState('');
  const [force, setForce] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const handleReplace = async () => {
    if (!newDisk.trim()) { setError('New device path is required'); return; }
    setReplacing(true); setError('');
    try {
      await api.replaceDisk(poolName, oldDisk, newDisk.trim(), force);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Replace failed');
    } finally {
      setReplacing(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {showPicker && <DevicePicker onSelect={p => setNewDisk(p)} onClose={() => setShowPicker(false)} />}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
          transition={{ duration: 0.25, ease: 'circOut' }}
          className="glass-panel w-full max-w-md p-8 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">Replace Disk</h3>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                zpool replace {poolName}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-5">
            <div className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/15">
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Replacing</p>
              <p className="text-[12px] font-mono text-white/80">{oldDisk}</p>
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">New Disk</label>
              <div className="flex gap-2">
                <input
                  type="text" placeholder="/dev/sdb"
                  value={newDisk} onChange={e => setNewDisk(e.target.value)}
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white font-mono placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40"
                />
                <button
                  onClick={() => setShowPicker(true)}
                  className="px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-slate-500 hover:text-sky-400 hover:border-sky-400/30 transition-all"
                >
                  <HardDrive size={15} />
                </button>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setForce(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${force ? 'bg-amber-400' : 'bg-white/[0.06]'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${force ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[10px] font-bold text-slate-400">Force replace (-f)</span>
            </label>

            {error && (
              <div className="flex items-start gap-3 p-3 bg-rose-500/8 rounded-xl border border-rose-500/15">
                <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] font-bold text-rose-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 apple-button apple-button-secondary">Cancel</button>
              <button
                onClick={handleReplace}
                disabled={replacing || !newDisk.trim()}
                className="flex-1 apple-button apple-button-primary disabled:opacity-40 gap-2"
              >
                {replacing ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {replacing ? 'Replacing...' : 'Replace'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Import Pool Modal ─────────────────────────────────────────────────────────
function ImportPoolModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [importable, setImportable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolName, setPoolName] = useState('');
  const [dir, setDir] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getImportablePools()
      .then(res => setImportable(res.pools || []))
      .catch(() => setImportable([]))
      .finally(() => setLoading(false));
  }, []);

  const handleImport = async () => {
    const name = poolName.trim();
    if (!name) { setError('Pool name is required'); return; }
    setImporting(true); setError('');
    try {
      await api.importPool(name, dir.trim() || undefined);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
        transition={{ duration: 0.25, ease: 'circOut' }}
        className="glass-panel w-full max-w-md p-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">Import Pool</h3>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">zpool import</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Importable pools */}
          {loading ? (
            <div className="flex items-center gap-3 py-4 justify-center text-slate-600">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[11px] font-bold">Scanning for importable pools...</span>
            </div>
          ) : importable.length > 0 ? (
            <div>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Detected Pools</p>
              <div className="space-y-2">
                {importable.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPoolName(p.name)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                      poolName === p.name
                        ? 'bg-sky-400/10 border-sky-400/25'
                        : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08]'
                    }`}
                  >
                    <div>
                      <span className="text-[13px] font-black text-white">{p.name}</span>
                      {p.id && <span className="text-[9px] font-mono text-slate-600 ml-2">{p.id}</span>}
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                      p.state === 'ONLINE'
                        ? 'bg-emerald-400/8 text-emerald-400 border-emerald-400/15'
                        : 'bg-amber-400/8 text-amber-400 border-amber-400/15'
                    }`}>{p.state || 'UNKNOWN'}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <Database size={28} className="text-white/5 mx-auto mb-2" strokeWidth={1} />
              <p className="text-[10px] font-bold text-slate-600">No importable pools detected</p>
            </div>
          )}

          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Pool Name</label>
            <input
              type="text" placeholder="e.g. tank"
              value={poolName} onChange={e => setPoolName(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">
              Search Directory <span className="normal-case font-bold text-slate-700 ml-1">(optional)</span>
            </label>
            <input
              type="text" placeholder="/mnt/disk1 or /dev/disk/by-id/..."
              value={dir} onChange={e => setDir(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white font-mono placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40"
            />
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3 bg-rose-500/8 rounded-xl border border-rose-500/15">
              <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] font-bold text-rose-300">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 apple-button apple-button-secondary">Cancel</button>
            <button
              onClick={handleImport}
              disabled={importing || !poolName.trim()}
              className="flex-1 apple-button apple-button-primary disabled:opacity-40 gap-2"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {importing ? 'Importing...' : 'Import Pool'}
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Expand Pool Modal ─────────────────────────────────────────────────────────
function ExpandPoolModal({
  poolName, onClose, onSuccess
}: { poolName: string; onClose: () => void; onSuccess: () => void }) {
  const [disk, setDisk] = useState('');
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const handleExpand = async () => {
    if (!disk.trim()) { setError('Device path is required'); return; }
    setExpanding(true); setError('');
    try {
      await api.expandPool(poolName, disk.trim());
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Expand failed');
    } finally {
      setExpanding(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {showPicker && <DevicePicker onSelect={p => setDisk(p)} onClose={() => setShowPicker(false)} />}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
          transition={{ duration: 0.25, ease: 'circOut' }}
          className="glass-panel w-full max-w-md p-8 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">Expand Pool</h3>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                zpool online -e {poolName} &lt;disk&gt;
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-5">
            <div>
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Device / Disk Path</label>
              <div className="flex gap-2">
                <input
                  type="text" placeholder="/dev/sda"
                  value={disk} onChange={e => setDisk(e.target.value)}
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white font-mono placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40"
                />
                <button
                  onClick={() => setShowPicker(true)}
                  className="px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-slate-500 hover:text-sky-400 hover:border-sky-400/30 transition-all"
                >
                  <HardDrive size={15} />
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-3 p-3 bg-rose-500/8 rounded-xl border border-rose-500/15">
                <XCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] font-bold text-rose-300">{error}</p>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 apple-button apple-button-secondary">Cancel</button>
              <button
                onClick={handleExpand}
                disabled={expanding || !disk.trim()}
                className="flex-1 apple-button apple-button-primary disabled:opacity-40 gap-2"
              >
                {expanding ? <Loader2 size={14} className="animate-spin" /> : <Expand size={14} />}
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {expanding ? 'Expanding...' : 'Expand'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Create Pool Modal ─────────────────────────────────────────────────────────
function CreatePoolModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (name: string) => void }) {
  const [poolName, setPoolName] = useState('');
  const [vdevType, setVdevType] = useState<VdevType>('mirror');
  const [devices, setDevices]   = useState<string[]>(['', '']);
  const [ashift, setAshift]     = useState('12');
  const [force, setForce]       = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<number | null>(null);

  const info        = VDEV_INFO[vdevType];
  const validDevices = devices.filter(d => d.trim());
  const minMet      = validDevices.length >= info.min;

  const addDevice    = () => setDevices(d => [...d, '']);
  const removeDevice = (i: number) => setDevices(d => d.filter((_, j) => j !== i));
  const setDevice    = (i: number, val: string) => setDevices(d => d.map((v, j) => j === i ? val : v));

  const openPickerFor = (idx: number) => { setPickerTarget(idx); setShowPicker(true); };
  const handlePickerSelect = (path: string) => {
    if (pickerTarget !== null) setDevice(pickerTarget, path);
    else setDevices(d => [...d, path]);
  };

  const buildVdevs   = (): string[] => vdevType === 'stripe' ? validDevices : [vdevType, ...validDevices];
  const buildOptions = (): string[] => {
    const opts: string[] = [];
    if (ashift && ashift !== '0') opts.push('-o', `ashift=${ashift}`);
    if (force) opts.push('-f');
    return opts;
  };

  const preview = ['zpool create', ...buildOptions(), poolName || '<pool-name>', ...buildVdevs().map(d => d || '<device>')].join(' ');

  const handleCreate = async () => {
    setError('');
    if (!poolName.trim()) { setError('Pool name is required'); return; }
    if (validDevices.length < info.min) {
      setError(`${info.label} requires at least ${info.min} device(s)`);
      return;
    }
    setCreating(true);
    try {
      await api.createPool(poolName.trim(), buildVdevs(), buildOptions());
      onSuccess(poolName.trim());
    } catch (err: any) {
      setError(err.message || 'Pool creation failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {showPicker && (
          <DevicePicker
            onSelect={path => { handlePickerSelect(path); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
          transition={{ duration: 0.25, ease: 'circOut' }}
          className="glass-panel w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-7">
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">Create ZFS Pool</h3>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">zpool create</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Pool Name</label>
              <input
                type="text" placeholder="e.g. tank, storage, data"
                value={poolName}
                onChange={e => setPoolName(e.target.value.replace(/[^a-zA-Z0-9_\-:.]/g, ''))}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-white placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40 transition-all"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">VDEV Type</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {(Object.keys(VDEV_INFO) as VdevType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setVdevType(t);
                      const min = VDEV_INFO[t].min;
                      setDevices(d => d.length < min ? [...d, ...Array(min - d.length).fill('')] : d);
                    }}
                    className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      vdevType === t
                        ? 'bg-sky-400/15 border-sky-400/30 text-sky-400'
                        : 'bg-white/[0.02] border-white/[0.04] text-slate-600 hover:text-slate-300'
                    }`}
                  >
                    {VDEV_INFO[t].label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold text-slate-600 mt-2">{info.desc}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Devices / Paths</label>
                <button
                  onClick={() => { setPickerTarget(null); setShowPicker(true); }}
                  className="flex items-center gap-1.5 text-[9px] font-black text-sky-400/70 hover:text-sky-400 uppercase tracking-widest transition-colors"
                >
                  <HardDrive size={10} />
                  Browse Disks
                </button>
              </div>
              <div className="space-y-2">
                {devices.map((dev, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text" placeholder={`/dev/sdX`}
                      value={dev} onChange={e => setDevice(i, e.target.value)}
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-[12px] text-white font-mono placeholder:text-slate-700 focus:outline-none focus:border-sky-400/40 transition-all"
                    />
                    <button
                      onClick={() => openPickerFor(i)}
                      className="w-9 h-10 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/[0.04] text-slate-600 hover:text-sky-400 hover:border-sky-400/20 transition-all flex-shrink-0"
                    >
                      <HardDrive size={12} />
                    </button>
                    {devices.length > info.min && (
                      <button
                        onClick={() => removeDevice(i)}
                        className="w-9 h-10 flex items-center justify-center rounded-xl bg-rose-500/8 border border-rose-500/15 text-rose-400 hover:bg-rose-500/15 transition-all flex-shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addDevice} className="mt-2 flex items-center gap-2 text-[10px] font-black text-sky-400 hover:text-sky-300 transition-colors">
                <Plus size={13} strokeWidth={3} />
                Add device
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">Ashift</label>
                <select
                  value={ashift} onChange={e => setAshift(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-[12px] text-white focus:outline-none focus:border-sky-400/40"
                >
                  <option value="9"  className="bg-[#07090E]">9 — 512B (HDD legacy)</option>
                  <option value="12" className="bg-[#07090E]">12 — 4K (SSD/modern)</option>
                  <option value="13" className="bg-[#07090E]">13 — 8K</option>
                  <option value="0"  className="bg-[#07090E]">Auto-detect</option>
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForce(v => !v)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${force ? 'bg-amber-400' : 'bg-white/[0.06]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${force ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">Force (-f)</span>
                </label>
                {force && <p className="text-[9px] text-amber-400 mt-1">Overwrites existing data</p>}
              </div>
            </div>

            <div>
              <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">Command preview</p>
              <div className="bg-black/40 rounded-xl px-4 py-3 border border-white/[0.04]">
                <code className="text-[11px] font-mono text-sky-300/80 break-all">{preview}</code>
              </div>
            </div>

            {!minMet && validDevices.length > 0 && (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={14} />
                <span className="text-[11px] font-bold">
                  {info.label} needs at least {info.min} devices ({validDevices.length} provided)
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 p-3 bg-rose-500/8 rounded-xl border border-rose-500/15">
                <XCircle size={15} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] font-bold text-rose-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 apple-button apple-button-secondary">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !poolName.trim() || !minMet}
                className="flex-1 apple-button apple-button-primary disabled:opacity-40 gap-2"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {creating ? 'Creating...' : 'Create Pool'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Pool Action Dropdown ───────────────────────────────────────────────────────
function PoolMenu({
  pool, onShowStatus, onResilver, onExpand, onReplaceDisk, onClose,
}: {
  pool: ZFSPool;
  onShowStatus: () => void;
  onResilver: () => void;
  onExpand: () => void;
  onReplaceDisk: () => void;
  onClose: () => void;
}) {
  const items = [
    { icon: Info,          label: 'Show Status',    action: onShowStatus,   color: 'text-slate-300' },
    { icon: RotateCcw,     label: 'ZFS Rewrite',    action: onResilver,     color: 'text-sky-400' },
    { icon: Expand,        label: 'Expand Pool',    action: onExpand,       color: 'text-indigo-400' },
    { icon: ArrowLeftRight, label: 'Replace Disk',  action: onReplaceDisk,  color: 'text-amber-400' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }}
        transition={{ duration: 0.15, ease: 'circOut' }}
        className="absolute right-0 top-full mt-1 z-50 w-52 glass-panel py-2 shadow-2xl border border-white/[0.06]"
      >
        {items.map(({ icon: Icon, label, action, color }) => (
          <button
            key={label}
            onClick={() => { action(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
          >
            <Icon size={13} className={color} />
            <span className={`text-[11px] font-black uppercase tracking-widest ${color}`}>{label}</span>
          </button>
        ))}
      </motion.div>
    </>
  );
}

// ── Disk Row ──────────────────────────────────────────────────────────────────
function DiskRow({ disk, poolName, onReplace, onSmartClick }: {
  disk: { path: string; state: string };
  poolName: string;
  onReplace: (disk: string) => void;
  onSmartClick: (disk: string) => void;
}) {
  const isOnline = disk.state === 'ONLINE';
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.015] border border-white/[0.025] hover:bg-white/[0.03] transition-all group">
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${
        isOnline ? 'bg-white/[0.02] border-white/[0.04] text-slate-500' : 'bg-rose-400/8 border-rose-400/20 text-rose-400'
      }`}>
        <HardDrive size={13} strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-black text-white font-mono truncate block">{disk.path}</span>
        <span className={`text-[9px] font-bold uppercase tracking-widest ${isOnline ? 'text-slate-700' : 'text-rose-400'}`}>
          {disk.state}
        </span>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSmartClick(disk.path)}
          title="SMART Data"
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.02] border border-white/[0.04] text-slate-600 hover:text-sky-400 hover:border-sky-400/20 transition-all text-[9px]"
        >
          <Cpu size={11} />
        </button>
        <button
          onClick={() => onReplace(disk.path)}
          title="Replace Disk"
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.02] border border-white/[0.04] text-slate-600 hover:text-amber-400 hover:border-amber-400/20 transition-all"
        >
          <ArrowLeftRight size={10} />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StoragePools({ pools, onRefresh }: StoragePoolsProps) {
  const [scrubState,    setScrubState]    = useState<Record<string, ScrubState>>({});
  const [scrubProgress, setScrubProgress] = useState<Record<string, ScrubProgress>>({});
  const [expandedPool,  setExpandedPool]  = useState<string | null>(null);
  const [poolStatus,    setPoolStatus]    = useState<Record<string, string>>({});
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [openMenu,      setOpenMenu]      = useState<string | null>(null);
  const [expandTarget,  setExpandTarget]  = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ pool: string; disk: string } | null>(null);
  const [smartTarget,   setSmartTarget]   = useState<string | null>(null);
  const [poolVdevs,     setPoolVdevs]     = useState<Record<string, any[]>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Load vdevs for each pool on mount/refresh
  useEffect(() => {
    pools.forEach(pool => {
      if (!poolVdevs[pool.name]) {
        api.getPoolVdevs(pool.name)
          .then(res => setPoolVdevs(prev => ({ ...prev, [pool.name]: res.vdevs || [] })))
          .catch(() => {});
      }
    });
  }, [pools]);

  const getPoolRaidType = (poolName: string): string => {
    const vdevs = poolVdevs[poolName] || [];
    if (vdevs.length === 0) return '—';
    const types = [...new Set(vdevs.map((v: any) => v.type as string))];
    if (types.length === 1) {
      const t = types[0];
      if (t === 'mirror') return 'Mirror';
      if (t === 'raidz1') return 'RAIDZ-1';
      if (t === 'raidz2') return 'RAIDZ-2';
      if (t === 'raidz3') return 'RAIDZ-3';
      if (t === 'stripe') return 'Stripe';
    }
    return types.map(t => t.toUpperCase()).join('+');
  };

  const getPoolDisks = (poolName: string): { path: string; state: string }[] => {
    const vdevs = poolVdevs[poolName] || [];
    return vdevs.flatMap((v: any) => v.disks || []);
  };

  const getRaidTypeColor = (raidType: string): string => {
    if (raidType.startsWith('Mirror')) return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/8';
    if (raidType.startsWith('RAIDZ-1')) return 'text-sky-400 border-sky-400/30 bg-sky-400/8';
    if (raidType.startsWith('RAIDZ-2')) return 'text-indigo-400 border-indigo-400/30 bg-indigo-400/8';
    if (raidType.startsWith('RAIDZ-3')) return 'text-violet-400 border-violet-400/30 bg-violet-400/8';
    if (raidType === 'Stripe') return 'text-rose-400 border-rose-400/30 bg-rose-400/8';
    return 'text-slate-400 border-slate-400/30 bg-slate-400/8';
  };

  const startScrubPolling = (poolName: string) => {
    if (pollTimers.current[poolName]) return;
    pollTimers.current[poolName] = setInterval(async () => {
      try {
        const res = await api.getScrubStatus(poolName);
        setScrubProgress(p => ({ ...p, [poolName]: {
          inProgress: res.in_progress, done: res.done,
          progress: res.progress, timeRemaining: res.time_remaining, scan: res.scan,
        }}));
        if (!res.in_progress) {
          clearInterval(pollTimers.current[poolName]);
          delete pollTimers.current[poolName];
          setScrubState(s => ({ ...s, [poolName]: 'success' }));
          setTimeout(() => setScrubState(s => ({ ...s, [poolName]: 'idle' })), 4000);
        }
      } catch {
        clearInterval(pollTimers.current[poolName]);
        delete pollTimers.current[poolName];
      }
    }, 2000);
  };

  useEffect(() => {
    return () => { Object.values(pollTimers.current).forEach(clearInterval); };
  }, []);

  const handleScrub = async (poolName: string) => {
    setScrubState(s => ({ ...s, [poolName]: 'running' }));
    setScrubProgress(p => ({ ...p, [poolName]: { inProgress: true, done: false, progress: 0, timeRemaining: '', scan: '' } }));
    try {
      await api.startScrub(poolName);
      showToast(`Scrub started on ${poolName}`, 'success');
      startScrubPolling(poolName);
    } catch (err: any) {
      setScrubState(s => ({ ...s, [poolName]: 'error' }));
      showToast(err.message || 'Scrub failed', 'error');
      setTimeout(() => setScrubState(s => ({ ...s, [poolName]: 'idle' })), 3000);
    }
  };

  const handleResilver = async (poolName: string) => {
    try {
      await api.resilverPool(poolName);
      showToast(`Rewrite (scrub) started on ${poolName}`, 'success');
      setScrubState(s => ({ ...s, [poolName]: 'running' }));
      startScrubPolling(poolName);
    } catch (err: any) {
      showToast(err.message || 'Rewrite failed', 'error');
    }
  };

  const handleToggleStatus = async (poolName: string) => {
    if (expandedPool === poolName) { setExpandedPool(null); return; }
    setExpandedPool(poolName);
    if (!poolStatus[poolName]) {
      setStatusLoading(poolName);
      try {
        const res = await api.getPoolStatus(poolName);
        setPoolStatus(s => ({ ...s, [poolName]: res.status }));
      } catch (err: any) {
        setPoolStatus(s => ({ ...s, [poolName]: `Error: ${err.message}` }));
      } finally {
        setStatusLoading(null);
      }
    }
  };

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-10">
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showCreate && (
          <CreatePoolModal
            onClose={() => setShowCreate(false)}
            onSuccess={(name) => {
              setShowCreate(false);
              showToast(`Pool "${name}" created successfully`, 'success');
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImport && (
          <ImportPoolModal
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              showToast('Pool imported successfully', 'success');
              setShowImport(false);
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expandTarget && (
          <ExpandPoolModal
            poolName={expandTarget}
            onClose={() => setExpandTarget(null)}
            onSuccess={() => {
              showToast(`Pool "${expandTarget}" expand command sent`, 'success');
              setExpandTarget(null);
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {replaceTarget && (
          <ReplaceDiskModal
            poolName={replaceTarget.pool}
            oldDisk={replaceTarget.disk}
            onClose={() => setReplaceTarget(null)}
            onSuccess={() => {
              showToast(`Disk replacement started on "${replaceTarget.pool}"`, 'success');
              setReplaceTarget(null);
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {smartTarget && (
          <SmartModal device={smartTarget} onClose={() => setSmartTarget(null)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Storage Pools</h2>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">
            ZFS pool cluster telemetry · {pools.length} active
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button onClick={onRefresh} className="apple-button apple-button-secondary group">
            <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Refresh</span>
          </button>
          <button onClick={() => setShowImport(true)} className="apple-button apple-button-secondary gap-2">
            <Download size={14} className="text-sky-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Import Pool</span>
          </button>
          <button onClick={() => setShowCreate(true)} className="apple-button apple-button-primary gap-2">
            <Plus size={14} strokeWidth={3} />
            <span className="text-[10px] font-black uppercase tracking-widest">Create Pool</span>
          </button>
        </div>
      </div>

      {/* Pool cards */}
      <div className="space-y-5">
        {pools.map((pool, idx) => {
          const state      = scrubState[pool.name] || 'idle';
          const progress   = scrubProgress[pool.name];
          const isExpanded = expandedPool === pool.name;
          const raidType   = getPoolRaidType(pool.name);
          const disks      = getPoolDisks(pool.name);
          const raidColor  = getRaidTypeColor(raidType);

          return (
            <motion.div
              key={pool.name}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-panel overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-sky-400/4 blur-[100px] rounded-full -mr-16 -mt-16 pointer-events-none" />

              <div className="p-6 relative">
                {/* Pool header */}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/[0.02] border border-white/[0.05] rounded-2xl flex items-center justify-center text-sky-400">
                      <Database size={20} strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white tracking-tight">{pool.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                          pool.health === 'ONLINE'
                            ? 'bg-emerald-400/8 text-emerald-400 border-emerald-400/15'
                            : pool.health === 'DEGRADED'
                            ? 'bg-amber-400/8 text-amber-400 border-amber-400/15'
                            : 'bg-rose-400/8 text-rose-400 border-rose-400/15'
                        }`}>
                          {pool.health}
                        </span>
                        {raidType !== '—' && (
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${raidColor}`}>
                            {raidType}
                          </span>
                        )}
                        {(pool as any).dedup && (pool as any).dedup !== '1.00x' && (
                          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                            DEDUP {(pool as any).dedup}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action text button */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(m => m === pool.name ? null : pool.name)}
                      className="px-4 py-2 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl border border-white/[0.03] text-slate-400 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                    >
                      Action
                      <ChevronDown size={11} className={`transition-transform ${openMenu === pool.name ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {openMenu === pool.name && (
                        <PoolMenu
                          pool={pool}
                          onShowStatus={() => handleToggleStatus(pool.name)}
                          onResilver={() => handleResilver(pool.name)}
                          onExpand={() => setExpandTarget(pool.name)}
                          onReplaceDisk={() => setReplaceTarget({ pool: pool.name, disk: disks[0]?.path || '' })}
                          onClose={() => setOpenMenu(null)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-6 mb-6 border-b border-white/[0.04]">
                  <div>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Utilization</span>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-black text-white">{pool.cap}%</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pool.cap}%` }}
                        transition={{ duration: 1, ease: 'circOut' }}
                        className={`h-full rounded-full ${pool.cap > 90 ? 'bg-rose-500' : pool.cap > 75 ? 'bg-amber-400' : 'bg-sky-400'}`}
                      />
                    </div>
                    <p className="text-[9px] font-bold text-slate-700 mt-1">
                      {pool.alloc} von {pool.size}
                    </p>
                  </div>
                  {[
                    { label: 'Total Size', value: pool.size },
                    { label: 'Allocated',  value: pool.alloc },
                    { label: 'Free Space', value: pool.free },
                  ].map((s, i) => (
                    <div key={i}>
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1 truncate">{s.label}</span>
                      <span className="text-2xl font-black text-white tracking-tight">{s.value}</span>
                    </div>
                  ))}
                </div>

                {/* Fragmentation + disk count */}
                <div className="flex items-center gap-4 mb-5 text-[10px]">
                  <span className="font-black text-slate-600 uppercase tracking-widest">Fragmentation:</span>
                  <span className={`font-black ${(pool as any).frag > 20 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {(pool as any).frag ?? 0}%
                  </span>
                  {disks.length > 0 && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="font-black text-slate-600 uppercase tracking-widest">{disks.length} disk{disks.length !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>

                {/* Disk list */}
                {disks.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-2">Disks</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {disks.map((disk, di) => (
                        <DiskRow
                          key={di}
                          disk={disk}
                          poolName={pool.name}
                          onReplace={(d) => setReplaceTarget({ pool: pool.name, disk: d })}
                          onSmartClick={(d) => setSmartTarget(d)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Scrub progress bar */}
                <AnimatePresence>
                  {state === 'running' && progress && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-5"
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Loader2 size={9} className="animate-spin" />
                          Scrub in progress
                        </span>
                        <div className="flex items-center gap-3">
                          {progress.timeRemaining && (
                            <span className="text-[9px] font-bold text-slate-600">{progress.timeRemaining} remaining</span>
                          )}
                          <span className="text-[10px] font-black text-white">{progress.progress.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${progress.progress}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-sky-400"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleToggleStatus(pool.name)}
                    className="apple-button apple-button-secondary !px-4 gap-2"
                  >
                    <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      {isExpanded ? 'Hide Status' : 'Show Status'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleScrub(pool.name)}
                    disabled={state === 'running'}
                    className={`ml-auto apple-button !px-5 gap-2 transition-all ${
                      state === 'running' ? 'bg-amber-400/10 border border-amber-400/20 text-amber-400 cursor-not-allowed'
                      : state === 'success' ? 'bg-emerald-400/10 border border-emerald-400/20 text-emerald-400'
                      : state === 'error'   ? 'bg-rose-400/10 border border-rose-400/20 text-rose-400'
                      : 'apple-button-primary'
                    }`}
                  >
                    {state === 'running' && <Loader2 size={14} className="animate-spin" />}
                    {state === 'success' && <CheckCircle size={14} />}
                    {state === 'error'   && <XCircle size={14} />}
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      {state === 'running' ? 'Scrubbing...' : state === 'success' ? 'Done' : state === 'error' ? 'Failed' : 'Start Scrub'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Expandable pool status */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'circOut' }}
                    className="overflow-hidden border-t border-white/[0.04]"
                  >
                    <div className="p-6 bg-black/20">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4">
                        zpool status {pool.name}
                      </p>
                      {statusLoading === pool.name ? (
                        <div className="flex items-center gap-3 text-slate-600">
                          <Loader2 size={14} className="animate-spin" />
                          <span className="text-[11px] font-bold">Fetching status...</span>
                        </div>
                      ) : (
                        <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {poolStatus[pool.name] || 'No data available'}
                        </pre>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {pools.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-panel p-16 flex flex-col items-center justify-center text-center"
          >
            <Database size={48} className="text-white/5 mb-6" strokeWidth={1} />
            <h3 className="text-xl font-black text-white mb-2">No Pools Detected</h3>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest max-w-sm">
              Hardware scan complete. No ZFS clusters found.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
