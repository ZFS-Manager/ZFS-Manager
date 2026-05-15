import { useState, useEffect, useCallback, useRef } from 'react';

export interface WidgetConfig {
  id: string;
  visible: boolean;
  order: number;
}

const DEFAULTS: Record<string, WidgetConfig[]> = {
  dashboard: [
    { id: 'stats-row',        visible: true, order: 0 },
    { id: 'io-activity',      visible: true, order: 1 },
    { id: 'pool-cards',       visible: true, order: 2 },
    { id: 'system-resources', visible: true, order: 3 },
    { id: 'activity-log',     visible: true, order: 4 },
  ],
  performance: [
    { id: 'live-gauges',     visible: true, order: 0 },
    { id: 'io-chart',        visible: true, order: 1 },
    { id: 'storage-history', visible: true, order: 2 },
    { id: 'smart-health',    visible: true, order: 3 },
  ],
};

function getApiKey() {
  return localStorage.getItem('zfs_access_token') || '';
}

export function useLayout(page: string) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULTS[page] ?? []);
  const [loaded, setLoaded]   = useState(false);
  const [toast, setToast]     = useState<string | null>(null);
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/v1/layout/${page}`, {
      headers: { 'X-API-Key': getApiKey() },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (Array.isArray(data?.widgets) && data.widgets.length > 0) {
          // Merge server widgets with defaults (in case new widgets were added)
          const serverIds = new Set(data.widgets.map((w: WidgetConfig) => w.id));
          const defaults  = DEFAULTS[page] ?? [];
          const merged: WidgetConfig[] = [
            ...data.widgets,
            ...defaults.filter(d => !serverIds.has(d.id)).map((d, i) => ({
              ...d, order: data.widgets.length + i,
            })),
          ];
          setWidgets(merged);
        }
      })
      .catch(() => showToast('Could not load saved layout'))
      .finally(() => setLoaded(true));
  }, [page]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const save = useCallback((newWidgets: WidgetConfig[]) => {
    setWidgets(newWidgets);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/v1/layout/${page}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
        body: JSON.stringify({ page, widgets: newWidgets }),
      }).catch(() => showToast('Layout could not be saved'));
    }, 400);
  }, [page]);

  const setVisible = useCallback((id: string, visible: boolean) => {
    setWidgets(prev => {
      const next = prev.map(w => w.id === id ? { ...w, visible } : w);
      save(next);
      return next;
    });
  }, [save]);

  const reorder = useCallback((fromId: string, toId: string) => {
    setWidgets(prev => {
      const arr   = [...prev].sort((a, b) => a.order - b.order);
      const fromI = arr.findIndex(w => w.id === fromId);
      const toI   = arr.findIndex(w => w.id === toId);
      if (fromI === -1 || toI === -1 || fromI === toI) return prev;
      const [item] = arr.splice(fromI, 1);
      arr.splice(toI, 0, item);
      const next = arr.map((w, i) => ({ ...w, order: i }));
      save(next);
      return next;
    });
  }, [save]);

  return { widgets, loaded, save, setVisible, reorder, toast };
}
