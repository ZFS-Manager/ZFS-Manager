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
    <motion.div 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 256 }}
      className={`glass-sidebar h-full flex flex-col relative transition-all duration-300 ${isCollapsed ? 'px-3' : 'px-6'} py-6 border-r border-white/[0.05]`}
    >
      {/* Mobile Close Button */}
      <button 
        onClick={onClose}
        className="lg:hidden absolute top-6 right-6 p-2 text-white/40 hover:text-white"
      >
        <X size={20} />
      </button>

      {/* Collapse Toggle (Desktop Only) */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden lg:flex absolute top-6 -right-3 w-6 h-6 bg-zfs-accent rounded-full items-center justify-center text-white border-2 border-[#0C1327] hover:scale-110 transition-transform z-50 shadow-lg"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className={`flex items-center gap-4 ${isCollapsed ? 'px-2' : 'px-4'} mb-12`}>
          <div className="flex-shrink-0 w-10 h-10 bg-zfs-accent rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
            <HardDrive className="text-white" size={24} />
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.h1 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="text-xl font-bold tracking-tight text-white whitespace-nowrap"
              >
                ZFS Manager
              </motion.h1>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => 
                `nav-item group flex items-center gap-3 ${isCollapsed ? 'justify-center px-0' : 'px-4'} py-3 rounded-xl transition-all ${
                  isActive ? 'nav-item-active bg-zfs-accent/10 border border-zfs-accent/20' : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                }`
              }
              title={isCollapsed ? item.label : ''}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className={isActive ? 'text-zfs-accent' : 'text-inherit'} />
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className={`font-medium whitespace-nowrap ${isActive ? 'text-white' : ''}`}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {isActive && !isCollapsed && (
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

        <div className={`mt-auto pt-6 border-t border-white/[0.05] ${isCollapsed ? 'px-1' : ''}`}>
          <button 
            onClick={handleLogout}
            className={`w-full nav-item group text-white/40 hover:text-rose-400 hover:bg-rose-500/10 flex items-center gap-3 ${isCollapsed ? 'justify-center px-0' : 'px-4'} py-3 rounded-xl transition-all`}
            title={isCollapsed ? 'Logout' : ''}
          >
            <LogOut size={20} />
            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="font-medium whitespace-nowrap"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.div>
    </motion.div>
  );
}
