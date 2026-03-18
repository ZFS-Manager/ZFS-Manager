import React from 'react';
import { 
  LayoutDashboard, 
  Database, 
  Layers, 
  Camera, 
  Settings, 
  HardDrive,
  Activity,
  LogOut,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import { NavLink, useNavigate } from 'react-router-dom';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'stats', label: 'Performance', icon: Activity, path: '/stats' },
  { id: 'pools', label: 'Storage Pools', icon: Database, path: '/pools' },
  { id: 'datasets', label: 'Datasets & Volumes', icon: Layers, path: '/datasets' },
  { id: 'snapshots', label: 'Snapshots', icon: Camera, path: '/snapshots' },
  { id: 'logs', label: 'System Logs', icon: FileText, path: '/logs' },
  { id: 'settings', label: 'App Settings', icon: Settings, path: '/settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('zfs_access_token');
    window.location.href = '/login';
  };

  return (
    <div className="glass-sidebar w-72 flex flex-col p-6">
      <div className="flex items-center gap-4 px-4 mb-12">
        <div className="w-10 h-10 bg-zfs-accent rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
          <HardDrive className="text-white" size={24} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">ZFS Manager</h1>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => 
              `nav-item group flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive ? 'nav-item-active bg-zfs-accent/10 border border-zfs-accent/20' : 'text-white/40 hover:bg-white/5 hover:text-white/60'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} className={isActive ? 'text-zfs-accent' : 'text-inherit'} />
                <span className={`font-medium ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-zfs-accent"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/[0.05]">
        <button 
          onClick={handleLogout}
          className="w-full nav-item group text-white/40 hover:text-rose-400 hover:bg-rose-500/10 flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
        >
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
