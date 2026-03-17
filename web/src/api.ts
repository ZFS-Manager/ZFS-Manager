import axios from 'axios';
import type { ZFSPool, ZFSDataset } from './types';

const API_BASE_URL = '/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY || 'my-super-secret-key-123';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
});

// Helper to format bytes into human-readable sizes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// ─── Datasets ────────────────────────────────────────────────────────────────

export interface RawDataset {
  name: string;
  used: string;       // bytes (from zfs list -p)
  available: string;  // bytes
  refer: string;      // bytes
  mountpoint: string;
}

export const getDatasets = async (): Promise<ZFSDataset[]> => {
  const response = await api.get<{ datasets: RawDataset[] }>('/datasets');
  return response.data.datasets.map((ds, index) => ({
    id: `ds-${index}`,
    name: ds.name,
    used: formatBytes(Number(ds.used)),
    avail: formatBytes(Number(ds.available)),
    refer: formatBytes(Number(ds.refer)),
    mountpoint: ds.mountpoint || '-',
    compression: 'lz4' as const,
    dedup: 'off' as const,
    readonly: false,
  }));
};

export const createDataset = async (name: string, options: string[] = []): Promise<string> => {
  const response = await api.post<{ message: string }>('/datasets', { name, options });
  return response.data.message;
};

export const deleteDataset = async (name: string): Promise<string> => {
  const response = await api.delete<{ message: string }>(`/datasets/${name}`);
  return response.data.message;
};

// ─── Pools ───────────────────────────────────────────────────────────────────

export interface RawPool {
  name: string;
  size: string;    // bytes
  alloc: string;   // bytes
  free: string;    // bytes
  frag: string;    // percent string
  cap: string;     // percent string  e.g. "31"
  dedup: string;
  health: string;
  altroot: string;
}

export const getPools = async (): Promise<ZFSPool[]> => {
  const response = await api.get<{ pools: RawPool[] }>('/pools');
  return response.data.pools.map(pool => {
    const cap = parseInt(pool.cap, 10) || 0;
    return {
      name: pool.name,
      size: formatBytes(Number(pool.size)),
      alloc: formatBytes(Number(pool.alloc)),
      free: formatBytes(Number(pool.free)),
      cap,
      health: (pool.health?.toUpperCase() as ZFSPool['health']) || 'ONLINE',
      raidType: 'ZFS',
      vdevs: [],
    };
  });
};

export const startScrub = async (name: string): Promise<string> => {
  const response = await api.post<{ message: string }>(`/pools/${name}/scrub`);
  return response.data.message;
};

export const stopScrub = async (name: string): Promise<string> => {
  const response = await api.delete<{ message: string }>(`/pools/${name}/scrub`);
  return response.data.message;
};

export const getPoolStatus = async (name: string): Promise<string> => {
  const response = await api.get<{ name: string; status: string }>(`/pools/${name}/status`);
  return response.data.status;
};

// ─── Snapshots ───────────────────────────────────────────────────────────────

export interface RawSnapshot {
  name: string;
  used: string;     // bytes
  refer: string;    // bytes
  creation: string; // unix timestamp
}

export interface Snapshot {
  name: string;
  dataset: string;
  snapName: string;
  used: string;
  refer: string;
  creation: Date;
}

export const getSnapshots = async (): Promise<Snapshot[]> => {
  const response = await api.get<{ snapshots: RawSnapshot[] }>('/snapshots');
  return response.data.snapshots.map(snap => {
    const parts = snap.name.split('@');
    return {
      name: snap.name,
      dataset: parts[0] || snap.name,
      snapName: parts[1] || '',
      used: formatBytes(Number(snap.used)),
      refer: formatBytes(Number(snap.refer)),
      creation: new Date(Number(snap.creation) * 1000),
    };
  });
};

export const createSnapshot = async (name: string, recursive = false): Promise<string> => {
  const response = await api.post<{ message: string }>('/snapshots', { name, recursive });
  return response.data.message;
};

export const deleteSnapshot = async (name: string): Promise<string> => {
  const response = await api.delete<{ message: string }>(`/snapshots/${name}`);
  return response.data.message;
};

export const rollbackSnapshot = async (name: string, force = false): Promise<string> => {
  const response = await api.post<{ message: string }>('/snapshots/rollback', { name, force });
  return response.data.message;
};
