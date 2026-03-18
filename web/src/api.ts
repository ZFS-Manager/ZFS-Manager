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

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const formatBytes = (bytes: number | string, decimals = 2) => {
  if (!bytes || bytes === '0') return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k));
  return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const api = {
  // Pools
  getPools: () => request<{ pools: any[] }>('/pools'),
  getPool: (name: string) => request<any>(`/pools/${name}`),
  getPoolStatus: (name: string) => request<{ status: string }>(`/pools/${name}/status`),
  startScrub: (name: string) => request<any>(`/pools/${name}/scrub`, { method: 'POST' }),
  stopScrub: (name: string) => request<any>(`/pools/${name}/scrub`, { method: 'DELETE' }),
  getPoolIoStat: (name: string) => request<{ iostat: any[][] }>(`/pools/${name}/iostat`),

  // Datasets
  getDatasets: () => request<{ datasets: any[] }>('/datasets'),
  getDataset: (name: string) => request<any>(`/datasets/${name}`),
  createDataset: (name: string, options: string[] = []) => 
    request<any>('/datasets', { method: 'POST', body: JSON.stringify({ name, options }) }),
  deleteDataset: (name: string) => request<any>(`/datasets/${name}`, { method: 'DELETE' }),
  
  // Snapshots
  getSnapshots: (dataset?: string) => request<{ snapshots: any[] }>(dataset ? `/snapshots/${dataset}` : '/snapshots'),
  createSnapshot: (dataset: string, name: string) =>
    request<any>(`/snapshots/${dataset}`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteSnapshot: (dataset: string, name: string) =>
    request<any>(`/snapshots/${dataset}/${name}`, { method: 'DELETE' }),
  rollbackSnapshot: (dataset: string, name: string) =>
    request<any>(`/snapshots/${dataset}/${name}/rollback`, { method: 'POST' }),

  // Volumes
  getVolumes: () => request<{ volumes: any[] }>('/volumes'),

  // Properties
  getProperties: (dataset: string) => request<{ properties: any[] }>(`/properties/${dataset}`),
  setProperty: (dataset: string, prop: string, value: string) =>
    request<any>(`/properties/${dataset}`, { method: 'PUT', body: JSON.stringify({ prop, value }) }),
  inheritProperty: (dataset: string, prop: string) =>
    request<any>(`/properties/${dataset}`, { method: 'DELETE', body: JSON.stringify({ prop }) }),
};
