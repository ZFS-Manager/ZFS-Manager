import { useState, useEffect } from 'react';
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
  Layers,
  Zap,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Settings as SettingsIcon,
  ChevronRight,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  Thermometer,
  Info,
  AlertTriangle,
  XCircle,
  Terminal,
  Server,
  Key,
  LayoutDashboard,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import DatasetList from './components/DatasetList';
import ACLManager from './components/ACLManager';
import { ZFSPool, ZFSDataset, ZFSLog, DiskSmart, DiskStat } from './types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDatasets, getPools } from './api';
import type { ZfsDataset as ApiDataset, ZfsPool as ApiPool } from './api';

// Helper for generating mock stats for charts
const generateMockStats = () => {
  const stats: DiskStat[] = [];
  const now = new Date();
  for (let i = 0; i < 20; i++) {
    stats.push({
      timestamp: new Date(now.getTime() - (20 - i) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

// Mock data for components not yet in API
const mockLogs: ZFSLog[] = [
  { id: '1', timestamp: '2026-03-06 14:20:12', level: 'info', message: 'Pool "tank" scrub started.', pool: 'tank' },
  { id: '2', timestamp: '2026-03-06 14:25:45', level: 'info', message: 'Dataset "tank/data" property "compression" set to "lz4".', pool: 'tank' },
  { id: '3', timestamp: '2026-03-06 14:30:00', level: 'warning', message: 'Disk "sde" reported high temperature (45°C).', pool: 'tank' },
  { id: '4', timestamp: '2026-03-06 14:32:10', level: 'info', message: 'Snapshot "tank/data@hourly-1" created.', pool: 'tank' },
  { id: '5', timestamp: '2026-03-06 14:35:00', level: 'error', message: 'Replication task "tank/data → remote" failed: Connection timed out.', pool: 'tank' },
];

const mockSmartData: DiskSmart[] = [
  { device: 'sda', model: 'Samsung SSD 870', serial: 'S5YJN123456', temperature: 32, powerOnHours: 12450, status: 'PASSED', reallocatedSectors: 0 },
  { device: 'sdb', model: 'Samsung SSD 870', serial: 'S5YJN123457', temperature: 33, powerOnHours: 12452, status: 'PASSED', reallocatedSectors: 0 },
  { device: 'sdc', model: 'WD Red Pro', serial: 'WD-WCC123456', temperature: 38, powerOnHours: 25600, status: 'PASSED', reallocatedSectors: 0 },
  { device: 'sdd', model: 'WD Red Pro', serial: 'WD-WCC123457', temperature: 39, powerOnHours: 25605, status: 'PASSED', reallocatedSectors: 0 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [stats, setStats] = useState<DiskStat[]>(generateMockStats());
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([getDatasets(), getPools()]);
      
      const mappedDatasets: ZFSDataset[] = d.map((ds: ApiDataset, index: number) => ({
        id: index.toString(),
        name: ds.name,
        used: ds.used,
        avail: ds.available,
        refer: ds.refer,
        mountpoint: ds.mountpoint,
        compression: 'lz4',
        dedup: 'off',
        readonly: false
      }));

      const mappedPools: ZFSPool[] = p.map((pool: ApiPool) => ({
        name: pool.name,
        size: pool.size,
        alloc: pool.alloc,
        free: pool.free,
        cap: Math.round((parseInt(pool.alloc) / parseInt(pool.size)) * 100) || 0,
        health: pool.health as any,
        raidType: 'Generic',
        vdevs: []
      }));

      setDatasets(mappedDatasets);
      setPools(mappedPools);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      setStats(prev => {
        const newStat: DiskStat = {
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

  const renderContent = () => {
    const currentStats = stats[stats.length - 1] || { read: 0, write: 0, iops: 0 };

    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              {[
                { label: 'Total Capacity', value: pools.length > 0 ? pools.reduce((acc, p) => acc + (parseFloat(p.size) || 0), 0).toFixed(1) + ' TB' : '0 TB', icon: Database, color: 'text-blue-400', trend: '+2.4%', up: true },
                { label: 'CPU Usage', value: '12.4%', icon: Cpu, color: 'text-emerald-400', trend: '-1.2%', up: false },
                { label: 'System Health', value: pools.every(p => p.health === 'ONLINE') ? 'Optimal' : 'Check', icon: ShieldCheck, color: 'text-indigo-400', trend: 'Stable', up: true },
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="glass-panel p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-xl font-bold text-white">System Overview</h3>
                      <p className="text-sm text-white/40">Nexus ZFS Node-01 Status</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="status-badge status-online">Operational</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                      <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Uptime</h4>
                      <p className="text-2xl font-bold text-white">12d 4h 32m</p>
                      <p className="text-[10px] text-white/20 mt-1">Last reboot: 2026-02-22</p>
                    </div>
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                      <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Load Average</h4>
                      <div className="flex gap-4">
                        <div>
                          <p className="text-lg font-bold text-white">0.42</p>
                          <p className="text-[10px] text-white/20 mt-1">1 min</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white">0.38</p>
                          <p className="text-[10px] text-white/20 mt-1">5 min</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white">0.31</p>
                          <p className="text-[10px] text-white/20 mt-1">15 min</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white">Active Pools</h3>
                  <button className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-white transition-all">
                    <Plus size={20} />
                  </button>
                </div>
                <div className="space-y-6">
                  {pools.map((pool, i) => (
                    <motion.div
                      key={pool.name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="glass-panel p-6 group cursor-pointer"
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
              </div>
            </div>
          </div>
        );
      case 'stats':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="glass-panel p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white">Throughput</h3>
                    <p className="text-sm text-white/40">Real-time I/O performance monitoring</p>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats}>
                      <defs>
                        <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="read" stroke="#3B82F6" fillOpacity={1} fill="url(#colorRead)" strokeWidth={2} />
                      <Area type="monotone" dataKey="write" stroke="#10B981" fillOpacity={1} fill="url(#colorWrite)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white">IOPS</h3>
                    <p className="text-sm text-white/40">Input/Output operations per second</p>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats}>
                      <defs>
                        <linearGradient id="colorIops" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="iops" stroke="#F59E0B" fillOpacity={1} fill="url(#colorIops)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        );
      case 'pools':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Storage Pools</h2>
                <p className="text-white/40">Manage your ZFS storage pools and vdevs</p>
              </div>
              <button onClick={fetchData} className="apple-button apple-button-primary">
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} /> Refresh Pools
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {pools.map((pool) => (
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
                    <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : 'status-error'}`}>{pool.health}</span>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/5 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">Used</p>
                        <p className="text-lg font-bold text-white">{pool.alloc}</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">Free</p>
                        <p className="text-lg font-bold text-white">{pool.free}</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">Cap</p>
                        <p className="text-lg font-bold text-white">{pool.cap}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'datasets':
        return <DatasetList datasets={datasets} />;
      case 'permissions':
        return <ACLManager />;
      case 'snapshots':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Snapshots</h2>
                <p className="text-white/40">Point-in-time recovery and scheduling</p>
              </div>
              <button className="apple-button apple-button-primary">
                <Camera size={20} /> Create Snapshot
              </button>
            </div>
            <div className="glass-panel p-12 text-center">
              <Camera size={64} className="mx-auto text-zfs-accent mb-6 opacity-20" />
              <h2 className="text-3xl font-bold mb-2">Snapshots</h2>
              <p className="text-white/40 max-w-md mx-auto">Point-in-time recovery and snapshot scheduling.</p>
            </div>
          </div>
        );
      case 'replication':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Replication</h2>
                <p className="text-white/40">Remote dataset replication and backups</p>
              </div>
              <button className="apple-button apple-button-primary">
                <RefreshCw size={20} /> New Replication Task
              </button>
            </div>
            <div className="glass-panel p-12 text-center">
              <RefreshCw size={64} className="mx-auto text-zfs-accent mb-6 opacity-20" />
              <h2 className="text-3xl font-bold mb-2">Replication</h2>
              <p className="text-white/40 max-w-md mx-auto">Remote dataset replication and backup synchronization.</p>
            </div>
          </div>
        );
      case 'scrub':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="glass-panel p-8">
                <h4 className="text-lg font-bold mb-6">Integrity Check</h4>
                <div className="space-y-6">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/60">Last Scrub</span>
                    <span className="font-bold">2026-03-04 12:00</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/60">Errors Found</span>
                    <span className="font-bold text-emerald-400">0</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white/60">Status</span>
                    <span className="status-badge status-online">Healthy</span>
                  </div>
                </div>
                <button className="mt-8 w-full apple-button apple-button-primary">Start Scrub</button>
              </div>
              <div className="glass-panel p-8">
                <h4 className="text-xl font-bold text-white mb-8">SMART Diagnostics</h4>
                <div className="grid grid-cols-1 gap-6">
                  {mockSmartData.slice(0, 2).map((smart) => (
                    <div key={smart.device} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-white/5 rounded-lg text-zfs-accent">
                          <HardDrive size={18} />
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${smart.status === 'PASSED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {smart.status}
                        </span>
                      </div>
                      <p className="font-bold text-white text-sm">{smart.device}</p>
                      <p className="text-[10px] text-white/40 mb-4">{smart.model}</p>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <span className="text-white flex items-center gap-1"><Thermometer size={10} /> {smart.temperature}°C</span>
                        <span className="text-white flex items-center gap-1"><Clock size={10} /> {smart.powerOnHours}h</span>
                        <span className={`flex items-center gap-1 ${smart.reallocatedSectors === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <CheckCircle2 size={10} /> {smart.reallocatedSectors}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'logs':
        return (
          <div className="space-y-8">
            <div className="glass-panel p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white">System Logs</h3>
                  <p className="text-sm text-white/40">Recent ZFS operations and system events</p>
                </div>
              </div>
              <div className="space-y-3">
                {mockLogs.map((log, i) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-6 p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05] hover:bg-white/[0.04] transition-all"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      log.level === 'error' ? 'bg-rose-500/10 text-rose-400' :
                      log.level === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-zfs-accent/10 text-zfs-accent'
                    }`}>
                      {log.level === 'error' ? <XCircle size={18} /> :
                       log.level === 'warning' ? <AlertTriangle size={18} /> :
                       <Info size={18} />}
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
      case 'settings':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-panel p-8">
              <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                <SettingsIcon size={24} className="text-zfs-accent" />
                System Settings
              </h3>
              <div className="space-y-6">
                {[
                  { label: 'Hostname', value: 'nexus-zfs-node-01', icon: Server },
                  { label: 'SSH Access', value: 'Enabled (Port 22)', icon: Terminal },
                  { label: 'Root Password', value: '••••••••••••', icon: Key },
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
              <button className="mt-8 w-full apple-button apple-button-primary">Save Changes</button>
            </div>
            <div className="glass-panel p-8">
              <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                <ShieldCheck size={24} className="text-emerald-400" />
                Security
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold">Two-Factor Authentication</p>
                    <p className="text-xs text-white/40">Secure your account with 2FA</p>
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold">API Access</p>
                    <p className="text-xs text-white/40">Manage API keys for automation</p>
                  </div>
                  <ChevronRight size={16} className="text-white/20" />
                </div>
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
              <span className="absolute top-3.5 right-3.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-zfs-deep" />
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
