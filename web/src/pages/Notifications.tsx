import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api';
import { Bell, Trash2, Plus, Mail, MessageSquare, Globe, Send, BellOff, AlertTriangle, Edit2, CheckCircle } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import Pagination from '../components/Pagination';

const PAGE_SIZE_NOTIF = 30;

/* ── Shared Local Styles & Components ── */
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
        {title}
      </h2>
      {sub && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', marginTop: 4, margin: 0, lineHeight: 1.4 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', transition: 'all 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11,
  fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 8,
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);

  // Modals state
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Initial rich form state for channels
  const initialChannelState = {
    name: '',
    ctype: 'webhook',
    // Webhook specific
    webhook_url: '',
    webhook_method: 'POST',
    webhook_headers: '{\n  "Content-Type": "application/json"\n}',
    // Discord specific
    discord_url: '',
    discord_username: 'ZFS-Manager',
    discord_avatar: '',
    // Gotify specific
    gotify_url: '',
    gotify_token: '',
    gotify_priority: '5',
    // Telegram specific
    telegram_bot_token: '',
    telegram_chat_id: '',
    // Email specific
    email_host: '',
    email_port: '587',
    email_username: '',
    email_password: '',
    email_encryption: 'TLS',
    email_from: '',
    email_to: '',
  };

  const [newChannel, setNewChannel] = useState(initialChannelState);
  const [newRule, setNewRule] = useState<{name: string, trigger_type: string, threshold_value: string, channel_ids: number[], is_active: boolean}>({
    name: '',
    trigger_type: 'login_failed',
    threshold_value: '',
    channel_ids: [],
    is_active: true,
  });
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');

  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertState, setAlertState] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);
  const [notifPage, setNotifPage] = useState(1);

  const [editingChannelId, setEditingChannelId] = useState<number | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  const displayTriggerType = (trigger: string) => {
    if (trigger.startsWith('quota_reached:')) {
      return `Dataset Quota > Threshold (${trigger.split(':')[1]})`;
    }
    switch(trigger) {
      case 'login_failed': return 'Failed Login Attempt (Interface)';
      case 'pool_unhealthy': return 'Pool Unhealthy (DEGRADED/FAULTED)';
      case 'hdd_temp': return 'HDD Temperature';
      case 'capacity': return 'Pool Capacity';
      case 'quota_reached': return 'Dataset Quota';
      case 'scrub_failed': return 'ZFS Scrub Failure';
      case 'scrub_started': return 'ZFS Scrub Started';
      case 'scrub_finished': return 'ZFS Scrub Finished';
      case 'smart_failure': return 'SMART Health Failure';
      case 'snapshots_high': return 'Snapshot Count High';
      case 'iops_high': return 'Live Combined IOPS High';
      case 'read_iops_high': return 'Live Read IOPS High';
      case 'write_iops_high': return 'Live Write IOPS High';
      default: return trigger;
    }
  };

  const fetchData = async () => {
    try {
      const [nRes, cRes, rRes, dRes] = await Promise.all([
        fetch('/api/v1/notifications', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()),
        fetch('/api/v1/notifications/channels', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()),
        fetch('/api/v1/notifications/rules', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()),
        fetch('/api/v1/datasets', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()).catch(() => ({ datasets: [] })),
      ]);
      setNotifications(nRes || []);
      setChannels(cRes || []);
      setRules(rRes || []);
      setDatasets(dRes?.datasets || []);
    } catch (e) {
      console.error("Failed to fetch notifications data", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createChannel = async () => {
    // Dynamically compile config JSON depending on ctype
    let configObj: any = {};
    if (newChannel.ctype === 'webhook') {
      let headers = {};
      try {
        headers = JSON.parse(newChannel.webhook_headers);
      } catch(e) {
        setAlertState({ title: "Configuration Error", message: "Headers field must be valid JSON.", type: "error" });
        return;
      }
      configObj = {
        url: newChannel.webhook_url,
        method: newChannel.webhook_method,
        headers,
      };
    } else if (newChannel.ctype === 'discord') {
      configObj = {
        url: newChannel.discord_url,
        username: newChannel.discord_username,
        avatar_url: newChannel.discord_avatar,
      };
    } else if (newChannel.ctype === 'gotify') {
      configObj = {
        url: newChannel.gotify_url,
        token: newChannel.gotify_token,
        priority: parseInt(newChannel.gotify_priority) || 5,
      };
    } else if (newChannel.ctype === 'telegram') {
      configObj = {
        bot_token: newChannel.telegram_bot_token,
        chat_id: newChannel.telegram_chat_id,
      };
    } else if (newChannel.ctype === 'email') {
      configObj = {
        host: newChannel.email_host,
        port: parseInt(newChannel.email_port) || 587,
        username: newChannel.email_username,
        password: newChannel.email_password,
        encryption: newChannel.email_encryption,
        from: newChannel.email_from,
        to: newChannel.email_to,
      };
    }

    try {
      await fetch('/api/v1/notifications/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` },
        body: JSON.stringify({
          id: editingChannelId || undefined,
          name: newChannel.name,
          ctype: newChannel.ctype,
          config: configObj,
        })
      });
      setShowChannelModal(false);
      setEditingChannelId(null);
      setNewChannel(initialChannelState);
      fetchData();
    } catch (e) {
      setAlertState({ title: "Network Error", message: "Network error saving channel.", type: "error" });
    }
  };

  const startEditChannel = (channel: any) => {
    setEditingChannelId(channel.id);
    const c = channel.config || {};
    setNewChannel({
      name: channel.name,
      ctype: channel.ctype,
      webhook_url: c.url || '',
      webhook_method: c.method || 'POST',
      webhook_headers: c.headers ? JSON.stringify(c.headers, null, 2) : '{}',
      discord_url: c.url || '',
      discord_username: c.username || '',
      discord_avatar: c.avatar_url || '',
      gotify_url: c.url || '',
      gotify_token: c.token || '',
      gotify_priority: String(c.priority || 5),
      telegram_bot_token: c.bot_token || '',
      telegram_chat_id: c.chat_id || '',
      email_host: c.host || '',
      email_port: String(c.port || 587),
      email_username: c.username || '',
      email_password: c.password || '',
      email_encryption: c.encryption || 'TLS',
      email_from: c.from || '',
      email_to: c.to || '',
    });
    setShowChannelModal(true);
  };

  const deleteChannel = async (id: number) => {
    setConfirmState({
      title: "Delete Notification Channel",
      message: "Are you sure you want to permanently delete this notification channel? Active rules relying on it might fail to deliver.",
      onConfirm: async () => {
        await fetch(`/api/v1/notifications/channels/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
        fetchData();
      }
    });
  };

  const testChannel = async (id: number) => {
    try {
      const res = await fetch(`/api/v1/notifications/channels/${id}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` }
      });
      if (res.ok) {
        setAlertState({ title: "Test Sent", message: "Test notification successfully sent to the channel!", type: "success" });
      } else {
        const txt = await res.text();
        setAlertState({ title: "Test Failed", message: `Test failed: ${txt}`, type: "error" });
      }
    } catch(e) {
      setAlertState({ title: "Network Error", message: "Network error sending test notification.", type: "error" });
    }
  };

  const createRule = async () => {
    try {
      const threshold = newRule.threshold_value ? parseFloat(newRule.threshold_value) : null;
      let finalTriggerType = newRule.trigger_type;
      if (newRule.trigger_type === 'quota_reached' && selectedDataset) {
        finalTriggerType = `quota_reached:${selectedDataset}`;
      }
      await fetch('/api/v1/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` },
        body: JSON.stringify({
          id: editingRuleId || undefined,
          name: newRule.name,
          trigger_type: finalTriggerType,
          threshold_value: threshold,
          channel_ids: newRule.channel_ids,
          is_active: newRule.is_active,
        })
      });
      setShowRuleModal(false);
      setEditingRuleId(null);
      setNewRule({ name: '', trigger_type: 'login_failed', threshold_value: '', channel_ids: [], is_active: true });
      setSelectedDataset('');
      fetchData();
    } catch (e) {
      setAlertState({ title: "Save Failed", message: "Failed to save diagnostic rule.", type: "error" });
    }
  };

  const startEditRule = (rule: any) => {
    setEditingRuleId(rule.id);
    let baseTrigger = rule.trigger_type;
    let dataset = '';
    if (rule.trigger_type.startsWith('quota_reached:')) {
      baseTrigger = 'quota_reached';
      dataset = rule.trigger_type.split(':')[1];
    }
    setNewRule({
      name: rule.name,
      trigger_type: baseTrigger,
      threshold_value: rule.threshold_value !== null ? String(rule.threshold_value) : '',
      channel_ids: rule.channel_ids || [],
      is_active: rule.is_active,
    });
    setSelectedDataset(dataset);
    setShowRuleModal(true);
  };

  const markRead = async (id: number) => {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const deleteNotification = async (id: number) => {
    await fetch(`/api/v1/notifications/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllRead = async () => {
    await fetch('/api/v1/notifications/read', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const clearAll = () => {
    setConfirmState({
      title: "Clear All Notifications",
      message: "Are you sure you want to permanently delete all notification log entries? This cannot be undone.",
      onConfirm: async () => {
        await fetch('/api/v1/notifications', { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
        setNotifications([]);
      }
    });
  };

  const deleteRule = async (id: number) => {
    setConfirmState({
      title: "Delete Rule",
      message: "Are you sure you want to permanently delete this diagnostic rule?",
      onConfirm: async () => {
        await fetch(`/api/v1/notifications/rules/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
        fetchData();
      }
    });
  };

  const getChannelIcon = (type: string) => {
    switch(type) {
      case 'webhook': return <Globe size={15} style={{ color: 'var(--text-muted)' }} />;
      case 'discord': return <MessageSquare size={15} style={{ color: '#5865F2' }} />;
      case 'gotify': return <Bell size={15} style={{ color: '#3b82f6' }} />;
      case 'telegram': return <Send size={15} style={{ color: '#0088cc' }} />;
      case 'email': return <Mail size={15} style={{ color: '#ef4444' }} />;
      default: return <Globe size={15} />;
    }
  };

  return (
    <PageTransition>
    <div style={{ paddingBottom: 48 }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <Bell size={20} style={{ color: 'var(--accent)' }} />
          Notifications & Integrations
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)' }}>
          Manage external alert channels and design automation trigger rules for ZFS diagnostics
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24, marginBottom: 24 }}>
        
        {/* Rules Panel */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 28, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <SectionHeader
              title="Active Diagnostic Rules"
              sub="Trigger external notifications on custom system events."
            />
            <button className="btn btn-primary" style={{ padding: '0 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, height: 32 }} onClick={() => { setEditingRuleId(null); setNewRule({ name: '', trigger_type: 'login_failed', threshold_value: '', channel_ids: [], is_active: true }); setSelectedDataset(''); setShowRuleModal(true); }}>
              <Plus size={14} /> Add Rule
            </button>
          </div>

          <div style={{ flex: 1 }}>
            {rules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                <BellOff size={28} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                No rules active. Add a rule to trigger alerts.
              </div>
            ) : (
              rules.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
                      Trigger: <strong style={{ color: 'var(--accent)' }}>{displayTriggerType(r.trigger_type)}</strong> {r.threshold_value !== null ? `(${r.threshold_value})` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary" style={{ width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => startEditRule(r)}>
                      <Edit2 size={13} style={{ color: 'var(--accent)' }} />
                    </button>
                    <button className="btn btn-secondary" style={{ width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => deleteRule(r.id)}>
                      <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Channels Panel */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 28, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <SectionHeader
              title="Notification Channels"
              sub="Delivery end-points for triggers."
            />
            <button className="btn btn-primary" style={{ padding: '0 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, height: 32 }} onClick={() => { setEditingChannelId(null); setNewChannel(initialChannelState); setShowChannelModal(true); }}>
              <Plus size={14} /> Add Channel
            </button>
          </div>

          <div style={{ flex: 1 }}>
            {channels.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                <Globe size={28} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                No notification channels. Add Webhooks, Discord, or Email.
              </div>
            ) : (
              channels.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getChannelIcon(c.ctype)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize', marginTop: 2, fontFamily: 'var(--font-ui)' }}>Type: {c.ctype}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary" style={{ height: 30, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} onClick={() => testChannel(c.id)}>
                      <Send size={11} style={{ color: 'var(--accent)' }} /> Test
                    </button>
                    <button className="btn btn-secondary" style={{ width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => startEditChannel(c)}>
                      <Edit2 size={13} style={{ color: 'var(--accent)' }} />
                    </button>
                    <button className="btn btn-secondary" style={{ width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => deleteChannel(c.id)}>
                      <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* History Log */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 28
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <SectionHeader
            title="System Notifications Log"
            sub="Historical archive of all triggered alerts."
          />
          {notifications.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className="btn btn-secondary"
                style={{ height: 32, padding: '0 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={markAllRead}
              >
                <CheckCircle size={13} style={{ color: 'var(--success)' }} /> Mark All Read
              </button>
              <button
                className="btn btn-secondary"
                style={{ height: 32, padding: '0 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={clearAll}
              >
                <Trash2 size={13} style={{ color: 'var(--danger)' }} /> Clear All
              </button>
            </div>
          )}
        </div>

        <div>
          {notifications.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
              No notification logs present.
            </div>
          ) : (
            notifications.slice((notifPage - 1) * PAGE_SIZE_NOTIF, notifPage * PAGE_SIZE_NOTIF).map(n => (
              <div key={n.id} style={{ padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center', opacity: n.is_read ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: n.is_read ? 'var(--text-muted)' : 'var(--danger)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: n.is_read ? 400 : 600, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <span className={`badge ${n.level === 'error' ? 'badge-danger' : n.level === 'warning' ? 'badge-warning' : ''}`} style={{ textTransform: 'uppercase', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>{n.level}</span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {!n.is_read && (
                    <button
                      title="Mark as read"
                      onClick={() => markRead(n.id)}
                      style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--success)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,197,94,0.35)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    >
                      <CheckCircle size={12} />
                    </button>
                  )}
                  <button
                    title="Delete"
                    onClick={() => deleteNotification(n.id)}
                    style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.35)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <Pagination total={notifications.length} page={notifPage} pageSize={PAGE_SIZE_NOTIF} onChange={setNotifPage} />
      </div>

      {/* RICH CHANNEL MODAL (Larger Popup) */}
      {showChannelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 28, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 580, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <SectionHeader
              title={editingChannelId ? 'Edit Delivery Channel' : 'Configure Delivery Channel'}
              sub={editingChannelId ? 'Modify notification endpoint settings.' : 'Create an external notification channel for system messages.'}
            />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Channel Display Name</label>
                <input className="input" style={inputStyle} value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} placeholder="e.g. My Telegram Bot" />
              </div>
              <div>
                <label style={labelStyle}>Channel Type</label>
                <select className="input" style={inputStyle} value={newChannel.ctype} onChange={e => setNewChannel({...newChannel, ctype: e.target.value})}>
                  <option value="webhook">General Webhook</option>
                  <option value="discord">Discord Integration</option>
                  <option value="gotify">Gotify Server</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="email">SMTP Email Client</option>
                </select>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
              
              {/* Webhook Configuration fields */}
              {newChannel.ctype === 'webhook' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Webhook Endpoint URL</label>
                    <input className="input" style={inputStyle} value={newChannel.webhook_url} onChange={e => setNewChannel({...newChannel, webhook_url: e.target.value})} placeholder="https://api.myendpoint.com/v1/alert" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>HTTP Method</label>
                      <select className="input" style={inputStyle} value={newChannel.webhook_method} onChange={e => setNewChannel({...newChannel, webhook_method: e.target.value})}>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="GET">GET</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Custom Headers (JSON)</label>
                      <input className="input" style={inputStyle} value={newChannel.webhook_headers} onChange={e => setNewChannel({...newChannel, webhook_headers: e.target.value})} placeholder='{"Authorization": "Bearer token"}' />
                    </div>
                  </div>
                </div>
              )}

              {/* Discord Configuration fields */}
              {newChannel.ctype === 'discord' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Discord Webhook URL</label>
                    <input className="input" style={inputStyle} value={newChannel.discord_url} onChange={e => setNewChannel({...newChannel, discord_url: e.target.value})} placeholder="https://discord.com/api/webhooks/..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Bot Username Override</label>
                      <input className="input" style={inputStyle} value={newChannel.discord_username} onChange={e => setNewChannel({...newChannel, discord_username: e.target.value})} placeholder="ZFS Manager" />
                    </div>
                    <div>
                      <label style={labelStyle}>Avatar URL (Optional)</label>
                      <input className="input" style={inputStyle} value={newChannel.discord_avatar} onChange={e => setNewChannel({...newChannel, discord_avatar: e.target.value})} placeholder="https://..." />
                    </div>
                  </div>
                </div>
              )}

              {/* Gotify Configuration fields */}
              {newChannel.ctype === 'gotify' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Gotify Server Base URL</label>
                    <input className="input" style={inputStyle} value={newChannel.gotify_url} onChange={e => setNewChannel({...newChannel, gotify_url: e.target.value})} placeholder="https://gotify.mydomain.com" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Gotify Application Token</label>
                      <input className="input" type="password" style={inputStyle} value={newChannel.gotify_token} onChange={e => setNewChannel({...newChannel, gotify_token: e.target.value})} placeholder="A_TokenString" />
                    </div>
                    <div>
                      <label style={labelStyle}>Default Priority</label>
                      <input className="input" type="number" min="0" max="10" style={inputStyle} value={newChannel.gotify_priority} onChange={e => setNewChannel({...newChannel, gotify_priority: e.target.value})} />
                    </div>
                  </div>
                </div>
              )}

              {/* Telegram Configuration fields */}
              {newChannel.ctype === 'telegram' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Telegram Bot Token</label>
                    <input className="input" type="password" style={inputStyle} value={newChannel.telegram_bot_token} onChange={e => setNewChannel({...newChannel, telegram_bot_token: e.target.value})} placeholder="123456:ABC-DEF1234ghIkl-zyx" />
                  </div>
                  <div>
                    <label style={labelStyle}>Telegram Chat ID</label>
                    <input className="input" style={inputStyle} value={newChannel.telegram_chat_id} onChange={e => setNewChannel({...newChannel, telegram_chat_id: e.target.value})} placeholder="e.g. -100123456789 or 987654321" />
                  </div>
                </div>
              )}

              {/* Email SMTP Configuration fields */}
              {newChannel.ctype === 'email' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>SMTP Host Server</label>
                      <input className="input" style={inputStyle} value={newChannel.email_host} onChange={e => setNewChannel({...newChannel, email_host: e.target.value})} placeholder="smtp.gmail.com" />
                    </div>
                    <div>
                      <label style={labelStyle}>SMTP Port</label>
                      <input className="input" style={inputStyle} value={newChannel.email_port} onChange={e => setNewChannel({...newChannel, email_port: e.target.value})} placeholder="587" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>SMTP Username</label>
                      <input className="input" style={inputStyle} value={newChannel.email_username} onChange={e => setNewChannel({...newChannel, email_username: e.target.value})} placeholder="user@gmail.com" />
                    </div>
                    <div>
                      <label style={labelStyle}>SMTP Password</label>
                      <input className="input" type="password" style={inputStyle} value={newChannel.email_password} onChange={e => setNewChannel({...newChannel, email_password: e.target.value})} placeholder="••••••••••••" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>From Email Address</label>
                      <input className="input" style={inputStyle} value={newChannel.email_from} onChange={e => setNewChannel({...newChannel, email_from: e.target.value})} placeholder="noreply@mydomain.com" />
                    </div>
                    <div>
                      <label style={labelStyle}>To Recipient Address</label>
                      <input className="input" style={inputStyle} value={newChannel.email_to} onChange={e => setNewChannel({...newChannel, email_to: e.target.value})} placeholder="admin@mydomain.com" />
                    </div>
                  </div>
                </div>
              )}

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowChannelModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createChannel}>Save Channel</button>
            </div>
          </div>
        </div>
      )}

      {/* RICH RULE MODAL (Larger Popup) */}
      {showRuleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 28, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 580, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <SectionHeader
              title={editingRuleId ? 'Edit Diagnostic Rule' : 'Create Diagnostic Rule'}
              sub={editingRuleId ? 'Modify configuration options for this alert trigger.' : 'Define threshold conditions that trigger automated notifications.'}
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Rule Name / Alias</label>
                <input className="input" style={inputStyle} value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} placeholder="e.g. Critical Hard Drive Temp Alert" />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Trigger Type</label>
                  <select className="input" style={inputStyle} value={newRule.trigger_type} onChange={e => {
                    const val = e.target.value;
                    setNewRule({...newRule, trigger_type: val});
                    if (val !== 'quota_reached') {
                      setSelectedDataset('');
                    }
                  }}>
                    <option value="login_failed">Failed Login Attempt (Interface)</option>
                    <option value="pool_unhealthy">Pool Unhealthy (DEGRADED/FAULTED)</option>
                    <option value="hdd_temp">HDD Temperature {'>'} Threshold (°C)</option>
                    <option value="capacity">Pool Capacity {'>'} Threshold (%)</option>
                    <option value="quota_reached">Dataset Quota {'>'} Threshold (%)</option>
                    <option value="scrub_failed">ZFS Scrub Failure (Errors Detected)</option>
                    <option value="scrub_started">ZFS Scrub Started (Informative)</option>
                    <option value="scrub_finished">ZFS Scrub Finished (Informative)</option>
                    <option value="smart_failure">SMART Health Diagnostic Failure</option>
                    <option value="snapshots_high">Snapshot Count {'>'} Threshold (Count)</option>
                    <option value="iops_high">Live Combined IOPS {'>'} Threshold</option>
                    <option value="read_iops_high">Live Read IOPS {'>'} Threshold</option>
                    <option value="write_iops_high">Live Write IOPS {'>'} Threshold</option>
                  </select>
                </div>
                
                <div>
                  <label style={labelStyle}>Threshold Value (Optional)</label>
                  <input className="input" type="number" style={inputStyle} value={newRule.threshold_value} onChange={e => setNewRule({...newRule, threshold_value: e.target.value})} placeholder="e.g. 50, 85, or 1000" />
                </div>
              </div>

              {newRule.trigger_type === 'quota_reached' && (
                <div>
                  <label style={labelStyle}>Target Specific Dataset</label>
                  <select className="input" style={inputStyle} value={selectedDataset} onChange={e => setSelectedDataset(e.target.value)}>
                    <option value="">-- Apply to All Datasets --</option>
                    {datasets.map(ds => (
                      <option key={ds.name} value={ds.name}>{ds.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>Target Delivery Channels</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.015)' }}>
                  {channels.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                      No channels registered. Please create a channel first.
                    </div>
                  ) : (
                    channels.map(c => {
                      const isSelected = newRule.channel_ids.includes(c.id);
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {getChannelIcon(c.ctype)}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{c.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize', fontFamily: 'var(--font-ui)' }}>{c.ctype}</div>
                            </div>
                          </div>
                          <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 18, cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => {
                                const nextChannelIds = isSelected 
                                  ? newRule.channel_ids.filter(id => id !== c.id)
                                  : [...newRule.channel_ids, c.id];
                                setNewRule({...newRule, channel_ids: nextChannelIds});
                              }}
                              style={{ opacity: 0, width: 0, height: 0 }} 
                            />
                            <span style={{
                              position: 'absolute', inset: 0,
                              backgroundColor: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                              transition: '0.2s', borderRadius: 20,
                              border: isSelected ? 'none' : '1px solid var(--border)'
                            }}>
                              <span style={{
                                position: 'absolute', height: 12, width: 12,
                                  left: isSelected ? 20 : 3, bottom: 2,
                                backgroundColor: '#fff', transition: '0.2s', borderRadius: '50%'
                              }} />
                            </span>
                          </label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowRuleModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createRule}>Save Rule</button>
            </div>
          </div>
        </div>
      )}

      {/* Fancy Confirmation Modal */}
      {confirmState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                <AlertTriangle size={20} />
              </div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{confirmState.title || 'Confirm Action'}</h4>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px 0' }}>{confirmState.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmState(null)} style={{ padding: '8px 16px', fontSize: 13 }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { confirmState.onConfirm(); setConfirmState(null); }} style={{ padding: '8px 16px', fontSize: 13, background: 'var(--danger)', borderColor: 'var(--danger)' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Fancy Alert Modal */}
      {alertState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: alertState.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: alertState.type === 'success' ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: alertState.type === 'success' ? '#22c55e' : 'var(--danger)'
              }}>
                {alertState.type === 'success' ? <Bell size={20} /> : <AlertTriangle size={20} />}
              </div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{alertState.title}</h4>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px 0' }}>{alertState.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setAlertState(null)} style={{ padding: '8px 24px', fontSize: 13 }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
