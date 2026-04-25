
export interface ZFSPool {
  name: string;
  size: string;
  alloc: string;
  free: string;
  cap: number;
  frag?: number;
  dedup?: string;
  health: 'ONLINE' | 'DEGRADED' | 'FAULTED' | 'OFFLINE';
  raidType: string;
  vdevs: VDev[];
  _raw?: any;
}

export interface VDev {
  id: string;
  name: string;
  type: 'disk' | 'mirror' | 'raidz1' | 'raidz2' | 'raidz3';
  status: string;
  disks: string[];
}

export interface ZFSDataset {
  id: string;
  name: string;
  used: string;
  avail: string;
  refer: string;
  mountpoint: string;
  compression: string;
  dedup: string;
  readonly: boolean;
  quota?: string;
  reservation?: string;
  _usedBytes?: number;
  _availBytes?: number;
}

export interface ZFSSnapshot {
  id: string;
  dataset: string;
  name: string;
  used: string;
  created: string;
}

export interface ZFSReplication {
  id: string;
  source: string;
  destination: string;
  status: 'idle' | 'running' | 'failed' | 'finished';
  lastRun: string;
  progress?: number;
}

export interface ZFSScrub {
  pool: string;
  status: 'none' | 'scanning' | 'finished' | 'canceled';
  progress?: number;
  errors: number;
  lastRun: string;
}

export interface ZFSLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  pool?: string;
}

export interface DiskSmart {
  device: string;
  model: string;
  serial: string;
  temperature: number;
  powerOnHours: number;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  reallocatedSectors: number;
}

export interface ACLRule {
  id: string;
  type: 'user' | 'group' | 'everyone';
  name: string;
  permissions: string[];
  inheritance: 'none' | 'file' | 'dir' | 'all';
}

export interface DiskStat {
  timestamp: string;
  read: number;
  write: number;
  iops: number;
}
