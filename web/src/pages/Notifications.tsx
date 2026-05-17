import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Bell, Trash2, Plus, Mail, MessageSquare, Globe, Send, BellOff } from 'lucide-react';

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
        alert("Headers field must be valid JSON.");
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
          name: newChannel.name,
          ctype: newChannel.ctype,
          config: configObj,
        })
      });
      setShowChannelModal(false);
      setNewChannel(initialChannelState);
      fetchData();
    } catch (e) {
      alert("Network error creating channel.");
    }
  };

  const deleteChannel = async (id: number) => {
    if (!confirm("Delete this channel?")) return;
    await fetch(`/api/v1/notifications/channels/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
    fetchData();
  };

  const testChannel = async (id: number) => {
    try {
      const res = await fetch(`/api/v1/notifications/channels/${id}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` }
      });
      if (res.ok) {
        alert("Test notification successfully sent!");
      } else {
        const txt = await res.text();
        alert("Test failed: " + txt);
      }
    } catch(e) {
      alert("Network error sending test.");
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
        body: JSON.stringify({ ...newRule, trigger_type: finalTriggerType, threshold_value: threshold })
      });
      setShowRuleModal(false);
      setNewRule({ name: '', trigger_type: 'login_failed', threshold_value: '', channel_ids: [], is_active: true });
      setSelectedDataset('');
      fetchData();
    } catch (e) {
      alert("Failed to create rule.");
    }
  };

  const deleteRule = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/v1/notifications/rules/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } });
    fetchData();
  };

  const getChannelIcon = (type: string) => {
    switch(type) {
      case 'webhook': return <Globe size={16} className="text-muted" />;
      case 'discord': return <MessageSquare size={16} style={{ color: '#5865F2' }} />;
      case 'gotify': return <Bell size={16} style={{ color: '#4d94ff' }} />;
      case 'telegram': return <Send size={16} style={{ color: '#0088cc' }} />;
      case 'email': return <Mail size={16} style={{ color: '#ea4335' }} />;
      default: return <Globe size={16} />;
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bell size={28} style={{ color: 'var(--accent)' }} />
          System Notifications & Integrations
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
          Manage your external alert channels and design automation trigger rules for ZFS diagnostics.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        
        {/* Rules Panel */}
        <div className="panel" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Active Diagnostic Rules</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trigger notifications on system events</span>
            </div>
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowRuleModal(true)}>
              <Plus size={15} /> Add Rule
            </button>
          </div>
          <div style={{ padding: '20px 24px', flex: 1 }}>
            {rules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                <BellOff size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                No rules active. Add a rule to trigger alerts.
              </div>
            ) : (
              rules.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Trigger: <strong style={{ color: 'var(--accent)' }}>{displayTriggerType(r.trigger_type)}</strong> {r.threshold_value !== null ? `(${r.threshold_value})` : ''}
                    </div>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => deleteRule(r.id)}>
                    <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Channels Panel */}
        <div className="panel" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Notification Channels</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delivery end-points for triggers</span>
            </div>
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowChannelModal(true)}>
              <Plus size={15} /> Add Channel
            </button>
          </div>
          <div style={{ padding: '20px 24px', flex: 1 }}>
            {channels.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                <Globe size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                No notification channels. Add Webhooks, Discord, or Email.
              </div>
            ) : (
              channels.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getChannelIcon(c.ctype)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>Type: {c.ctype}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }} onClick={() => testChannel(c.id)}>
                      <Send size={13} style={{ color: 'var(--accent)' }} /> Test
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => deleteChannel(c.id)}>
                      <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* History Log */}
      <div className="panel" style={{ marginTop: 32, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>System Notifications Log</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Historical logs of all triggered alerts</span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {notifications.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              No notifications logs present.
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.is_read ? 'var(--text-muted)' : 'var(--danger)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: n.is_read ? 400 : 500 }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <span className={`badge ${n.level === 'error' ? 'badge-danger' : 'badge-warning'}`} style={{ textTransform: 'uppercase', fontSize: 10 }}>{n.level}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RICH CHANNEL MODAL (Larger Popup) */}
      {showChannelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-surface)', padding: 28, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 580, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>Configure Delivery Channel</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>Create an external notification channel for system messages.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Channel Display Name</label>
                <input className="input" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} placeholder="e.g. My Telegram Bot" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Channel Type</label>
                <select className="input" value={newChannel.ctype} onChange={e => setNewChannel({...newChannel, ctype: e.target.value})} style={{ width: '100%' }}>
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
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Webhook Endpoint URL</label>
                    <input className="input" value={newChannel.webhook_url} onChange={e => setNewChannel({...newChannel, webhook_url: e.target.value})} placeholder="https://api.myendpoint.com/v1/alert" style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>HTTP Method</label>
                      <select className="input" value={newChannel.webhook_method} onChange={e => setNewChannel({...newChannel, webhook_method: e.target.value})} style={{ width: '100%' }}>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="GET">GET</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Custom Headers (JSON)</label>
                      <input className="input" value={newChannel.webhook_headers} onChange={e => setNewChannel({...newChannel, webhook_headers: e.target.value})} placeholder='{"Authorization": "Bearer token"}' style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Discord Configuration fields */}
              {newChannel.ctype === 'discord' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Discord Webhook URL</label>
                    <input className="input" value={newChannel.discord_url} onChange={e => setNewChannel({...newChannel, discord_url: e.target.value})} placeholder="https://discord.com/api/webhooks/..." style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Bot Username Override</label>
                      <input className="input" value={newChannel.discord_username} onChange={e => setNewChannel({...newChannel, discord_username: e.target.value})} placeholder="ZFS Manager" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Avatar URL (Optional)</label>
                      <input className="input" value={newChannel.discord_avatar} onChange={e => setNewChannel({...newChannel, discord_avatar: e.target.value})} placeholder="https://..." style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Gotify Configuration fields */}
              {newChannel.ctype === 'gotify' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Gotify Server Base URL</label>
                    <input className="input" value={newChannel.gotify_url} onChange={e => setNewChannel({...newChannel, gotify_url: e.target.value})} placeholder="https://gotify.mydomain.com" style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Gotify Application Token</label>
                      <input className="input" type="password" value={newChannel.gotify_token} onChange={e => setNewChannel({...newChannel, gotify_token: e.target.value})} placeholder="A_TokenString" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Default Priority</label>
                      <input className="input" type="number" min="0" max="10" value={newChannel.gotify_priority} onChange={e => setNewChannel({...newChannel, gotify_priority: e.target.value})} style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Telegram Configuration fields */}
              {newChannel.ctype === 'telegram' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Telegram Bot Token</label>
                    <input className="input" type="password" value={newChannel.telegram_bot_token} onChange={e => setNewChannel({...newChannel, telegram_bot_token: e.target.value})} placeholder="123456:ABC-DEF1234ghIkl-zyx" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Telegram Chat ID</label>
                    <input className="input" value={newChannel.telegram_chat_id} onChange={e => setNewChannel({...newChannel, telegram_chat_id: e.target.value})} placeholder="e.g. -100123456789 or 987654321" style={{ width: '100%' }} />
                  </div>
                </div>
              )}

              {/* Email SMTP Configuration fields */}
              {newChannel.ctype === 'email' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>SMTP Host Server</label>
                      <input className="input" value={newChannel.email_host} onChange={e => setNewChannel({...newChannel, email_host: e.target.value})} placeholder="smtp.gmail.com" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>SMTP Port</label>
                      <input className="input" value={newChannel.email_port} onChange={e => setNewChannel({...newChannel, email_port: e.target.value})} placeholder="587" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>SMTP Username</label>
                      <input className="input" value={newChannel.email_username} onChange={e => setNewChannel({...newChannel, email_username: e.target.value})} placeholder="user@gmail.com" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>SMTP Password</label>
                      <input className="input" type="password" value={newChannel.email_password} onChange={e => setNewChannel({...newChannel, email_password: e.target.value})} placeholder="••••••••••••" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From Email Address</label>
                      <input className="input" value={newChannel.email_from} onChange={e => setNewChannel({...newChannel, email_from: e.target.value})} placeholder="noreply@mydomain.com" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To Recipient Address</label>
                      <input className="input" value={newChannel.email_to} onChange={e => setNewChannel({...newChannel, email_to: e.target.value})} placeholder="admin@mydomain.com" style={{ width: '100%' }} />
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-surface)', padding: 28, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', maxWidth: 580, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>Create Diagnostic Rule</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>Define threshold conditions that trigger automated notifications.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Rule Name / Alias</label>
                <input className="input" value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} placeholder="e.g. Critical Hard Drive Temp Alert" style={{ width: '100%' }} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Trigger Type</label>
                  <select className="input" value={newRule.trigger_type} onChange={e => {
                    const val = e.target.value;
                    setNewRule({...newRule, trigger_type: val});
                    if (val !== 'quota_reached') {
                      setSelectedDataset('');
                    }
                  }} style={{ width: '100%' }}>
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
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Threshold Value (Optional)</label>
                  <input className="input" type="number" value={newRule.threshold_value} onChange={e => setNewRule({...newRule, threshold_value: e.target.value})} placeholder="e.g. 50, 85, or 1000" style={{ width: '100%' }} />
                </div>
              </div>

              {newRule.trigger_type === 'quota_reached' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Target Specific Dataset</label>
                  <select className="input" value={selectedDataset} onChange={e => setSelectedDataset(e.target.value)} style={{ width: '100%' }}>
                    <option value="">-- Apply to All Datasets --</option>
                    {datasets.map(ds => (
                      <option key={ds.name} value={ds.name}>{ds.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Target Delivery Channels</label>
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
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{c.ctype}</div>
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
    </div>
  );
}
