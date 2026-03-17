import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Bell,
  User,
  Activity,
  HardDrive,
  ShieldCheck,
  Database,
  Camera,
  RefreshCw,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Settings as SettingsIcon,
  ChevronRight,
  MoreHorizontal,
  Terminal,
  Server,
  Key,
  Info,
  AlertTriangle,
  XCircle,
  Thermometer,
  Clock,
  CheckCircle2,
  Layers,
  Trash2,
  Play,
  StopCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import DatasetList from './components/DatasetList';
import ACLManager from './components/ACLManager';
import type { ZFSPool, ZFSDataset, ZFSLog, DiskSmart } from './types';
import type { Snapshot } from './api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getPools, getDatasets, getSnapshots,
  createSnapshot, deleteSnapshot, rollbackSnapshot,
  startScrub, stopScrub, getPoolStatus,
} from './api';

// ─── Mock / Static Data (Non-ZFS, informational) ──────────────────────────────

const mockLogs: ZFSLog[] = [
  { id: '1', timestamp: new Date().toLocaleString(), level: 'info', message: 'ZFS Manager UI started.', pool: '' },
];

const mockSmartData: DiskSmart[] = [
  { device: 'sda', model: 'Unknown', serial: '-', temperature: 0, powerOnHours: 0, status: 'PASSED', reallocatedSectors: 0 },
];

const generateMockStats = () => {
  const stats: any[] = [];
  const now = new Date();
  for (let i = 0; i < 20; i++) {
    stats.push({
      timestamp: new Date(now.getTime() - (20 - i) * 3000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: Math.floor(Math.random() * 500) + 100,
      write: Math.floor(Math.random() * 300) + 50,
      iops: Math.floor(Math.random() * 5000) + 1000,
      latency: (Math.random() * 5 + 1).toFixed(2),
      arcHit: Math.floor(Math.random() * 10) + 90,
      l2arcHit: Math.floor(Math.random() * 20) + 70,
    });
  }
  return stats;
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<any[]>(generateMockStats());

  // Real data from backend
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [scrubStatus, setScrubStatus] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<ZFSLog[]>(mockLogs);

  // UI state
  const [loadingPools, setLoadingPools] = useState(true);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // New snapshot form
  const [newSnapName, setNewSnapName] = useState('');
  const [snapLoading, setSnapLoading] = useState(false);

  const addLog = useCallback((level: 'info' | 'warning' | 'error', message: string, pool?: string) => {
    const entry: ZFSLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString(),
      level,
      message,
      pool: pool || '',
    };
    setLogs(prev => [entry, ...prev].slice(0, 100));
  }, []);

  // Fetch pools
  const fetchPools = useCallback(async () => {
    try {
      const data = await getPools();
      setPools(data);
      setApiError(null);
    } catch (e: any) {
      setApiError(e?.response?.data?.error || e?.message || 'Failed to fetch pools');
      addLog('error', `Failed to fetch pools: ${e?.message}`, '');
    } finally {
      setLoadingPools(false);
    }
  }, [addLog]);

  // Fetch datasets
  const fetchDatasets = useCallback(async () => {
    try {
      const data = await getDatasets();
      setDatasets(data);
    } catch (e: any) {
      addLog('error', `Failed to fetch datasets: ${e?.message}`, '');
    } finally {
      setLoadingDatasets(false);
    }
  }, [addLog]);

  // Fetch snapshots
  const fetchSnapshots = useCallback(async () => {
    try {
      const data = await getSnapshots();
      setSnapshots(data);
    } catch (e: any) {
      addLog('error', `Failed to fetch snapshots: ${e?.message}`, '');
    } finally {
      setLoadingSnapshots(false);
    }
  }, [addLog]);

  // Initial load + polling
  useEffect(() => {
    fetchPools();
    fetchDatasets();
    fetchSnapshots();

    const dataInterval = setInterval(() => {
      fetchPools();
      fetchDatasets();
    }, 15000);

    return () => clearInterval(dataInterval);
  }, [fetchPools, fetchDatasets, fetchSnapshots]);

  // Stats mock real-time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => {
        const newStat = {
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: Math.floor(Math.random() * 500) + 100,
          write: Math.floor(Math.random() * 300) + 50,
          iops: Math.floor(Math.random() * 5000) + 1000,
          latency: (Math.random() * 5 + 1).toFixed(2),
          arcHit: Math.floor(Math.random() * 10) + 90,
          l2arcHit: Math.floor(Math.random() * 20) + 70,
        };
        return [...prev.slice(1), newStat];
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ─── Scrub Actions ────────────────────────────────────────────────────────

  const handleStartScrub = async (poolName: string) => {
    try {
      setScrubStatus(prev => ({ ...prev, [poolName]: 'starting' }));
      await startScrub(poolName);
      addLog('info', `Scrub started on pool '${poolName}'`, poolName);
      setScrubStatus(prev => ({ ...prev, [poolName]: 'running' }));
    } catch (e: any) {
      addLog('error', `Failed to start scrub on '${poolName}': ${e?.message}`, poolName);
      setScrubStatus(prev => ({ ...prev, [poolName]: 'error' }));
    }
  };

  const handleStopScrub = async (poolName: string) => {
    try {
      await stopScrub(poolName);
      addLog('info', `Scrub stopped on pool '${poolName}'`, poolName);
      setScrubStatus(prev => ({ ...prev, [poolName]: 'stopped' }));
    } catch (e: any) {
      addLog('error', `Failed to stop scrub on '${poolName}': ${e?.message}`, poolName);
    }
  };

  const handleGetPoolStatus = async (poolName: string) => {
    try {
      const status = await getPoolStatus(poolName);
      addLog('info', `Pool '${poolName}' status retrieved.`, poolName);
      alert(`Pool Status: ${poolName}\n\n${status}`);
    } catch (e: any) {
      addLog('error', `Failed to get status for '${poolName}': ${e?.message}`, poolName);
    }
  };

  // ─── Snapshot Actions ─────────────────────────────────────────────────────

  const handleCreateSnapshot = async () => {
    if (!newSnapName.trim()) return;
    setSnapLoading(true);
    try {
      await createSnapshot(newSnapName.trim());
      addLog('info', `Snapshot '${newSnapName}' created.`);
      setNewSnapName('');
      await fetchSnapshots();
    } catch (e: any) {
      addLog('error', `Failed to create snapshot '${newSnapName}': ${e?.message}`);
    } finally {
      setSnapLoading(false);
    }
  };

  const handleDeleteSnapshot = async (name: string) => {
    if (!confirm(`Delete snapshot '${name}'?`)) return;
    try {
      await deleteSnapshot(name);
      addLog('info', `Snapshot '${name}' deleted.`);
      await fetchSnapshots();
    } catch (e: any) {
      addLog('error', `Failed to delete snapshot '${name}': ${e?.message}`);
    }
  };

  const handleRollback = async (name: string) => {
    if (!confirm(`Rollback to snapshot '${name}'? This will discard changes since this snapshot.`)) return;
    try {
      await rollbackSnapshot(name);
      addLog('warning', `Rolled back to '${name}'.`);
      await fetchDatasets();
    } catch (e: any) {
      addLog('error', `Failed to rollback to '${name}': ${e?.message}`);
    }
  };

  // ─── Tab Content ──────────────────────────────────────────────────────────

  const renderContent = () => {
    const currentStats = stats[stats.length - 1] || { read: 0, write: 0, iops: 0 };

    switch (activeTab) {
      // ── Dashboard ──────────────────────────────────────────────────────────
      case 'dashboard':
        return (
          <div className="space-y-8">
            {apiError && (
              <div className="glass-panel p-4 border-rose-500/30 bg-rose-500/5 flex items-center gap-3 text-rose-400">
                <XCircle size={20} />
                <span className="text-sm font-medium">{apiError} — running in demo mode</span>
              </div>
            )}

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              {[
                { label: 'Total Pools', value: loadingPools ? '…' : String(pools.length), icon: Database, color: 'text-blue-400', trend: 'Live', up: true },
                { label: 'Datasets', value: loadingDatasets ? '…' : String(datasets.length), icon: Layers, color: 'text-emerald-400', trend: 'Live', up: true },
                { label: 'Snapshots', value: loadingSnapshots ? '…' : String(snapshots.length), icon: Camera, color: 'text-indigo-400', trend: 'Live', up: true },
                { label: 'IOPS', value: `${(currentStats.iops / 1000).toFixed(1)}k`, icon: Zap, color: 'text-amber-400', trend: '+12%', up: true },
                { label: 'Read Speed', value: `${currentStats.read} MB/s`, icon: ArrowDownRight, color: 'text-blue-500', trend: 'Live', up: true },
                { label: 'Write Speed', value: `${currentStats.write} MB/s`, icon: ArrowUpRight, color: 'text-emerald-500', trend: 'Live', up: true },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass-panel p-6 flex flex-col gap-4"
                >
                  <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-xl bg-white/5 ${stat.color}`}>
                      <stat.icon size={24} />
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold ${stat.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stat.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {stat.trend}
                    </div>
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">{stat.label}</p>
                    <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="glass-panel p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-xl font-bold text-white">System Overview</h3>
                      <p className="text-sm text-white/40">Pool Health Summary</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="status-badge status-online">Operational</span>
                    </div>
                  </div>
                  {loadingPools ? (
                    <div className="text-white/30 text-sm text-center py-8">Loading pools…</div>
                  ) : pools.length === 0 ? (
                    <div className="text-white/30 text-sm text-center py-8">No pools found</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {pools.map(pool => (
                        <div key={pool.name} className="bg-white/5 p-6 rounded-2xl border border-white/5">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="font-bold text-white">{pool.name}</p>
                              <p className="text-[10px] text-white/30 uppercase tracking-widest">{pool.raidType}</p>
                            </div>
                            <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : pool.health === 'DEGRADED' ? 'status-warning' : 'status-error'}`}>
                              {pool.health}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-white/40 font-bold uppercase tracking-widest">Usage</span>
                              <span className="text-white font-bold">{pool.cap}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pool.cap}%` }}
                                className={`h-full rounded-full ${pool.cap > 80 ? 'bg-rose-500' : pool.cap > 60 ? 'bg-amber-500' : 'bg-gradient-to-r from-zfs-accent to-indigo-500'}`}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-white/20 uppercase tracking-widest">
                              <span>{pool.alloc} Used</span>
                              <span>{pool.free} Free</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white">Active Pools</h3>
                  <button onClick={fetchPools} className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-white transition-all">
                    <RefreshCw size={20} />
                  </button>
                </div>
                <div className="space-y-6">
                  {(pools.length > 0 ? pools : []).map((pool, i) => (
                    <motion.div
                      key={pool.name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="glass-panel p-6 group cursor-pointer"
                      onClick={() => handleGetPoolStatus(pool.name)}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-zfs-accent group-hover:bg-zfs-accent group-hover:text-white transition-all">
                            <Database size={24} />
                          </div>
                          <div>
                            <p className="text-lg font-bold text-white">{pool.name}</p>
                            <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : 'status-error'}`}>{pool.health}</span>
                          </div>
                        </div>
                        <button className="text-white/20 hover:text-white">
                          <MoreHorizontal size={20} />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40 font-bold uppercase tracking-widest">Usage</span>
                          <span className="text-white font-bold">{pool.cap}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pool.cap}%` }}
                            className="h-full bg-gradient-to-r from-zfs-accent to-indigo-500 rounded-full"
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-white/20 uppercase tracking-widest">
                          <span>{pool.alloc} Used</span>
                          <span>{pool.free} Free</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="glass-panel p-6 bg-zfs-accent/5 border-zfs-accent/20">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 bg-zfs-accent/20 rounded-xl flex items-center justify-center text-zfs-accent">
                      <ShieldCheck size={20} />
                    </div>
                    <h4 className="font-bold text-white">Quick Scrub</h4>
                  </div>
                  <p className="text-sm text-white/60 mb-4">Start a data integrity verification on all pools.</p>
                  <div className="flex gap-2">
                    {pools.map(pool => (
                      <button
                        key={pool.name}
                        onClick={() => scrubStatus[pool.name] === 'running' ? handleStopScrub(pool.name) : handleStartScrub(pool.name)}
                        className={`flex-1 apple-button !py-2 text-xs ${scrubStatus[pool.name] === 'running' ? 'apple-button-secondary' : 'apple-button-primary'}`}
                      >
                        {scrubStatus[pool.name] === 'running' ? `Stop ${pool.name}` : `Scrub ${pool.name}`}
                      </button>
                    ))}
                    {pools.length === 0 && (
                      <span className="text-white/30 text-xs">No pools available</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      // ── Stats ──────────────────────────────────────────────────────────────
      case 'stats':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Throughput */}
              <div className="glass-panel p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white">Throughput</h3>
                    <p className="text-sm text-white/40">Real-time I/O performance</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-zfs-accent" /><span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Read</span></div>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Write</span></div>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats}>
                      <defs>
                        <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0C1327', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="read" stroke="#3B82F6" fillOpacity={1} fill="url(#colorRead)" strokeWidth={2} />
                      <Area type="monotone" dataKey="write" stroke="#10B981" fillOpacity={1} fill="url(#colorWrite)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* IOPS */}
              <div className="glass-panel p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white">IOPS</h3>
                    <p className="text-sm text-white/40">Input/Output operations per second</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><Zap size={20} /></div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats}>
                      <defs>
                        <linearGradient id="colorIops" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0C1327', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="iops" stroke="#F59E0B" fillOpacity={1} fill="url(#colorIops)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cache */}
              <div className="glass-panel p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white">Cache Performance</h3>
                    <p className="text-sm text-white/40">ARC and L2ARC hit rates</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-400" /><span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">ARC Hit</span></div>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-violet-400" /><span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">L2ARC Hit</span></div>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats}>
                      <defs>
                        <linearGradient id="colorArc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorL2arc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#A78BFA" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#0C1327', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="arcHit" stroke="#818CF8" fillOpacity={1} fill="url(#colorArc)" strokeWidth={2} />
                      <Area type="monotone" dataKey="l2arcHit" stroke="#A78BFA" fillOpacity={1} fill="url(#colorL2arc)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Latency */}
              <div className="glass-panel p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white">Latency</h3>
                    <p className="text-sm text-white/40">Average I/O response time (ms)</p>
                  </div>
                  <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400"><Clock size={20} /></div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats}>
                      <defs>
                        <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FB7185" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#FB7185" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0C1327', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="latency" stroke="#FB7185" fillOpacity={1} fill="url(#colorLatency)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        );

      // ── Pools ──────────────────────────────────────────────────────────────
      case 'pools':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Storage Pools</h2>
                <p className="text-white/40">Manage your ZFS storage pools</p>
              </div>
              <button onClick={fetchPools} className="apple-button apple-button-secondary">
                <RefreshCw size={18} /> Refresh
              </button>
            </div>
            {loadingPools ? (
              <div className="glass-panel p-12 text-center text-white/30">Loading pools…</div>
            ) : pools.length === 0 ? (
              <div className="glass-panel p-12 text-center text-white/30">No pools found. The backend may not be running.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {pools.map(pool => (
                  <div key={pool.name} className="glass-panel p-8">
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-zfs-accent/10 rounded-2xl flex items-center justify-center text-zfs-accent">
                          <Database size={28} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-white">{pool.name}</h2>
                          <p className="text-sm text-white/40">{pool.raidType} • {pool.size}</p>
                        </div>
                      </div>
                      <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : pool.health === 'DEGRADED' ? 'status-warning' : 'status-error'}`}>{pool.health}</span>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Used', value: pool.alloc },
                          { label: 'Free', value: pool.free },
                          { label: 'Total', value: pool.size },
                        ].map(item => (
                          <div key={item.label} className="bg-white/5 p-4 rounded-2xl">
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">{item.label}</p>
                            <p className="text-lg font-bold text-white">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40 font-bold uppercase tracking-widest">Capacity</span>
                          <span className="text-white font-bold">{pool.cap}%</span>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pool.cap}%` }}
                            className={`h-full rounded-full ${pool.cap > 80 ? 'bg-rose-500' : pool.cap > 60 ? 'bg-amber-500' : 'bg-gradient-to-r from-zfs-accent to-indigo-500'}`}
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => scrubStatus[pool.name] === 'running' ? handleStopScrub(pool.name) : handleStartScrub(pool.name)}
                          className={`flex-1 apple-button !py-2 text-xs flex items-center gap-2 ${scrubStatus[pool.name] === 'running' ? 'apple-button-secondary' : 'apple-button-primary'}`}
                        >
                          {scrubStatus[pool.name] === 'running' ? <><StopCircle size={14} /> Stop Scrub</> : <><Play size={14} /> Start Scrub</>}
                        </button>
                        <button
                          onClick={() => handleGetPoolStatus(pool.name)}
                          className="apple-button apple-button-secondary !py-2 text-xs"
                        >
                          <Activity size={14} /> Status
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      // ── Datasets ───────────────────────────────────────────────────────────
      case 'datasets':
        return <DatasetList datasets={datasets} />;

      // ── Snapshots ──────────────────────────────────────────────────────────
      case 'snapshots':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Snapshots</h2>
                <p className="text-white/40">Point-in-time recovery and scheduling</p>
              </div>
            </div>

            {/* Create Snapshot */}
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
                <Camera size={20} className="text-zfs-accent" /> Create Snapshot
              </h3>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="e.g. tank/data@manual-2026-03-17"
                  value={newSnapName}
                  onChange={e => setNewSnapName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateSnapshot()}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-zfs-accent/50"
                />
                <button
                  onClick={handleCreateSnapshot}
                  disabled={snapLoading || !newSnapName.trim()}
                  className="apple-button apple-button-primary disabled:opacity-40"
                >
                  {snapLoading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create
                </button>
              </div>
            </div>

            {/* Snapshot List */}
            <div className="glass-panel overflow-hidden">
              <div className="p-8 border-b border-white/[0.05]">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white">All Snapshots</h3>
                  <button onClick={fetchSnapshots} className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-white transition-all">
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>
              {loadingSnapshots ? (
                <div className="p-12 text-center text-white/30">Loading snapshots…</div>
              ) : snapshots.length === 0 ? (
                <div className="p-12 text-center text-white/30">No snapshots found.</div>
              ) : (
                <div className="p-4 space-y-3">
                  {snapshots.map((snap, i) => (
                    <motion.div
                      key={snap.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center justify-between p-5 bg-white/[0.02] rounded-2xl hover:bg-white/[0.05] transition-all group border border-white/[0.05]"
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-10 h-10 bg-zfs-accent/10 rounded-xl flex items-center justify-center text-zfs-accent">
                          <Camera size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-white">{snap.snapName}</p>
                          <p className="text-[10px] text-white/30 font-mono mt-0.5">{snap.dataset}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1">Used</p>
                          <p className="text-xs font-bold text-white/60">{snap.used}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1">Created</p>
                          <p className="text-xs font-bold text-white/60">{snap.creation.toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRollback(snap.name)}
                            className="px-3 py-1.5 bg-amber-500/10 text-amber-400 text-xs font-bold rounded-lg hover:bg-amber-500/20 transition-all"
                          >
                            Rollback
                          </button>
                          <button
                            onClick={() => handleDeleteSnapshot(snap.name)}
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      // ── Replication ────────────────────────────────────────────────────────
      case 'replication':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Replication</h2>
                <p className="text-white/40">Remote dataset replication via ZFS send/receive</p>
              </div>
            </div>
            <div className="glass-panel p-12 text-center">
              <RefreshCw size={64} className="mx-auto text-zfs-accent mb-6 opacity-20" />
              <h2 className="text-3xl font-bold mb-2">ZFS Send / Receive</h2>
              <p className="text-white/40 max-w-md mx-auto mb-8">Use the Snapshots tab to send a snapshot to a remote destination using ZFS send/receive.</p>
              <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex items-center justify-between text-left max-w-2xl mx-auto">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                    <RefreshCw size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-white">tank/data → remote-backup/data</p>
                    <p className="text-xs text-white/40 mt-1">Use: POST /api/v1/snapshots/send</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      // ── Scrub & Health ─────────────────────────────────────────────────────
      case 'scrub':
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold text-white">Scrub & Health</h2>
              <p className="text-white/40">Data integrity verification and pool diagnostics</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {pools.map(pool => (
                <div key={pool.name} className="glass-panel p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-zfs-accent/10 rounded-2xl flex items-center justify-center text-zfs-accent">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{pool.name}</h3>
                      <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : 'status-error'}`}>{pool.health}</span>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    {[
                      { label: 'Used', value: pool.alloc },
                      { label: 'Free', value: pool.free },
                      { label: 'Total', value: pool.size },
                      { label: 'Capacity', value: `${pool.cap}%` },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                        <span className="text-sm text-white/60">{item.label}</span>
                        <span className="text-sm font-bold text-white">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => scrubStatus[pool.name] === 'running' ? handleStopScrub(pool.name) : handleStartScrub(pool.name)}
                      className={`flex-1 apple-button !py-2.5 text-sm ${scrubStatus[pool.name] === 'running' ? 'apple-button-secondary' : 'apple-button-primary'}`}
                    >
                      {scrubStatus[pool.name] === 'running' ? <><StopCircle size={16} /> Stop Scrub</> : <><Play size={16} /> Start Scrub</>}
                    </button>
                    <button onClick={() => handleGetPoolStatus(pool.name)} className="apple-button apple-button-secondary !py-2.5 text-sm">
                      <Info size={16} /> Status
                    </button>
                  </div>
                </div>
              ))}

              {pools.length === 0 && (
                <div className="glass-panel p-12 text-center text-white/30 col-span-2">No pools found.</div>
              )}
            </div>

            {/* Disk grid */}
            <div className="glass-panel p-8">
              <h3 className="text-xl font-bold text-white mb-8">SMART Diagnostics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {mockSmartData.map(smart => (
                  <div key={smart.device} className="bg-white/5 p-6 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-white/5 rounded-lg text-zfs-accent"><HardDrive size={20} /></div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${smart.status === 'PASSED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {smart.status}
                      </span>
                    </div>
                    <p className="font-bold text-white">{smart.device}</p>
                    <p className="text-[10px] text-white/40 mb-4">{smart.model}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/20 uppercase tracking-widest">Temp</span>
                        <span className="text-white flex items-center gap-1"><Thermometer size={10} /> {smart.temperature}°C</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/20 uppercase tracking-widest">Power On</span>
                        <span className="text-white flex items-center gap-1"><Clock size={10} /> {smart.powerOnHours}h</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/20 uppercase tracking-widest">Errors</span>
                        <span className={`flex items-center gap-1 ${smart.reallocatedSectors === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <CheckCircle2 size={10} /> {smart.reallocatedSectors}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Permissions ────────────────────────────────────────────────────────
      case 'permissions':
        return <ACLManager />;

      // ── Settings ───────────────────────────────────────────────────────────
      case 'settings':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-panel p-8">
              <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                <SettingsIcon size={24} className="text-zfs-accent" /> System Settings
              </h3>
              <div className="space-y-6">
                {[
                  { label: 'API Base URL', value: '/api/v1', icon: Server },
                  { label: 'SSH Access', value: 'Enabled (Port 22)', icon: Terminal },
                  { label: 'API Key', value: '••••••••••••', icon: Key },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="text-white/40"><item.icon size={18} /></div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <span className="text-sm font-bold text-white/60">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-panel p-8">
              <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                <ShieldCheck size={24} className="text-emerald-400" /> Security
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold">API Key Authentication</p>
                    <p className="text-xs text-white/40">X-API-Key header required on all requests</p>
                  </div>
                  <div className="w-12 h-6 bg-emerald-500/20 rounded-full relative p-1 cursor-pointer">
                    <div className="w-4 h-4 bg-emerald-500 rounded-full ml-auto" />
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold">API Documentation</p>
                    <p className="text-xs text-white/40">GET /api/v1/pools, /datasets, /snapshots</p>
                  </div>
                  <ChevronRight size={16} className="text-white/20" />
                </div>
              </div>
            </div>
          </div>
        );

      // ── Logs ───────────────────────────────────────────────────────────────
      case 'logs':
        return (
          <div className="space-y-8">
            <div className="glass-panel p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white">System Logs</h3>
                  <p className="text-sm text-white/40">Recent ZFS operations and system events</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setLogs([])} className="px-4 py-2 bg-white/5 rounded-xl text-xs font-bold text-white/60 hover:bg-white/10 transition-all">Clear</button>
                </div>
              </div>
              <div className="space-y-3">
                {logs.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-8">No logs yet.</p>
                )}
                {logs.map((log, i) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-6 p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05] hover:bg-white/[0.04] transition-all"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      log.level === 'error' ? 'bg-rose-500/10 text-rose-400' :
                      log.level === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-zfs-accent/10 text-zfs-accent'
                    }`}>
                      {log.level === 'error' ? <XCircle size={18} /> : log.level === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] font-mono text-white/20">{log.timestamp}</span>
                        {log.pool && <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-white/5 text-white/40 rounded-md tracking-widest">{log.pool}</span>}
                      </div>
                      <p className="text-sm text-white/80 truncate">{log.message}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-zfs-deep">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 ml-72 p-12 overflow-y-auto h-screen no-scrollbar">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-6 bg-white/[0.03] border border-white/[0.05] rounded-2xl px-6 py-3 w-96 focus-within:bg-white/[0.05] focus-within:border-zfs-accent/50 transition-all">
            <Search size={18} className="text-white/30" />
            <input
              type="text"
              placeholder="Search pools, datasets, or snapshots..."
              className="bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20 w-full"
            />
          </div>

          <div className="flex items-center gap-6">
            <button className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/[0.03] text-white/40 hover:text-white border border-white/[0.05] transition-all relative">
              <Bell size={20} />
              {logs.some(l => l.level === 'error') && (
                <span className="absolute top-3.5 right-3.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-zfs-deep" />
              )}
            </button>
            <div className="flex items-center gap-4 pl-6 border-l border-white/10">
              <div className="text-right">
                <p className="text-sm font-bold text-white">Admin User</p>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Superuser</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-zfs-accent to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                <User size={20} className="text-white" />
              </div>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
