import React, { useState } from 'react';
import { ZFSDataset } from '../types';
import { MoreVertical, HardDrive, Settings, Plus, Lock, Search } from 'lucide-react';
import { motion } from 'framer-motion';

interface DatasetListProps {
  datasets: ZFSDataset[];
  selectedName?: string;
  onSelect?: (name: string) => void;
}

export default function DatasetList({ datasets }: DatasetListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDatasets = datasets.filter(ds => 
    ds.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1300px] mx-auto pb-10">
      <div className="glass-panel overflow-hidden border-white/[0.02]">
        <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/[0.03] bg-white/[0.01]">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Storage Volumes</h2>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Dataset hierarchy & allocation</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative group flex-1 md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-zfs-accent transition-colors" size={14} />
              <input 
                type="text" 
                placeholder="Search datasets..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white/[0.02] border border-white/[0.03] rounded-xl pl-10 pr-4 py-2.5 text-[12px] text-white placeholder:text-slate-700 focus:outline-none focus:border-zfs-accent/30 w-full transition-all" 
              />
            </div>
            <button className="apple-button apple-button-primary !py-2.5 !px-5 whitespace-nowrap">
              <Plus size={14} strokeWidth={3} />
              <span className="text-[10px] font-black uppercase tracking-widest">Add Volume</span>
            </button>
          </div>
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-1 gap-3">
            {filteredDatasets.map((ds, i) => (
              <motion.div 
                key={ds.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.01] rounded-2xl hover:bg-white/[0.03] transition-all group border border-white/[0.02] hover:border-white/[0.06]"
              >
                <div className="flex items-center gap-5 mb-4 lg:mb-0">
                  <div className="w-12 h-12 bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-center justify-center text-slate-600 group-hover:text-zfs-accent transition-all">
                    <HardDrive size={22} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-base font-black text-white leading-none tracking-tight group-hover:text-zfs-accent transition-colors truncate">{ds.name.split('/').pop()}</p>
                      {ds.readonly && (
                        <div className="p-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <Lock size={10} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <p className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] mt-1.5 truncate">{ds.name}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-8 lg:gap-10">
                  <div className="flex items-center gap-6">
                    <div className="min-w-[60px]">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1.5">Ratio</p>
                      <span className="px-2 py-0.5 rounded bg-white/[0.02] text-[10px] font-black text-white/50 border border-white/[0.04] uppercase tracking-tighter">{ds.compression}</span>
                    </div>
                    <div className="min-w-[50px]">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1.5">Dedup</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter border ${ds.dedup === 'on' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/[0.02] text-slate-700 border-white/[0.04]'}`}>{ds.dedup}</span>
                    </div>
                  </div>

                  <div className="min-w-[140px]">
                    {(() => {
                      const usedMatch = ds.used.match(/(\d+(\.\d+)?)\s*(\w+)/);
                      const availMatch = ds.avail.match(/(\d+(\.\d+)?)\s*(\w+)/);
                      let percent = 0;
                      if (usedMatch && availMatch) {
                        const u = parseFloat(usedMatch[1]);
                        const a = parseFloat(availMatch[1]);
                        const uUnit = usedMatch[3].toUpperCase();
                        const aUnit = availMatch[3].toUpperCase();
                        
                        const toMb = (v: number, unit: string) => {
                          if (unit.startsWith('T')) return v * 1024 * 1024;
                          if (unit.startsWith('G')) return v * 1024;
                          if (unit.startsWith('K')) return v / 1024;
                          return v;
                        };
                        
                        const uMb = toMb(u, uUnit);
                        const aMb = toMb(a, aUnit);
                        percent = (uMb / (uMb + aMb)) * 100;
                      }

                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest">Capacity</p>
                            <p className="text-[10px] font-black text-white/60">{ds.used}</p>
                          </div>
                          <div className="w-full h-1 bg-white/[0.02] rounded-full overflow-hidden border border-white/[0.02]">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              className="h-full bg-zfs-accent rounded-full" 
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.01] border border-white/[0.02] text-slate-600 hover:text-white hover:border-white/[0.06] transition-all">
                      <Settings size={14} strokeWidth={2.5} />
                    </button>
                    <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.01] border border-white/[0.02] text-slate-600 hover:text-white hover:border-white/[0.06] transition-all">
                      <MoreVertical size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
