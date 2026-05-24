import React, { useState, useEffect, useCallback } from 'react';
import { Key, Lock, Plus, Trash2, Eye, EyeOff, CheckCircle, XCircle, Copy, AlertTriangle, Monitor, Database } from 'lucide-react';
import { api } from '../api';
import PageTransition from './PageTransition';

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

function ToastItem({ entry, onClose }: { entry: ToastEntry; onClose: () => void }) {
  const col = entry.type === 'success' ? 'var(--success)' : 'var(--danger)';
  const dim = entry.type === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)';
  const bdr = entry.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';

  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
      borderRadius: 'var(--radius-lg)', border: `1px solid ${bdr}`,
      background: dim, color: col, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
      minWidth: 260, animation: 'toastSlideIn 0.2s ease',
    }}>
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
        {toasts.map(t => (
          <ToastItem key={t.id} entry={t} onClose={() => onClose(t.id)} />
        ))}
      </div>
    </>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {sub && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
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

/* ── Change Password section ── */
function ChangePassword({ onSuccess }: { onSuccess: () => void }) {
  const [current, setCurrent]     = useState('');
  const [next, setNext]           = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const strength = (() => {
    if (next.length === 0) return null;
    if (next.length < 12)  return { label: 'Too short', color: 'var(--danger)', pct: 20 };
    let score = 0;
    if (/[a-z]/.test(next)) score++;
    if (/[A-Z]/.test(next)) score++;
    if (/[0-9]/.test(next)) score++;
    if (/[^a-zA-Z0-9]/.test(next)) score++;
    if (next.length >= 16) score++;
    if (score <= 2) return { label: 'Weak',   color: 'var(--warning)', pct: 40 };
    if (score <= 3) return { label: 'Fair',   color: '#f59e0b',        pct: 65 };
    if (score <= 4) return { label: 'Strong', color: 'var(--success)', pct: 85 };
    return { label: 'Very strong', color: 'var(--success)', pct: 100 };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    if (next.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(current, next, confirm);
      setCurrent(''); setNext(''); setConfirm('');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 28,
    }}>
      <SectionHeader
        title="Change Password"
        sub="Must be at least 12 characters. Use a mix of letters, numbers and symbols."
      />

      <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
        {/* Current password */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Current Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              style={{ ...inputStyle, paddingRight: 40 }}
              placeholder="Current password"
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showNew ? 'text' : 'password'}
              value={next}
              onChange={e => setNext(e.target.value)}
              style={{ ...inputStyle, paddingRight: 40 }}
              placeholder="New password (min 12 chars)"
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Strength meter */}
        {strength && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: `${strength.pct}%`, background: strength.color, borderRadius: 9999, transition: 'all 0.3s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: strength.color }}>{strength.label}</span>
          </div>
        )}

        {/* Confirm password */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Confirm New Password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            style={{
              ...inputStyle,
              borderColor: confirm && confirm !== next ? 'rgba(239,68,68,0.5)' : 'var(--border)',
            }}
            placeholder="Repeat new password"
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = confirm && confirm !== next ? 'rgba(239,68,68,0.5)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {confirm && confirm !== next && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
              Passwords do not match
            </p>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !current || !next || !confirm || next !== confirm}
          className="btn btn-primary"
          style={{ height: 40, fontSize: 14, width: '100%', opacity: (loading || !current || !next || !confirm || next !== confirm) ? 0.5 : 1 }}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

/* ── API Keys section ── */
function ApiKeys({ addToast }: { addToast: (msg: string, type: 'success' | 'error') => void }) {
  const [keys, setKeys]             = useState<ApiKeyRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermission, setNewKeyPermission] = useState('read');
  const [creating, setCreating]     = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    try {
      const res = await api.getApiKeys();
      setKeys(res.keys || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.createApiKey(newKeyName.trim(), newKeyPermission);
      setNewKeyValue(res.key);
      setNewKeyName('');
      setNewKeyPermission('read');
      await load();
    } catch (err: any) {
      addToast(err.message || 'Failed to create API key', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number, name: string) => {
    setConfirmState({
      title: "Revoke API Key",
      message: `Are you sure you want to revoke the API key "${name}"? Any external scripts or integrations using this key will immediately lose access. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.revokeApiKey(id);
          addToast(`Key "${name}" revoked`, 'success');
          await load();
        } catch (err: any) {
          addToast(err.message || 'Failed to revoke key', 'error');
        }
      }
    });
  };

  const handleCopy = async () => {
    if (!newKeyValue) return;
    try {
      await navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const selectStyle: React.CSSProperties = {
    height: 36, padding: '0 8px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)', fontSize: 13, cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 28,
    }}>
      <SectionHeader
        title="API Keys"
        sub="API keys grant programmatic access to the ZFS Manager API. Store them securely — they are only shown once."
      />

      {/* New key created banner */}
      {newKeyValue && (
        <div style={{
          marginBottom: 24, padding: 16, borderRadius: 'var(--radius)',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
        }}>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 10 }}>
            Key created — copy it now, it will not be shown again
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '8px 12px',
              color: 'var(--success)', wordBreak: 'break-all',
            }}>
              {newKeyValue}
            </code>
            <button
              onClick={handleCopy}
              className="btn btn-secondary"
              style={{ flexShrink: 0, gap: 6 }}
            >
              <Copy size={13} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewKeyValue(null)}
            style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create new key */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          type="text"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. ci-deploy)"
          style={{ ...inputStyle, flex: 1, height: 36 }}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
        />
        <select
          value={newKeyPermission}
          onChange={e => setNewKeyPermission(e.target.value)}
          style={selectStyle}
        >
          <option value="read">Read</option>
          <option value="readwrite">Read/Write</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={handleCreate}
          disabled={creating || !newKeyName.trim()}
          className="btn btn-primary"
          style={{ height: 36, gap: 6, flexShrink: 0, opacity: (creating || !newKeyName.trim()) ? 0.5 : 1 }}
        >
          <Plus size={14} />
          {creating ? 'Creating…' : 'Create Key'}
        </button>
      </div>

      {/* Keys table */}
      {loading ? (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Loading…</span>
        </div>
      ) : keys.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Key size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)' }}>No API keys yet</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key prefix</th>
                <th>Created</th>
                <th>Last used</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {k.name}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>
                      {k.prefix}…
                    </code>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatDate(k.created_at)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {k.last_used_at ? formatDate(k.last_used_at) : '—'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger"
                      style={{ height: 28, padding: '0 10px', fontSize: 11, gap: 4 }}
                      onClick={() => handleRevoke(k.id, k.name)}
                    >
                      <Trash2 size={11} />
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  );
}

/* ── General section (Default Pool) ── */
function General({ pools, selectedPool, onSelectPool }: { pools: any[]; selectedPool?: string; onSelectPool?: (name: string) => void }) {
  const [defaultPool, setDefaultPool] = useState(
    () => selectedPool || localStorage.getItem('zfs_default_pool') || pools[0]?.name || ''
  );

  // Keep local state in sync when parent selectedPool changes
  useEffect(() => {
    if (selectedPool && selectedPool !== defaultPool) setDefaultPool(selectedPool);
  }, [selectedPool]);

  const handleChange = (name: string) => {
    setDefaultPool(name);
    localStorage.setItem('zfs_default_pool', name);
    onSelectPool?.(name); // propagate to App.tsx state immediately
  };

  if (pools.length <= 1) return null;

  const selectStyle: React.CSSProperties = {
    height: 40, padding: '0 12px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)', fontSize: 14, cursor: 'pointer',
    minWidth: 200,
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 28 }}>
      <SectionHeader title="General" sub="Application-wide preferences." />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            Default Pool
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Pre-selected pool on Dashboard and Performance tab
          </div>
        </div>
        <select
          value={defaultPool}
          onChange={e => handleChange(e.target.value)}
          style={selectStyle}
        >
          {pools.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ── Appearance section ── */
function Appearance() {
  const [animEnabled, setAnimEnabled] = useState(
    localStorage.getItem('page_animations') !== 'false'
  );

  const toggle = () => {
    const next = !animEnabled;
    setAnimEnabled(next);
    localStorage.setItem('page_animations', next ? 'true' : 'false');
  };

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 28,
    }}>
      <SectionHeader
        title="Appearance"
        sub="Customize visual behavior of the interface."
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            Page transition animations
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Slide-in animation when switching between pages
          </div>
        </div>
        <button
          onClick={toggle}
          style={{
            width: 44, height: 22, borderRadius: 11, flexShrink: 0,
            background: animEnabled ? 'var(--success)' : 'var(--bg-elevated)',
            border: `1px solid ${animEnabled ? 'var(--success)' : 'var(--border)'}`,
            position: 'relative', cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: 2,
            left: animEnabled ? 22 : 2,
            width: 16, height: 16, borderRadius: 8,
            background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
      </div>
    </div>
  );
}

/* ── Main Settings page ── */
export default function Settings({ onPasswordChanged, pools = [], selectedPool, onSelectPool }: SettingsProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

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

  return (
    <PageTransition>
    <div style={{ paddingBottom: 48 }}>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4,
        }}>
          Settings
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)' }}>
          Manage your account security, API access and appearance
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* General section — only when multiple pools exist */}
        {pools.length > 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Database size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                General
              </span>
            </div>
            <General pools={pools} selectedPool={selectedPool} onSelectPool={onSelectPool} />
          </div>
        )}

        {/* Appearance section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Monitor size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Appearance
            </span>
          </div>
          <Appearance />
        </div>

        {/* Password section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Lock size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Account Security
            </span>
          </div>
          <ChangePassword onSuccess={handlePasswordChanged} />
        </div>

        {/* API Keys section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Key size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              API Access
            </span>
          </div>
          <ApiKeys addToast={addToast} />
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
