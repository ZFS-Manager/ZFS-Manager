import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Activity, Database, Layers,
  Camera, FileText, Settings, HardDrive, LogOut,
  Server, ChevronLeft, ChevronRight,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard',   icon: LayoutDashboard, path: '/dashboard' },
      { id: 'stats',     label: 'Performance', icon: Activity,        path: '/stats'     },
    ],
  },
  {
    label: 'Storage',
    items: [
      { id: 'pools',     label: 'Storage Pools', icon: Database, path: '/pools'     },
      { id: 'datasets',  label: 'Datasets',      icon: Layers,   path: '/datasets'  },
      { id: 'snapshots', label: 'Snapshots',      icon: Camera,   path: '/snapshots' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'logs',     label: 'System Logs', icon: FileText, path: '/logs'     },
      { id: 'settings', label: 'Settings',    icon: Settings, path: '/settings' },
    ],
  },
];

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface SidebarProps {
  systemStats?: any;
  mobileOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  breakpoint?: Breakpoint;
}

export default function Sidebar({
  systemStats,
  mobileOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
  breakpoint = 'desktop',
}: SidebarProps) {
  const location = useLocation();
  const [hoverExpanded, setHoverExpanded] = useState(false);

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';

  const isCollapsed = isMobile
    ? false
    : isTablet
    ? collapsed && !hoverExpanded
    : collapsed;

  const effectiveWidth = isCollapsed ? 56 : 220;

  const handleLogout = () => {
    localStorage.removeItem('zfs_access_token');
    window.location.href = '/login';
  };

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
    if (isTablet) setHoverExpanded(false);
  };

  const asideStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
        width: 220,
        transform: 'translateX(' + (mobileOpen ? 0 : -220) + 'px)',
        transition: 'transform 0.25s ease',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: mobileOpen ? '4px 0 32px rgba(0,0,0,0.5)' : 'none',
      }
    : isTablet
    ? {
        position: 'absolute', left: 0, top: 0, bottom: 0,
        zIndex: hoverExpanded ? 50 : 1,
        width: effectiveWidth,
        transition: 'width 0.2s ease, box-shadow 0.2s ease',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: hoverExpanded && !isCollapsed ? '4px 0 24px rgba(0,0,0,0.4)' : 'none',
      }
    : {
        position: 'relative', height: '100%',
        width: effectiveWidth,
        transition: 'width 0.2s ease',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        flexShrink: 0,
      };

  return (
    <aside
      style={asideStyle}
      onMouseEnter={() => isTablet && setHoverExpanded(true)}
      onMouseLeave={() => isTablet && setHoverExpanded(false)}
    >
      <div style={{
        height: 52, display: 'flex', alignItems: 'center',
        gap: 10, padding: isCollapsed ? '0 14px' : '0 16px',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        borderBottom: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{
          width: 28, height: 28, background: 'var(--accent-dim)',
          border: '1px solid var(--accent-mid)', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <HardDrive size={14} color="var(--accent)" strokeWidth={2} />
        </div>
        {!isCollapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
              color: 'var(--text-primary)', letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            }}>ZFS Manager</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-muted)', letterSpacing: '0.03em',
            }}>Storage Platform</div>
          </div>
        )}
      </div>

      <nav style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: isCollapsed ? '12px 6px' : '12px 8px',
      }} className="no-scrollbar">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: gi < NAV_GROUPS.length - 1 ? 24 : 0 }}>
            {!isCollapsed && (
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--text-muted)', padding: '0 10px 6px',
              }}>{group.label}</div>
            )}
            {group.items.map(({ id, label, icon: Icon, path }) => {
              const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
              return (
                <NavLink
                  key={id}
                  to={path}
                  onClick={handleNavClick}
                  title={isCollapsed ? label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: isCollapsed ? 0 : 10, height: 40,
                    padding: isCollapsed ? '0' : '0 10px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--radius)', marginBottom: 2,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: isCollapsed ? 'none' : (isActive ? '3px solid var(--accent)' : '3px solid transparent'),
                    outline: isCollapsed && isActive ? '2px solid var(--accent)' : 'none',
                    outlineOffset: 2,
                    fontFamily: 'var(--font-ui)', fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    textDecoration: 'none', transition: 'all 0.1s ease', cursor: 'pointer',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }
                  }}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.75} style={{ flexShrink: 0 }} />
                  {!isCollapsed && label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{
        padding: isCollapsed ? '12px 6px' : '12px 8px',
        borderTop: '1px solid var(--border)', flexShrink: 0,
      }}>
        {!isCollapsed && (systemStats?.hostname || systemStats?.zfs_version || systemStats?.uptime) && (
          <div style={{
            padding: '8px 10px', marginBottom: 8,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          }}>
            {systemStats?.hostname && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Server size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{systemStats.hostname}</span>
              </div>
            )}
            {systemStats?.zfs_version && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>ZFS</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {systemStats.zfs_version.replace('zfs-', '')}
                </span>
              </div>
            )}
            {systemStats?.uptime && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Uptime</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {systemStats.uptime}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleLogout}
          title={isCollapsed ? 'Sign Out' : undefined}
          style={{
            display: 'flex', alignItems: 'center',
            gap: isCollapsed ? 0 : 9, height: 40,
            padding: isCollapsed ? '0' : '0 10px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 'var(--radius)', width: '100%',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
            fontSize: 13, fontWeight: 400, transition: 'all 0.1s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--danger)';
            (e.currentTarget as HTMLElement).style.background = 'var(--danger-dim)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <LogOut size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {!isCollapsed && 'Sign Out'}
        </button>

        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, height: 34, padding: '0', width: '100%',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
              fontSize: 11, fontWeight: 400, transition: 'all 0.1s', marginTop: 4,
              borderRadius: 'var(--radius)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {isCollapsed
              ? <ChevronRight size={14} />
              : <><ChevronLeft size={14} /><span style={{ whiteSpace: 'nowrap' }}>Collapse</span></>
            }
          </button>
        )}
      </div>
    </aside>
  );
}
