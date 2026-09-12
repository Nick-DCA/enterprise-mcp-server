import React, { useEffect, useState, useMemo } from 'react';
import { api, AuditLogItem } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface AuditPageProps {
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type FilterCategory = 'all' | 'auth' | 'services' | 'secrets' | 'users' | 'system';
type TimelinePreset = 'all' | '1h' | '24h' | '7d' | '30d' | 'custom';
type ViewMode = 'timeline' | 'table';

export const AuditPage: React.FC<AuditPageProps> = ({ onShowToast }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [timelinePreset, setTimelinePreset] = useState<TimelinePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedActor, setSelectedActor] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [autoRefreshSecs, setAutoRefreshSecs] = useState<number>(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const loadLogs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getAuditLogs(300);
      setLogs(res.logs || []);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      onShowToast(err.message || 'Failed to load audit logs', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshSecs <= 0) return;
    const interval = setInterval(() => {
      loadLogs(true);
    }, autoRefreshSecs * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSecs]);

  // Distinct actors and actions for filters
  const distinctActors = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.actorEmail) set.add(l.actorEmail);
    });
    return Array.from(set).sort();
  }, [logs]);

  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set).sort();
  }, [logs]);

  const getActionPresentation = (log: AuditLogItem) => {
    switch (log.action) {
      case 'ADMIN_LOGIN':
        return {
          title: 'Admin Session Login',
          badgeClass: 'badge-emerald',
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeColor: '#34D399',
          badgeBorder: 'rgba(16, 185, 129, 0.3)',
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
          badgeBg: 'rgba(6, 182, 212, 0.15)',
          badgeColor: '#22D3EE',
          badgeBorder: 'rgba(6, 182, 212, 0.3)',
          icon: 'services' as const,
          category: 'services' as FilterCategory,
          summary: `Updated operational state for connector [${log.target.replace('services_config/', '')}]`,
        };
      case 'CONFIG_CHANGE':
        return {
          title: 'Service Configuration Updated',
          badgeClass: 'badge-indigo',
          badgeBg: 'rgba(99, 102, 241, 0.15)',
          badgeColor: '#818CF8',
          badgeBorder: 'rgba(99, 102, 241, 0.3)',
          icon: 'cog' as const,
          category: 'services' as FilterCategory,
          summary: `Updated parameters, dataset boundaries, or scan quotas on [${log.target}]`,
        };
      case 'SECRET_UPDATE':
        return {
          title: 'Secret Manager Vault Push',
          badgeClass: 'badge-amber',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeColor: '#FBBF24',
          badgeBorder: 'rgba(245, 158, 11, 0.3)',
          icon: 'secrets' as const,
          category: 'secrets' as FilterCategory,
          summary: `Provisioned new version for secret [${log.details?.secretKey || log.target}] to ${log.details?.source === 'SECRET_MANAGER' ? 'Google Secret Manager' : 'Environment'}`,
        };
      case 'USER_CREATE':
        return {
          title: 'New User Access Provisioned',
          badgeClass: 'badge-emerald',
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeColor: '#34D399',
          badgeBorder: 'rgba(16, 185, 129, 0.3)',
          icon: 'plus' as const,
          category: 'users' as FilterCategory,
          summary: `Authorized team member [${log.details?.userEmail || log.target}] with role [${log.details?.isAdmin ? 'ADMIN' : 'MEMBER'}]`,
        };
      case 'USER_UPDATE':
        return {
          title: 'User Permissions Modified',
          badgeClass: 'badge-indigo',
          badgeBg: 'rgba(99, 102, 241, 0.15)',
          badgeColor: '#818CF8',
          badgeBorder: 'rgba(99, 102, 241, 0.3)',
          icon: 'users' as const,
          category: 'users' as FilterCategory,
          summary: `Modified role, restriction mode, or allowed service list for [${log.target.replace('users/', '')}]`,
        };
      case 'USER_TOGGLE':
        return {
          title: 'User Access State Changed',
          badgeClass: 'badge-amber',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeColor: '#FBBF24',
          badgeBorder: 'rgba(245, 158, 11, 0.3)',
          icon: 'users' as const,
          category: 'users' as FilterCategory,
          summary: `${log.details?.isEnabled ? 'Enabled' : 'Disabled'} access for account [${log.target.replace('users/', '')}]`,
        };
      case 'USER_DELETE':
        return {
          title: 'User Access Revoked & Deleted',
          badgeClass: 'badge-rose',
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          badgeColor: '#F87171',
          badgeBorder: 'rgba(239, 68, 68, 0.3)',
          icon: 'trash' as const,
          category: 'users' as FilterCategory,
          summary: `Removed account [${log.target.replace('users/', '')}] from authorized directory`,
        };
      case 'USER_SESSIONS_REVOKED':
        return {
          title: 'User Sessions Forcefully Terminated',
          badgeClass: 'badge-rose',
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          badgeColor: '#F87171',
          badgeBorder: 'rgba(239, 68, 68, 0.3)',
          icon: 'logout' as const,
          category: 'auth' as FilterCategory,
          summary: `Evicted ${log.details?.revokedCount || 'all'} active sessions for user [${log.target.replace('users/', '')}]`,
        };
      case 'ALL_SESSIONS_REVOKED':
        return {
          title: 'Global Emergency Session Revocation',
          badgeClass: 'badge-rose',
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          badgeColor: '#F87171',
          badgeBorder: 'rgba(239, 68, 68, 0.3)',
          icon: 'shield' as const,
          category: 'auth' as FilterCategory,
          summary: `Purged ${log.details?.revokedSessionsCount || 'all'} active admin sessions across the entire deployment`,
        };
      case 'DIAGNOSTIC_RUN':
        return {
          title: 'Upstream Diagnostic Health Probe',
          badgeClass: 'badge-cyan',
          badgeBg: 'rgba(6, 182, 212, 0.15)',
          badgeColor: '#22D3EE',
          badgeBorder: 'rgba(6, 182, 212, 0.3)',
          icon: 'sparkles' as const,
          category: 'system' as FilterCategory,
          summary: `Executed live connection test against service instance [${log.target}] (${log.details?.status || 'OK'})`,
        };
      default:
        return {
          title: (log.action || 'SYSTEM_EVENT').replace(/_/g, ' '),
          badgeClass: 'badge-muted',
          badgeBg: 'rgba(255, 255, 255, 0.08)',
          badgeColor: '#E4E4E7',
          badgeBorder: 'rgba(255, 255, 255, 0.15)',
          icon: 'info' as const,
          category: 'system' as FilterCategory,
          summary: `Executed ${log.action || 'action'} on target [${log.target || 'system'}]`,
        };
    }
  };

  // Filter pipeline
  const filteredLogs = useMemo(() => {
    const now = Date.now();

    return logs.filter((log) => {
      const pres = getActionPresentation(log);

      // 1. Category Filter
      if (activeCategory !== 'all' && pres.category !== activeCategory) {
        return false;
      }

      // 2. Actor Filter
      if (selectedActor !== 'all' && log.actorEmail !== selectedActor) {
        return false;
      }

      // 3. Action Filter
      if (selectedAction !== 'all' && log.action !== selectedAction) {
        return false;
      }

      // 4. Timeline Filter
      const logTime = new Date(log.timestamp).getTime();
      if (timelinePreset === '1h' && now - logTime > 3600 * 1000) return false;
      if (timelinePreset === '24h' && now - logTime > 24 * 3600 * 1000) return false;
      if (timelinePreset === '7d' && now - logTime > 7 * 24 * 3600 * 1000) return false;
      if (timelinePreset === '30d' && now - logTime > 30 * 24 * 3600 * 1000) return false;
      if (timelinePreset === 'custom') {
        if (customStartDate) {
          const startMs = new Date(customStartDate).getTime();
          if (logTime < startMs) return false;
        }
        if (customEndDate) {
          const endMs = new Date(customEndDate).getTime() + 24 * 3600 * 1000;
          if (logTime > endMs) return false;
        }
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const actorMatch = (log.actorEmail || '').toLowerCase().includes(q);
        const actionMatch = (log.action || '').toLowerCase().includes(q);
        const targetMatch = (log.target || '').toLowerCase().includes(q);
        const summaryMatch = (pres.summary || '').toLowerCase().includes(q);
        const detailsMatch = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        if (!actorMatch && !actionMatch && !targetMatch && !summaryMatch && !detailsMatch) {
          return false;
        }
      }

      return true;
    });
  }, [logs, activeCategory, selectedActor, selectedAction, timelinePreset, customStartDate, customEndDate, searchQuery]);

  const copyLogData = (log: AuditLogItem) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedLogId(log.logId);
    onShowToast('Copied raw audit event JSON to clipboard', 'success');
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const exportLogsAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `enterprise_mcp_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    onShowToast(`Exported ${filteredLogs.length} audit logs as JSON`, 'success');
  };

  const exportLogsAsCsv = () => {
    const headers = ['Log ID', 'Timestamp', 'Actor Email', 'Action', 'Target', 'Details JSON'];
    const rows = filteredLogs.map((l) => [
      `"${l.logId}"`,
      `"${l.timestamp}"`,
      `"${l.actorEmail}"`,
      `"${l.action}"`,
      `"${l.target.replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `enterprise_mcp_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    onShowToast(`Exported ${filteredLogs.length} audit logs as CSV`, 'success');
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

  // KPI calculations
  const totalCount = logs.length;
  const filteredCount = filteredLogs.length;
  const criticalActionsCount = logs.filter(
    (l) => ((l.action || '').includes('SECRET') || (l.action || '').includes('REVOKE') || (l.action || '').includes('DELETE'))
  ).length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
              }}
            >
              <ThemeIcon name="audit" size={18} />
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              System Audit Trail & Governance
            </h1>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Immutable chronological telemetry of administrative actions, secret rotations, connector configurations, and security audits.
          </p>
        </div>

        {/* Top Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Auto Refresh Selector */}
          <select
            className="form-input"
            value={autoRefreshSecs}
            onChange={(e) => setAutoRefreshSecs(parseInt(e.target.value, 10))}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', width: 'auto', background: '#18181B', borderColor: '#27272A', color: '#FAFAFA' }}
            title="Auto-refresh interval"
          >
            <option value={0}>Auto-refresh: Off</option>
            <option value={10}>Auto-refresh: 10s</option>
            <option value={30}>Auto-refresh: 30s</option>
            <option value={60}>Auto-refresh: 60s</option>
          </select>

          {/* Manual Refresh Button */}
          <button
            className="mono-btn-secondary"
            onClick={() => loadLogs(false)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
            title={`Last updated at ${lastRefreshedAt.toLocaleTimeString()}`}
          >
            <div style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s linear' }}>
              <ThemeIcon name="sparkles" size={13} />
            </div>
            <span>Refresh ({lastRefreshedAt.toLocaleTimeString()})</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <button
            className="mono-btn-secondary"
            onClick={exportLogsAsCsv}
            disabled={filteredLogs.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
            title="Export filtered records as CSV"
          >
            <ThemeIcon name="download" size={13} />
            <span>CSV</span>
          </button>

          <button
            className="mono-btn-secondary"
            onClick={exportLogsAsJson}
            disabled={filteredLogs.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
            title="Export filtered records as JSON"
          >
            <ThemeIcon name="code" size={13} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Audit Events
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {totalCount}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Filtered Results
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38BDF8', marginTop: '0.2rem' }}>
            {filteredCount}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Unique Actors
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34D399', marginTop: '0.2rem' }}>
            {distinctActors.length}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Critical Security Actions
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: criticalActionsCount > 0 ? '#F87171' : 'var(--text-muted)', marginTop: '0.2rem' }}>
            {criticalActionsCount}
          </div>
        </div>
      </div>

      {/* Primary Filtering & Timeline Control Deck */}
      <div
        style={{
          backgroundColor: '#18181B',
          border: '1px solid #27272A',
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        {/* Row 1: Search Bar & View Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Full text search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <ThemeIcon name="search" size={14} />
            </span>
            <input
              type="text"
              placeholder="Search audit trail by actor, action, target resource, or metadata JSON..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.2rem',
                fontSize: '0.825rem',
                backgroundColor: '#09090B',
                border: '1px solid #3F3F46',
                borderRadius: '6px',
                color: '#FAFAFA',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#09090B', padding: '3px', borderRadius: '6px', border: '1px solid #27272A' }}>
            <button
              onClick={() => setViewMode('timeline')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: viewMode === 'timeline' ? '#27272A' : 'transparent',
                color: viewMode === 'timeline' ? '#FAFAFA' : '#71717A',
              }}
            >
              <ThemeIcon name="sparkles" size={13} />
              <span>Timeline Feed</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: viewMode === 'table' ? '#27272A' : 'transparent',
                color: viewMode === 'table' ? '#FAFAFA' : '#71717A',
              }}
            >
              <ThemeIcon name="document" size={13} />
              <span>Structured Table</span>
            </button>
          </div>
        </div>

        {/* Row 2: Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.2rem' }}>Category:</span>
          {(
            [
              { id: 'all', label: 'All Events' },
              { id: 'auth', label: 'Auth & Sessions' },
              { id: 'services', label: 'SaaS Connectors' },
              { id: 'secrets', label: 'Secrets Vault' },
              { id: 'users', label: 'Users & IAM' },
              { id: 'system', label: 'System & Probes' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.725rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: activeCategory === cat.id ? '1px solid #10B981' : '1px solid #27272A',
                backgroundColor: activeCategory === cat.id ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: activeCategory === cat.id ? '#34D399' : '#A1A1AA',
                transition: 'all 0.15s ease',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Row 3: Timeline & Dropdown Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.35rem', borderTop: '1px solid #27272A' }}>
          {/* Timeline Filter Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Timeline:</span>
            {(
              [
                { id: 'all', label: 'All Time' },
                { id: '1h', label: 'Past 1h' },
                { id: '24h', label: 'Past 24h' },
                { id: '7d', label: 'Past 7d' },
                { id: '30d', label: 'Past 30d' },
                { id: 'custom', label: 'Custom Range' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTimelinePreset(t.id)}
                style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: timelinePreset === t.id ? '1px solid #3B82F6' : '1px solid #27272A',
                  backgroundColor: timelinePreset === t.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  color: timelinePreset === t.id ? '#60A5FA' : '#71717A',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {timelinePreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', background: '#09090B', border: '1px solid #3F3F46', borderRadius: '4px', color: '#FAFAFA' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#71717A' }}>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', background: '#09090B', border: '1px solid #3F3F46', borderRadius: '4px', color: '#FAFAFA' }}
              />
            </div>
          )}

          {/* Actor Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actor:</span>
            <select
              className="form-input"
              value={selectedActor}
              onChange={(e) => setSelectedActor(e.target.value)}
              style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', width: 'auto', background: '#09090B', borderColor: '#3F3F46', color: '#FAFAFA' }}
            >
              <option value="all">All Actors ({distinctActors.length})</option>
              {distinctActors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>

            {/* Action Dropdown */}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>Action:</span>
            <select
              className="form-input"
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', width: 'auto', background: '#09090B', borderColor: '#3F3F46', color: '#FAFAFA' }}
            >
              <option value="all">All Actions ({distinctActions.length})</option>
              {distinctActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '280px', gap: '1rem' }}>
          <div className="spinner-slow" style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-bright)', borderRadius: '50%' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading system audit stream...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3.5rem 1.5rem',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <ThemeIcon name="search" size={32} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '1rem 0 0.35rem 0', color: 'var(--text-primary)' }}>
            No Matching Audit Events Found
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 0 1.25rem 0' }}>
            No audit records match your current combination of category, search query, actor, and timeline filters.
          </p>
          <button
            className="mono-btn-secondary"
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('all');
              setTimelinePreset('all');
              setSelectedActor('all');
              setSelectedAction('all');
            }}
          >
            Clear All Filters
          </button>
        </div>
      ) : viewMode === 'timeline' ? (
        /* TIMELINE VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredLogs.map((log) => {
            const pres = getActionPresentation(log);
            const isExpanded = expandedLogId === log.logId;

            return (
              <div
                key={log.logId}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: isExpanded ? '1px solid #3B82F6' : '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  {/* Left Column: Action badge & Summary */}
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: pres.badgeBg,
                          color: pres.badgeColor,
                          border: `1px solid ${pres.badgeBorder}`,
                        }}
                      >
                        {pres.title}
                      </span>

                      <code style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {log.action}
                      </code>

                      {log.target && (
                        <span style={{ fontSize: '0.75rem', color: '#A1A1AA', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          &bull; Target: <strong style={{ color: '#FAFAFA' }}>{log.target}</strong>
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '0 0 0.5rem 0', lineHeight: 1.45 }}>
                      {pres.summary}
                    </p>

                    {/* Actor & Timestamp bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <ThemeIcon name="users" size={12} />
                        <span>Actor: <strong style={{ color: '#E4E4E7' }}>{log.actorEmail}</strong></span>
                      </span>
                      <span>&bull;</span>
                      <span title={new Date(log.timestamp).toLocaleString()}>
                        {getRelativeTime(log.timestamp)} ({new Date(log.timestamp).toLocaleTimeString()})
                      </span>
                      <span>&bull;</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        ID: {log.logId.slice(0, 16)}...
                      </span>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      className="mono-btn-secondary"
                      onClick={() => copyLogData(log)}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      title="Copy raw JSON event"
                    >
                      {copiedLogId === log.logId ? (
                        <>
                          <ThemeIcon name="check" size={11} />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <ThemeIcon name="download" size={11} />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>

                    <button
                      className="mono-btn-secondary"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.logId)}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <span>{isExpanded ? 'Hide Payload' : 'Inspect Details'}</span>
                      <ThemeIcon name={isExpanded ? 'chevronLeft' : 'chevronRight'} size={11} />
                    </button>
                  </div>
                </div>

                {/* Expandable JSON details drawer */}
                {isExpanded && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Metadata & Execution Payload:
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#71717A', fontFamily: 'var(--font-mono)' }}>
                        Timestamp: {log.timestamp}
                      </span>
                    </div>

                    <pre
                      style={{
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        color: '#34D399',
                        overflowX: 'auto',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(
                        {
                          logId: log.logId,
                          timestamp: log.timestamp,
                          actorEmail: log.actorEmail,
                          action: log.action,
                          target: log.target,
                          details: log.details,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* STRUCTURED DATA TABLE VIEW */
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Action</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Actor</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Target</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Summary</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const pres = getActionPresentation(log);
                  const isExpanded = expandedLogId === log.logId;

                  return (
                    <React.Fragment key={log.logId}>
                      <tr
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          backgroundColor: isExpanded ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0.65rem 0.85rem', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {getRelativeTime(log.timestamp)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </div>
                        </td>

                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              backgroundColor: pres.badgeBg,
                              color: pres.badgeColor,
                              border: `1px solid ${pres.badgeBorder}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {log.action}
                          </span>
                        </td>

                        <td style={{ padding: '0.65rem 0.85rem', color: '#E4E4E7', fontWeight: 600 }}>
                          {log.actorEmail}
                        </td>

                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          {log.target || '—'}
                        </td>

                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pres.summary}>
                            {pres.summary}
                          </div>
                        </td>

                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className="mono-btn-secondary"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.logId)}
                            style={{ padding: '2px 8px', fontSize: '0.7rem', marginRight: '0.3rem' }}
                          >
                            {isExpanded ? 'Hide' : 'Inspect'}
                          </button>
                          <button
                            className="mono-btn-secondary"
                            onClick={() => copyLogData(log)}
                            style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                            title="Copy JSON"
                          >
                            Copy
                          </button>
                        </td>
                      </tr>

                      {/* Expandable row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ padding: '0.85rem', backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-subtle)' }}>
                            <pre
                              style={{
                                margin: 0,
                                fontSize: '0.75rem',
                                fontFamily: 'var(--font-mono)',
                                color: '#34D399',
                                overflowX: 'auto',
                              }}
                            >
                              {JSON.stringify(log, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
