const API_BASE_URL = '/api/v1';
let API_KEY = localStorage.getItem('zfs_access_token') || import.meta.env.VITE_API_KEY || 'admin123';

export const setApiKey = (key: string) => {
  API_KEY = key;
  localStorage.setItem('zfs_access_token', key);
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const errorMsg = body.error || body.message || `Request failed with status ${response.status}`;
      console.error(`❌ API Error [${path}]:`, errorMsg);
      throw new Error(errorMsg);
    }

    return response.json();
  } catch (err: any) {
    console.error(`📡 Network Error [${path}]:`, err.message || err);
    throw err;
  }
}

export const formatBytes = (bytes: number | string, decimals = 2): string => {
  const n = Number(bytes);
  if (!n || isNaN(n)) return '0 B';
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(dm))} ${sizes[Math.min(i, sizes.length - 1)]}`;
};

export const formatUnixTimestamp = (ts: string | number): string => {
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (!n || isNaN(n)) return '—';
  return new Date(n * 1000).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const api = {
  // ── Pools ──────────────────────────────────────────────────────────────────
  getPools:            ()             => request<{ pools: any[] }>('/pools'),
  getPool:             (name: string) => request<any>(`/pools/${name}`),
  getPoolStatus:       (name: string) => request<{ name: string; status: string }>(`/pools/${name}/status`),
  getPoolHistory:      (name: string) => request<{ name: string; history: string[] }>(`/pools/${name}/history`),
  getPoolEvents:       (name: string) => request<{ name: string; events: any[] }>(`/pools/${name}/events`),
  getPoolIoStat:       (name: string) => request<{ iostat: any[][] }>(`/pools/${name}/iostat`),
  getPoolVdevs:        (name: string) => request<{ vdevs: any[] }>(`/pools/${name}/vdevs`),
  getImportablePools:  ()             => request<{ pools: any[] }>('/pools/importable'),
  getScrubStatus:      (name: string) => request<any>(`/pools/${name}/scrub-status`),
  startScrub:          (name: string) => request<any>(`/pools/${name}/scrub`, { method: 'POST' }),
  stopScrub:           (name: string) => request<any>(`/pools/${name}/scrub`, { method: 'DELETE' }),
  resilverPool:        (name: string) => request<any>(`/pools/${name}/resilver`, { method: 'POST' }),
  expandPool:          (name: string, disk: string) =>
    request<any>(`/pools/${name}/expand`, { method: 'POST', body: JSON.stringify({ disk }) }),
  replaceDisk: (poolName: string, oldDisk: string, newDisk: string, force = false) =>
    request<any>(`/pools/${poolName}/replace`, { method: 'POST', body: JSON.stringify({ old_disk: oldDisk, new_disk: newDisk, force }) }),
  importPool: (name: string, dir?: string) =>
    request<any>(`/pools/${name}/import`, { method: 'POST', body: JSON.stringify({ dir }) }),
  importPoolById: (name: string, dir?: string) =>
    request<any>(`/pools/${name}/import`, { method: 'POST', body: JSON.stringify({ dir }) }),
  createPool: (name: string, vdevs: string[], options: string[] = []) =>
    request<any>('/pools', { method: 'POST', body: JSON.stringify({ name, vdevs, options }) }),

  // ── Datasets ───────────────────────────────────────────────────────────────
  getDatasets: () => request<{ datasets: any[] }>('/datasets'),
  createDataset: (name: string, options: string[] = []) =>
    request<any>('/datasets', { method: 'POST', body: JSON.stringify({ name, options }) }),
  deleteDataset: (name: string, force = false, recursive = false) =>
    request<any>(`/datasets/${name}?force=${force}&recursive=${recursive}`, { method: 'DELETE' }),
  rewriteDataset: (datasetName: string) => {
    const poolName = datasetName.split('/')[0];
    return request<any>(`/pools/${poolName}/resilver`, { method: 'POST' });
  },

  // ── Dataset Properties ─────────────────────────────────────────────────────
  getDatasetProperties: (name: string, props?: string) =>
    request<any>(`/properties/${name}${props ? `?prop=${encodeURIComponent(props)}` : ''}`),
  setDatasetProperty: (name: string, prop: string, value: string) =>
    request<any>(`/properties/${name}`, { method: 'PUT', body: JSON.stringify({ prop, value }) }),
  inheritDatasetProperty: (name: string, prop: string) =>
    request<any>(`/properties/${name}`, { method: 'DELETE', body: JSON.stringify({ prop }) }),

  // ── Snapshots ──────────────────────────────────────────────────────────────
  getSnapshots: () => request<{ snapshots: any[] }>('/snapshots'),
  createSnapshot: (fullName: string, recursive = false) =>
    request<any>('/snapshots', { method: 'POST', body: JSON.stringify({ name: fullName, recursive }) }),
  deleteSnapshot: (fullName: string) =>
    request<any>(`/snapshots/${fullName}`, { method: 'DELETE' }),
  rollbackSnapshot: (fullName: string, force = false) =>
    request<any>('/snapshots/rollback', { method: 'POST', body: JSON.stringify({ name: fullName, force }) }),

  // ── Volumes ────────────────────────────────────────────────────────────────
  getVolumes: () => request<{ volumes: any[] }>('/volumes'),

  // ── System ─────────────────────────────────────────────────────────────────
  getSystemStats: () => request<any>('/stats/system'),
  getDisks:       () => request<{ blockdevices: any[] }>('/system/disks'),
  getSmartData:   (device: string) => request<any>(`/system/smart/${encodeURIComponent(device)}`),

  // ── Metrics History ────────────────────────────────────────────────────────
  getMetricsHistory: (interval: string) =>
    request<{ metrics: any[]; interval: string; count: number }>(`/metrics/history?interval=${interval}`),
};
