import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api, UserLogTraceItem, UserLogStats } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface UserLogsPageProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const UserLogsPage: React.FC<UserLogsPageProps> = ({ onShowToast }) => {
  const [traces, setTraces] = useState<UserLogTraceItem[]>([]);
  const [stats, setStats] = useState<UserLogStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedHasUpstream, setSelectedHasUpstream] = useState<'all' | 'with' | 'without'>('all');
  const [selectedHasPayload, setSelectedHasPayload] = useState<'all' | 'with' | 'without'>('all');
  const [argsSearchQuery, setArgsSearchQuery] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('24h');
  const [customStartTime, setCustomStartTime] = useState<string>('');
  const [customEndTime, setCustomEndTime] = useState<string>('');
  const [viewMode, setViewMode] = useState<'feed' | 'table'>('feed');

  // Interactive Inspector Modal State
  const [selectedTraceForModal, setSelectedTraceForModal] = useState<UserLogTraceItem | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'overview' | 'args' | 'spans' | 'response'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Auto-Refresh
  const [autoRefreshSecs, setAutoRefreshSecs] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(0);

  // Load Data
  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const [logsRes, statsRes] = await Promise.all([
        api.getUserLogs({
          preset: selectedPreset as any,
          startTime: selectedPreset === 'custom' ? customStartTime : undefined,
          endTime: selectedPreset === 'custom' ? customEndTime : undefined,
          hasUpstream: selectedHasUpstream !== 'all' ? selectedHasUpstream : undefined,
          hasPayload: selectedHasPayload !== 'all' ? selectedHasPayload : undefined,
          argsSearch: argsSearchQuery.trim() || undefined,
          limit: 150,
        }),
        api.getUserLogStats(24 * 60 * 60 * 1000),
      ]);

      if (logsRes.success) {
        setTraces(logsRes.traces || []);
      }
      if (statsRes.success) {
        setStats(statsRes.stats);
      }
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load user runtime execution logs');
      if (onShowToast) {
        onShowToast(`Failed to load logs: ${err.message}`, 'error');
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [selectedPreset, customStartTime, customEndTime, selectedHasUpstream, selectedHasPayload, argsSearchQuery, onShowToast]);

  // Initial fetch and preset trigger
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Auto-refresh countdown logic
  useEffect(() => {
    if (autoRefreshSecs <= 0) {
      setCountdown(0);
      return;
    }

    setCountdown(autoRefreshSecs);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData(false);
          return autoRefreshSecs;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshSecs, loadData]);

  // Distinct user options
  const userOptions = useMemo(() => {
    const set = new Set<string>();
    traces.forEach((t) => {
      if (t.userEmail) set.add(t.userEmail);
    });
    return Array.from(set).sort();
  }, [traces]);

  // Filtered Traces
  const filteredTraces = useMemo(() => {
    return traces.filter((trace) => {
      // 1. User Filter
      if (selectedUser !== 'ALL') {
        if (!trace.userEmail || trace.userEmail.toLowerCase() !== selectedUser.toLowerCase()) {
          return false;
        }
      }

      // 2. Service Filter
      if (selectedService !== 'ALL') {
        const sLower = selectedService.toLowerCase();
        const matchesDomain = trace.domain?.toLowerCase() === sLower;
        const matchesSpan = trace.upstreamSpans?.some((s) => s.serviceId?.toLowerCase() === sLower);
        if (!matchesDomain && !matchesSpan) return false;
      }

      // 3. Status Filter
      if (selectedStatus !== 'ALL') {
        if (trace.status !== selectedStatus) return false;
      }

      // 4. Upstream Spans Filter
      if (selectedHasUpstream === 'with') {
        const spanCount = trace.upstreamCallsCount || (trace.upstreamSpans && trace.upstreamSpans.length) || 0;
        if (spanCount === 0) return false;
      } else if (selectedHasUpstream === 'without') {
        const spanCount = trace.upstreamCallsCount || (trace.upstreamSpans && trace.upstreamSpans.length) || 0;
        if (spanCount > 0) return false;
      }

      // 5. Response Payload Filter
      if (selectedHasPayload === 'with') {
        const hasPayload = Boolean(trace.responsePayload || trace.responsePreview);
        if (!hasPayload) return false;
      } else if (selectedHasPayload === 'without') {
        const hasPayload = Boolean(trace.responsePayload || trace.responsePreview);
        if (hasPayload) return false;
      }

      // 6. Dedicated Tool Arguments Keyword Search
      if (argsSearchQuery.trim()) {
        const term = argsSearchQuery.toLowerCase().trim();
        const matchArgs = trace.arguments && JSON.stringify(trace.arguments).toLowerCase().includes(term);
        if (!matchArgs) return false;
      }

      // 7. Full-Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTraceId = trace.traceId?.toLowerCase().includes(q);
        const matchTool = trace.toolName?.toLowerCase().includes(q);
        const matchEmail = trace.userEmail?.toLowerCase().includes(q);
        const matchClient = trace.clientId?.toLowerCase().includes(q);
        const matchMethod = trace.jsonrpcMethod?.toLowerCase().includes(q);
        const matchError = trace.errorMessage?.toLowerCase().includes(q);
        const matchPreview = (trace.responsePayload || trace.responsePreview)?.toLowerCase().includes(q);
        const matchArgs = trace.arguments && JSON.stringify(trace.arguments).toLowerCase().includes(q);
        const matchSpans = trace.upstreamSpans?.some(
          (s) => s.endpoint?.toLowerCase().includes(q) || s.errorMessage?.toLowerCase().includes(q)
        );

        if (
          !matchTraceId &&
          !matchTool &&
          !matchEmail &&
          !matchClient &&
          !matchMethod &&
          !matchError &&
          !matchPreview &&
          !matchArgs &&
          !matchSpans
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    traces,
    selectedUser,
    selectedService,
    selectedStatus,
    selectedHasUpstream,
    selectedHasPayload,
    argsSearchQuery,
    searchQuery,
  ]);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    if (onShowToast) onShowToast('Copied to clipboard', 'info');
  };

  // CSV Export
  const handleExportCsv = () => {
    if (filteredTraces.length === 0) {
      if (onShowToast) onShowToast('No traces to export', 'info');
      return;
    }

    const headers = [
      'Trace ID',
      'Timestamp (ISO)',
      'User Email',
      'Client ID',
      'Tool Name',
      'Domain',
      'Status',
      'Duration (ms)',
      'Upstream Calls',
      'Error Message',
    ];

    const rows = filteredTraces.map((t) => [
      t.traceId,
      t.timestamp,
      t.userEmail || 'Anonymous',
      t.clientId || '',
      t.toolName || t.jsonrpcMethod,
      t.domain || '',
      t.status,
      t.durationMs,
      t.upstreamCallsCount || t.upstreamSpans?.length || 0,
      `"${(t.errorMessage || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `user-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onShowToast) onShowToast('User Logs exported as CSV', 'success');
  };

  // JSON Export
  const handleExportJson = () => {
    if (filteredTraces.length === 0) {
      if (onShowToast) onShowToast('No traces to export', 'info');
      return;
    }

    const dataStr = JSON.stringify(filteredTraces, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `user-logs-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onShowToast) onShowToast('User Logs exported as JSON', 'success');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10B981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            SUCCESS
          </span>
        );
      case 'ERROR':
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              color: '#F43F5E',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            ERROR
          </span>
        );
      case 'RATE_LIMITED':
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#F59E0B',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            RATE LIMITED
          </span>
        );
      case 'BLOCKED':
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              color: '#8B5CF6',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            BLOCKED
          </span>
        );
      default:
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: '#27272A',
              color: '#A1A1AA',
            }}
          >
            {status}
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      {/* Top Header Card */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#27272A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FAFAFA',
              }}
            >
              <ThemeIcon name="code" size={18} />
            </div>
            <h1
              style={{
                fontSize: '1.45rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              User Logs
            </h1>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Real-time full-trace runtime telemetry across Gemini Enterprise agents &amp; upstream SaaS APIs
          </p>
        </div>

        {/* Top Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Auto Refresh Selector */}
          <select
            className="form-input"
            value={autoRefreshSecs}
            onChange={(e) => setAutoRefreshSecs(parseInt(e.target.value, 10))}
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.75rem',
              width: 'auto',
              background: '#18181B',
              borderColor: '#27272A',
              color: '#FAFAFA',
            }}
            title="Auto-refresh interval"
          >
            <option value={0}>Auto-refresh: Off</option>
            <option value={5}>Every 5s</option>
            <option value={15}>Every 15s</option>
            <option value={30}>Every 30s</option>
            <option value={60}>Every 60s</option>
          </select>

          {countdown > 0 && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#3B82F6',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontWeight: 600,
              }}
            >
              {countdown}s
            </span>
          )}

          {/* Manual Refresh */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(true)}
            disabled={isLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            title={`Last refreshed at ${lastRefreshed.toLocaleTimeString()}`}
          >
            <ThemeIcon name="sparkles" size={13} />
            <span>Refresh</span>
          </button>

          {/* Export CSV */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            disabled={filteredTraces.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <ThemeIcon name="download" size={13} />
            <span>CSV</span>
          </button>

          {/* Export JSON */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportJson}
            disabled={filteredTraces.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <ThemeIcon name="code" size={13} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Telemetry Stats Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Invocations (24h)
          </span>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FAFAFA' }}>
            {stats ? stats.totalInvocations : traces.length}
          </span>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Success Rate
          </span>
          <span
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: stats && stats.successRatePercent < 90 ? '#F59E0B' : '#10B981',
            }}
          >
            {stats ? `${stats.successRatePercent}%` : '100%'}
          </span>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Average Latency
          </span>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FAFAFA' }}>
            {stats ? `${stats.averageLatencyMs} ms` : '0 ms'}
          </span>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active Users &amp; Agents
          </span>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FAFAFA' }}>
            {stats ? `${stats.activeUsersCount} / ${stats.activeAgentsCount}` : `${userOptions.length} / 1`}
          </span>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Upstream SaaS Calls
          </span>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3B82F6' }}>
            {stats ? stats.upstreamCallsCount : 0}
          </span>
        </div>
      </div>

      {/* Filter Deck */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Row 1: Search and View Mode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Full text search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <ThemeIcon name="search" size={14} />
            </span>
            <input
              type="text"
              placeholder="Search user logs by user, client ID, tool, arguments, errors, trace ID..."
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
          </div>

          {/* View Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #27272A', borderRadius: '6px', overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('feed')}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                backgroundColor: viewMode === 'feed' ? '#27272A' : '#121215',
                color: viewMode === 'feed' ? '#FAFAFA' : '#71717A',
                cursor: 'pointer',
              }}
            >
              Trace Feed
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                backgroundColor: viewMode === 'table' ? '#27272A' : '#121215',
                color: viewMode === 'table' ? '#FAFAFA' : '#71717A',
                cursor: 'pointer',
              }}
            >
              Data Table
            </button>
          </div>
        </div>

        {/* Row 2: Timeline Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Timeline:</span>
          {['15m', '1h', '24h', '7d', '30d', 'all', 'custom'].map((preset) => {
            const labelMap: Record<string, string> = {
              '15m': 'Past 15m',
              '1h': 'Past 1h',
              '24h': 'Past 24h',
              '7d': 'Past 7d',
              '30d': 'Past 30d',
              all: 'All Time',
              custom: 'Custom Range',
            };
            const isSelected = selectedPreset === preset;
            return (
              <button
                key={preset}
                onClick={() => setSelectedPreset(preset)}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: isSelected ? '1px solid #FAFAFA' : '1px solid #27272A',
                  backgroundColor: isSelected ? '#FAFAFA' : '#18181B',
                  color: isSelected ? '#09090B' : '#A1A1AA',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {labelMap[preset] || preset}
              </button>
            );
          })}
        </div>

        {/* Row 2b: Custom Date Range Inputs */}
        {selectedPreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.5rem', backgroundColor: '#09090B', borderRadius: '6px', border: '1px solid #27272A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="datetime-local"
                value={customStartTime}
                onChange={(e) => setCustomStartTime(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#18181B', border: '1px solid #3F3F46', color: '#FAFAFA', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="datetime-local"
                value={customEndTime}
                onChange={(e) => setCustomEndTime(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#18181B', border: '1px solid #3F3F46', color: '#FAFAFA', borderRadius: '4px' }}
              />
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadData(true)}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
            >
              Apply Range
            </button>
          </div>
        )}

        {/* Row 3: Dropdown Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* User Email Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '160px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Corporate User
            </label>
            <select
              className="form-input"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.775rem', background: '#09090B', borderColor: '#27272A', color: '#FAFAFA' }}
            >
              <option value="ALL">All Users</option>
              {userOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Service Domain Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '140px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Service Domain
            </label>
            <select
              className="form-input"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.775rem', background: '#09090B', borderColor: '#27272A', color: '#FAFAFA' }}
            >
              <option value="ALL">All Domains</option>
              <option value="accounting">Xero (Accounting)</option>
              <option value="contacts">Xero (Contacts)</option>
              <option value="reports">Xero (Reports)</option>
              <option value="bigquery">Google BigQuery</option>
              <option value="firestore">Cloud Firestore</option>
              <option value="sagehr">Sage HR</option>
              <option value="slack">Slack Federated Search</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '130px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Execution Status
            </label>
            <select
              className="form-input"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.775rem', background: '#09090B', borderColor: '#27272A', color: '#FAFAFA' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="ERROR">ERROR</option>
              <option value="RATE_LIMITED">RATE LIMITED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>

          {/* Upstream Spans Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '145px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upstream Spans
            </label>
            <select
              className="form-input"
              value={selectedHasUpstream}
              onChange={(e) => setSelectedHasUpstream(e.target.value as any)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.775rem', background: '#09090B', borderColor: '#27272A', color: '#FAFAFA' }}
            >
              <option value="all">All (With &amp; Without)</option>
              <option value="with">With Upstream Calls</option>
              <option value="without">Without Upstream Calls</option>
            </select>
          </div>

          {/* Response Payload Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '145px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Response Payload
            </label>
            <select
              className="form-input"
              value={selectedHasPayload}
              onChange={(e) => setSelectedHasPayload(e.target.value as any)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.775rem', background: '#09090B', borderColor: '#27272A', color: '#FAFAFA' }}
            >
              <option value="all">All Payloads</option>
              <option value="with">With Response Payload</option>
              <option value="without">Without Response Payload</option>
            </select>
          </div>

          {/* Dedicated Tool Arguments Search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '220px', flex: '1 1 200px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Arguments Keyword
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '0.6rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <ThemeIcon name="code" size={13} />
              </div>
              <input
                type="text"
                placeholder="Search arguments (e.g. query, id)..."
                value={argsSearchQuery}
                onChange={(e) => setArgsSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 1.8rem 0.4rem 1.9rem',
                  fontSize: '0.775rem',
                  backgroundColor: '#09090B',
                  border: '1px solid #27272A',
                  borderRadius: '6px',
                  color: '#FAFAFA',
                  outline: 'none',
                }}
              />
              {argsSearchQuery && (
                <button
                  type="button"
                  onClick={() => setArgsSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.1rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear arguments search"
                >
                  <ThemeIcon name="xmark" size={12} />
                </button>
              )}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Showing <strong>{filteredTraces.length}</strong> of <strong>{traces.length}</strong> traces
            </span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '8px',
            color: '#F43F5E',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ThemeIcon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Presentation View */}
      {isLoading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <ThemeIcon name="sparkles" size={24} />
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>Loading user execution traces...</p>
        </div>
      ) : filteredTraces.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <ThemeIcon name="search" size={28} />
          <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            No matching execution traces found
          </p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Try adjusting your timeline preset, clear search filters, or execute a tool in Gemini Enterprise.
          </p>
        </div>
      ) : viewMode === 'feed' ? (
        /* View 1: Trace Feed (Timeline Cards) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredTraces.map((trace) => {
            const hasSpans = trace.upstreamSpans && trace.upstreamSpans.length > 0;
            return (
              <div
                key={trace.traceId}
                className="card"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  borderLeft:
                    trace.status === 'SUCCESS'
                      ? '3px solid #10B981'
                      : trace.status === 'BLOCKED'
                      ? '3px solid #8B5CF6'
                      : trace.status === 'RATE_LIMITED'
                      ? '3px solid #F59E0B'
                      : '3px solid #F43F5E',
                }}
              >
                {/* Header line */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {getStatusBadge(trace.status)}

                    <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#FAFAFA' }}>
                      {trace.toolName || trace.jsonrpcMethod}
                    </span>

                    {trace.domain && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.45rem',
                          backgroundColor: '#18181B',
                          border: '1px solid #27272A',
                          borderRadius: '4px',
                          color: '#A1A1AA',
                        }}
                      >
                        {trace.domain}
                      </span>
                    )}

                    <span style={{ fontSize: '0.75rem', color: '#71717A' }}>
                      ({trace.durationMs}ms)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717A', fontFamily: 'var(--font-mono)' }}>
                      {new Date(trace.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSelectedTraceForModal(trace);
                        setModalActiveTab('overview');
                      }}
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.7rem' }}
                    >
                      Inspect
                    </button>
                  </div>
                </div>

                {/* Identity line */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.775rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span>
                    User: <strong style={{ color: '#FAFAFA' }}>{trace.userEmail || 'Anonymous'}</strong>
                  </span>
                  {trace.clientId && (
                    <span>
                      Agent: <code style={{ color: '#A1A1AA', background: '#18181B', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{trace.clientId}</code>
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#52525B' }}>
                    ID: {trace.traceId}
                  </span>
                </div>

                {/* Upstream SaaS Spans Badges */}
                {hasSpans && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Upstream:
                    </span>
                    {trace.upstreamSpans.map((span) => (
                      <span
                        key={span.spanId}
                        style={{
                          fontSize: '0.725rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: '#18181B',
                          border: '1px solid #27272A',
                          color: '#E4E4E7',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <strong style={{ color: '#3B82F6' }}>{span.serviceId}</strong>
                        <span>{span.endpoint}</span>
                        <span style={{ color: '#71717A' }}>({span.durationMs}ms)</span>
                        {span.quotaInfo && <span style={{ color: '#10B981', fontSize: '0.675rem' }}>[{span.quotaInfo}]</span>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Response / Error Preview */}
                {trace.errorMessage ? (
                  <div
                    style={{
                      padding: '0.6rem 0.75rem',
                      backgroundColor: 'rgba(244, 63, 94, 0.08)',
                      border: '1px solid rgba(244, 63, 94, 0.2)',
                      borderRadius: '6px',
                      fontSize: '0.775rem',
                      color: '#F43F5E',
                    }}
                  >
                    <strong>Error:</strong> {trace.errorMessage}
                  </div>
                ) : trace.responsePreview ? (
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#09090B',
                      border: '1px solid #1F1F23',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#A1A1AA',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {trace.responsePreview}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        /* View 2: High-Density Structured Table */
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#18181B', borderBottom: '1px solid #27272A', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Tool / Method</th>
                <th style={{ padding: '0.75rem 1rem' }}>User Email</th>
                <th style={{ padding: '0.75rem 1rem' }}>Client ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Duration</th>
                <th style={{ padding: '0.75rem 1rem' }}>Upstream</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTraces.map((trace) => (
                <tr
                  key={trace.traceId}
                  style={{ borderBottom: '1px solid #1F1F23', transition: 'background-color 0.15s' }}
                  className="table-row-hover"
                >
                  <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#A1A1AA' }}>
                    {new Date(trace.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                    {getStatusBadge(trace.status)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#FAFAFA' }}>
                    {trace.toolName || trace.jsonrpcMethod}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#FAFAFA' }}>
                    {trace.userEmail || <span style={{ color: '#71717A' }}>Anonymous</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#A1A1AA', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {trace.clientId || '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: '#A1A1AA' }}>
                    {trace.durationMs}ms
                  </td>
                  <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: trace.upstreamCallsCount ? '#3B82F6' : '#71717A' }}>
                    {trace.upstreamCallsCount || trace.upstreamSpans?.length || 0} calls
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSelectedTraceForModal(trace);
                        setModalActiveTab('overview');
                      }}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deep-Dive Payload Inspector Modal */}
      {selectedTraceForModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
          onClick={() => setSelectedTraceForModal(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '840px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              backgroundColor: '#121215',
              borderColor: '#27272A',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #27272A',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#18181B',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ThemeIcon name="code" size={18} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#FAFAFA' }}>
                  Execution Trace Inspector
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#71717A', fontFamily: 'var(--font-mono)' }}>
                  [{selectedTraceForModal.traceId}]
                </span>
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedTraceForModal(null)}
                style={{ padding: '0.25rem 0.5rem' }}
              >
                <ThemeIcon name="xmark" size={14} />
              </button>
            </div>

            {/* Modal Tab Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #27272A', backgroundColor: '#09090B' }}>
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'args', label: 'Input Arguments' },
                { key: 'spans', label: `Upstream Spans (${selectedTraceForModal.upstreamSpans?.length || 0})` },
                { key: 'response', label: 'Response Payload' },
              ].map((tab) => {
                const isActive = modalActiveTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setModalActiveTab(tab.key as any)}
                    style={{
                      padding: '0.6rem 1.25rem',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 700 : 500,
                      border: 'none',
                      borderBottom: isActive ? '2px solid #FAFAFA' : '2px solid transparent',
                      backgroundColor: 'transparent',
                      color: isActive ? '#FAFAFA' : '#71717A',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {modalActiveTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.825rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <div style={{ marginTop: '0.25rem' }}>{getStatusBadge(selectedTraceForModal.status)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                    <div style={{ marginTop: '0.25rem', fontWeight: 600, color: '#FAFAFA' }}>
                      {selectedTraceForModal.durationMs} ms
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Tool Name:</span>
                    <div style={{ marginTop: '0.25rem', fontWeight: 600, color: '#FAFAFA' }}>
                      {selectedTraceForModal.toolName || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Service Domain:</span>
                    <div style={{ marginTop: '0.25rem', fontWeight: 600, color: '#FAFAFA' }}>
                      {selectedTraceForModal.domain || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>User Email:</span>
                    <div style={{ marginTop: '0.25rem', fontWeight: 600, color: '#FAFAFA' }}>
                      {selectedTraceForModal.userEmail || 'Anonymous'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Client / Agent ID:</span>
                    <div style={{ marginTop: '0.25rem', fontWeight: 600, color: '#FAFAFA' }}>
                      {selectedTraceForModal.clientId || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Caller IP:</span>
                    <div style={{ marginTop: '0.25rem', color: '#A1A1AA' }}>
                      {selectedTraceForModal.ipAddress || 'Unknown'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span>
                    <div style={{ marginTop: '0.25rem', color: '#A1A1AA' }}>
                      {new Date(selectedTraceForModal.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {modalActiveTab === 'args' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tool Input Arguments (Sanitized)</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        handleCopy(JSON.stringify(selectedTraceForModal.arguments || {}, null, 2), 'args')
                      }
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    >
                      {copiedKey === 'args' ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '1rem',
                      backgroundColor: '#09090B',
                      border: '1px solid #27272A',
                      borderRadius: '6px',
                      fontSize: '0.775rem',
                      color: '#E4E4E7',
                      overflowX: 'auto',
                      overflowY: 'auto',
                      maxHeight: '60vh',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {JSON.stringify(selectedTraceForModal.arguments || {}, null, 2)}
                  </pre>
                </div>
              )}

              {modalActiveTab === 'spans' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    maxHeight: '60vh',
                    overflowY: 'auto',
                    paddingRight: '0.25rem',
                  }}
                >
                  {(!selectedTraceForModal.upstreamSpans || selectedTraceForModal.upstreamSpans.length === 0) ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No outbound upstream SaaS calls were made during this tool execution.
                    </div>
                  ) : (
                    selectedTraceForModal.upstreamSpans.map((span, idx) => (
                      <div
                        key={span.spanId || idx}
                        style={{
                          padding: '1rem',
                          backgroundColor: '#09090B',
                          border: '1px solid #27272A',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3B82F6' }}>
                            [{span.serviceId?.toUpperCase()}] {span.endpoint}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                            HTTP {span.httpStatus || 200} ({span.durationMs}ms)
                          </span>
                        </div>
                        {span.quotaInfo && (
                          <span style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                            Quota / Usage: <strong>{span.quotaInfo}</strong>
                          </span>
                        )}
                        {span.errorMessage && (
                          <span style={{ fontSize: '0.75rem', color: '#F43F5E' }}>
                            Error: {span.errorMessage}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {modalActiveTab === 'response' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Response Output (
                      {selectedTraceForModal.responsePayload
                        ? selectedTraceForModal.responsePayload.length
                        : selectedTraceForModal.responseChars || 0}{' '}
                      chars)
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        handleCopy(
                          selectedTraceForModal.responsePayload ||
                            selectedTraceForModal.errorMessage ||
                            selectedTraceForModal.responsePreview ||
                            '',
                          'response'
                        )
                      }
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    >
                      {copiedKey === 'response' ? 'Copied!' : 'Copy Text'}
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '1rem',
                      backgroundColor: '#09090B',
                      border: '1px solid #27272A',
                      borderRadius: '6px',
                      fontSize: '0.775rem',
                      color:
                        selectedTraceForModal.errorMessage && !selectedTraceForModal.responsePayload
                          ? '#F43F5E'
                          : '#E4E4E7',
                      overflowX: 'auto',
                      overflowY: 'auto',
                      maxHeight: '60vh',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedTraceForModal.responsePayload ||
                      selectedTraceForModal.errorMessage ||
                      selectedTraceForModal.responsePreview ||
                      'No response content recorded.'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
