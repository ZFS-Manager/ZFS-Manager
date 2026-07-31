import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Package, Play, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, History, RefreshCw, ArrowUpCircle, Search,
  Database, Loader2, Server
} from 'lucide-react';
import { api } from '../api';
import { ActiveModule, ModuleRun, StoreModule } from '../types';
import ModuleConfigForm from '../components/ModuleConfigForm';
import PageTransition from '../components/PageTransition';
import ConfirmDialog from '../components/ConfirmDialog';
import { useNotifications } from '../context/NotificationContext';
import { getActiveModulesCached, getModuleStoreCached, isUpdateAvailable } from '../utils/moduleCache';

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', background: 'transparent',
  color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  flex: 1, height: 38, padding: '0 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatVersion(version?: string): string {
  if (!version) return '';
  const trimmed = version.trim();
  if (!trimmed) return '';
  const clean = trimmed.replace(/^v+/i, '');
  return `v${clean}`;
}

function RunStatus({ success }: { success: boolean | null }) {
  if (success === null) return <Clock size={14} style={{ color: 'var(--warning)' }} />;
  return success
    ? <CheckCircle size={14} style={{ color: 'var(--success, #22c55e)' }} />
    : <XCircle size={14} style={{ color: 'var(--danger)' }} />;
}

export default function ActiveModules() {
  const { notify } = useNotifications();
  const [modules, setModules] = useState<ActiveModule[]>([]);
  const [storeModulesMap, setStoreModulesMap] = useState<Record<string, StoreModule>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, ModuleRun[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uninstallTarget, setUninstallTarget] = useState<ActiveModule | null>(null);

  // ── Module database selection (internal PostgreSQL vs. external server) ──
  const [dbMode, setDbMode] = useState<'internal' | 'external'>('internal');
  const [dbForm, setDbForm] = useState({ host: '', port: 5432, username: '', database: '', password: '' });
  const [dbHasPassword, setDbHasPassword] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Any change to the connection form invalidates a previous test result.
  const patchDbForm = (patch: Partial<typeof dbForm>) => {
    setDbForm(f => ({ ...f, ...patch }));
    setDbTestResult(null);
  };

  const loadDbSettings = async () => {
    try {
      const res = await api.getModuleDbSettings();
      setDbMode(res.mode);
      setDbForm({
        host: res.external.host,
        port: res.external.port || 5432,
        username: res.external.username,
        database: res.external.database,
        password: '',
      });
      setDbHasPassword(res.external.has_password);
    } catch { /* settings are non-critical */ }
  };

  const saveDbSettings = async () => {
    setDbSaving(true);
    try {
      const res = await api.updateModuleDbSettings(
        dbMode === 'internal'
          ? { mode: 'internal' }
          : {
              mode: 'external',
              external: {
                host: dbForm.host.trim(),
                port: Number(dbForm.port) || 5432,
                username: dbForm.username.trim(),
                database: dbForm.database.trim(),
                ...(dbForm.password ? { password: dbForm.password } : {}),
              },
            }
      );
      setDbHasPassword(res.external.has_password);
      setDbForm(f => ({ ...f, password: '' }));
      notify({
        type: 'success',
        title: 'Module Database',
        message: dbMode === 'internal'
          ? 'Interne PostgreSQL-Datenbank aktiviert.'
          : 'Externe Datenbankverbindung gespeichert.',
        toastOnly: true,
      });
    } catch (err) {
      notify({ type: 'error', title: 'Module Database', message: `Speichern fehlgeschlagen: ${(err as Error).message}` });
    } finally {
      setDbSaving(false);
    }
  };

  const testDbConnection = async () => {
    setDbTesting(true);
    setDbTestResult(null);
    try {
      const res = await api.testModuleDbConnection({
        host: dbForm.host.trim(),
        port: Number(dbForm.port) || 5432,
        username: dbForm.username.trim(),
        database: dbForm.database.trim(),
        ...(dbForm.password ? { password: dbForm.password } : {}),
      });
      setDbTestResult(res);
    } catch (err) {
      setDbTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setDbTesting(false);
    }
  };

  const reload = async (forceRefresh = false, silent = false) => {
    setLoading(true);
    try {
      const [activeRes, storeRes] = await Promise.all([
        getActiveModulesCached(forceRefresh),
        getModuleStoreCached(forceRefresh),
      ]);
      setModules(activeRes.modules);

      const map: Record<string, StoreModule> = {};
      storeRes.modules.forEach(m => { map[m.id] = m; });
      setStoreModulesMap(map);

      if (forceRefresh && !silent) {
        notify({ type: 'success', title: 'Active Modules', message: 'Module Cache erfolgreich aktualisiert.', toastOnly: true });
      }
    } catch (err) {
      notify({ type: 'error', title: 'Modules', message: `Failed to load modules: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); loadDbSettings(); }, []);

  const loadRuns = async (id: string) => {
    try {
      const res = await api.getModuleRuns(id);
      setRuns(r => ({ ...r, [id]: res.runs }));
    } catch { /* run history is non-critical */ }
  };

  const toggleExpand = (id: string) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) loadRuns(next);
  };

  const toggleEnabled = async (mod: ActiveModule) => {
    try {
      await api.setModuleEnabled(mod.id, !mod.enabled);
      await reload(true, true);
    } catch (err) {
      notify({ type: 'error', title: 'Modules', message: `Toggle failed: ${(err as Error).message}` });
    }
  };

  const runNow = async (mod: ActiveModule) => {
    setBusy(mod.id);
    try {
      const result = await api.runModule(mod.id);
      notify({
        type: result.success ? 'success' : 'error',
        title: mod.name,
        message: result.success
          ? `Run finished: ${result.metrics_written} metrics written`
          : `Run failed: ${result.error ?? 'unknown error'}`,
      });
      await reload(true, true);
      await loadRuns(mod.id);
    } catch (err) {
      notify({ type: 'error', title: mod.name, message: `Run failed: ${(err as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const uninstall = (mod: ActiveModule) => {
    setUninstallTarget(mod);
  };

  const confirmUninstall = async () => {
    const mod = uninstallTarget;
    if (!mod) return;
    setUninstallTarget(null);
    // Optimistic update: remove the module from the list immediately so the UI
    // stays fluid instead of waiting for the backend round-trip.
    setModules(prev => prev.filter(m => m.id !== mod.id));
    setExpanded(null);
    try {
      await api.uninstallModule(mod.id);
      notify({ type: 'success', title: 'Modules', message: `"${mod.name}" uninstalled` });
      await reload(true, true);
    } catch (err) {
      notify({ type: 'error', title: 'Modules', message: `Uninstall failed: ${(err as Error).message}` });
      await reload(true, true); // restore consistent state on failure
    }
  };

  const saveConfig = async (mod: ActiveModule, config: Record<string, unknown>, secrets: Record<string, string | null>) => {
    try {
      await api.updateModuleConfig(mod.id, config, secrets);
      notify({ type: 'success', title: mod.name, message: 'Configuration saved' });
      await reload(true, true);
    } catch (err) {
      notify({ type: 'error', title: mod.name, message: `Saving failed: ${(err as Error).message}` });
      throw err;
    }
  };

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Active Modules
            </h2>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Installed modules, their schedules, configuration and run history.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: 9, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search active modules..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 34, width: '100%', height: 32 }}
              />
            </div>
            <button style={buttonStyle} onClick={() => reload(true)} disabled={loading} title="Cache leeren & Registries neu abfragen">
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Module database selection ── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius)', flexShrink: 0,
              background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Database size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Module Database
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Wähle, wo Modul-Daten gespeichert werden — internes PostgreSQL oder ein externer Server.
              </div>
            </div>
            {/* Segmented Internal / External switch */}
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0 }}>
              {(['internal', 'external'] as const).map(m => {
                const active = dbMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => { setDbMode(m); setDbTestResult(null); }}
                    style={{
                      height: 32, padding: '0 16px', border: 'none',
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.12s',
                      borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                      display: 'flex', alignItems: 'center', gap: 6,
                      textTransform: 'capitalize',
                    }}
                  >
                    {m === 'internal' ? <Database size={13} /> : <Server size={13} />}
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {dbMode === 'internal' ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}>
              <CheckCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Internes <strong style={{ color: 'var(--text-primary)' }}>PostgreSQL</strong> (Standard) — Modul-Daten werden in der eingebetteten Datenbank gespeichert.
              </span>
              <button
                className="btn btn-primary"
                style={{ marginLeft: 'auto', flexShrink: 0, opacity: dbSaving ? 0.6 : 1 }}
                disabled={dbSaving}
                onClick={saveDbSettings}
              >
                {dbSaving ? <Loader2 size={13} className="spin" /> : <CheckCircle size={13} />} {dbSaving ? 'Speichern…' : 'Übernehmen'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    IP-Adresse / Host *
                  </label>
                  <input
                    type="text"
                    value={dbForm.host}
                    onChange={e => patchDbForm({ host: e.target.value })}
                    placeholder="z. B. 192.168.1.50"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Port
                  </label>
                  <input
                    type="number"
                    value={dbForm.port}
                    onChange={e => patchDbForm({ port: parseInt(e.target.value, 10) || 5432 })}
                    placeholder="5432"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    value={dbForm.username}
                    onChange={e => patchDbForm({ username: e.target.value })}
                    placeholder="zfs_modules"
                    autoComplete="off"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Passwort
                  </label>
                  <input
                    type="password"
                    value={dbForm.password}
                    onChange={e => patchDbForm({ password: e.target.value })}
                    placeholder={dbHasPassword ? '••••••••  (gespeichert — leer lassen zum Behalten)' : 'Passwort'}
                    autoComplete="new-password"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Datenbankname *
                  </label>
                  <input
                    type="text"
                    value={dbForm.database}
                    onChange={e => patchDbForm({ database: e.target.value })}
                    placeholder="zfs_metrics"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: dbTesting ? 0.6 : 1 }}
                  disabled={dbTesting || !dbForm.host.trim() || !dbForm.username.trim() || !dbForm.database.trim()}
                  onClick={testDbConnection}
                >
                  {dbTesting ? <Loader2 size={13} className="spin" /> : <Server size={13} />}
                  {dbTesting ? 'Teste…' : 'Verbindung testen'}
                </button>
                <button
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: dbSaving ? 0.6 : 1 }}
                  disabled={dbSaving || !dbForm.host.trim() || !dbForm.username.trim() || !dbForm.database.trim()}
                  onClick={saveDbSettings}
                >
                  {dbSaving ? <Loader2 size={13} className="spin" /> : <CheckCircle size={13} />}
                  {dbSaving ? 'Speichern…' : 'Speichern'}
                </button>
                {dbTestResult && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                    color: dbTestResult.ok ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {dbTestResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                    {dbTestResult.message}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Das Passwort wird verschlüsselt (AES-256-GCM) gespeichert. Leer lassen, um das gespeicherte Passwort beizubehalten.
              </div>
            </div>
          )}
        </div>

        {!loading && modules.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
            No modules installed yet — visit the Store to install one.
          </div>
        )}

        {modules.filter(mod => 
          mod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          mod.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          mod.description.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(mod => {
          const storeMod = storeModulesMap[mod.id];
          const hasUpdate = storeMod ? isUpdateAvailable(mod.version, storeMod.version) : false;

          return (
            <div key={mod.id} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', overflow: 'hidden',
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => toggleExpand(mod.id)}
              >
                <div style={{
                  width: 34, height: 34, background: 'var(--accent-dim)',
                  border: '1px solid var(--accent-mid)', borderRadius: 'var(--radius)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Package size={16} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {mod.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                      {formatVersion(mod.version)}{mod.source === 'sideload' ? ' · sideloaded' : ''}
                    </span>
                    {hasUpdate && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning, #f59e0b)',
                        border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 4,
                        padding: '2px 7px', fontSize: 10, fontWeight: 700,
                        fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.04em'
                      }}>
                        <ArrowUpCircle size={11} /> Update Available
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {mod.last_run
                      ? <><RunStatus success={mod.last_run.success} /> Last run {formatTime(mod.last_run.started_at)}</>
                      : 'Never ran'}
                  </div>
                </div>

              <button
                onClick={e => { e.stopPropagation(); toggleEnabled(mod); }}
                title={mod.enabled ? 'Disable schedule' : 'Enable schedule'}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: mod.enabled ? 'var(--accent)' : 'var(--border)',
                  position: 'relative', transition: 'background 0.15s ease', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: mod.enabled ? 21 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.15s ease',
                }} />
              </button>
              {expanded === mod.id ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
            </div>

            {expanded === mod.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
                  {mod.description}
                </p>

                {/* Dynamic Actions & Execution Buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={buttonStyle} disabled={busy === mod.id} onClick={() => runNow(mod)}>
                    <Play size={13} /> {busy === mod.id ? 'Running…' : 'Run now'}
                  </button>

                  {mod.actions?.map(act => (
                    <button
                      key={act.key}
                      style={{ ...buttonStyle, borderColor: 'var(--accent-mid)', color: 'var(--accent)' }}
                      disabled={busy === mod.id}
                      onClick={async () => {
                        try {
                          setBusy(mod.id);
                          const res = await api.executeModuleAction(mod.id, act.key);
                          notify({
                            type: res.success ? 'success' : 'error',
                            title: `${mod.name}: ${act.label}`,
                            message: res.message || (res.success ? 'Action executed' : 'Action failed'),
                          });
                          await reload();
                          await loadRuns(mod.id);
                        } catch (err) {
                          notify({ type: 'error', title: mod.name, message: `Action failed: ${(err as Error).message}` });
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Play size={13} /> {act.label}
                    </button>
                  ))}

                  <button
                    style={{ ...buttonStyle, color: 'var(--danger)' }}
                    onClick={() => uninstall(mod)}
                  >
                    <Trash2 size={13} /> Uninstall
                  </button>
                </div>

                {/* Dynamic Status Fields */}
                {mod.status_fields && mod.status_fields.length > 0 && (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Module Status & Fields
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {mod.status_fields.map(sf => (
                        <div key={sf.key} style={{ background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>{sf.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                            {sf.unit ? `— ${sf.unit}` : 'Active'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <ModuleConfigForm
                  module={mod}
                  onSave={(config, secrets) => saveConfig(mod, config, secrets)}
                />

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <History size={13} color="var(--text-muted)" />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Run history
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                    {(runs[mod.id] ?? []).map(run => (
                      <div key={run.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px',
                        background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius)',
                        fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)',
                      }}>
                        <RunStatus success={run.success} />
                        <span style={{ whiteSpace: 'nowrap' }}>{formatTime(run.started_at)}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{run.trigger}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{run.metrics_written} metrics</span>
                        {run.message && (
                          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                            {run.message.length > 300 ? run.message.slice(0, 300) + '…' : run.message}
                          </span>
                        )}
                      </div>
                    ))}
                    {(runs[mod.id] ?? []).length === 0 && (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)' }}>No runs yet.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
           </div>
         );
       })}

      <AnimatePresence>
        {uninstallTarget && (
          <ConfirmDialog
            title="Modul deinstallieren"
            message={`Modul "${uninstallTarget.name}" wirklich deinstallieren? Konfiguration und Ausführungs-Verlauf werden gelöscht.`}
            confirmLabel="Deinstallieren"
            variant="danger"
            onConfirm={confirmUninstall}
            onCancel={() => setUninstallTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  </PageTransition>
  );
}
