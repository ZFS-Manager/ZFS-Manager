import { useState, useEffect } from 'react';
import { 
  Search, 
  Bell, 
  User, 
  Database,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import DatasetList from './components/DatasetList';
import StatCard from './components/StatCard';
import PerformanceMonitor from './components/PerformanceMonitor';
import ACLManager from './components/ACLManager';
import { getDatasets, getPools } from './api';
import type { ZfsDataset as ApiDataset, ZfsPool as ApiPool } from './api';
import type { ZFSDataset, ZFSPool } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([getDatasets(), getPools()]);
      
      // Map API types to UI types
      const mappedDatasets: ZFSDataset[] = d.map((ds: ApiDataset, index: number) => ({
        id: index.toString(),
        name: ds.name,
        used: ds.used,
        avail: ds.available,
        refer: ds.refer,
        mountpoint: ds.mountpoint,
        compression: 'lz4', // Default or fetch from props if added to API
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
        vdevs: [] // API doesn't provide vdevs in list yet
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
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <StatCard 
                label="Total Pools" 
                value={pools.length.toString()} 
                icon={Database} 
                trend={{ value: 'Stable', isPositive: true }}
              />
              <StatCard 
                label="Total Datasets" 
                value={datasets.length.toString()} 
                icon={Database} 
              />
              <StatCard 
                label="System Health" 
                value={pools.every(p => p.health === 'ONLINE') ? 'Healthy' : 'Check Required'} 
                icon={RefreshCw}
                trend={{ value: 'Optimal', isPositive: true }}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <PerformanceMonitor />
              </div>
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white">Quick Status</h3>
                {pools.map((pool, i) => (
                  <motion.div
                    key={pool.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="glass-panel p-6"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-lg font-bold text-white">{pool.name}</p>
                      <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : 'status-error'}`}>
                        {pool.health}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-white/40">
                        <span>Capacity</span>
                        <span>{pool.cap}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-zfs-accent" 
                          style={{ width: `${pool.cap}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'stats':
        return <PerformanceMonitor />;
      case 'pools':
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold text-white">Storage Pools</h2>
              <button 
                onClick={fetchData}
                className="apple-button apple-button-secondary"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {pools.map((pool) => (
                <div key={pool.name} className="glass-panel p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">{pool.name}</h3>
                    <span className={`status-badge ${pool.health === 'ONLINE' ? 'status-online' : 'status-error'}`}>
                      {pool.health}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-xl">
                      <p className="text-xs text-white/40 uppercase">Used</p>
                      <p className="text-lg font-bold text-white">{pool.alloc}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl">
                      <p className="text-xs text-white/40 uppercase">Free</p>
                      <p className="text-lg font-bold text-white">{pool.free}</p>
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
      default:
        return (
          <div className="glass-panel p-12 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Coming Soon</h2>
            <p className="text-white/40">The {activeTab} module is currently under development.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-zfs-deep text-white">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 ml-72 p-12 overflow-y-auto h-screen no-scrollbar">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-6 bg-white/[0.03] border border-white/[0.05] rounded-2xl px-6 py-3 w-96 focus-within:bg-white/[0.05] focus-within:border-zfs-accent/50 transition-all">
            <Search size={18} className="text-white/30" />
            <input 
              type="text" 
              placeholder="Search pools or datasets..." 
              className="bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20 w-full"
            />
          </div>
          
          <div className="flex items-center gap-6">
            <button className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/[0.03] text-white/40 hover:text-white border border-white/[0.05] transition-all relative">
              <Bell size={20} />
              <span className="absolute top-3.5 right-3.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#020617]" />
            </button>
            <div className="flex items-center gap-4 pl-6 border-l border-white/10">
              <div className="text-right">
                <p className="text-sm font-bold text-white">Admin</p>
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
