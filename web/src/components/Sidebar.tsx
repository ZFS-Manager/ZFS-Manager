import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Database, 
  Layers, 
  Camera, 
  Settings, 
  HardDrive,
  Activity,
  LogOut,
  FileText,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavLink } from 'react-router-dom';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'stats', label: 'Performance', icon: Activity, path: '/stats' },
  { id: 'pools', label: 'Storage Pools', icon: Database, path: '/pools' },
  { id: 'datasets', label: 'Datasets & Volumes', icon: Layers, path: '/datasets' },
  { id: 'snapshots', label: 'Snapshots', icon: Camera, path: '/snapshots' },
  { id: 'logs', label: 'System Logs', icon: FileText, path: '/logs' },
  { id: 'settings', label: 'App Settings', icon: Settings, path: '/settings' },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('zfs_access_token');
    window.location.href = '/login';
  };

  return (
    <div className={`fixed left-0 top-0 h-screen transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] z-50 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <div className="h-full glass-panel !rounded-none !border-y-0 !border-l-0 flex flex-col bg-[#07090E]/60 backdrop-blur-3xl border-r border-white/[0.04]">
        {/* Brand Section */}
        <div className="p-6 pb-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-zfs-accent to-zfs-secondary rounded-xl flex items-center justify-center shadow-lg shadow-zfs-accent/10">
            <HardDrive className="text-white" size={20} strokeWidth={2.5} />
          </div>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col"
            >
              <h1 className="text-[15px] font-black tracking-tighter text-white leading-none">ZFS <span className="text-zfs-accent">Manager</span></h1>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 mt-1">Enterprise Link</span>
            </motion.div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-6 space-y-1 overflow-y-auto no-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) => 
                  `nav-item ${isActive ? 'nav-item-active' : ''} ${isCollapsed ? 'justify-center' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-zfs-accent' : ''} />
                    {!isCollapsed && (
                      <span className="tracking-tight">{item.label}</span>
                    )}
                    {isActive && !isCollapsed && (
                      <motion.div 
                        layoutId="active-pill"
                        className="ml-auto w-1 h-3.5 bg-zfs-accent rounded-full shadow-[0_0_8px_rgba(56,189,248,0.4)]"
                      />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* System State & Logout */}
        <div className="p-4 border-t border-white/[0.03]">
          {!isCollapsed && (
            <div className="mb-4 px-4 py-3 bg-white/[0.02] rounded-xl border border-white/[0.03]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Node Alpha</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-zfs-accent w-[42%] rounded-full shadow-[0_0_8px_rgba(56,189,248,0.2)]" />
              </div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className={`w-full nav-item !text-rose-500 hover:bg-rose-500/5 group transition-all ${isCollapsed ? 'justify-center border-none' : 'border border-rose-500/10'}`}
          >
            <LogOut size={18} strokeWidth={2} className="group-hover:scale-110 transition-transform" />
            {!isCollapsed && <span className="font-bold tracking-tight">Terminate Session</span>}
          </button>
        </div>
      </div>

      {/* Collapse Toggle */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-8 w-6 h-6 bg-slate-900 border border-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:border-zfs-accent/50 transition-all shadow-xl z-50 group"
      >
        <ChevronLeft size={14} className={`transition-transform duration-500 ${isCollapsed ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}
