import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DiskStat } from '../types';
import { Activity, ArrowUp, ArrowDown } from 'lucide-react';

export default function PerformanceMonitor() {
  const [stats, setStats] = useState<DiskStat[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats/disk');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch disk stats', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const latest = stats[stats.length - 1];

  return (
    <div className="glass-widget p-10">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-3">Activity</h2>
          <p className="text-4xl font-bold text-white tracking-tight">Real-time Throughput</p>
        </div>
        <div className="flex gap-12">
          <div className="text-right">
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-2 flex items-center justify-end gap-2">
              <ArrowDown size={12} className="text-emerald-400" /> Read
            </p>
            <p className="text-3xl font-bold text-white">{latest?.read || 0} <span className="text-sm text-white/40">MB/s</span></p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-2 flex items-center justify-end gap-2">
              <ArrowUp size={12} className="text-apple-blue-light" /> Write
            </p>
            <p className="text-3xl font-bold text-white">{latest?.write || 0} <span className="text-sm text-white/40">MB/s</span></p>
          </div>
        </div>
      </div>

      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats}>
            <defs>
              <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#58A6FF" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#58A6FF" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="timestamp" hide />
            <YAxis 
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontWeight: 600 }} 
              axisLine={false} 
              tickLine={false}
              unit="MB"
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '20px',
                color: '#fff',
                fontSize: '12px',
                backdropFilter: 'blur(20px)',
                padding: '16px'
              }}
              itemStyle={{ color: '#fff' }}
            />
            <Area 
              type="monotone" 
              dataKey="read" 
              stroke="#10b981" 
              strokeWidth={4}
              fillOpacity={1} 
              fill="url(#colorRead)" 
              isAnimationActive={false}
            />
            <Area 
              type="monotone" 
              dataKey="write" 
              stroke="#58A6FF" 
              strokeWidth={4}
              fillOpacity={1} 
              fill="url(#colorWrite)" 
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-10 pt-8 border-t border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-white/40">
            <Activity size={20} />
          </div>
          <span className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">IOPS: {latest?.iops || 0}</span>
        </div>
        <div className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] bg-white/5 px-6 py-2 rounded-full">
          Live Sync Active
        </div>
      </div>
    </div>
  );
}
