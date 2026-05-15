import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar, { Breakpoint } from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Performance from './components/Performance';
import StoragePools from './components/StoragePools';
import DatasetList from './components/DatasetList';
import SnapshotManager from './components/SnapshotManager';
import SystemLogs from './components/SystemLogs';
import Login from './components/Login';
import { ZFSPool, ZFSDataset, ZFSLog } from './types';
import { api, formatBytes, setApiKey } from './api';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/stats':     'Performance',
  '/pools':     'Storage Pools',
  '/datasets':  'Datasets',
  '/snapshots': 'Snapshots',
  '/logs':      'System Logs',
  '/settings':  'Settings',
};

function getBreakpoint(): Breakpoint {
  const w = window.innerWidth;
  if (w < 768)  return 'mobile';
  if (w < 1200) return 'tablet';
  return 'desktop';
}

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint);
  useEffect(() => {
    const h = () => setBp(getBreakpoint());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return bp;
}

function TopBar({
  loading,
  systemStats,
  onMenuOpen,
}: {
  loading: boolean;
  systemStats: any;
  onMenuOpen?: () => void;
}) {
  const location = useLocation();
  const title    = PAGE_TITLES[location.pathname] || 'ZFS Manager';

  return (
    <header style={{
      height: 52, display: 'flex', alignItems: 'center',
      padding: onMenuOpen ? '0 16px' : '0 24px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0, gap: 12,
    }}>
      {onMenuOpen && (
        <button
          onClick={onMenuOpen}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', borderRadius: 'var(--radius)', flexShrink: 0,
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <Menu size={20} />
        </button>
      )}

      <span style={{
        fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600,
        color: 'var(--text-primary)', letterSpacing: '-0.01em',
        flex: 1, textAlign: onMenuOpen ? 'center' : 'left',
      }}>
        {title}
      </span>

      {!onMenuOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={loading ? 'dot dot-warning' : 'dot dot-success'} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            {loading ? 'Syncing' : 'Live'}
          </span>
          {systemStats?.zfs_version && (
            <span className="badge">
              {systemStats.zfs_version.replace('zfs-', '')}
            </span>
          )}
        </div>
      )}
    </header>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('zfs_access_token'));
  const [pools, setPools]           = useState<ZFSPool[]>([]);
  const [datasets, setDatasets]     = useState<ZFSDataset[]>([]);
  const [volumes, setVolumes]       = useState<any[]>([]);
  const [snapshots, setSnapshots]   = useState<any[]>([]);
  const [totalCapacity, setTotalCapacity]       = useState(0);
  const [totalUsedStorage, setTotalUsedStorage] = useState(0);
  const [stats, setStats]           = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [logs, setLogs]             = useState<ZFSLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const breakpoint = useBreakpoint();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const bp = getBreakpoint();
    if (bp === 'desktop') return localStorage.getItem('sidebar_collapsed') === 'true';
    return bp === 'tablet';
  });

  useEffect(() => {
    if (breakpoint === 'tablet') {
      setSidebarCollapsed(true);
    } else if (breakpoint === 'desktop') {
      setSidebarCollapsed(localStorage.getItem('sidebar_collapsed') === 'true');
    } else {
      setMobileSidebarOpen(false);
    }
  }, [breakpoint]);

  const handleToggleCollapse = () => {
    setSidebarCollapsed(v => {
      const next = !v;
      if (breakpoint === 'desktop') localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const sidebarWidth =
    breakpoint === 'mobile' ? 0 :
    breakpoint === 'tablet' ? 56 :
    sidebarCollapsed ? 56 : 220;

  const handleLogin = async (password: string) => {
    setApiKey(password);
    await api.getPools();
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

      const totalCap  = (poolsRes.pools || []).reduce((a: number, p: any) => a + (Number(p.size)  || 0), 0);
      const totalUsed = (poolsRes.pools || []).reduce((a: number, p: any) => a + (Number(p.alloc) || 0), 0);

      setPools(mappedPools);
      setTotalCapacity(totalCap);
      setTotalUsedStorage(totalUsed);
      setSnapshots(snapshotRes.snapshots || []);

      setDatasets((datasetsRes.datasets || []).map((d: any) => ({
        id: d.name, name: d.name,
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
        used: formatBytes(v.used, 2), avail: formatBytes(v.avail, 2),
        volsize: formatBytes(v.volsize, 2), refer: formatBytes(v.refer, 2),
      })));

      if (mappedPools.length > 0) {
        try {
          const iostatRes = await api.getPoolIoStat(mappedPools[0].name);
          if (iostatRes.iostat?.length > 0) {
            const row = iostatRes.iostat[0];
            const readBw    = parseFloat(row[5] ?? '0') / 1024 / 1024;
            const writeBw   = parseFloat(row[6] ?? '0') / 1024 / 1024;
            const readIops  = parseFloat(row[3] ?? '0');
            const writeIops = parseFloat(row[4] ?? '0');
            const iops      = readIops + writeIops;
            const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setStats(prev => [...prev.slice(-59), {
              name: time, timestamp: time,
              read: readBw, write: writeBw, iops, readIops, writeIops,
              cpu:    statsRes?.cpu_percent ?? statsRes?.cpu_load?.[0] ?? 0,
              arcHit: statsRes?.arc_hit_ratio ?? 0,
              alloc:  Number(row[1] ?? 0) / 1e9,
              free:   Number(row[2] ?? 0) / 1e9,
            }]);
          }
        } catch { /* no iostat */ }
      }

      if (mappedPools.length > 0) {
        try {
          const histRes = await api.getPoolHistory(mappedPools[0].name);
          const histLogs: ZFSLog[] = (histRes.history || [])
            .filter((line: string) => line.trim() && !line.startsWith('History'))
            .slice(-50)
            .map((line: string, i: number) => ({
              id: String(i),
              timestamp: line.substring(0, 19) || new Date().toISOString(),
              level: (line.includes('destroy') || line.includes('DEGRADED') || line.includes('FAULTED') || (line.toLowerCase().includes('error') && !/\b0 errors?\b/i.test(line))) ? 'error'
                : (line.includes('replace') || line.includes('resilver') || (line.includes('scrub') && line.toLowerCase().includes('checksum')) || line.includes('warn')) ? 'warning'
                : 'info',
              message: line.replace(/^\d{4}-\d{2}-\d{2}\.\d{2}:\d{2}:\d{2}\s+/, '').trim(),
              pool: mappedPools[0].name,
            }))
            .reverse();
          setLogs(histLogs);
        } catch { /* no history */ }
      }

      setLoading(false);
      setGlobalError(null);
    } catch (error: any) {
      if (error.message?.includes('401')) {
        localStorage.removeItem('zfs_access_token');
        setIsAuthenticated(false);
      } else {
        setGlobalError(`Backend connection failed: ${error.message}`);
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

  const currentStats = stats[stats.length - 1] || { read: 0, write: 0, iops: 0, readIops: 0, writeIops: 0, cpu: 0, arcHit: 0 };

  return (
    <BrowserRouter>
      <div style={{
        display: 'flex', height: '100vh',
        background: 'var(--bg-base)', overflow: 'hidden',
      }}>

        {/* Mobile backdrop */}
        {breakpoint === 'mobile' && mobileSidebarOpen && (
          <div
            onClick={() => setMobileSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 99,
              background: 'rgba(0,0,0,0.5)',
            }}
          />
        )}

        {/* Sidebar wrapper */}
        <div style={{
          width: sidebarWidth, flexShrink: 0,
          position: 'relative', height: '100%',
          overflow: 'visible',
          transition: 'width 0.2s ease',
        }}>
          <Sidebar
            systemStats={systemStats}
            mobileOpen={mobileSidebarOpen}
            onClose={() => setMobileSidebarOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleCollapse}
            breakpoint={breakpoint}
          />
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TopBar
            loading={loading}
            systemStats={systemStats}
            onMenuOpen={breakpoint === 'mobile' ? () => setMobileSidebarOpen(true) : undefined}
          />

          <main
            style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              padding: breakpoint === 'mobile' ? '16px' : '24px',
            }}
            className="no-scrollbar"
          >
            {globalError && (
              <div style={{
                marginBottom: 24, padding: '12px 16px', borderRadius: 'var(--radius)',
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.85rem'
              }}>
                <span style={{ fontWeight: 600 }}>📡 Connection Issue:</span>
                <span>{globalError}</span>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <Dashboard
                  pools={pools} datasets={datasets} snapshots={snapshots}
                  totalCapacity={totalCapacity} totalUsedStorage={totalUsedStorage}
                  currentStats={currentStats}
                  systemStats={systemStats} logs={logs} loading={loading} historicalStats={stats}
                />
              } />
              <Route path="/stats" element={<Performance stats={stats} />} />
              <Route path="/pools" element={
                <StoragePools pools={pools} onRefresh={fetchData} zfsVersion={systemStats?.zfs_version} />
              } />
              <Route path="/datasets" element={
                <DatasetList datasets={datasets} volumes={volumes} pools={pools} onRefresh={fetchData} />
              } />
              <Route path="/snapshots" element={
                <SnapshotManager snapshots={snapshots} datasets={datasets} onRefresh={fetchData} />
              } />
              <Route path="/logs" element={<SystemLogs logs={logs} pools={pools} />} />
              <Route path="/settings" element={
                <div className="card" style={{ padding: 48, textAlign: 'center' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    System Configuration
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Configuration module coming soon.
                  </p>
                </div>
              } />
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
