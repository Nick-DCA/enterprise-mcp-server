import React, { useState } from 'react';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface MonochromeSidebarPageProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface ServiceMeshItem {
  id: string;
  name: string;
  domain: string;
  tools: number;
  status: 'ONLINE' | 'STANDBY' | 'MAINTENANCE';
  latency: string;
  qps: string;
  enabled: boolean;
}

const INITIAL_SERVICES: ServiceMeshItem[] = [
  { id: 'srv-1', name: 'Xero Accounting Master', domain: 'xero', tools: 23, status: 'ONLINE', latency: '24ms', qps: '142 req/s', enabled: true },
  { id: 'srv-2', name: 'BigQuery Analytics Engine', domain: 'bigquery', tools: 12, status: 'ONLINE', latency: '18ms', qps: '89 req/s', enabled: true },
  { id: 'srv-3', name: 'Firestore Document Store', domain: 'firestore', tools: 12, status: 'ONLINE', latency: '12ms', qps: '310 req/s', enabled: true },
  { id: 'srv-4', name: 'Sage HR Privacy Shield', domain: 'sagehr', tools: 12, status: 'ONLINE', latency: '31ms', qps: '64 req/s', enabled: true },
];

const INITIAL_LOGS = [
  { time: '21:52:14', tag: 'MCP-RPC', msg: 'Tool call [xero-list-invoices] invoked by user: analyst@company.com (status: 200 OK - 24ms)' },
  { time: '21:52:10', tag: 'SECURITY', msg: 'Session token refreshed for admin@company.com via Google Workspace OIDC' },
  { time: '21:52:04', tag: 'BIGQUERY', msg: 'Validated SQL read-only guardrail: allowed scan capped at 1.00 GB' },
  { time: '21:51:55', tag: 'MCP-RPC', msg: 'Tool call [sagehr-get-employee-directory] sanitized: salary & PII fields redacted' },
  { time: '21:51:42', tag: 'FIRESTORE', msg: 'Runtime config synchronized across active Cloud Run revision instances' },
];

export const MonochromeSidebarPage: React.FC<MonochromeSidebarPageProps> = ({ onShowToast }) => {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [services, setServices] = useState<ServiceMeshItem[]>(INITIAL_SERVICES);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [searchQuery, setSearchQuery] = useState('');

  const handleToggleService = (id: string) => {
    setServices((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const next = !s.enabled;
          if (onShowToast) {
            onShowToast(`${s.name} connector ${next ? 'enabled' : 'disabled'}`, next ? 'success' : 'info');
          }
          return { ...s, enabled: next, status: next ? 'ONLINE' : 'STANDBY' };
        }
        return s;
      })
    );
  };

  const handleSimulateTool = () => {
    const tools = [
      'xero-get-bank-transactions',
      'bigquery-list-tables',
      'firestore-query-collection',
      'sagehr-list-time-off-requests',
      'xero-create-invoice',
    ];
    const picked = tools[Math.floor(Math.random() * tools.length)];
    const now = new Date().toTimeString().split(' ')[0];
    const newLog = {
      time: now,
      tag: 'MCP-RPC',
      msg: `Tool call [${picked}] executed successfully via MCP Gateway (${Math.floor(10 + Math.random() * 35)}ms)`,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 15)]);
    if (onShowToast) onShowToast(`Simulated live tool invocation: ${picked}`, 'success');
  };

  return (
    <div className="mono-portal-layout">
      {/* --- 1. Left Sidebar Navigation (240px) --- */}
      <aside className="mono-sidebar">
        {/* Workspace Switcher */}
        <div
          className="mono-ws-header"
          onClick={() => onShowToast && onShowToast('Workspace: Enterprise Production', 'info')}
        >
          <div>
            <div className="mono-ws-title">
              <ThemeIcon name="lightning" size={14} />
              <span>Acme Corp</span>
            </div>
            <div className="mono-ws-sub">MCP Gateway &bull; v2.0</div>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#71717A' }}>▾</span>
        </div>

        <div className="mono-sidebar-nav">
          {/* Group 1: CORE */}
          <div className="mono-nav-group">
            <div className="mono-group-label">Core Platform</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button
                className={`mono-nav-link ${activeNav === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveNav('dashboard')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="services" size={14} />
                  <span>Dashboard</span>
                </span>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>LIVE</span>
              </button>

              <button
                className={`mono-nav-link ${activeNav === 'services' ? 'active' : ''}`}
                onClick={() => setActiveNav('services')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="lightning" size={14} />
                  <span>Services Mesh</span>
                </span>
                <span style={{ fontSize: '0.7rem' }}>4</span>
              </button>

              <button
                className={`mono-nav-link ${activeNav === 'secrets' ? 'active' : ''}`}
                onClick={() => setActiveNav('secrets')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="secrets" size={14} />
                  <span>Secrets Vault</span>
                </span>
                <span style={{ fontSize: '0.7rem' }}>GSM</span>
              </button>

              <button
                className={`mono-nav-link ${activeNav === 'users' ? 'active' : ''}`}
                onClick={() => setActiveNav('users')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="users" size={14} />
                  <span>Access & IAM</span>
                </span>
              </button>

              <button
                className={`mono-nav-link ${activeNav === 'audit' ? 'active' : ''}`}
                onClick={() => setActiveNav('audit')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="audit" size={14} />
                  <span>Audit Trail</span>
                </span>
              </button>
            </div>
          </div>

          {/* Group 2: DEVELOPER */}
          <div className="mono-nav-group">
            <div className="mono-group-label">Developer</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button
                className={`mono-nav-link ${activeNav === 'tokens' ? 'active' : ''}`}
                onClick={() => setActiveNav('tokens')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="shield" size={14} />
                  <span>API Tokens</span>
                </span>
              </button>

              <button
                className={`mono-nav-link ${activeNav === 'telemetry' ? 'active' : ''}`}
                onClick={() => setActiveNav('telemetry')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="dev" size={14} />
                  <span>Telemetry Log</span>
                </span>
              </button>

              <button
                className={`mono-nav-link ${activeNav === 'policies' ? 'active' : ''}`}
                onClick={() => setActiveNav('policies')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name="cog" size={14} />
                  <span>Guardrails</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="mono-sidebar-footer">
          <div className="mono-user-profile">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  color: '#000000',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                A
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FFFFFF' }}>admin@company.com</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#71717A', fontFamily: 'var(--font-mono)' }}>ADMIN</span>
          </div>
        </div>
      </aside>

      {/* --- 2. Main Viewport --- */}
      <main className="mono-main-content">
        {/* Top Command Bar */}
        <header className="mono-topbar">
          <div className="mono-search-box">
            <ThemeIcon name="search" size={14} />
            <input
              type="text"
              className="mono-search-input"
              placeholder="Search connectors, tools, or logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="mono-kbd">⌘K</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="mono-btn-secondary"
              onClick={handleSimulateTool}
            >
              <ThemeIcon name="lightning" size={13} />
              <span>Simulate Tool</span>
            </button>
          </div>
        </header>

        {/* Dashboard Body */}
        <div className="mono-body">
          {/* Header Title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                Gateway Overview
              </h2>
              <p style={{ fontSize: '0.825rem', color: '#71717A', marginTop: '0.2rem' }}>
                Single-container multi-SaaS MCP engine connected to Google Gemini Enterprise.
              </p>
            </div>
            <span className="mono-badge-active">ACTIVE REVISION: 00022-FMK</span>
          </div>

          {/* KPI Metrics Grid (4 Minimalist Cards) */}
          <div className="mono-kpi-grid">
            <div className="mono-kpi-card">
              <div className="mono-kpi-header">
                <span>Active SaaS Mesh</span>
                <ThemeIcon name="services" size={14} />
              </div>
              <div className="mono-kpi-value">4 / 4</div>
              <div className="mono-kpi-trend">
                <span>● 100% operational</span>
              </div>
            </div>

            <div className="mono-kpi-card">
              <div className="mono-kpi-header">
                <span>Registered Tools</span>
                <ThemeIcon name="lightning" size={14} />
              </div>
              <div className="mono-kpi-value">59</div>
              <div className="mono-kpi-trend">
                <span>4 domains active</span>
              </div>
            </div>

            <div className="mono-kpi-card">
              <div className="mono-kpi-header">
                <span>Gateway Latency</span>
                <ThemeIcon name="shield" size={14} />
              </div>
              <div className="mono-kpi-value">18ms</div>
              <div className="mono-kpi-trend">
                <span>p99: 42ms &bull; Cache hit: 98%</span>
              </div>
            </div>

            <div className="mono-kpi-card">
              <div className="mono-kpi-header">
                <span>Rate Limit Quota</span>
                <ThemeIcon name="check" size={14} />
              </div>
              <div className="mono-kpi-value">60 / min</div>
              <div className="mono-kpi-trend">
                <span>Leaky-bucket active</span>
              </div>
            </div>
          </div>

          {/* Service Gateway Mesh Table */}
          <div className="mono-card">
            <div className="mono-card-header">
              <h3>Active Service Mesh</h3>
              <span style={{ fontSize: '0.75rem', color: '#71717A', fontFamily: 'var(--font-mono)' }}>
                HOT-RELOAD ENABLED
              </span>
            </div>

            <table className="mono-table">
              <thead>
                <tr>
                  <th>SERVICE NAME</th>
                  <th>DOMAIN</th>
                  <th>TOOLS</th>
                  <th>STATUS</th>
                  <th>LATENCY</th>
                  <th>THROUGHPUT</th>
                  <th style={{ textAlign: 'right' }}>TOGGLE</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '4px',
                            background: '#18181B',
                            border: '1px solid #27272A',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                          }}
                        >
                          <ThemeIcon name={s.domain as any} size={14} />
                        </div>
                        <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{s.name}</span>
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.75rem', background: '#121215', padding: '2px 6px', borderRadius: '3px', color: '#A1A1AA' }}>
                        {s.domain}
                      </code>
                    </td>
                    <td>
                      <span style={{ color: '#D4D4D8', fontWeight: 600 }}>{s.tools}</span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: s.enabled ? '#FFFFFF' : '#71717A' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.enabled ? '#FFFFFF' : '#52525B' }} />
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#A1A1AA' }}>{s.latency}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#A1A1AA' }}>{s.qps}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <label className="switch-container" style={{ transform: 'scale(0.85)' }}>
                        <input
                          type="checkbox"
                          className="switch-input"
                          checked={s.enabled}
                          onChange={() => handleToggleService(s.id)}
                        />
                        <span className="switch-slider" />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Real-Time Telemetry Stream Log */}
          <div className="mono-card">
            <div className="mono-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ThemeIcon name="dev" size={14} />
                <h3>Live Telemetry Stream</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="mono-btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setLogs([])}
                >
                  Clear Feed
                </button>
              </div>
            </div>

            <div className="mono-telemetry">
              {logs.map((l, i) => (
                <div key={i} className="mono-log-line">
                  <span className="mono-log-time">{l.time}</span>
                  <span className="mono-log-tag">{l.tag}</span>
                  <span className="mono-log-msg">{l.msg}</span>
                </div>
              ))}

              {logs.length === 0 && (
                <div style={{ textAlign: 'center', color: '#52525B', padding: '1.5rem' }}>
                  Log buffer empty. Click "Simulate Tool" above to stream live events.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
