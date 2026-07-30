import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Activity, Clock } from 'lucide-react';
import { api, formatBytes } from '../api';
import { ModuleMetricPoint } from '../types';

interface ModuleWidgetRendererProps {
  moduleId: string;
  widgetKey: string;
  widgetType: 'stat' | 'line' | 'bar' | 'gauge' | 'table';
  metrics: string[];
  title: string;
  unit?: string;
  color?: string;
}

function formatVal(val: number, unit?: string): string {
  if (unit === 'bytes') return formatBytes(val);
  if (unit === 'MB/s' || unit === 'GB/s' || unit === 'MB') return `${val.toFixed(1)} ${unit}`;
  if (unit === '%' || unit === 'percent') return `${val.toFixed(1)}%`;
  if (unit === 'ms' || unit === 's') return `${val.toFixed(0)} ${unit}`;
  return val.toLocaleString();
}

function formatChartTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ModuleWidgetRenderer({
  moduleId,
  widgetKey,
  widgetType,
  metrics,
  title,
  unit,
  color = 'var(--accent)',
}: ModuleWidgetRendererProps) {
  const [data, setData] = useState<ModuleMetricPoint[]>([]);
  const [interval, setInterval] = useState('1h');
  const [loading, setLoading] = useState(true);

  const primaryMetric = metrics[0] || '';

  const loadData = async () => {
    try {
      const res = await api.getModuleMetrics(moduleId, primaryMetric, interval);
      setData(res.metrics);
    } catch (err) {
      console.error(`Failed to load metrics for ${moduleId}/${widgetKey}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, [moduleId, primaryMetric, interval]);

  const latestVal = data.length > 0 ? data[data.length - 1].value : 0;

  if (widgetType === 'stat') {
    return (
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', display: 'flex',
        flexDirection: 'column', gap: 8, height: '100%', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            {title}
          </span>
          <Activity size={14} color={color} />
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
          {formatVal(latestVal, unit)}
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>
          Module: <span style={{ color: 'var(--text-secondary)' }}>{moduleId}</span>
        </div>
      </div>
    );
  }

  if (widgetType === 'gauge') {
    const pct = Math.min(100, Math.max(0, latestVal));
    return (
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', display: 'flex',
        flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', alignSelf: 'flex-start' }}>
          {title}
        </span>
        <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" stroke="var(--border)" strokeWidth="8" fill="none" />
            <circle
              cx="50" cy="50" r="40" stroke={color} strokeWidth="8" fill="none"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - pct / 100)}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          </svg>
          <span style={{ position: 'absolute', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatVal(latestVal, unit)}
          </span>
        </div>
      </div>
    );
  }

  const chartData = data.map(d => ({
    time: formatChartTime(d.collected_at),
    val: d.value,
  }));

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px', display: 'flex',
      flexDirection: 'column', gap: 12, height: 260,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h4 style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {title}
          </h4>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>
            {moduleId} · {primaryMetric}
          </span>
        </div>
        <select
          value={interval}
          onChange={e => setInterval(e.target.value)}
          style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--text-secondary)',
            fontSize: 11, fontFamily: 'var(--font-ui)', padding: '2px 6px',
          }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="1d">24h</option>
          <option value="1w">7d</option>
        </select>
      </div>

      <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
        {widgetType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                formatter={(val: any) => [formatVal(Number(val), unit), primaryMetric]}
              />
              <Bar dataKey="val" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`grad-${widgetKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                formatter={(val: any) => [formatVal(Number(val), unit), primaryMetric]}
              />
              <Area type="monotone" dataKey="val" stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#grad-${widgetKey})`} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
