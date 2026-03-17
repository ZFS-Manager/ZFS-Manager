import React, { useEffect, useState } from 'react';
import { Database, HardDrive, Activity, ShieldCircle, RefreshCw, Layers } from 'lucide-react';
import { getDatasets, getPools, ZfsDataset, ZfsPool } from './api';

const App: React.FC = () => {
  const [datasets, setDatasets] = useState<ZfsDataset[]>([]);
  const [pools, setPools] = useState<ZfsPool[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([getDatasets(), getPools()]);
      setDatasets(d);
      setPools(p);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatSize = (bytes: string) => {
    const b = parseInt(bytes);
    if (isNaN(b)) return bytes;
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            ZFS Manager
          </h1>
          <p className="text-slate-400 mt-2">Enterprise Storage Orchestration</p>
        </div>
        <button 
          onClick={fetchData}
          className="p-3 glass rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2 text-blue-400 border border-blue-500/20"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Database className="text-blue-500" />
          <h2 className="text-2xl font-semibold">Storage Pools</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pools.map((pool) => (
            <div key={pool.name} className="glass p-6 rounded-2xl card-hover relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Database size={80} />
              </div>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{pool.name}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  pool.health === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {pool.health}
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Capacity</span>
                  <span className="text-white font-medium">{formatSize(pool.alloc)} / {formatSize(pool.size)}</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full" 
                    style={{ width: `${(parseInt(pool.alloc) / parseInt(pool.size)) * 100}%` }}
                  ></div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity size={16} className="text-blue-400" />
                    <span className="text-slate-400">Read: {pool.read}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Activity size={16} className="text-emerald-400" />
                    <span className="text-slate-400">Write: {pool.write}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {pools.length === 0 && !loading && (
            <div className="col-span-full glass p-12 text-center rounded-2xl text-slate-500">
              No storage pools detected
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <Layers className="text-emerald-500" />
          <h2 className="text-2xl font-semibold">Datasets</h2>
        </div>
        <div className="glass rounded-2xl overflow-hidden border border-slate-800">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Used</th>
                <th className="px-6 py-4 font-semibold">Available</th>
                <th className="px-6 py-4 font-semibold">Mountpoint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {datasets.map((ds) => (
                <tr key={ds.name} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <ShieldCircle size={18} className="text-emerald-500 opacity-50 group-hover:opacity-100" />
                      <span className="text-white font-medium">{ds.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{formatSize(ds.used)}</td>
                  <td className="px-6 py-4 text-slate-300">{formatSize(ds.available)}</td>
                  <td className="px-6 py-4">
                    <code className="text-xs bg-slate-900 px-2 py-1 rounded text-blue-400 border border-blue-500/20">
                      {ds.mountpoint}
                    </code>
                  </td>
                </tr>
              ))}
              {datasets.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No active datasets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default App;
