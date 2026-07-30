import React, { useEffect, useState } from 'react';
import { Package, Plus, Trash2, Download, CheckCircle, AlertTriangle, RefreshCw, X } from 'lucide-react';
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

function formatVersion(version?: string): string {
  if (!version) return '';
  const trimmed = version.trim();
  if (!trimmed) return '';
  const clean = trimmed.replace(/^v+/i, '');
  return `v${clean}`;
}

function formatRegistryError(error: string): string {
  if (error.includes('invalid registry index') || error.includes('expected value') || error.includes('syntax error')) {
    return 'Ungültige Registry-URL: Keine gültige index.json Datei erkannt';
  }
  return error;
}

export default function ModuleStore() {
  const { notify } = useNotifications();
  const [modules, setModules] = useState<StoreModule[]>([]);
  const [errors, setErrors] = useState<Array<{ registry_url: string; error: string }>>([]);
  const [registries, setRegistries] = useState<Array<{ id: number; url: string; is_default: boolean }>>([]);
  const [newRegistryUrl, setNewRegistryUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Version Picker Modal State
  const [selectedModuleForVersionModal, setSelectedModuleForVersionModal] = useState<StoreModule | null>(null);
  const [availableReleases, setAvailableReleases] = useState<Array<{ tag_name: string; name: string; published_at: string; wasm_url: string }>>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [selectedReleaseTag, setSelectedReleaseTag] = useState('');
  const [selectedWasmUrl, setSelectedWasmUrl] = useState('');

  // Duplicate Modules Modal State & Selections
  interface DuplicateGroup {
    id: string;
    name: string;
    instances: StoreModule[];
  }
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedRegistryForMod, setSelectedRegistryForMod] = useState<Record<string, string>>({});
  const [rawStoreModules, setRawStoreModules] = useState<StoreModule[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const filterAndSetModules = (rawMods: StoreModule[], selections: Record<string, string>) => {
    const seen = new Set<string>();
    const result: StoreModule[] = [];

    rawMods.forEach(mod => {
      if (selections[mod.id]) {
        if (mod.registry_url === selections[mod.id] && !seen.has(mod.id)) {
          seen.add(mod.id);
          result.push(mod);
        }
      } else if (!seen.has(mod.id)) {
        seen.add(mod.id);
        result.push(mod);
      }
    });

    setModules(result);
  };

  const reload = async () => {
    setLoading(true);
    try {
      const [store, regs] = await Promise.all([api.getModuleStore(), api.getRegistries()]);
      setRegistries(regs.registries);
      setErrors(store.errors);
      setRawStoreModules(store.modules);

      // Detect duplicate modules across registries
      const grouped = new Map<string, StoreModule[]>();
      store.modules.forEach(mod => {
        const list = grouped.get(mod.id) || [];
        grouped.set(mod.id, [...list, mod]);
      });

      const dups: DuplicateGroup[] = [];
      const initialSelections: Record<string, string> = {};

      grouped.forEach((list, id) => {
        if (list.length > 1) {
          dups.push({
            id,
            name: list[0].name,
            instances: list,
          });
          initialSelections[id] = list[0].registry_url;
        }
      });

      filterAndSetModules(store.modules, initialSelections);

      if (dups.length > 0) {
        setDuplicateGroups(dups);
        setSelectedRegistryForMod(initialSelections);
        setShowDuplicateModal(true);
      } else {
        setDuplicateGroups([]);
        setShowDuplicateModal(false);
      }
    } catch (err) {
      notify({ type: 'error', title: 'Module Store', message: `Failed to load: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const openInstallModal = async (mod: StoreModule) => {
    setSelectedModuleForVersionModal(mod);
    setSelectedReleaseTag('');
    setSelectedWasmUrl('');
    setAvailableReleases([]);

    if (mod.repository_url) {
      setLoadingReleases(true);
      try {
        const res = await api.getModuleReleases(mod.repository_url);
        setAvailableReleases(res.releases);
        if (res.releases.length > 0) {
          setSelectedReleaseTag(res.releases[0].tag_name);
          setSelectedWasmUrl(res.releases[0].wasm_url);
        }
      } catch (err) {
        console.warn('Failed to fetch releases:', err);
      } finally {
        setLoadingReleases(false);
      }
    }
  };

  const confirmInstallWithVersion = async () => {
    if (!selectedModuleForVersionModal) return;
    const mod = selectedModuleForVersionModal;
    setBusyId(mod.id);
    try {
      if (mod.installed && selectedReleaseTag) {
        await api.switchModuleVersion(mod.id, selectedReleaseTag, selectedWasmUrl);
        notify({
          type: 'success',
          title: 'Module Store',
          message: `Switched "${mod.name}" to version ${selectedReleaseTag}`,
        });
      } else {
        await api.installModule(
          mod.registry_url,
          mod.id,
          selectedReleaseTag || undefined,
          selectedWasmUrl || undefined
        );
        notify({
          type: 'success',
          title: 'Module Store',
          message: `Module "${mod.name}" ${selectedReleaseTag ? `(${selectedReleaseTag}) ` : ''}installed`,
        });
      }
      setSelectedModuleForVersionModal(null);
      await reload();
    } catch (err) {
      notify({ type: 'error', title: 'Module Store', message: `Operation failed: ${(err as Error).message}` });
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
            <span>{e.registry_url}: {formatRegistryError(e.error)}</span>
          </div>
        ))}

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}>
          {modules.map(mod => {
            const regIdx = registries.findIndex(r => r.url === mod.registry_url);
            const regNumber = regIdx !== -1 ? regIdx + 1 : null;

            return (
              <div key={`${mod.registry_url}:${mod.id}`} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
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
                        {mod.author ? mod.author : 'Community Module'}
                      </div>
                    </div>
                  </div>

                  {regNumber !== null && (
                    <div
                      title={`Registry #${regNumber}: ${mod.registry_url}`}
                      style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
                        color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, cursor: 'help'
                      }}
                    >
                      {regNumber}
                    </div>
                  )}
                </div>

                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                  {mod.description}
                </p>
                {mod.installed ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success, #22c55e)', fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
                      <CheckCircle size={14} />
                      <span>Installed {mod.installed_version ? `(${formatVersion(mod.installed_version)})` : ''}</span>
                    </div>
                    <button
                      style={{ ...buttonStyle, opacity: busyId === mod.id ? 0.6 : 1, padding: '0 10px', height: 28, fontSize: 11 }}
                      disabled={busyId === mod.id}
                      onClick={() => openInstallModal(mod)}
                    >
                      <RefreshCw size={12} /> Switch Version
                    </button>
                  </div>
                ) : (
                  <button
                    style={{ ...buttonStyle, opacity: busyId === mod.id ? 0.6 : 1 }}
                    disabled={busyId === mod.id}
                    onClick={() => openInstallModal(mod)}
                  >
                    <Download size={14} /> {busyId === mod.id ? 'Installing…' : 'Install'}
                  </button>
                )}
              </div>
            );
          })}
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
            {registries.map((reg, idx) => (
              <div key={reg.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)',
                  border: '1px solid var(--accent-mid)', color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {idx + 1}
                </span>
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

        {/* Duplicate Module Selection Modal */}
        {showDuplicateModal && duplicateGroups.length > 0 && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', width: '90%', maxWidth: 560, padding: 22,
              display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--warning)' }}>
                  <AlertTriangle size={22} />
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Doppelte Module in Registries
                  </h3>
                </div>
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Folgende Module sind in mehreren Registries enthalten. Wähle pro Modul aus, aus welcher Registry es bezogen werden soll:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
                {duplicateGroups.map(dup => (
                  <div key={dup.id} style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-primary)' }}>
                        {dup.name}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        ID: {dup.id}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dup.instances.map(inst => {
                        const regIdx = registries.findIndex(r => r.url === inst.registry_url);
                        const isSelected = selectedRegistryForMod[dup.id] === inst.registry_url;

                        return (
                          <div
                            key={inst.registry_url}
                            onClick={() => {
                              const next = { ...selectedRegistryForMod, [dup.id]: inst.registry_url };
                              setSelectedRegistryForMod(next);
                              filterAndSetModules(rawStoreModules, next);
                            }}
                            style={{
                              display: 'flex', flexDirection: 'column', gap: 6,
                              padding: '10px 12px',
                              background: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: 'var(--radius)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: isSelected ? 'var(--accent)' : 'var(--bg-hover)',
                                  color: isSelected ? '#fff' : 'var(--text-muted)',
                                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                }}>
                                  {regIdx !== -1 ? regIdx + 1 : '?'}
                                </span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                                  Registry #{regIdx !== -1 ? regIdx + 1 : '?'}
                                </span>
                                {inst.version && (
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                                    ({formatVersion(inst.version)})
                                  </span>
                                )}
                              </div>
                              <span style={{
                                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                                color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', gap: 4
                              }}>
                                {isSelected ? '✓ Ausgewählt' : 'Wählen'}
                              </span>
                            </div>
                            <div style={{
                              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                              wordBreak: 'break-all', lineHeight: 1.4, paddingLeft: 28
                            }}>
                              {inst.registry_url}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  style={{ ...buttonStyle, background: 'var(--accent)', color: '#fff' }}
                  onClick={() => setShowDuplicateModal(false)}
                >
                  Auswahl übernehmen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Version Picker Modal */}
        {selectedModuleForVersionModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', width: '90%', maxWidth: 440, padding: 20,
              display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedModuleForVersionModal.installed ? `Switch Version: ${selectedModuleForVersionModal.name}` : `Install ${selectedModuleForVersionModal.name}`}
                </h3>
                <button
                  onClick={() => setSelectedModuleForVersionModal(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-secondary)' }}>
                Select a version from GitHub Releases:
              </p>

              {loadingReleases ? (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
                  Fetching available releases from GitHub...
                </div>
              ) : availableReleases.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
                  No specific releases found. Default version will be installed.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {availableReleases.map(rel => (
                    <label
                      key={rel.tag_name}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', border: `1px solid ${selectedReleaseTag === rel.tag_name ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)', background: selectedReleaseTag === rel.tag_name ? 'var(--accent-dim)' : 'transparent',
                        cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="radio"
                          name="release_version"
                          checked={selectedReleaseTag === rel.tag_name}
                          onChange={() => {
                            setSelectedReleaseTag(rel.tag_name);
                            setSelectedWasmUrl(rel.wasm_url);
                          }}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatVersion(rel.tag_name)}</span>
                      </div>
                      {rel.published_at && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(rel.published_at).toLocaleDateString()}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-secondary)' }}
                  onClick={() => setSelectedModuleForVersionModal(null)}
                >
                  Cancel
                </button>
                <button
                  style={{ ...buttonStyle, background: 'var(--accent)', color: '#fff' }}
                  disabled={busyId === selectedModuleForVersionModal.id}
                  onClick={confirmInstallWithVersion}
                >
                  {busyId === selectedModuleForVersionModal.id
                    ? (selectedModuleForVersionModal.installed ? 'Switching…' : 'Installing…')
                    : (selectedModuleForVersionModal.installed ? 'Switch Version' : 'Install Version')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

