import React, { useState, useEffect, useCallback } from 'react';
import { Key, Lock, Plus, Trash2, Eye, EyeOff, CheckCircle, XCircle, Copy, AlertTriangle, Monitor, Database, Shield, Zap } from 'lucide-react';
import { api } from '../api';
import PageTransition from './PageTransition';
import { useIsMobile } from '../hooks/useBreakpoint';

interface SettingsProps {
  onPasswordChanged?: () => void;
  pools?: any[];
  selectedPool?: string;
  onSelectPool?: (name: string) => void;
}

interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

interface ToastEntry {
  id: number;
  msg: string;
  type: 'success' | 'error';
}

let toastIdCounter = 0;

type Tab = 'security' | 'api' | 'appearance' | 'general';

function ToastItem({ entry, onClose }: { entry: ToastEntry; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  const col = entry.type === 'success' ? 'var(--success)' : 'var(--danger)';
  const dim = entry.type === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)';
  const bdr = entry.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 'var(--radius-lg)', border: `1px solid ${bdr}`, background: dim, color: col, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, minWidth: 260, animation: 'toastSlideIn 0.2s ease' }}>
      {entry.type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
      {entry.msg}
      <button onClick={onClose} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: col, opacity: 0.6, fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

function ToastContainer({ toasts, onClose }: { toasts: ToastEntry[]; onClose: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <>
      <style>{`@keyframes toastSlideIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div style={{ position: 'fixed', top: 70, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => <ToastItem key={t.id} entry={t} onClose={() => onClose(t.id)} />)}
      </div>
    </>
  );
}

/* ── Shared row layout ── */
function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '16px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {description && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{ width: 44, height: 22, borderRadius: 11, flexShrink: 0, background: value ? 'var(--success)' : 'var(--bg-elevated)', border: `1px solid ${value ? 'var(--success)' : 'var(--border)'}`, position: 'relative', cursor: 'pointer', transition: 'all 0.2s' }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40, padding: '0 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.12s',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11,
  fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 8,
};

/* ── Security tab ── */
function SecurityTab({ onSuccess }: { onSuccess: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const strength = (() => {
    if (next.length === 0) return null;
    if (next.length < 12)  return { label: 'Too short', color: 'var(--danger)', pct: 20 };
    let score = 0;
    if (/[a-z]/.test(next)) score++;
    if (/[A-Z]/.test(next)) score++;
    if (/[0-9]/.test(next)) score++;
    if (/[^a-zA-Z0-9]/.test(next)) score++;
    if (next.length >= 16) score++;
    if (score <= 2) return { label: 'Weak',       color: 'var(--warning)', pct: 40 };
    if (score <= 3) return { label: 'Fair',        color: '#f59e0b',        pct: 65 };
    if (score <= 4) return { label: 'Strong',      color: 'var(--success)', pct: 85 };
    return            { label: 'Very strong', color: 'var(--success)', pct: 100 };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (next !== confirm) { setError('New passwords do not match'); return; }
    if (next.length < 12) { setError('Password must be at least 12 characters'); return; }
    setLoading(true);
    try { await api.changePassword(current, next, confirm); setCurrent(''); setNext(''); setConfirm(''); onSuccess(); }
    catch (err: any) { setError(err.message || 'Failed to change password'); }
    finally { setLoading(false); }
  };

  const focusBorder = { onFocus: (e: any) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }, onBlur: (e: any) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Info card */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.18)', borderRadius: 'var(--radius)' }}>
        <Shield size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          Use a password of at least <strong style={{ color: 'var(--text-primary)' }}>12 characters</strong> with a mix of uppercase, lowercase, numbers, and symbols for best security.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <SettingRow label="Current Password">
          <div style={{ position: 'relative' }}>
            <input type={showCurrent ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)} style={{ ...inputStyle, width: 280, paddingRight: 44 }} placeholder="Current password" {...focusBorder} />
            <button type="button" onClick={() => setShowCurrent(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>{showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>
        </SettingRow>

        <SettingRow label="New Password" description="Minimum 12 characters">
          <div>
            <div style={{ position: 'relative', marginBottom: strength ? 8 : 0 }}>
              <input type={showNew ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)} style={{ ...inputStyle, width: 280, paddingRight: 44 }} placeholder="New password" {...focusBorder} />
              <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>{showNew ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </div>
            {strength && (
              <div>
                <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden', marginBottom: 4, width: 280 }}>
                  <div style={{ height: '100%', width: `${strength.pct}%`, background: strength.color, borderRadius: 9999, transition: 'all 0.3s' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: strength.color }}>{strength.label}</span>
              </div>
            )}
          </div>
        </SettingRow>

        <SettingRow label="Confirm New Password">
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={{ ...inputStyle, width: 280, borderColor: confirm && confirm !== next ? 'rgba(239,68,68,0.5)' : 'var(--border)' }} placeholder="Repeat new password" {...focusBorder} />
        </SettingRow>

        {error && (
          <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
            {error}
          </div>
        )}

        <div style={{ paddingTop: 20 }}>
          <button type="submit" disabled={loading || !current || !next || !confirm || next !== confirm} className="btn btn-primary" style={{ height: 40, fontSize: 14, padding: '0 24px', opacity: (loading || !current || !next || !confirm || next !== confirm) ? 0.5 : 1 }}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── API Keys tab ── */
function ApiKeysTab({ addToast }: { addToast: (msg: string, type: 'success' | 'error') => void }) {
  const [keys, setKeys]             = useState<ApiKeyRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermission, setNewKeyPermission] = useState('read');
  const [creating, setCreating]     = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    try { const res = await api.getApiKeys(); setKeys(res.keys || []); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.createApiKey(newKeyName.trim(), newKeyPermission);
      setNewKeyValue(res.key); setNewKeyName(''); setNewKeyPermission('read');
      await load();
    } catch (err: any) { addToast(err.message || 'Failed to create API key', 'error'); }
    finally { setCreating(false); }
  };

  const handleRevoke = (id: number, name: string) => {
    setConfirmState({
      title: 'Revoke API Key',
      message: `Revoke "${name}"? Any integrations using this key will immediately lose access.`,
      onConfirm: async () => {
        try { await api.revokeApiKey(id); addToast(`Key "${name}" revoked`, 'success'); await load(); }
        catch (err: any) { addToast(err.message || 'Failed to revoke key', 'error'); }
      },
    });
  };

  const handleCopy = async () => {
    if (!newKeyValue) return;
    try { await navigator.clipboard.writeText(newKeyValue); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* ignore */ }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const permBadge = (p: string) => {
    const color = p === 'admin' ? 'var(--danger)' : p === 'readwrite' ? 'var(--warning)' : 'var(--success)';
    return <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '18', border: `1px solid ${color}44`, borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info card */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.18)', borderRadius: 'var(--radius)' }}>
        <Key size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          API keys grant programmatic access to the ZFS Manager API. Store them securely — they are <strong style={{ color: 'var(--text-primary)' }}>only shown once</strong>.
        </p>
      </div>

      {/* New key created banner */}
      {newKeyValue && (
        <div style={{ padding: 16, borderRadius: 'var(--radius)', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 10 }}>
            Key created — copy it now, it will not be shown again
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', color: 'var(--success)', wordBreak: 'break-all' }}>
              {newKeyValue}
            </code>
            <button onClick={handleCopy} className="btn btn-secondary" style={{ flexShrink: 0 }}>
              <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setNewKeyValue(null)} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Create new key */}
      <div>
        <label style={labelStyle}>Create New Key</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. ci-deploy)" style={{ ...inputStyle, flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <select value={newKeyPermission} onChange={e => setNewKeyPermission(e.target.value)} style={{ ...inputStyle, width: 140, cursor: 'pointer' }}>
            <option value="read">Read only</option>
            <option value="readwrite">Read / Write</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={handleCreate} disabled={creating || !newKeyName.trim()} className="btn btn-primary" style={{ flexShrink: 0, opacity: (creating || !newKeyName.trim()) ? 0.5 : 1 }}>
            <Plus size={14} /> {creating ? 'Creating…' : 'Create Key'}
          </button>
        </div>
      </div>

      {/* Keys list */}
      {loading ? (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Loading…</span>
        </div>
      ) : keys.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
          <Key size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)' }}>No API keys yet</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <Key size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{k.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span>prefix: <span style={{ color: 'var(--text-secondary)' }}>{k.prefix}…</span></span>
                  <span>created: {formatDate(k.created_at)}</span>
                  {k.last_used_at && <span>used: {formatDate(k.last_used_at)}</span>}
                </div>
              </div>
              <button className="btn btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', flexShrink: 0 }} onClick={() => handleRevoke(k.id, k.name)}>
                <Trash2 size={11} /> Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                <AlertTriangle size={20} />
              </div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{confirmState.title}</h4>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px 0' }}>{confirmState.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmState(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { confirmState.onConfirm(); setConfirmState(null); }} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}>Revoke</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Appearance tab ── */
function AppearanceTab() {
  const [animEnabled, setAnimEnabled] = useState(localStorage.getItem('page_animations') !== 'false');

  const toggle = () => {
    const next = !animEnabled;
    setAnimEnabled(next);
    localStorage.setItem('page_animations', next ? 'true' : 'false');
  };

  return (
    <div>
      <SettingRow label="Page transition animations" description="Slide-in animation when switching between pages">
        <Toggle value={animEnabled} onChange={toggle} />
      </SettingRow>
    </div>
  );
}

/* ── General tab ── */
function GeneralTab({ pools, selectedPool, onSelectPool }: { pools: any[]; selectedPool?: string; onSelectPool?: (name: string) => void }) {
  const [defaultPool, setDefaultPool] = useState(() => selectedPool || localStorage.getItem('zfs_default_pool') || pools[0]?.name || '');

  useEffect(() => { if (selectedPool && selectedPool !== defaultPool) setDefaultPool(selectedPool); }, [selectedPool]);

  const handleChange = (name: string) => {
    setDefaultPool(name);
    localStorage.setItem('zfs_default_pool', name);
    onSelectPool?.(name);
  };

  return (
    <div>
      <SettingRow label="Default Pool" description="Pre-selected pool on Dashboard and Performance">
        <select value={defaultPool} onChange={e => handleChange(e.target.value)} style={{ ...inputStyle, height: 36, width: 200, cursor: 'pointer' }}>
          {pools.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </SettingRow>
    </div>
  );
}

/* ── Tab definition ── */
const TABS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'security',   label: 'Security',   icon: <Lock size={15} />,    desc: 'Password & authentication' },
  { id: 'api',        label: 'API Keys',   icon: <Key size={15} />,     desc: 'Programmatic access tokens' },
  { id: 'appearance', label: 'Appearance', icon: <Monitor size={15} />, desc: 'Interface preferences' },
  { id: 'general',    label: 'General',    icon: <Database size={15} />, desc: 'Application defaults' },
];

/* ── Main Settings page ── */
export default function Settings({ onPasswordChanged, pools = [], selectedPool, onSelectPool }: SettingsProps) {
  const isMobile = useIsMobile();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('security');

  const addToast = useCallback((msg: string, type: 'success' | 'error') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, msg, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handlePasswordChanged = () => {
    addToast('Password updated successfully', 'success');
    onPasswordChanged?.();
  };

  const visibleTabs = TABS.filter(t => t.id !== 'general' || pools.length > 1);

  return (
    <PageTransition>
    <div style={{ paddingBottom: 48 }}>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)' }}>
          Manage security, API access, and interface preferences
        </p>
      </div>

      {/* Layout: sidebar + content */}
      <div className="settings-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Sidebar nav — horizontal tab bar on mobile, vertical sidebar on desktop */}
        <div
          className="settings-sidebar"
          style={isMobile
            ? { width: '100%', flexShrink: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex' }
            : { width: 220, flexShrink: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }
          }
        >
          {visibleTabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={isMobile ? {
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '12px 8px', textAlign: 'center',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  cursor: 'pointer', transition: 'all 0.12s',
                } : {
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', textAlign: 'left',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>{tab.icon}</span>
                {isMobile ? (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{tab.label}</span>
                ) : (
                  <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>{tab.label}</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{tab.desc}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: isMobile ? 16 : 28 }}>
          {/* Section title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius)', background: 'rgba(99,179,237,0.1)', border: '1px solid rgba(99,179,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
              {TABS.find(t => t.id === activeTab)?.icon}
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
                {TABS.find(t => t.id === activeTab)?.desc}
              </p>
            </div>
          </div>

          {activeTab === 'security'   && <SecurityTab onSuccess={handlePasswordChanged} />}
          {activeTab === 'api'        && <ApiKeysTab addToast={addToast} />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'general'    && pools.length > 1 && <GeneralTab pools={pools} selectedPool={selectedPool} onSelectPool={onSelectPool} />}
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
