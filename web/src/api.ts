import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY || 'my-super-secret-key-123';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
});

export interface ZfsDataset {
  name: string;
  used: string;
  available: string;
  refer: string;
  mountpoint: string;
}

export interface ZfsPool {
  name: string;
  size: string;
  alloc: string;
  free: string;
  cksum: string;
  read: string;
  write: string;
  health: string;
}

export const getDatasets = async () => {
  const response = await api.get<{ datasets: ZfsDataset[] }>('/datasets');
  return response.data.datasets;
};

export const getPools = async () => {
  const response = await api.get<{ pools: ZfsPool[] }>('/pools');
  return response.data.pools;
};
