import React, { useEffect, useState } from 'react';
import { Package, Plus, Trash2, Download, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { StoreModule } from '../types';
import PageTransition from '../components/PageTransition';
import { useNotifications } from '../context/NotificationContext';

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 16,
  display: 'flex', flexDirection: 'column', gap: 10,
};

const inputStyle: React.CSSProperties = {
  flex: 1, height: 38, padding: '0 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 34, padding: '0 14px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', background: 'var(--accent-dim)',
  color: 'var(--accent)', fontFamily: 'var(--font-ui)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer',
};

export default function ModuleStore() {
  const { notify } = useNotifications();
  const [modules, setModules] = useState<StoreModule[]>([]);
  const [errors, setErrors] = useState<Array<{ registry_url: string; error: string }>>([]);
  const [registries, setRegistries] = useState<Array<{ id: number; url: string; is_default: boolean }>>([]);
  const [newRegistryUrl, setNewRegistryUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [store, regs] = await Promise.all([api.getModuleStore(), api.getRegistries()]);
      setModules(store.modules);
      setErrors(store.errors);
      setRegistries(regs.registries);
    } catch (err) {
      notify({ type: 'error', title: 'Module Store', message: `Failed to load: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const install = async (mod: StoreModule) => {
    setBusyId(mod.id);
    try {
      await api.installModule(mod.registry_url, mod.id);
      notify({ type: 'success', title: 'Module Store', message: `Module "${mod.name}" installed` });
      await reload();
    } catch (err) {
      notify({ type: 'error', title: 'Module Store', message: `Install failed: ${(err as Error).message}` });
    } finally {
      setBusyId(null);
    }
  };

  const addRegistry = async () => {
    const url = newRegistryUrl.trim();
    if (!url) return;
    try {
      await api.addRegistry(url);
      setNewRegistryUrl('');
      notify({ type: 'success', title: 'Module Store', message: 'Registry added' });
      await reload();
    } catch (err) {
      notify({ type: 'error', title: 'Module Store', message: `Adding registry failed: ${(err as Error).message}` });
    }
  };

  const removeRegistry = async (id: number) => {
    try {
      await api.removeRegistry(id);
      notify({ type: 'success', title: 'Module Store', message: 'Registry removed' });
      await reload();
    } catch (err) {
      notify({ type: 'error', title: 'Module Store', message: `Removing registry failed: ${(err as Error).message}` });
    }
  };

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Module Store
            </h2>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Install community modules from configured registries. Artifacts are checksum-verified and run sandboxed.
            </p>
          </div>
          <button style={buttonStyle} onClick={reload} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {errors.map(e => (
          <div key={e.registry_url} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius)', color: 'var(--warning)', fontSize: 12, fontFamily: 'var(--font-ui)',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{e.registry_url}: {e.error}</span>
          </div>
        ))}

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}>
          {modules.map(mod => (
            <div key={`${mod.registry_url}:${mod.id}`} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, background: 'var(--accent-dim)',
                  border: '1px solid var(--accent-mid)', borderRadius: 'var(--radius)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Package size={18} color="var(--accent)" />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {mod.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    v{mod.version}{mod.author ? ` · ${mod.author}` : ''}
                  </div>
                </div>
              </div>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                {mod.description}
              </p>
              {mod.installed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success, #22c55e)', fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
                  <CheckCircle size={14} /> Installed
                </div>
              ) : (
                <button
                  style={{ ...buttonStyle, opacity: busyId === mod.id ? 0.6 : 1 }}
                  disabled={busyId === mod.id}
                  onClick={() => install(mod)}
                >
                  <Download size={14} /> {busyId === mod.id ? 'Installing…' : 'Install'}
                </button>
              )}
            </div>
          ))}
          {!loading && modules.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
              No modules available. Check your registries below.
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            Registries
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {registries.map(reg => (
              <div key={reg.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {reg.url}
                </span>
                {reg.is_default ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    default
                  </span>
                ) : (
                  <button
                    onClick={() => removeRegistry(reg.id)}
                    title="Remove registry"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={inputStyle}
                placeholder="https://example.com/my-registry/index.json"
                value={newRegistryUrl}
                onChange={e => setNewRegistryUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRegistry()}
              />
              <button style={buttonStyle} onClick={addRegistry}>
                <Plus size={14} /> Add registry
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
