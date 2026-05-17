import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Bell, Trash2, Plus, Save } from 'lucide-react';

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => {
    // Basic fetch
    const fetchData = async () => {
      try {
        const [nRes, cRes, rRes] = await Promise.all([
          fetch('/api/v1/notifications', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()),
          fetch('/api/v1/notifications/channels', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()),
          fetch('/api/v1/notifications/rules', { headers: { 'Authorization': `Bearer ${localStorage.getItem('zfs_access_token')}` } }).then(r => r.json()),
        ]);
        setNotifications(nRes || []);
        setChannels(cRes || []);
        setRules(rRes || []);
      } catch (e) {
        console.error("Failed to fetch notifications data", e);
      }
    };
    fetchData();
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bell size={24} style={{ color: 'var(--accent)' }} />
          Notifications
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Configure alerts and integrations.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Rules Section */}
        <div className="panel" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Active Rules</h2>
            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}><Plus size={14} /> New Rule</button>
          </div>
          <div style={{ padding: 20 }}>
            {rules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No rules configured.</div>
            ) : (
              rules.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trigger: {r.trigger_type}</div>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '4px 8px' }}><Trash2 size={14} /></button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Channels Section */}
        <div className="panel" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Notification Channels</h2>
            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}><Plus size={14} /> New Channel</button>
          </div>
          <div style={{ padding: 20 }}>
            {channels.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No channels configured.</div>
            ) : (
              channels.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Type: {c.ctype}</div>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '4px 8px' }}><Trash2 size={14} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 24, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Notification History</h2>
        </div>
        <div style={{ padding: 20 }}>
          {notifications.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No recent notifications.</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 16 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.is_read ? 'var(--text-muted)' : 'var(--danger)', marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
