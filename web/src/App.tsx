import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate, 
  useLocation 
} from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Performance from './components/Performance';
import StoragePools from './components/StoragePools';
import DatasetList from './components/DatasetList';
import SnapshotManager from './components/SnapshotManager';
import SystemLogs from './components/SystemLogs';
import Login from './components/Login';
import { ZFSPool, ZFSDataset, ZFSLog } from './types';
import { api, formatBytes, setApiKey } from './api';
import { Menu, X, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('zfs_access_token'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [volumes, setVolumes] = useState<any[]>([]);
  const [totalCapacity, setTotalCapacity] = useState<number>(0);
  const [totalUsedStorage, setTotalUsedStorage] = useState<number>(0);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ZFSLog[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);

  const handleLogin = async (password: string) => {
    try {
      setApiKey(password);
      await api.getPools();
      setIsAuthenticated(true);
    } catch (err: any) {
      localStorage.removeItem('zfs_access_token');
      setIsAuthenticated(false);
      throw new Error('Invalid authentication password');
    }
  };

  const fetchData = async () => {
    if (!isAuthenticated) return;
    
    try {
      const [poolsRes, snapshotRes, statsRes] = await Promise.all([
        api.getPools(),
        api.getSnapshots(),
        api.getSystemStats().catch(() => null)
      ]);

      if (statsRes) setSystemStats(statsRes);

      const mappedPools: ZFSPool[] = (poolsRes.pools || []).map((p: any) => ({
        name: p.name,
        size: formatBytes(p.size, 2),
        alloc: formatBytes(p.alloc, 2),
        free: formatBytes(p.free, 2),
        cap: parseInt(p.cap),
        health: p.health,
        raidType: 'ZFS Pool',
        vdevs: []
      }));

      const totalCap = (poolsRes.pools || []).reduce((acc: number, p: any) => acc + (Number(p.size) || 0), 0);
      const totalUsed = (poolsRes.pools || []).reduce((acc: number, p: any) => acc + (Number(p.alloc) || 0), 0);

      setPools(mappedPools);
      setTotalCapacity(totalCap);
      setTotalUsedStorage(totalUsed);

      const [datasetsRes, volumesRes] = await Promise.all([
        api.getDatasets(),
        api.getVolumes()
      ]);

      setDatasets((datasetsRes.datasets || []).map((d: any) => ({
        id: d.name,
        name: d.name,
        used: formatBytes(d.used, 2),
        avail: formatBytes(d.available || d.avail, 2),
        refer: formatBytes(d.refer, 2),
        mountpoint: d.mountpoint,
        compression: d.compression || 'on',
        dedup: d.dedup || 'off',
        readonly: d.readonly === 'on' || d.readonly === true
      })));

      setVolumes((volumesRes.volumes || []).map((v: any) => ({
        ...v,
        used: formatBytes(v.used, 2),
        avail: formatBytes(v.avail, 2),
        volsize: formatBytes(v.volsize, 2),
        refer: formatBytes(v.refer, 2),
      })));

      setSnapshots(snapshotRes.snapshots || []);
      
      if (mappedPools.length > 0) {
        const iostatRes = await api.getPoolIoStat(mappedPools[0].name);
        if (iostatRes.iostat && iostatRes.iostat.length > 0) {
          const statsRow = iostatRes.iostat[0];
          const read = parseFloat(statsRow[3]) / 1024 / 1024;
          const write = parseFloat(statsRow[4]) / 1024 / 1024;
          const readIops = parseFloat(statsRow[5]);
          const writeIops = parseFloat(statsRow[6]);
          const time = new Date().toLocaleTimeString();
          setStats(prev => {
            const newStats = [...prev, { 
              name: time, 
              timestamp: time,
              read, 
              write,
              iops: readIops + writeIops,
              cpu: statsRes?.cpu_load?.[0] || 0.42,
              arcHit: statsRes?.arc_hit_ratio || 98.2,
              alloc: Number(statsRow[1]) / 1024 / 1024 / 1024, // GB
              free: Number(statsRow[2]) / 1024 / 1024 / 1024, // GB
            }];
            return newStats.slice(-30);
          });
        }
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      if (error.message && error.message.includes('401')) {
        localStorage.removeItem('zfs_access_token');
        setIsAuthenticated(false);
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-[#070B14] text-white selection:bg-zfs-accent/30 overflow-hidden">
        {/* Desktop Sidebar */}
        <motion.div 
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="hidden lg:block h-full overflow-hidden"
        >
          <Sidebar />
        </motion.div>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
              />
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                className="fixed inset-y-0 left-0 z-[101] lg:hidden"
              >
                <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile Header */}
          <header className="lg:hidden flex items-center justify-between p-6 border-b border-white/[0.05] bg-[#0C1327]/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zfs-accent rounded-lg flex items-center justify-center">
                <HardDrive className="text-white" size={18} />
              </div>
              <span className="font-bold text-lg">ZFS Manager</span>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-white hover:bg-white/5 rounded-lg"
            >
              <Menu size={24} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 md:p-10 no-scrollbar">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <Dashboard 
                  pools={pools} 
                  totalCapacity={totalCapacity} 
                  totalUsedStorage={totalUsedStorage} 
                  currentStats={stats[stats.length - 1] || { read: 0, write: 0, iops: 0, cpu: 0, arcHit: 0 }}
                  systemStats={systemStats}
                  formatSizeLong={(b) => formatBytes(b, 2)}
                />
              } />
              <Route path="/stats" element={<Performance stats={stats} />} />
              <Route path="/pools" element={<StoragePools pools={pools} />} />
              <Route path="/datasets" element={
                <div className="space-y-8">
                  <DatasetList datasets={datasets} selectedName="" onSelect={() => {}} />
                  {volumes.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-white/40 uppercase tracking-widest mt-10 text-center md:text-left">ZVOL Volumes</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {volumes.map((v, i) => (
                          <div key={i} className="glass-panel p-6 border-white/[0.05] hover:bg-white/[0.03] transition-all">
                             <div className="flex justify-between items-start mb-4">
                               <div className="font-bold text-white truncate max-w-[150px]">{v.name}</div>
                               <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Active</div>
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                 <div className="text-[10px] text-white/20 uppercase font-bold">Size</div>
                                 <div className="text-sm font-bold">{v.volsize}</div>
                               </div>
                               <div>
                                 <div className="text-[10px] text-white/20 uppercase font-bold">Used</div>
                                 <div className="text-sm font-bold">{v.used}</div>
                               </div>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              } />
              <Route path="/snapshots" element={<SnapshotManager snapshots={snapshots} />} />
              <Route path="/logs" element={<SystemLogs logs={logs} />} />
              <Route path="/settings" element={
                <div className="glass-panel p-10 flex flex-col items-center justify-center text-center">
                  <h3 className="text-2xl font-bold mb-4">Application Settings</h3>
                  <p className="text-white/40 max-w-md">Configuration options for the ZFS Manager interface and node connection.</p>
                </div>
              } />
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
