import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Database, RefreshCw, ChevronDown, CheckCircle, XCircle,
  Loader2, Plus, Trash2, AlertTriangle, X, HardDrive,
  ArrowLeftRight, Download, Expand, RotateCcw, ChevronRight,
  Activity, Info, Cpu, Settings,
} from 'lucide-react';
import { ZFSPool } from '../types';
import { api, formatBytes } from '../api';
import { useNotifications } from '../context/NotificationContext';

interface StoragePoolsProps {
  pools: ZFSPool[];
  onRefresh: () => void;
  zfsVersion?: string;
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
  stripe: { min: 1, label: 'Stripe',  desc: 'Max performance, no redundancy',       color: 'var(--danger)'  },
  mirror: { min: 2, label: 'Mirror',  desc: 'Full redundancy, survives 1 disk loss', color: 'var(--success)' },
  raidz1: { min: 3, label: 'RAIDZ-1', desc: 'Single parity, min 3 devices',          color: 'var(--info)'    },
  raidz2: { min: 4, label: 'RAIDZ-2', desc: 'Double parity, min 4 devices',          color: 'var(--accent)'  },
  raidz3: { min: 5, label: 'RAIDZ-3', desc: 'Triple parity, min 5 devices',          color: 'var(--warning)' },
};

/* ── Small helpers ───────────────────────────────────────────────────────────── */
const S = {
  modal: {
    overlay: {
      position: 'fixed' as const, inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
    },
    box: {
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 28, width: '100%',
      maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    },
    title:  { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', margin: 0 },
    label:  { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', display: 'block', marginBottom: 8 },
    input:  { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' as const },
    select: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', outline: 'none', cursor: 'pointer' },
  },
};

function iconBtn(onClick: () => void, icon: React.ReactNode, title: string, col = 'var(--text-muted)') {
  return (
    <button title={title} onClick={onClick} style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', cursor: 'pointer', color: col, transition: 'all 0.12s',
    }}>{icon}</button>
  );
}


/* ── Device Picker ────────────────────────────────────────────────────────────── */
function DevicePicker({ onSelect, onClose, usedDisks = new Set<string>() }: {
  onSelect: (path: string) => void;
  onClose: () => void;
  usedDisks?: Set<string>;
}) {
  const [disks, setDisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDisks()
      .then(res => setDisks(res.blockdevices || []))
      .catch(() => setDisks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ ...S.modal.overlay, zIndex: 300 }} onClick={onClose}>
      <div style={{ ...S.modal.box, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h4 style={S.modal.title}>Available Block Devices</h4>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>lsblk output</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)' }}>Scanning devices…</span>
          </div>
        ) : disks.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '24px 0' }}>No block devices found</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {disks.map((disk, i) => {
              const path = `/dev/${disk.name}`;
              const inUse = usedDisks.has(path);
              return (
                <button
                  key={i}
                  onClick={() => { if (!inUse) { onSelect(path); onClose(); } }}
                  disabled={inUse}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', cursor: inUse ? 'not-allowed' : 'pointer',
                    textAlign: 'left', transition: 'all 0.12s',
                    opacity: inUse ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!inUse) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                >
                  <HardDrive size={16} style={{ color: inUse ? 'var(--text-muted)' : 'var(--info)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{path}</span>
                      {inUse && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                          In use
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{disk.model || ''} {disk.rota ? 'HDD' : 'SSD'}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: inUse ? 'var(--text-muted)' : 'var(--info)', fontWeight: 600 }}>{formatBytes(disk.size, 2)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SMART Modal ──────────────────────────────────────────────────────────────── */
function SmartModal({ device, onClose }: { device: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSmartData(device).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [device]);

  const passed = data?.smart_status?.passed;
  const temp   = data?.temperature?.current;
  const hours  = data?.power_on_time?.hours;
  const attrs  = data?.ata_smart_attributes?.table || [];

  return (
    <div style={S.modal.overlay} onClick={onClose}>
      <div style={{ ...S.modal.box, maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h4 style={S.modal.title}>SMART Data</h4>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{device}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12 }}>Reading SMART data…</span>
          </div>
        ) : !data ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '24px 0' }}>No SMART data available</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Status', value: passed === true ? 'PASSED' : 'FAILED', color: passed === true ? 'var(--success)' : 'var(--danger)' },
                ...(temp !== undefined ? [{ label: 'Temp', value: `${temp}°C`, color: temp > 55 ? 'var(--danger)' : temp > 45 ? 'var(--warning)' : 'var(--text-primary)' }] : []),
                ...(hours !== undefined ? [{ label: 'Power-On', value: hours >= 8760 ? `${(hours/8760).toFixed(1)}y` : `${(hours/24).toFixed(0)}d`, color: 'var(--text-primary)' }] : []),
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
            {attrs.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Attributes</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {attrs.slice(0, 12).map((a: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: a.thresh > 0 && a.value <= a.thresh ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>{a.raw?.value ?? a.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Replace Disk Modal ───────────────────────────────────────────────────────── */
function ReplaceDiskModal({ poolName, poolDisks, preselectedDisk, onClose, onSuccess, usedDisks = new Set<string>() }: {
  poolName: string; poolDisks: { path: string; state: string }[];
  preselectedDisk?: string; onClose: () => void; onSuccess: () => void;
  usedDisks?: Set<string>;
}) {
  const [selectedOld, setSelectedOld] = useState(preselectedDisk || '');
  const [newDisk, setNewDisk]         = useState('');
  const [force, setForce]             = useState(false);
  const [replacing, setReplacing]     = useState(false);
  const [error, setError]             = useState('');
  const [showPicker, setShowPicker]   = useState(false);
  const [step, setStep]               = useState<1 | 2>(preselectedDisk ? 2 : 1);

  const handleReplace = async () => {
    if (!selectedOld) { setError('Select the disk to replace'); return; }
    if (!newDisk.trim()) { setError('New device path is required'); return; }
    setReplacing(true); setError('');
    try { await api.replaceDisk(poolName, selectedOld, newDisk.trim(), force); onSuccess(); }
    catch (err: any) { setError(err.message || 'Replace failed'); }
    finally { setReplacing(false); }
  };

  return (
    <>
      {showPicker && <DevicePicker onSelect={p => { setNewDisk(p); setShowPicker(false); }} onClose={() => setShowPicker(false)} usedDisks={usedDisks} />}
      <div style={S.modal.overlay} onClick={onClose}>
        <div style={S.modal.box} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h3 style={S.modal.title}>Replace Disk</h3>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                zpool replace {poolName} · Step {step}/2
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {step === 1 ? (
              <>
                <label style={S.modal.label}>Step 1 — Select disk to replace</label>
                {poolDisks.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No disks found in pool</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {poolDisks.map((d, i) => (
                      <button key={i} onClick={() => setSelectedOld(d.path)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        background: selectedOld === d.path ? 'var(--warning-dim)' : 'var(--bg-elevated)',
                        border: `1px solid ${selectedOld === d.path ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                      }}>
                        <HardDrive size={14} style={{ color: selectedOld === d.path ? 'var(--warning)' : 'var(--text-muted)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{d.path}</div>
                          <div style={{ fontSize: 10, color: d.state === 'ONLINE' ? 'var(--success)' : 'var(--danger)', textTransform: 'uppercase', marginTop: 2 }}>{d.state}</div>
                        </div>
                        {selectedOld === d.path && <CheckCircle size={13} style={{ color: 'var(--warning)' }} />}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => setStep(2)} disabled={!selectedOld}>
                    <ChevronRight size={14} /> Next
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--warning-dim)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Replacing</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{selectedOld}</div>
                </div>
                <label style={S.modal.label}>Step 2 — Select replacement disk</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...S.modal.input, flex: 1 }} type="text" placeholder="/dev/sdb" value={newDisk} onChange={e => setNewDisk(e.target.value)} />
                  <button className="btn btn-secondary" onClick={() => setShowPicker(true)} title="Browse devices"><HardDrive size={14} /></button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div onClick={() => setForce(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: force ? 'var(--warning)' : 'var(--bg-elevated)', border: '1px solid var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: force ? 17 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>Force replace (-f)</span>
                </label>
                {error && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)' }}>
                    <XCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronDown size={13} style={{ transform: 'rotate(90deg)' }} /> Back
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleReplace} disabled={replacing || !newDisk.trim()}>
                    {replacing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowLeftRight size={14} />}
                    {replacing ? 'Replacing…' : 'Replace'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Import Pool Modal ────────────────────────────────────────────────────────── */
function ImportPoolModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [importable, setImportable] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [poolName, setPoolName]     = useState('');
  const [dir, setDir]               = useState('');
  const [importing, setImporting]   = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.getImportablePools()
      .then(res => setImportable(res.pools || []))
      .catch(() => setImportable([]))
      .finally(() => setLoading(false));
  }, []);

  const handleImport = async () => {
    if (!poolName.trim()) { setError('Pool name is required'); return; }
    setImporting(true); setError('');
    try { await api.importPool(poolName.trim(), dir.trim() || undefined); onSuccess(); }
    catch (err: any) { setError(err.message || 'Import failed'); }
    finally { setImporting(false); }
  };

  return (
    <div style={S.modal.overlay} onClick={onClose}>
      <div style={S.modal.box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h3 style={S.modal.title}>Import Pool</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12 }}>Scanning for importable pools…</span>
            </div>
          ) : importable.length > 0 && (
            <div>
              <label style={S.modal.label}>Detected Pools</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {importable.map((p, i) => (
                  <button key={i} onClick={() => setPoolName(p.name)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px',
                    background: poolName === p.name ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                    border: `1px solid ${poolName === p.name ? 'var(--accent-mid)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.12s',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</span>
                    <span className={p.state === 'ONLINE' ? 'badge badge-success' : 'badge badge-warning'}>{p.state || 'UNKNOWN'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label style={S.modal.label}>Pool Name</label>
            <input style={S.modal.input} type="text" placeholder="e.g. tank" value={poolName} onChange={e => setPoolName(e.target.value)} />
          </div>
          <div>
            <label style={S.modal.label}>Search Directory (optional)</label>
            <input style={{ ...S.modal.input, fontFamily: 'var(--font-mono)' }} type="text" placeholder="/mnt/disk1" value={dir} onChange={e => setDir(e.target.value)} />
          </div>
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--danger)' }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleImport} disabled={importing || !poolName.trim()}>
              {importing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              {importing ? 'Importing…' : 'Import Pool'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Expand Pool Modal ────────────────────────────────────────────────────────── */
function ExpandPoolModal({ poolName, poolDisks, onClose, onSuccess, usedDisks = new Set<string>() }: {
  poolName: string; poolDisks: { path: string; state: string }[];
  onClose: () => void; onSuccess: () => void;
  usedDisks?: Set<string>;
}) {
  const [selected, setSelected] = useState('');
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState('');

  const handleExpand = async () => {
    if (!selected) { setError('Select a disk to expand'); return; }
    setExpanding(true); setError('');
    try { await api.expandPool(poolName, selected); onSuccess(); }
    catch (err: any) { setError(err.message || 'Expand failed'); }
    finally { setExpanding(false); }
  };

  return (
    <div style={S.modal.overlay} onClick={onClose}>
      <div style={S.modal.box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h3 style={S.modal.title}>Expand Pool</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={S.modal.label}>Select disk to expand</label>
          {poolDisks.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No disks found</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {poolDisks.map((d, i) => (
                <button key={i} onClick={() => setSelected(d.path)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: selected === d.path ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${selected === d.path ? 'var(--accent-mid)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  <HardDrive size={14} style={{ color: selected === d.path ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{d.path}</div>
                    <div style={{ fontSize: 10, color: d.state === 'ONLINE' ? 'var(--success)' : 'var(--danger)', textTransform: 'uppercase', marginTop: 2 }}>{d.state}</div>
                  </div>
                  {selected === d.path && <CheckCircle size={13} style={{ color: 'var(--accent)', marginLeft: 'auto' }} />}
                </button>
              ))}
            </div>
          )}
          {error && <div style={{ padding: '10px 14px', background: 'var(--danger-dim)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleExpand} disabled={expanding || !selected}>
              {expanding ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Expand size={14} />}
              {expanding ? 'Expanding…' : 'Expand'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Create Pool Modal ────────────────────────────────────────────────────────── */
function CreatePoolModal({ onClose, onSuccess, usedDisks = new Set<string>() }: { onClose: () => void; onSuccess: (name: string) => void; usedDisks?: Set<string> }) {
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
  const validDev    = devices.filter(d => d.trim());
  const minMet      = validDev.length >= info.min;

  const addDevice    = () => setDevices(d => [...d, '']);
  const removeDevice = (i: number) => setDevices(d => d.filter((_, j) => j !== i));
  const setDevice    = (i: number, val: string) => setDevices(d => d.map((v, j) => j === i ? val : v));

  const openPickerFor = (idx: number) => { setPickerTarget(idx); setShowPicker(true); };
  const handlePickerSelect = (path: string) => {
    if (pickerTarget !== null) setDevice(pickerTarget, path);
    else setDevices(d => [...d, path]);
  };

  const buildVdevs   = (): string[] => vdevType === 'stripe' ? validDev : [vdevType, ...validDev];
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
    if (validDev.length < info.min) { setError(`${info.label} requires at least ${info.min} device(s)`); return; }
    setCreating(true);
    try { await api.createPool(poolName.trim(), buildVdevs(), buildOptions()); onSuccess(poolName.trim()); }
    catch (err: any) { setError(err.message || 'Pool creation failed'); }
    finally { setCreating(false); }
  };

  return (
    <>
      {showPicker && (
        <DevicePicker
          onSelect={path => { handlePickerSelect(path); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
          usedDisks={usedDisks}
        />
      )}
      <div style={S.modal.overlay} onClick={onClose}>
        <div style={{ ...S.modal.box, maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h3 style={S.modal.title}>Create ZFS Pool</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={S.modal.label}>Pool Name</label>
              <input style={S.modal.input} type="text" placeholder="e.g. tank, storage, data" value={poolName} onChange={e => setPoolName(e.target.replace(/[^a-zA-Z0-9_\-:.]/g, ''))} />
            </div>

            <div>
              <label style={S.modal.label}>VDEV Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {(Object.keys(VDEV_INFO) as VdevType[]).map(t => (
                  <button key={t} onClick={() => { setVdevType(t); const min = VDEV_INFO[t].min; setDevices(d => d.length < min ? [...d, ...Array(min - d.length).fill('')] : d); }} style={{
                    padding: '8px 4px', borderRadius: 'var(--radius)', fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.12s',
                    border: `1px solid ${vdevType === t ? VDEV_INFO[t].color + '44' : 'var(--border)'}`,
                    background: vdevType === t ? VDEV_INFO[t].color + '18' : 'var(--bg-elevated)',
                    color: vdevType === t ? VDEV_INFO[t].color : 'var(--text-muted)',
                  }}>{VDEV_INFO[t].label}</button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{info.desc}</p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...S.modal.label, marginBottom: 0 }}>Devices / Paths</label>
                <button onClick={() => { setPickerTarget(null); setShowPicker(true); }} style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <HardDrive size={11} /> Browse Disks
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {devices.map((dev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...S.modal.input, flex: 1 }} type="text" placeholder="/dev/sdX" value={dev} onChange={e => setDevice(i, e.target.value)} />
                    <button className="btn btn-secondary" onClick={() => openPickerFor(i)} title="Browse"><HardDrive size={12} /></button>
                    {devices.length > info.min && (
                      <button className="btn btn-danger" onClick={() => removeDevice(i)} title="Remove"><Trash2 size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addDevice} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> Add device
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={S.modal.label}>Ashift</label>
                <select style={S.modal.select} value={ashift} onChange={e => setAshift(e.target.value)}>
                  <option value="9">9 — 512B (HDD legacy)</option>
                  <option value="12">12 — 4K (SSD/modern)</option>
                  <option value="13">13 — 8K</option>
                  <option value="0">Auto-detect</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div onClick={() => setForce(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: force ? 'var(--warning)' : 'var(--bg-elevated)', border: '1px solid var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: force ? 17 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Force (-f)</span>
                </label>
              </div>
            </div>

            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '10px 14px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Command preview</div>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--info)', wordBreak: 'break-all' }}>{preview}</code>
            </div>

            {!minMet && validDev.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)' }}>
                <AlertTriangle size={14} />
                <span style={{ fontSize: 12 }}>{info.label} needs at least {info.min} devices ({validDev.length} provided)</span>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--danger)' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleCreate} disabled={creating || !poolName.trim() || !minMet}>
                {creating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Database size={14} />}
                {creating ? 'Creating…' : 'Create Pool'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Disk Row ─────────────────────────────────────────────────────────────────── */
function DiskRow({ disk, poolName, onReplace, onSmartClick }: {
  disk: { path: string; state: string };
  poolName: string;
  onReplace: (disk: string) => void;
  onSmartClick: (disk: string) => void;
}) {
  const [hov, setHov] = useState(false);
  const isOnline = disk.state === 'ONLINE';
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', transition: 'border-color 0.12s',
      borderColor: hov ? 'rgba(255,255,255,0.12)' : 'var(--border)',
    }}>
      <HardDrive size={13} style={{ color: isOnline ? 'var(--text-muted)' : 'var(--danger)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div title={disk.path} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{disk.path}</div>
        <div style={{ fontSize: 9, color: isOnline ? 'var(--success)' : 'var(--danger)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{disk.state}</div>
      </div>
      <div style={{ display: 'flex', gap: 4, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
        <button title="SMART Data" onClick={() => onSmartClick(disk.path)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <Cpu size={10} />
        </button>
        <button title="Replace Disk" onClick={() => onReplace(disk.path)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <ArrowLeftRight size={10} />
        </button>
      </div>
    </div>
  );
}

/* ── Pool Settings Panel ─────────────────────────────────────────────────────── */

type PropDef = {
  name: string;
  label: string;
  scope: 'pool' | 'dataset';
  type: 'toggle' | 'select' | 'text';
  options?: string[];
};

const POOL_PROP_DEFS: PropDef[] = [
  { name: 'autoreplace',   label: 'Auto Replace',       scope: 'pool',    type: 'toggle' },
  { name: 'autotrim',      label: 'Auto Trim',          scope: 'pool',    type: 'toggle' },
  { name: 'autoexpand',    label: 'Auto Expand',        scope: 'pool',    type: 'toggle' },
  { name: 'failmode',      label: 'Fail Mode',          scope: 'pool',    type: 'select', options: ['wait', 'continue', 'panic'] },
  { name: 'comment',       label: 'Comment',            scope: 'pool',    type: 'text' },
  { name: 'compression',   label: 'Compression',        scope: 'dataset', type: 'select', options: ['off', 'lz4', 'zstd', 'gzip', 'zle'] },
  { name: 'atime',         label: 'Access Time',        scope: 'dataset', type: 'toggle' },
  { name: 'relatime',      label: 'Relative Atime',     scope: 'dataset', type: 'toggle' },
  { name: 'dedup',         label: 'Deduplication',      scope: 'dataset', type: 'toggle' },
  { name: 'recordsize',    label: 'Record Size',        scope: 'dataset', type: 'select', options: ['512', '1K', '2K', '4K', '8K', '16K', '32K', '64K', '128K', '1M'] },
  { name: 'xattr',         label: 'Extended Attrs',     scope: 'dataset', type: 'select', options: ['on', 'off', 'sa'] },
  { name: 'quota',         label: 'Quota',              scope: 'dataset', type: 'text' },
  { name: 'reservation',   label: 'Reservation',        scope: 'dataset', type: 'text' },
  { name: 'snapdir',       label: 'Snapshot Dir',       scope: 'dataset', type: 'select', options: ['hidden', 'visible'] },
  { name: 'sync',          label: 'Sync Mode',          scope: 'dataset', type: 'select', options: ['standard', 'always', 'disabled'] },
];

/* ── Settings Popout (slide-in from right) ──────────────────────────────────── */
function SettingsPopout({
  poolName,
  onClose,
  onSaved,
}: {
  poolName: string;
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
    api.getPoolSettings(poolName).then(res => {
      const map: Record<string, string> = {};
      for (const p of [...res.pool_props, ...res.dataset_props]) map[p.name] = p.value;
      setProps(map);
      setEdits({ ...map });
    }).catch(err => {
      setError(err.message || 'Failed to load settings');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [poolName]);

  const pendingCount = Object.entries(edits).filter(([k, v]) => v !== (props[k] ?? '')).length;

  const handleSave = async () => {
    const changed = Object.entries(edits).filter(([k, v]) => v !== (props[k] ?? ''));
    if (changed.length === 0) { close(); return; }
    setSaving(true);
    try {
      for (const [k, v] of changed) {
        const def = POOL_PROP_DEFS.find(d => d.name === k);
        if (def) await api.setPoolSetting(poolName, def.scope, k, v);
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

  const poolPropDefs    = POOL_PROP_DEFS.filter(d => d.scope === 'pool');
  const datasetPropDefs = POOL_PROP_DEFS.filter(d => d.scope === 'dataset');

  const sectionLabel = (text: string) => (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
      paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)', marginBottom: 4,
    }}>
      {text}
    </div>
  );

  return (
    <>
      {/* Dark overlay */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.4)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
      />

      {/* Slide-in panel */}
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

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {poolName}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Pool Settings
            </div>
          </div>
          <button
            onClick={close}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }} className="no-scrollbar">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
              {[48, 48, 48, 48, 48, 48, 48].map((h, i) => (
                <div key={i} className="skeleton" style={{ height: h, borderRadius: 'var(--radius)' }} />
              ))}
            </div>
          ) : error ? (
            <div style={{ paddingTop: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--danger)', fontFamily: 'var(--font-ui)', marginBottom: 16 }}>{error}</div>
              <button className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
          ) : (
            <>
              <div style={{ paddingTop: 16, paddingBottom: 4 }}>
                {sectionLabel('Pool Properties')}
                {poolPropDefs.map(def => (
                  <PopoutPropRow
                    key={def.name}
                    def={def}
                    value={edits[def.name] ?? ''}
                    currentValue={props[def.name] ?? ''}
                    onChange={v => setEdits(e => ({ ...e, [def.name]: v }))}
                  />
                ))}
              </div>
              <div style={{ paddingTop: 16, paddingBottom: 20 }}>
                {sectionLabel('Dataset Properties')}
                {datasetPropDefs.map(def => (
                  <PopoutPropRow
                    key={def.name}
                    def={def}
                    value={edits[def.name] ?? ''}
                    currentValue={props[def.name] ?? ''}
                    onChange={v => setEdits(e => ({ ...e, [def.name]: v }))}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
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
                <strong>Notice:</strong> Changing compression only affects newly written data. To compress existing files, you should run a <strong>Pool Rewrite (scrub)</strong> after saving.
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

function PopoutPropRow({
  def, value, currentValue, onChange,
}: {
  def: PropDef; value: string; currentValue: string; onChange: (v: string) => void;
}) {
  const changed = value !== currentValue;
  const inputStyle: React.CSSProperties = {
    flex: 1, height: 30, padding: '0 8px',
    background: 'var(--bg-elevated)',
    border: `1px solid ${changed ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 130, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: changed ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
          {def.label}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{def.name}</div>
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
            position: 'absolute', top: 2,
            left: value === 'on' ? 22 : 2,
            width: 16, height: 16, borderRadius: 8,
            background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
      ) : def.type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {(def.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="value"
          style={inputStyle}
        />
      )}
    </div>
  );
}

/* ── Raid type helpers ─────────────────────────────────────────────────────────── */
function raidColor(raidType: string): string {
  if (raidType.startsWith('Mirror'))  return 'var(--success)';
  if (raidType.startsWith('RAIDZ-1')) return 'var(--info)';
  if (raidType.startsWith('RAIDZ-2')) return 'var(--accent)';
  if (raidType.startsWith('RAIDZ-3')) return 'var(--warning)';
  if (raidType === 'Stripe')          return 'var(--danger)';
  return 'var(--text-muted)';
}

/* ── Main Component ───────────────────────────────────────────────────────────── */
export default function StoragePools({ pools, onRefresh, zfsVersion }: StoragePoolsProps) {
  const { notify } = useNotifications();
  const [scrubState,    setScrubState]    = useState<Record<string, ScrubState>>({});
  const [scrubProgress, setScrubProgress] = useState<Record<string, ScrubProgress>>({});
  const [expandedPool,  setExpandedPool]  = useState<string | null>(null);
  const [poolStatus,    setPoolStatus]    = useState<Record<string, string>>({});
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [expandTarget,  setExpandTarget]  = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ pool: string; preselectedDisk?: string } | null>(null);
  const [smartTarget,   setSmartTarget]   = useState<string | null>(null);
  const [poolVdevs,     setPoolVdevs]     = useState<Record<string, any[]>>({});
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const showToast = (msg: string, type: 'success' | 'error') => {
    notify({ type, title: type === 'success' ? 'Success' : 'Error', message: msg });
  };

  useEffect(() => {
    pools.forEach(pool => {
      if (!poolVdevs[pool.name]) {
        api.getPoolVdevs(pool.name)
          .then(res => setPoolVdevs(prev => ({ ...prev, [pool.name]: res.vdevs || [] })))
          .catch(() => {});
      }
      api.getScrubStatus(pool.name).then(res => {
        if (res.in_progress) {
          setScrubState(s => ({ ...s, [pool.name]: 'running' }));
          setScrubProgress(p => ({ ...p, [pool.name]: {
            inProgress: true, done: false,
            progress: res.progress || 0, timeRemaining: res.time_remaining || '', scan: res.scan || '',
          }}));
          startScrubPolling(pool.name);
        }
      }).catch(() => {});
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

  // Set of all disk paths currently in use by any pool
  const usedDisksSet = new Set<string>(
    Object.values(poolVdevs)
      .flatMap((vdevs: any) => (vdevs || []).flatMap((v: any) => (v.disks || []).map((d: any) => d.path || d)))
  );

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
    setConfirmState({
      title: "Start ZFS Scrub",
      message: `Are you sure you want to start a ZFS scrub on pool "${poolName}"? A scrub validates the integrity of all data by reading every block and comparing its checksum. This can consume significant disk bandwidth and temporarily impact system performance.`,
      onConfirm: async () => {
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
      }
    });
  };

  const handleResilver = async (poolName: string) => {
    setConfirmState({
      title: "Start ZFS Resilver (Scrub)",
      message: `Are you sure you want to start a ZFS resilver (rewrite/scrub) on pool "${poolName}"? This will check all mirrored or parity copies and synchronize any out-of-sync blocks.`,
      onConfirm: async () => {
        try {
          await api.resilverPool(poolName);
          showToast(`Rewrite (scrub) started on ${poolName}`, 'success');
          setScrubState(s => ({ ...s, [poolName]: 'running' }));
          startScrubPolling(poolName);
        } catch (err: any) {
          showToast(err.message || 'Rewrite failed', 'error');
        }
      }
    });
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
      } finally { setStatusLoading(null); }
    }
  };

  return (
    <div style={{ paddingBottom: 48 }}>

      {/* Modals */}
      {showCreate && (
        <CreatePoolModal
          onClose={() => setShowCreate(false)}
          onSuccess={name => { setShowCreate(false); showToast(`Pool "${name}" created`, 'success'); onRefresh(); }}
          usedDisks={usedDisksSet}
        />
      )}
      {showImport && (
        <ImportPoolModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { showToast('Pool imported', 'success'); setShowImport(false); onRefresh(); }}
        />
      )}
      {expandTarget && (
        <ExpandPoolModal
          poolName={expandTarget}
          poolDisks={getPoolDisks(expandTarget)}
          onClose={() => setExpandTarget(null)}
          onSuccess={() => { showToast(`Pool "${expandTarget}" expanded`, 'success'); setExpandTarget(null); onRefresh(); }}
          usedDisks={usedDisksSet}
        />
      )}
      {replaceTarget && (
        <ReplaceDiskModal
          poolName={replaceTarget.pool}
          poolDisks={getPoolDisks(replaceTarget.pool)}
          preselectedDisk={replaceTarget.preselectedDisk}
          onClose={() => setReplaceTarget(null)}
          onSuccess={() => { showToast('Disk replacement started', 'success'); setReplaceTarget(null); onRefresh(); }}
          usedDisks={usedDisksSet}
        />
      )}
      {smartTarget && <SmartModal device={smartTarget} onClose={() => setSmartTarget(null)} />}
      {settingsOpenFor && (
        <SettingsPopout
          poolName={settingsOpenFor}
          onClose={() => setSettingsOpenFor(null)}
          onSaved={() => { showToast(`Settings saved for ${settingsOpenFor}`, 'success'); onRefresh(); }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {pools.length} pool{pools.length !== 1 ? 's' : ''}
          </span>
          {zfsVersion && (
            <span className="badge">{zfsVersion.replace('zfs-', '')}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={13} /> Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Create Pool
          </button>
        </div>
      </div>

      {/* Pool cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pools.map(pool => {
          const state      = scrubState[pool.name] || 'idle';
          const progress   = scrubProgress[pool.name];
          const isExpanded = expandedPool === pool.name;
          const raidType   = getPoolRaidType(pool.name);
          const disks      = getPoolDisks(pool.name);
          const rc         = raidColor(raidType);
          const capColor   = pool.cap > 90 ? 'var(--danger)' : pool.cap > 80 ? 'var(--warning)' : 'var(--accent)';
          const isOnline   = pool.health === 'ONLINE';

          return (
            <div key={pool.name} style={{ background: 'var(--bg-surface)', border: `1px solid ${isOnline ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

              {/* Card header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  {/* Name + badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Database size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{pool.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span className={isOnline ? 'badge badge-success' : pool.health === 'DEGRADED' ? 'badge badge-warning' : 'badge badge-danger'}>
                          {pool.health}
                        </span>
                        {raidType !== '—' && (
                          <span className="badge" style={{ color: rc, borderColor: rc + '44', background: rc + '18' }}>{raidType}</span>
                        )}
                        {(pool as any).dedup && (pool as any).dedup !== '1.00x' && (
                          <span className="badge">DEDUP {(pool as any).dedup}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleScrub(pool.name)}
                      disabled={state === 'running'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: state === 'running' ? 'var(--warning)' : state === 'success' ? 'var(--success)' : state === 'error' ? 'var(--danger)' : 'var(--text-secondary)',
                        borderColor: state === 'running' ? 'rgba(245,158,11,0.3)' : state === 'success' ? 'rgba(34,197,94,0.3)' : undefined,
                      }}
                    >
                      {state === 'running' && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                      {state === 'success' && <CheckCircle size={13} />}
                      {state === 'error'   && <XCircle size={13} />}
                      {state === 'idle'    && <Activity size={13} />}
                      {state === 'running' ? 'Scrubbing…' : state === 'success' ? 'Done' : state === 'error' ? 'Failed' : 'Scrub'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setReplaceTarget({ pool: pool.name })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ArrowLeftRight size={13} /> Replace Disk
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleToggleStatus(pool.name)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Info size={13} />
                      {isExpanded ? 'Hide' : 'Status'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setSettingsOpenFor(settingsOpenFor === pool.name ? null : pool.name)}
                      title="Pool Settings"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, color: settingsOpenFor === pool.name ? 'var(--accent)' : undefined, borderColor: settingsOpenFor === pool.name ? 'var(--accent-mid)' : undefined }}
                    >
                      <Settings size={13} />
                    </button>
                  </div>
                </div>

                {/* Usage bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>Storage usage</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: capColor, fontWeight: 700 }}>{pool.cap}%</span>
                  </div>
                  <div className="progress-track" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${Math.min(pool.cap, 100)}%`, background: capColor }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{pool.alloc} used</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{pool.free} free of {pool.size}</span>
                  </div>
                </div>
              </div>

              {/* Stats row & Scrub Progress */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, padding: '0', borderBottom: '1px solid var(--border)' }}>
                {[
                  { label: 'Fragmentation', value: `${(pool as any).frag ?? 0}%`, color: (pool as any).frag > 20 ? 'var(--warning)' : 'var(--text-primary)' },
                  { label: 'Dedup Ratio',   value: (pool as any).dedup || '1.00x', color: 'var(--text-primary)' },
                  { label: 'Disks',         value: disks.length > 0 ? String(disks.length) : '—', color: 'var(--text-primary)' },
                  { label: 'RAID Type',     value: raidType,                       color: rc },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '14px 20px', borderRight: '1px solid var(--border)', minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color }}>{value}</div>
                  </div>
                ))}

                {/* Scrub progress */}
                {state === 'running' && progress && (
                  <div style={{ flex: 1, minWidth: 200, padding: '10px 20px', background: 'rgba(245,158,11,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--warning)', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Scrubbing
                      </span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {progress.timeRemaining && <span style={{ color: 'var(--text-muted)' }}>{progress.timeRemaining} rem</span>}
                        <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{progress.progress.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress.progress}%`, background: 'var(--warning)', borderRadius: 9999, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Disk list */}
              {disks.length > 0 && (
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Disks</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                    {disks.map((disk, di) => (
                      <DiskRow key={di} disk={disk} poolName={pool.name}
                        onReplace={d => setReplaceTarget({ pool: pool.name, preselectedDisk: d })}
                        onSmartClick={d => setSmartTarget(d)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced actions */}
              <div style={{ padding: '12px 24px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => setExpandTarget(pool.name)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <Expand size={12} /> Expand Pool
                </button>
                <button className="btn btn-ghost" onClick={() => handleResilver(pool.name)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <RotateCcw size={12} /> Resilver (Scrub)
                </button>
              </div>

              {/* Expanded status */}
              {isExpanded && (
                <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                    zpool status {pool.name}
                  </div>
                  {statusLoading === pool.name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: 12 }}>Fetching status…</span>
                    </div>
                  ) : (
                    <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {poolStatus[pool.name] || 'No data available'}
                    </pre>
                  )}
                </div>
              )}

            </div>
          );
        })}

        {pools.length === 0 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '80px 40px', textAlign: 'center' }}>
            <Database size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, margin: '0 auto 16px', display: 'block' }} strokeWidth={1} />
            <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No Pools Detected</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Create or import a ZFS pool to get started.</p>
          </div>
        )}
      </div>

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
  );
}
