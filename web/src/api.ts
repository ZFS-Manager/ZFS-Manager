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

export const getDatasets = async (): Promise<ZFSDataset[]> => {
  const response = await api.get<{ datasets: any[] }>('/datasets');
  return response.data.datasets.map((ds, index) => ({
    id: `ds-${index}`,
    name: ds.name,
    used: ds.used,
    avail: ds.available,
    refer: ds.refer,
    mountpoint: ds.mountpoint,
    compression: 'lz4', // Default placeholder as backend might not supply
    dedup: 'off', // Default placeholder
    readonly: false, // Default placeholder
  }));
};

export const getPools = async (): Promise<ZFSPool[]> => {
  const response = await api.get<{ pools: any[] }>('/pools');
  return response.data.pools.map(pool => {
    // Attempt to calculate capacity if possible, otherwise default to 0
    let cap = 0;
    try {
        const sizeVal = parseFloat(pool.size);
        const allocVal = parseFloat(pool.alloc);
        if (sizeVal > 0) {
            cap = Math.round((allocVal / sizeVal) * 100);
        }
    } catch(e) {}

    return {
      name: pool.name,
      size: pool.size,
      alloc: pool.alloc,
      free: pool.free,
      cap: cap || 50, // Provide a default if parsing failed
      health: (pool.health.toUpperCase() as any) || 'ONLINE',
      raidType: 'Unknown',
      vdevs: []
    } as ZFSPool;
  });
};
