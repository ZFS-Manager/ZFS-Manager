import React, { useState } from 'react';
import { Shield, User, Users, Globe, Plus, Trash2, ChevronRight } from 'lucide-react';
import { ACLRule } from '../types';
import { motion } from 'motion/react';

export default function ACLManager() {
  const [rules, setRules] = useState<ACLRule[]>([
    { id: '1', type: 'user', name: 'admin', permissions: ['read', 'write', 'execute'], inheritance: 'all' },
    { id: '2', type: 'group', name: 'developers', permissions: ['read', 'write'], inheritance: 'file' },
    { id: '3', type: 'everyone', name: 'everyone', permissions: ['read'], inheritance: 'none' },
  ]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'user': return <User size={18} />;
      case 'group': return <Users size={18} />;
      default: return <Globe size={18} />;
    }
  };

  return (
    <div className="glass-panel overflow-hidden">
      <div className="p-8 flex justify-between items-center border-b border-white/[0.05]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Access Control</h2>
          <p className="text-xs text-white/40 mt-1">Configure permissions and inheritance</p>
        </div>
        <button className="apple-button apple-button-primary !py-2 !px-4 text-xs">
          <Plus size={16} /> Add Rule
        </button>
      </div>

      <div className="p-4">
        <div className="space-y-3">
          {rules.map((rule, i) => (
            <motion.div 
              key={rule.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between p-6 bg-white/[0.02] rounded-2xl hover:bg-white/[0.05] transition-all group border border-white/[0.05]"
            >
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-white/40 group-hover:bg-zfs-accent group-hover:text-white transition-all">
                  {getIcon(rule.type)}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <p className="text-base font-bold text-white">{rule.name}</p>
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-white/5 text-white/30 rounded-md tracking-widest">{rule.type}</span>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {rule.permissions.map(p => (
                      <span key={p} className="text-[9px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-md border border-white/5 uppercase tracking-widest">{p}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-12">
                <div className="text-right">
                  <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1">Inheritance</p>
                  <p className="text-xs font-bold text-white/60 capitalize">{rule.inheritance}</p>
                </div>
                <div className="flex gap-2">
                  <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-white/30 hover:text-white hover:bg-white/10 transition-all">
                    <ChevronRight size={16} />
                  </button>
                  <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="p-6 bg-white/[0.02] border-t border-white/[0.05]">
        <div className="flex items-center gap-3 text-white/30">
          <Shield size={16} className="text-zfs-accent" />
          <p className="text-[10px] font-medium italic">Changes to ACLs are applied recursively to all sub-directories and files.</p>
        </div>
      </div>
    </div>
  );
}
