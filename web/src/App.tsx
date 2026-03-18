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

// Protected Route Wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('zfs_access_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('zfs_access_token'));
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [volumes, setVolumes] = useState<any[]>([]);
  const [totalCapacity, setTotalCapacity] = useState<number>(0);
  const [totalUsedStorage, setTotalUsedStorage] = useState<number>(0);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ZFSLog[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);

  const handleLogin = (password: string) => {
    // In a real app, we'd call a /login endpoint. 
    // Here, the password IS the API key, so we just set it.
    setApiKey(password);
    setIsAuthenticated(true);
  };

  const fetchData = async () => {
    if (!isAuthenticated) return;
    
    try {
      const [poolsRes, snapshotRes] = await Promise.all([
        api.getPools(),
        api.getSnapshots()
      ]);

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

      const mappedDatasets: ZFSDataset[] = (datasetsRes.datasets || []).map((d: any) => ({
        id: d.name,
        name: d.name,
        used: formatBytes(d.used, 2),
        avail: formatBytes(d.available || d.avail, 2),
        refer: formatBytes(d.refer, 2),
        mountpoint: d.mountpoint,
        compression: d.compression || 'on',
        dedup: d.dedup || 'off',
        readonly: d.readonly === 'on' || d.readonly === true
      }));

      const mappedVolumes = (volumesRes.volumes || []).map((v: any) => ({
        ...v,
        used: formatBytes(v.used, 2),
        avail: formatBytes(v.avail, 2),
        volsize: formatBytes(v.volsize, 2),
        refer: formatBytes(v.refer, 2),
      }));

      setDatasets(mappedDatasets);
      setVolumes(mappedVolumes);
      setSnapshots(snapshotRes.snapshots || []);
      
      if (mappedPools.length > 0) {
        const iostatRes = await api.getPoolIoStat(poolsRes.pools[0].name);
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
              arcHit: Math.random() * 20 + 75,
              l2arcHit: Math.random() * 5 + 90,
              latency: Math.random() * 2 + 0.5
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

  const formatSizeLong = (bytes: number) => formatBytes(bytes, 2);

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#070B14] text-white selection:bg-zfs-accent/30">
        <Sidebar />
        <main className="flex-1 flex flex-col p-10 overflow-y-auto max-h-screen custom-scrollbar">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={
              <Dashboard 
                pools={pools} 
                totalCapacity={totalCapacity} 
                totalUsedStorage={totalUsedStorage} 
                currentStats={stats[stats.length - 1] || { read: 0, write: 0, iops: 0 }}
                formatSizeLong={formatSizeLong}
              />
            } />
            <Route path="/stats" element={<Performance stats={stats} />} />
            <Route path="/pools" element={<StoragePools pools={pools} />} />
            <Route path="/datasets" element={
              <div className="space-y-8">
                <div className="flex justify-between items-center mr-8">
                   <h2 className="text-2xl font-bold">Datasets & Volumes</h2>
                   <button className="apple-button apple-button-primary">Create New</button>
                </div>
                <DatasetList datasets={datasets} selectedName="" onSelect={() => {}} />
                {volumes.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white/40 uppercase tracking-widest mt-10">ZVOL Volumes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {volumes.map((v: any, i: number) => (
                        <div key={i} className="glass-panel p-6 border-white/[0.05] hover:bg-white/[0.03] transition-all">
                           <div className="flex justify-between items-start mb-4">
                             <div className="font-bold text-white">{v.name}</div>
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
        </main>
      </div>
    </BrowserRouter>
  );
}
