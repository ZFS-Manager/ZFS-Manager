import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
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
import { Menu, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('zfs_access_token'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [volumes, setVolumes] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [totalUsedStorage, setTotalUsedStorage] = useState(0);
  const [stats, setStats] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [logs, setLogs] = useState<ZFSLog[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLogin = async (password: string) => {
    setApiKey(password);
    await api.getPools(); // throws on 401
    setIsAuthenticated(true);
  };

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [poolsRes, snapshotRes, statsRes, datasetsRes, volumesRes] = await Promise.all([
        api.getPools(),
        api.getSnapshots(),
        api.getSystemStats().catch(() => null),
        api.getDatasets(),
        api.getVolumes(),
      ]);

      if (statsRes) setSystemStats(statsRes);

      const mappedPools: ZFSPool[] = (poolsRes.pools || []).map((p: any) => ({
        name: p.name,
        size: formatBytes(p.size, 2),
        alloc: formatBytes(p.alloc, 2),
        free: formatBytes(p.free, 2),
        cap: parseInt(p.cap) || 0,
        frag: parseInt(p.frag) || 0,
        dedup: p.dedup || '1.00x',
        health: p.health,
        raidType: 'ZFS Pool',
        vdevs: [],
        _raw: p,
      }));

      const totalCap = (poolsRes.pools || []).reduce((a: number, p: any) => a + (Number(p.size) || 0), 0);
      const totalUsed = (poolsRes.pools || []).reduce((a: number, p: any) => a + (Number(p.alloc) || 0), 0);

      setPools(mappedPools);
      setTotalCapacity(totalCap);
      setTotalUsedStorage(totalUsed);
      setSnapshots(snapshotRes.snapshots || []);

      setDatasets((datasetsRes.datasets || []).map((d: any) => ({
        id: d.name,
        name: d.name,
        used: formatBytes(d.used, 2),
        avail: formatBytes(d.available || d.avail, 2),
        refer: formatBytes(d.refer, 2),
        mountpoint: d.mountpoint,
        compression: d.compression || 'lz4',
        dedup: d.dedup || 'off',
        readonly: d.readonly === 'on' || d.readonly === true,
        _usedBytes: Number(d.used) || 0,
        _availBytes: Number(d.available || d.avail) || 0,
      })));

      setVolumes((volumesRes.volumes || []).map((v: any) => ({
        ...v,
        used: formatBytes(v.used, 2),
        avail: formatBytes(v.avail, 2),
        volsize: formatBytes(v.volsize, 2),
        refer: formatBytes(v.refer, 2),
      })));

      // Build I/O stats from iostat
      if (mappedPools.length > 0) {
        try {
          const iostatRes = await api.getPoolIoStat(mappedPools[0].name);
          if (iostatRes.iostat?.length > 0) {
            const row = iostatRes.iostat[0];
            const read = parseFloat(row[3] ?? '0') / 1024 / 1024;
            const write = parseFloat(row[4] ?? '0') / 1024 / 1024;
            const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setStats(prev => [...prev.slice(-29), {
              name: time,
              timestamp: time,
              read,
              write,
              iops: (parseFloat(row[5] ?? '0') + parseFloat(row[6] ?? '0')),
              cpu: statsRes?.cpu_load?.[0] ?? 0,
              arcHit: statsRes?.arc_hit_ratio ?? 0,
              alloc: Number(row[1] ?? 0) / 1e9,
              free: Number(row[2] ?? 0) / 1e9,
            }]);
          }
        } catch { /* no iostat available */ }
      }

      // Fetch pool history as logs
      if (mappedPools.length > 0) {
        try {
          const histRes = await api.getPoolHistory(mappedPools[0].name);
          const histLogs: ZFSLog[] = (histRes.history || [])
            .filter((line: string) => line.trim() && !line.startsWith('History'))
            .slice(-50)
            .map((line: string, i: number) => ({
              id: String(i),
              timestamp: line.substring(0, 19) || new Date().toISOString(),
              level: line.includes('destroy') || line.includes('error') ? 'error'
                : line.includes('scrub') || line.includes('warn') ? 'warning' : 'info',
              message: line.replace(/^\d{4}-\d{2}-\d{2}\.\d{2}:\d{2}:\d{2}\s+/, '').trim(),
              pool: mappedPools[0].name,
            }))
            .reverse();
          setLogs(histLogs);
        } catch { /* no history */ }
      }

      setLoading(false);
    } catch (error: any) {
      if (error.message?.includes('401')) {
        localStorage.removeItem('zfs_access_token');
        setIsAuthenticated(false);
      }
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      const iv = setInterval(fetchData, 5000);
      return () => clearInterval(iv);
    }
  }, [isAuthenticated, fetchData]);

  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-[#070B14] text-white overflow-hidden">
        {/* Desktop Sidebar */}
        <motion.div layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="hidden lg:block h-full overflow-hidden">
          <Sidebar />
        </motion.div>

        {/* Mobile overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
              />
              <motion.div
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                className="fixed inset-y-0 left-0 z-[101] lg:hidden">
                <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile header */}
          <header className="lg:hidden flex items-center justify-between p-4 border-b border-white/[0.05] bg-[#0C1327]/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zfs-accent rounded-lg flex items-center justify-center">
                <HardDrive className="text-white" size={18} />
              </div>
              <span className="font-bold text-lg">ZFS Manager</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 hover:bg-white/5 rounded-lg">
              <Menu size={24} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <Dashboard
                  pools={pools}
                  datasets={datasets}
                  snapshots={snapshots}
                  totalCapacity={totalCapacity}
                  totalUsedStorage={totalUsedStorage}
                  currentStats={stats[stats.length - 1] || { read: 0, write: 0, iops: 0, cpu: 0, arcHit: 0 }}
                  systemStats={systemStats}
                  logs={logs}
                  loading={loading}
                />
              } />
              <Route path="/stats" element={<Performance stats={stats} />} />
              <Route path="/pools" element={<StoragePools pools={pools} onRefresh={fetchData} />} />
              <Route path="/datasets" element={
                <DatasetList
                  datasets={datasets}
                  volumes={volumes}
                  pools={pools}
                  onRefresh={fetchData}
                />
              } />
              <Route path="/snapshots" element={
                <SnapshotManager
                  snapshots={snapshots}
                  datasets={datasets}
                  onRefresh={fetchData}
                />
              } />
              <Route path="/logs" element={<SystemLogs logs={logs} pools={pools} />} />
              <Route path="/settings" element={
                <div className="glass-panel p-16 flex flex-col items-center justify-center text-center">
                  <h3 className="text-2xl font-black mb-4">Application Settings</h3>
                  <p className="text-white/40 max-w-md">Configuration options for the ZFS Manager interface.</p>
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
