
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
  available_bytes: number;
  used_bytes: number;
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

// ── Module system ────────────────────────────────────────────────────────────
export interface StoreModule {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  repository_url: string;
  registry_url: string;
  installed: boolean;
}

export interface ModuleConfigField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'secret' | 'number' | 'select' | 'multiselect' | 'schedule';
  required?: boolean;
  default?: unknown;
  options?: string[];
  description?: string;
}

export interface ModuleLastRun {
  started_at: string;
  finished_at: string | null;
  success: boolean | null;
  message: string | null;
}

export interface ActiveModule {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  repository_url: string;
  source: 'registry' | 'sideload';
  registry_url: string | null;
  enabled: boolean;
  installed_at: string;
  config_schema: ModuleConfigField[];
  config: Record<string, unknown>;
  secret_keys_set: string[];
  last_run: ModuleLastRun | null;
}

export interface ModuleRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  success: boolean | null;
  message: string;
  metrics_written: number;
  trigger: 'schedule' | 'manual';
}
