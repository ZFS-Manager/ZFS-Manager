import React, { useEffect, useState } from 'react';
import {
  Package, Play, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, History,
} from 'lucide-react';
import { api } from '../api';
import { ActiveModule, ModuleRun } from '../types';
import ModuleConfigForm from '../components/ModuleConfigForm';
import PageTransition from '../components/PageTransition';
import { useNotifications } from '../context/NotificationContext';

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', background: 'transparent',
  color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer',
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, ModuleRun[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const res = await api.getActiveModules();
      setModules(res.modules);
    } catch (err) {
      notify({ type: 'error', title: 'Modules', message: `Failed to load modules: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

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
      await reload();
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
      await reload();
      await loadRuns(mod.id);
    } catch (err) {
      notify({ type: 'error', title: mod.name, message: `Run failed: ${(err as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (mod: ActiveModule) => {
    if (!window.confirm(`Uninstall module "${mod.name}"? Its configuration and run history will be deleted.`)) return;
    try {
      await api.uninstallModule(mod.id);
      notify({ type: 'success', title: 'Modules', message: `"${mod.name}" uninstalled` });
      setExpanded(null);
      await reload();
    } catch (err) {
      notify({ type: 'error', title: 'Modules', message: `Uninstall failed: ${(err as Error).message}` });
    }
  };

  const saveConfig = async (mod: ActiveModule, config: Record<string, unknown>, secrets: Record<string, string | null>) => {
    try {
      await api.updateModuleConfig(mod.id, config, secrets);
      notify({ type: 'success', title: mod.name, message: 'Configuration saved' });
      await reload();
    } catch (err) {
      notify({ type: 'error', title: mod.name, message: `Saving failed: ${(err as Error).message}` });
      throw err;
    }
  };

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Active Modules
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Installed modules, their schedules, configuration and run history.
          </p>
        </div>

        {!loading && modules.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
            No modules installed yet — visit the Store to install one.
          </div>
        )}

        {modules.map(mod => (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {mod.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatVersion(mod.version)}{mod.source === 'sideload' ? ' · sideloaded' : ''}
                  </span>
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
        ))}
      </div>
    </PageTransition>
  );
}
