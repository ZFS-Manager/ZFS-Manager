import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Check, Trash2, ArrowUp, ArrowDown, Blocks, Search, Package, LineChart, BarChart3, Gauge, Hash } from 'lucide-react';
import { api } from '../api';
import { ActiveModule, CustomTab, CustomTabWidgetPlacement, WidgetDefinition } from '../types';
import ModuleWidgetRenderer from '../components/ModuleWidgetRenderer';
import AddModuleWidgetModal from '../components/AddModuleWidgetModal';

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

      <AddModuleWidgetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSelectWidget={handleAddWidget}
      />
    </div>
  );
}
