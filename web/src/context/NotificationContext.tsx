import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X, Bell } from 'lucide-react';

export type NotifType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  timestamp: number;
  isRead: boolean;
  autoDismiss?: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  notify: (opts: { type: NotifType; title: string; message: string; autoDismiss?: number }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

const TYPE_CONFIG: Record<NotifType, { icon: React.FC<any>; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle, color: 'var(--success)',  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)'   },
  error:   { icon: XCircle,     color: 'var(--danger)',   bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  warning: { icon: AlertTriangle, color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)'  },
  info:    { icon: Info,         color: 'var(--info)',     bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.25)'  },
};

interface ToastItem extends Notification {
  visible: boolean;
}

let idCounter = 0;
function genId() { return `notif_${Date.now()}_${++idCounter}`; }

function groupNotifications(notifs: Notification[]): Array<Notification | { grouped: true; type: NotifType; count: number; latest: Notification; ids: string[] }> {
  if (notifs.length <= 3) return notifs;
  const result: Array<Notification | { grouped: true; type: NotifType; count: number; latest: Notification; ids: string[] }> = [];
  const typeGroups = new Map<NotifType, Notification[]>();
  for (const n of notifs) {
    const arr = typeGroups.get(n.type) ?? [];
    arr.push(n);
    typeGroups.set(n.type, arr);
  }
  for (const [type, items] of typeGroups) {
    if (items.length >= 3) {
      result.push({ grouped: true, type, count: items.length, latest: items[0], ids: items.map(i => i.id) });
    } else {
      result.push(...items);
    }
  }
  return result;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350);
  }, []);

  const notify = useCallback((opts: { type: NotifType; title: string; message: string; autoDismiss?: number }) => {
    const id = genId();
    const dismissMs = opts.autoDismiss ?? (opts.type === 'error' ? 8000 : opts.type === 'warning' ? 6000 : 4000);
    const notif: Notification = {
      id, type: opts.type, title: opts.title, message: opts.message,
      timestamp: Date.now(), isRead: false, autoDismiss: dismissMs,
    };

    setNotifications(prev => [notif, ...prev].slice(0, 200));

    const toast: ToastItem = { ...notif, visible: false };
    setToasts(prev => [...prev, toast]);
    requestAnimationFrame(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t));
    });

    if (dismissMs > 0) {
      const timer = setTimeout(() => removeToast(id), dismissMs);
      timersRef.current.set(id, timer);
    }
  }, [removeToast]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    removeToast(id);
  }, [removeToast]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setToasts([]);
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{ notifications, notify, markRead, markAllRead, remove, clearAll, unreadCount }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </NotificationContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360,
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const cfg = TYPE_CONFIG[toast.type];
  const Icon = cfg.icon;
  const isCritical = toast.type === 'error' || toast.type === 'warning';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px',
      background: 'var(--bg-elevated)',
      border: `1px solid ${cfg.border}`,
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: 'var(--radius)',
      boxShadow: isCritical ? `0 4px 20px ${cfg.bg}, 0 2px 8px rgba(0,0,0,0.4)` : '0 2px 8px rgba(0,0,0,0.3)',
      fontFamily: 'var(--font-ui)',
      transform: toast.visible ? 'translateX(0)' : 'translateX(120%)',
      opacity: toast.visible ? 1 : 0,
      transition: 'transform 0.3s ease, opacity 0.3s ease',
      maxWidth: 360, minWidth: 280,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} style={{ color: cfg.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          {toast.title}
          {isCritical && (
            <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: cfg.color, background: cfg.bg,
              border: `1px solid ${cfg.border}`, borderRadius: 3, padding: '1px 4px',
            }}>
              {toast.type}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{toast.message}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          {new Date(toast.timestamp).toLocaleTimeString()}
        </div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

/* ── Notification Center Panel (used in TopBar dropdown) ── */
export function NotificationCenter({
  onClose,
  systemNotifications = [],
  onMarkSystemRead,
}: {
  onClose: () => void;
  systemNotifications?: any[];
  onMarkSystemRead?: (id: number) => void;
}) {
  const { notifications, markRead, markAllRead, remove, clearAll, unreadCount } = useNotifications();
  const [tab, setTab] = useState<'app' | 'system'>('app');

  const grouped = groupNotifications(notifications);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{
      position: isMobile ? 'fixed' : 'absolute',
      top: isMobile ? 52 : 44,
      right: isMobile ? 0 : 0,
      left: isMobile ? 0 : 'auto',
      width: isMobile ? '100vw' : 340,
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: isMobile ? 0 : 'var(--radius-lg)', zIndex: 500,
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 'calc(100vh - 52px)' : 480,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#fff',
              background: 'var(--danger)', borderRadius: 10,
              padding: '1px 6px', fontFamily: 'var(--font-mono)',
            }}>{unreadCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={markAllRead}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-ui)', padding: '2px 6px' }}
          >Mark all read</button>
          <button
            onClick={clearAll}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', padding: '2px 6px' }}
          >Clear</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['app', 'system'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, height: 34, background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            transition: 'all 0.12s',
          }}>{t === 'app' ? 'App' : 'System'}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
        {tab === 'app' ? (
          grouped.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              No app notifications
            </div>
          ) : (
            grouped.map((item, i) => {
              if ('grouped' in item) {
                const cfg = TYPE_CONFIG[item.type];
                const Icon = cfg.icon;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: cfg.bg }}>
                    <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, fontFamily: 'var(--font-ui)' }}>
                        {item.count} {item.type} notifications
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.latest.message}</div>
                    </div>
                  </div>
                );
              }
              const n = item;
              const cfg = TYPE_CONFIG[n.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: n.isRead ? 'transparent' : cfg.bg,
                    cursor: 'pointer',
                  }}
                  onClick={() => markRead(n.id)}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: n.isRead ? 'transparent' : cfg.bg,
                    border: `1px solid ${n.isRead ? 'var(--border)' : cfg.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={12} style={{ color: n.isRead ? 'var(--text-muted)' : cfg.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: n.isRead ? 400 : 700, color: n.isRead ? 'var(--text-muted)' : 'var(--text-primary)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{n.message}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); remove(n.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: 0 }}>
                    <X size={10} />
                  </button>
                </div>
              );
            })
          )
        ) : (
          systemNotifications.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              No system notifications
            </div>
          ) : (
            systemNotifications.slice(0, 20).map(n => (
              <div
                key={n.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: n.is_read ? 'transparent' : 'rgba(239,68,68,0.04)',
                  cursor: 'pointer',
                  opacity: n.is_read ? 0.7 : 1,
                }}
                onClick={() => onMarkSystemRead?.(n.id)}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: n.is_read ? 'transparent' : 'var(--danger)', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: n.is_read ? 400 : 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{n.message}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, textAlign: 'center' }}>
        <a href="/notifications" onClick={onClose} style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-ui)', textDecoration: 'underline' }}>
          Manage notifications & integrations →
        </a>
      </div>
    </div>
  );
}
