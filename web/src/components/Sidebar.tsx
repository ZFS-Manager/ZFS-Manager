import { 
  LayoutDashboard, 
  Database, 
  Layers, 
  Camera, 
  RefreshCw, 
  ShieldCheck, 
  Settings, 
  HardDrive,
  Activity,
  LogOut,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'stats', label: 'Stats', icon: Activity },
  { id: 'pools', label: 'Storage Pools', icon: Database },
  { id: 'datasets', label: 'Datasets', icon: Layers },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { id: 'snapshots', label: 'Snapshots', icon: Camera },
  { id: 'replication', label: 'Replication', icon: RefreshCw },
  { id: 'scrub', label: 'Scrub & Health', icon: ShieldCheck },
  { id: 'logs', label: 'Logs', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
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
          <motion.div
            key={item.id}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab(item.id)}
            className={`nav-item group ${activeTab === item.id ? 'nav-item-active' : ''}`}
          >
            <item.icon size={20} className={activeTab === item.id ? 'text-zfs-accent' : 'text-white/40 group-hover:text-white/60'} />
            <span className="font-medium">{item.label}</span>
            {activeTab === item.id && (
              <motion.div 
                layoutId="active-pill"
                className="ml-auto w-1.5 h-1.5 rounded-full bg-zfs-accent"
              />
            )}
          </motion.div>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/[0.05]">
        <div className="nav-item group text-white/40 hover:text-rose-400 hover:bg-rose-500/10">
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </div>
      </div>
    </div>
  );
}
