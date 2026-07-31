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
    { id: 'disk-io',          visible: true, order: 2 },
    { id: 'pool-cards',       visible: true, order: 3 },
    { id: 'system-resources', visible: true, order: 4 },
    { id: 'activity-log',     visible: true, order: 5 },
  ],
  performance: [
    { id: 'live-read-speed',   visible: true, order: 0 },
    { id: 'live-write-speed',  visible: true, order: 1 },
    { id: 'live-read-iops',    visible: true, order: 2 },
    { id: 'live-write-iops',   visible: true, order: 3 },
    { id: 'live-total-read',   visible: true, order: 4 },
    { id: 'live-total-write',  visible: true, order: 5 },
    { id: 'disk-io',         visible: true, order: 6 },
    { id: 'io-chart',        visible: true, order: 7 },
    { id: 'storage-history', visible: true, order: 8 },
    { id: 'smart-health',    visible: true, order: 9 },
  ],
};

function normalizeWidgets(page: string, list: WidgetConfig[]): WidgetConfig[] {
  if (page !== 'performance') return list;
  const hasLegacyGauges = list.some(w => w.id === 'live-gauges');
  if (!hasLegacyGauges) return list;

  const legacyIndex = list.findIndex(w => w.id === 'live-gauges');
  const legacyVisible = list[legacyIndex]?.visible ?? true;
  const newGaugeIds = [
    'live-read-speed', 'live-write-speed', 'live-read-iops',
    'live-write-iops', 'live-total-read', 'live-total-write'
  ];

  const result: WidgetConfig[] = [];
  list.forEach(w => {
    if (w.id === 'live-gauges') {
      newGaugeIds.forEach(id => {
        result.push({ id, visible: legacyVisible, order: result.length });
      });
    } else {
      result.push({ ...w, order: result.length });
    }
  });

  return result;
}

function getApiKey() {
  return localStorage.getItem('zfs_access_token') || '';
}

function getLocalLayout(page: string): WidgetConfig[] {
  const cached = localStorage.getItem(`layout:${page}`);
  if (cached) {
    try {
      return normalizeWidgets(page, JSON.parse(cached));
    } catch (_) {}
  }
  return DEFAULTS[page] ?? [];
}

export function useLayout(page: string) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => getLocalLayout(page));
  const [loaded, setLoaded]   = useState(true);
  const [toast, setToast]     = useState<string | null>(null);
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/v1/layout/${page}`, {
      headers: { 'X-API-Key': getApiKey() },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (Array.isArray(data?.widgets) && data.widgets.length > 0) {
          const normData = normalizeWidgets(page, data.widgets);
          // Merge server widgets with defaults (in case new widgets were added)
          const serverIds = new Set(normData.map((w: WidgetConfig) => w.id));
          const defaults  = DEFAULTS[page] ?? [];
          const merged: WidgetConfig[] = [
            ...normData,
            ...defaults.filter(d => !serverIds.has(d.id)).map((d, i) => ({
              ...d, order: normData.length + i,
            })),
          ];
          setWidgets(merged);
          localStorage.setItem(`layout:${page}`, JSON.stringify(merged));
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
    localStorage.setItem(`layout:${page}`, JSON.stringify(newWidgets));
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
