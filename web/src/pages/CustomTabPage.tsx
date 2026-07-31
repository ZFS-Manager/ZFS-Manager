import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Check, Trash2, ArrowUp, ArrowDown, Blocks, Search, Package, LineChart, BarChart3, Gauge, Hash } from 'lucide-react';
import { api } from '../api';
import { ActiveModule, CustomTab, CustomTabWidgetPlacement, WidgetDefinition } from '../types';
import ModuleWidgetRenderer from '../components/ModuleWidgetRenderer';
import Modal from '../components/Modal';

/** Grafana-style accent color per widget visualization type */
function widgetTypeColor(type: string): string {
  switch (type) {
    case 'gauge': return 'var(--warning)';
    case 'stat':  return 'var(--success)';
    case 'bar':   return 'var(--accent)';
    default:      return 'var(--info)';
  }
}

function widgetTypeIcon(type: string) {
  const color = widgetTypeColor(type);
  switch (type) {
    case 'gauge': return <Gauge size={15} style={{ color }} />;
    case 'stat':  return <Hash size={15} style={{ color }} />;
    case 'bar':   return <BarChart3 size={15} style={{ color }} />;
    default:      return <LineChart size={15} style={{ color }} />;
  }
}

export default function CustomTabPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tab, setTab] = useState<CustomTab | null>(null);
  const [activeModules, setActiveModules] = useState<ActiveModule[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [layout, setLayout] = useState<CustomTabWidgetPlacement[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [widgetSearch, setWidgetSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const closeAddModal = () => {
    setShowAddModal(false);
    setWidgetSearch('');
  };

  const loadTab = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      const res = await api.getCustomTab(slug);
      setTab(res);
      setLayout(res.layout || []);

      const modsRes = await api.getActiveModules();
      setActiveModules(modsRes.modules || []);
    } catch (err) {
      console.error(`Failed to load tab ${slug}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTab();
  }, [slug]);

  const handleSaveLayout = async () => {
    if (!slug) return;
    try {
      await api.saveCustomTabLayout(slug, layout);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save tab layout:', err);
    }
  };

  const handleAddWidget = (mod: ActiveModule, widget: WidgetDefinition) => {
    const newPlacement: CustomTabWidgetPlacement = {
      id: `${mod.id}-${widget.key}-${Date.now()}`,
      module_id: mod.id,
      widget_key: widget.key,
      title: `${mod.name}: ${widget.label}`,
      visible: true,
      order: layout.length,
      width: widget.type === 'stat' || widget.type === 'gauge' ? 'third' : 'half',
    };
    setLayout([...layout, newPlacement]);
    closeAddModal();
  };

  const handleRemoveWidget = (id: string) => {
    setLayout(layout.filter(w => w.id !== id));
  };

  const handleMoveWidget = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= layout.length) return;
    const next = [...layout];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setLayout(next);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
        Loading custom tab...
      </div>
    );
  }

  if (!tab) {
    return (
      <div style={{ padding: 24, color: 'var(--danger)', fontFamily: 'var(--font-ui)' }}>
        Custom tab not found.
      </div>
    );
  }

  // Modules + widgets filtered by the add-widget search query (Grafana-style picker)
  const widgetQuery = widgetSearch.trim().toLowerCase();
  const widgetPickerModules = activeModules
    .map(mod => {
      const widgets = (mod.widget_schema || []).filter(w =>
        !widgetQuery ||
        w.label.toLowerCase().includes(widgetQuery) ||
        w.type.toLowerCase().includes(widgetQuery) ||
        mod.name.toLowerCase().includes(widgetQuery) ||
        w.metrics.some(m => m.toLowerCase().includes(widgetQuery))
      );
      return { mod, widgets };
    })
    .filter(({ widgets }) =>
      widgetQuery ? widgets.length > 0 : true
    );

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {tab.name}
          </h1>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Custom modular dashboard page
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {isEditing ? (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Add Widget
              </button>
              <button
                onClick={handleSaveLayout}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 'var(--radius)', color: '#fff',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Check size={14} /> Save Layout
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Edit2 size={14} /> Edit Layout
            </button>
          )}
        </div>
      </div>

      {layout.length === 0 && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)', padding: 40, textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <Blocks size={32} color="var(--text-muted)" />
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            No widgets on this tab yet
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)' }}>
            Click "Edit Layout" and "Add Widget" to add metrics charts from active modules.
          </div>
          <button
            onClick={() => { setIsEditing(true); setShowAddModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', marginTop: 8,
              background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)',
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add First Widget
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {layout.map((item, idx) => {
          const mod = activeModules.find(m => m.id === item.module_id);
          const wDef = mod?.widget_schema?.find(w => w.key === item.widget_key);

          return (
            <div key={item.id} style={{ position: 'relative' }}>
              {isEditing && (
                <div style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 10,
                  display: 'flex', gap: 4, background: 'rgba(0,0,0,0.7)',
                  padding: 4, borderRadius: 6, border: '1px solid var(--border)',
                }}>
                  <button
                    onClick={() => handleMoveWidget(idx, 'up')}
                    disabled={idx === 0}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => handleMoveWidget(idx, 'down')}
                    disabled={idx === layout.length - 1}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: idx === layout.length - 1 ? 0.3 : 1 }}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    onClick={() => handleRemoveWidget(item.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}

              <ModuleWidgetRenderer
                moduleId={item.module_id}
                widgetKey={item.widget_key}
                widgetType={wDef?.type || 'line'}
                metrics={wDef?.metrics || [item.widget_key]}
                title={item.title || wDef?.label || item.widget_key}
                unit={wDef?.unit}
                color={wDef?.color || 'var(--accent)'}
              />
            </div>
          );
        })}
      </div>

      {/* ── Add-widget picker (Grafana-style panel library) ── */}
      <AnimatePresence>
        {showAddModal && (
          <Modal title="Add widget" onClose={closeAddModal} maxWidth={560}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  className="input"
                  placeholder="Search widgets by name, type or metric…"
                  value={widgetSearch}
                  onChange={e => setWidgetSearch(e.target.value)}
                  style={{ paddingLeft: 34, width: '100%' }}
                  autoFocus
                />
              </div>

              {activeModules.length === 0 && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  No active modules with widgets available.
                </div>
              )}

              {activeModules.length > 0 && widgetPickerModules.length === 0 && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  No widgets match "{widgetSearch}".
                </div>
              )}

              {widgetPickerModules.map(({ mod, widgets }) => (
                <div key={mod.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Module header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 'var(--radius)', flexShrink: 0,
                      background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Package size={12} style={{ color: 'var(--accent)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {mod.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                      {mod.version}
                    </span>
                    <span className="badge" style={{ marginLeft: 'auto' }}>
                      {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {(!mod.widget_schema || mod.widget_schema.length === 0) ? (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 2px' }}>
                      No widgets declared in manifest.
                    </div>
                  ) : widgets.length === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {widgets.map(w => (
                        <button
                          key={w.key}
                          onClick={() => handleAddWidget(mod, w)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)', padding: '10px 12px', cursor: 'pointer',
                            transition: 'border-color 0.12s ease, background 0.12s ease',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-mid)';
                            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                            (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
                          }}
                        >
                          <div style={{
                            width: 34, height: 34, borderRadius: 'var(--radius)', flexShrink: 0,
                            background: 'var(--bg-base)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {widgetTypeIcon(w.type)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {w.label}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{
                                fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                color: widgetTypeColor(w.type),
                                background: 'var(--bg-base)', border: '1px solid var(--border)',
                                borderRadius: 3, padding: '1px 5px',
                              }}>
                                {w.type}
                              </span>
                              {w.metrics.map(m => (
                                <span key={m} style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
                                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                                  borderRadius: 3, padding: '1px 5px',
                                }}>
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div style={{
                            width: 26, height: 26, borderRadius: 'var(--radius)', flexShrink: 0,
                            background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Plus size={13} style={{ color: 'var(--accent)' }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
