import React, { useEffect, useState, useMemo } from 'react';
import { api, AuditLogItem } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface AuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterCategory = 'all' | 'auth' | 'services' | 'secrets' | 'users' | 'system';

export const AuditDrawer: React.FC<AuditDrawerProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await api.getAuditLogs(100);
      setLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyLogData = (log: AuditLogItem) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedLogId(log.logId);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const exportLogsAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mcp_gateway_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getRelativeTime = (isoString: string) => {
    try {
      const now = Date.now();
      const past = new Date(isoString).getTime();
      const diffMs = now - past;
      if (diffMs < 0) return 'Just now';
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) return `${diffSecs}s ago`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch (_e) {
      return isoString;
    }
  };

  const getActionPresentation = (log: AuditLogItem) => {
    switch (log.action) {
      case 'ADMIN_LOGIN':
        return {
          title: 'Admin Session Login',
          badgeClass: 'badge-emerald',
          icon: 'sparkles' as const,
          category: 'auth' as FilterCategory,
          summary: log.details?.provider
            ? `Signed in via Google Workspace OIDC (${log.details.provider})`
            : `Signed in via Developer Local Auth (${log.details?.role || 'ADMIN'})`,
        };
      case 'SERVICE_TOGGLE':
        return {
          title: 'SaaS Connector Toggled',
          badgeClass: 'badge-cyan',
          icon: 'services' as const,
          category: 'services' as FilterCategory,
          summary: `Updated operational state for connector [${log.target.replace('services_config/', '')}]`,
        };
      case 'CONFIG_CHANGE':
        return {
          title: 'Service Configuration Updated',
          badgeClass: 'badge-indigo',
          icon: 'cog' as const,
          category: 'services' as FilterCategory,
          summary: `Updated parameters, dataset boundaries, or scan quotas on [${log.target}]`,
        };
      case 'SECRET_UPDATE':
        return {
          title: 'Secret Vault Provisioned',
          badgeClass: 'badge-amber',
          icon: 'secrets' as const,
          category: 'secrets' as FilterCategory,
          summary: `Stored or updated encrypted credential key for [${log.target}]`,
        };
      case 'USER_CREATE':
        return {
          title: 'User Access Provisioned',
          badgeClass: 'badge-emerald',
          icon: 'plus' as const,
          category: 'users' as FilterCategory,
          summary: `Created authorization profile for [${log.target.replace('users_access/', '')}]`,
        };
      case 'USER_TOGGLE':
        return {
          title: 'User Account Toggled',
          badgeClass: 'badge-cyan',
          icon: 'users' as const,
          category: 'users' as FilterCategory,
          summary: `Changed active state for [${log.target.replace('users_access/', '')}]`,
        };
      case 'PERMISSIONS_UPDATE':
        return {
          title: 'RBAC Permissions Modified',
          badgeClass: 'badge-indigo',
          icon: 'shield' as const,
          category: 'users' as FilterCategory,
          summary: `Updated allowed services or read-only lock for [${log.target.replace('users_access/', '')}]`,
        };
      case 'USER_DELETE':
        return {
          title: 'User Access Revoked',
          badgeClass: 'badge-rose',
          icon: 'trash' as const,
          category: 'users' as FilterCategory,
          summary: `Deleted authorization profile for [${log.target.replace('users_access/', '')}]`,
        };
      case 'SESSION_REVOKE':
        return {
          title: 'Security Session Revoked',
          badgeClass: 'badge-rose',
          icon: 'shield' as const,
          category: 'auth' as FilterCategory,
          summary: 'Terminated active authentication sessions',
        };
      case 'INITIALIZATION_STEP':
        return {
          title: 'Platform Initialized',
          badgeClass: 'badge-emerald',
          icon: 'sparkles' as const,
          category: 'system' as FilterCategory,
          summary: log.details?.message || 'Bootstrap initialization event recorded',
        };
      default:
        return {
          title: log.action || 'Audit Event',
          badgeClass: 'badge-cyan',
          icon: 'audit' as const,
          category: 'system' as FilterCategory,
          summary: `Action on ${log.target}`,
        };
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const pres = getActionPresentation(log);
      // Category filter
      if (activeCategory !== 'all' && pres.category !== activeCategory) {
        return false;
      }
      // Search text filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesActor = (log.actorEmail || '').toLowerCase().includes(q);
        const matchesTarget = (log.target || '').toLowerCase().includes(q);
        const matchesAction = (log.action || '').toLowerCase().includes(q);
        const matchesTitle = pres.title.toLowerCase().includes(q);
        const matchesSummary = pres.summary.toLowerCase().includes(q);
        const matchesDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        return matchesActor || matchesTarget || matchesAction || matchesTitle || matchesSummary || matchesDetails;
      }
      return true;
    });
  }, [logs, activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div
        className="drawer-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '560px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ThemeIcon name="audit" size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Audit Trail & Governance
                </h3>
                <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                  {logs.length} EVENTS
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Immutable event stream & secret-redacted operations
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={exportLogsAsJson}
              disabled={logs.length === 0}
              title="Export all logs as JSON file"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
            >
              <ThemeIcon name="download" size={13} />
              <span>Export</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={loadLogs}
              disabled={loading}
              title="Refresh audit event log"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
            >
              <ThemeIcon name="sparkles" size={13} />
              <span>{loading ? '...' : 'Refresh'}</span>
            </button>

            <button
              className="close-btn"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '1.2rem',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search & Category Filter Strip */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search events by actor, target, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
          />

          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '2px' }}>
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'auth', label: 'Logins & Auth' },
                { id: 'services', label: 'Services' },
                { id: 'secrets', label: 'Secrets' },
                { id: 'users', label: 'Users' },
                { id: 'system', label: 'System' },
              ] as { id: FilterCategory; label: string }[]
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  fontSize: '0.725rem',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: activeCategory === cat.id ? 'var(--accent-bright)' : 'var(--border-subtle)',
                  backgroundColor: activeCategory === cat.id ? 'var(--bg-input)' : 'transparent',
                  color: activeCategory === cat.id ? 'var(--accent-bright)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: activeCategory === cat.id ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Event List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  margin: '0 auto 0.75rem',
                  border: '2px solid var(--border-subtle)',
                  borderTopColor: 'var(--accent-bright)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', margin: 0 }}>
                Loading audit events...
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                No audit events found
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                {searchQuery || activeCategory !== 'all'
                  ? 'Try clearing your search filters to view recorded platform activities.'
                  : 'Platform audit events will appear here automatically when actions occur.'}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const pres = getActionPresentation(log);
              const isExpanded = expandedLogId === log.logId;
              const isCopied = copiedLogId === log.logId;
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div
                  key={log.logId}
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  {/* Top Line: Actor + Time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          color: 'var(--accent-bright)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {log.actorEmail}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                        title={new Date(log.timestamp).toLocaleString()}
                      >
                        {getRelativeTime(log.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Title & Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <ThemeIcon name={pres.icon} size={15} />
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {pres.title}
                      </span>
                    </div>
                    <span className={`badge ${pres.badgeClass}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                      {log.action}
                    </span>
                  </div>

                  {/* Natural Language Summary */}
                  <p style={{ margin: 0, fontSize: '0.785rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {pres.summary}
                  </p>

                  {/* Target pill */}
                  {log.target && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                      <span style={{ fontSize: '0.685rem', color: 'var(--text-muted)' }}>Target:</span>
                      <code
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-main)',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {log.target}
                      </code>
                    </div>
                  )}

                  {/* Collapsible Details & Context */}
                  {hasDetails && (
                    <div style={{ marginTop: '0.35rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.45rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.logId)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-bright)',
                            fontSize: '0.725rem',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <span>{isExpanded ? 'Hide Payload' : 'View Payload & Context'}</span>
                          <span>{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        <button
                          onClick={() => copyLogData(log)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {isCopied ? 'Copied ✓' : 'Copy JSON'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '0.45rem',
                            backgroundColor: 'var(--bg-main)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            padding: '0.5rem 0.65rem',
                          }}
                        >
                          <pre
                            style={{
                              margin: 0,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.7rem',
                              color: 'var(--text-secondary)',
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                              maxHeight: '180px',
                            }}
                          >
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
