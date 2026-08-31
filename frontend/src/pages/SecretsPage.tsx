import React, { useState, useEffect, useMemo } from 'react';
import { SecretItem, SecretsStatusResponse } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface SecretsPageProps {
  secretsData: SecretsStatusResponse | null;
  onOpenUpdateModal: (secret: SecretItem) => void;
  onRefresh: () => Promise<void>;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

type ViewMode = 'cards' | 'table';
type GroupByMode = 'category' | 'customer' | 'none';
type StatusFilter = 'ALL' | 'CONFIGURED' | 'MISSING' | 'REQUIRED_MISSING';
type SourceFilter = 'ALL' | 'SECRET_MANAGER' | 'ENVIRONMENT' | 'MISSING';
type SortOption = 'requirement' | 'key-asc' | 'key-desc' | 'category' | 'status';

export const SecretsPage: React.FC<SecretsPageProps> = ({
  secretsData,
  onOpenUpdateModal,
  onRefresh,
  onShowToast,
}) => {
  // View & Structure states with persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('mcp_secrets_view_mode') as ViewMode) || 'cards';
    } catch {
      return 'cards';
    }
  });

  const [groupBy, setGroupBy] = useState<GroupByMode>('category');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('requirement');

  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const secrets = secretsData?.secrets || [];

  // Persist viewMode
  useEffect(() => {
    try {
      localStorage.setItem('mcp_secrets_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  const categories = [
    'ALL',
    'Platform',
    'Google Workspace Auth',
    'Xero',
    'BigQuery',
    'Firestore',
    'Sage HR',
    'Slack',
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Xero':
        return 'xero';
      case 'BigQuery':
        return 'bigquery';
      case 'Firestore':
        return 'firestore';
      case 'Sage HR':
        return 'sagehr';
      case 'Slack':
        return 'sparkles';
      case 'Google Workspace Auth':
        return 'users';
      case 'Platform':
      default:
        return 'secrets';
    }
  };

  const handleCopyKey = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    if (onShowToast) {
      onShowToast(`Copied secret key: ${key}`, 'info');
    }
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const isCurrentlyCollapsed = prev[groupKey] !== undefined ? prev[groupKey] : (searchQuery.trim() === '');
      return {
        ...prev,
        [groupKey]: !isCurrentlyCollapsed,
      };
    });
  };

  // Compute counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; missing: number }> = {};
    categories.forEach((cat) => {
      counts[cat] = { total: 0, missing: 0 };
    });

    secrets.forEach((s) => {
      const cat = s.category || 'Platform';
      if (!counts[cat]) {
        counts[cat] = { total: 0, missing: 0 };
      }
      counts[cat].total += 1;
      if (!s.isConfigured) {
        counts[cat].missing += 1;
      }
    });

    counts['ALL'] = {
      total: secrets.length,
      missing: secrets.filter((s) => !s.isConfigured).length,
    };
    return counts;
  }, [secrets, categories]);

  // Filter and Sort Pipeline
  const filteredSecrets = useMemo(() => {
    return secrets
      .filter((s) => {
        // Category filter
        const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;

        // Status filter
        let matchesStatus = true;
        if (statusFilter === 'CONFIGURED') matchesStatus = s.isConfigured;
        else if (statusFilter === 'MISSING') matchesStatus = !s.isConfigured;
        else if (statusFilter === 'REQUIRED_MISSING') matchesStatus = !s.isConfigured && s.required;

        // Source filter
        let matchesSource = true;
        if (sourceFilter !== 'ALL') {
          matchesSource = s.status === sourceFilter;
        }

        // Search query
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          s.key.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.category && s.category.toLowerCase().includes(q)) ||
          (s.customerName && s.customerName.toLowerCase().includes(q));

        return matchesCategory && matchesStatus && matchesSource && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOption === 'requirement') {
          // Required missing first, then missing, then configured
          if (!a.isConfigured && a.required && (b.isConfigured || !b.required)) return -1;
          if (!b.isConfigured && b.required && (a.isConfigured || !a.required)) return 1;
          if (!a.isConfigured && b.isConfigured) return -1;
          if (a.isConfigured && !b.isConfigured) return 1;
          return a.key.localeCompare(b.key);
        } else if (sortOption === 'key-asc') {
          return a.key.localeCompare(b.key);
        } else if (sortOption === 'key-desc') {
          return b.key.localeCompare(a.key);
        } else if (sortOption === 'category') {
          return a.category.localeCompare(b.category) || a.key.localeCompare(b.key);
        } else if (sortOption === 'status') {
          if (a.isConfigured && !b.isConfigured) return -1;
          if (!a.isConfigured && b.isConfigured) return 1;
          return a.key.localeCompare(b.key);
        }
        return 0;
      });
  }, [secrets, selectedCategory, statusFilter, sourceFilter, searchQuery, sortOption]);

  // Grouped Data Structures
  const groupedData = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'ALL', title: 'All Secrets', secrets: filteredSecrets, icon: 'secrets' }];
    }

    const map = new Map<string, { key: string; title: string; secrets: SecretItem[]; icon: string; subtitle?: string }>();

    filteredSecrets.forEach((sec) => {
      const groupKey =
        groupBy === 'category'
          ? sec.category || 'Platform'
          : sec.customerName || 'Global Platform & System';

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          title: groupKey,
          secrets: [],
          icon: groupBy === 'category' ? getCategoryIcon(groupKey) : 'shield',
          subtitle: groupBy === 'customer' && sec.customerName ? `Customer-partitioned credentials for ${sec.customerName}` : undefined,
        });
      }
      map.get(groupKey)!.secrets.push(sec);
    });

    return Array.from(map.values());
  }, [filteredSecrets, groupBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="secrets" size={24} />
            <h2>Secret Manager Vault & Credentials</h2>
          </div>
          <p>
            Zero-exposure credential management with GCP Secret Manager synchronization. Select between structured card and table views with advanced search, status, and tenant filters.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Layout Mode Switcher (Cards vs Table) */}
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card Grid Layout"
            >
              <ThemeIcon name="services" size={13} />
              <span>Cards</span>
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Data Table Layout"
            >
              <ThemeIcon name="document" size={13} />
              <span>Table</span>
            </button>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing}>
            <ThemeIcon name="sparkles" size={13} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Status'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Stats (Clickable to Filter) */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {/* Card 1: Core Platform Setup */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setSelectedCategory(selectedCategory === 'Platform' ? 'ALL' : 'Platform')}
          title="Click to filter Core Platform secrets"
        >
          <div className="stat-icon cyan">
            <ThemeIcon name="shield" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">
              {secrets.filter((s) => s.required && s.isConfigured).length} / {secrets.filter((s) => s.required).length}
            </div>
            <div className="stat-label">CORE PLATFORM SETUP</div>
          </div>
        </div>

        {/* Card 2: Required Missing */}
        <div
          className="stat-card"
          style={{
            cursor: 'pointer',
            borderColor: statusFilter === 'REQUIRED_MISSING' ? 'var(--rose-primary)' : undefined,
          }}
          onClick={() => setStatusFilter(statusFilter === 'REQUIRED_MISSING' ? 'ALL' : 'REQUIRED_MISSING')}
          title="Click to toggle required missing secrets filter"
        >
          <div className={`stat-icon ${(secretsData?.requiredMissingCount || 0) > 0 ? 'rose' : 'emerald'}`}>
            <ThemeIcon name={(secretsData?.requiredMissingCount || 0) > 0 ? 'alert' : 'check'} size={20} />
          </div>
          <div className="stat-info">
            <div
              className="stat-value"
              style={{
                color:
                  (secretsData?.requiredMissingCount || 0) > 0
                    ? 'var(--rose-bright)'
                    : 'var(--emerald-bright)',
              }}
            >
              {(secretsData?.requiredMissingCount || 0) === 0 ? '0 (Healthy)' : secretsData?.requiredMissingCount}
            </div>
            <div className="stat-label">REQUIRED MISSING</div>
          </div>
        </div>

        {/* Card 3: SaaS Connector Credentials */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setStatusFilter(statusFilter === 'CONFIGURED' ? 'ALL' : 'CONFIGURED')}
          title="Click to filter configured service credentials"
        >
          <div className="stat-icon indigo">
            <ThemeIcon name="services" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">
              {secrets.filter((s) => !s.required && s.isConfigured).length} / {secrets.filter((s) => !s.required).length}
            </div>
            <div className="stat-label">OPTIONAL SERVICE CONNECTORS</div>
          </div>
        </div>
      </div>

      {/* Main Filter & Structure Toolbar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
        }}
      >
        {/* Top Controls: Search, Status, Source, Group By, Sort */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Box with Clear Button */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingRight: '2rem' }}
              placeholder="Search keys, description, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '2px 4px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">All Statuses ({secrets.length})</option>
              <option value="CONFIGURED">Configured Only ({secretsData?.configuredCount || 0})</option>
              <option value="MISSING">All Missing Only ({secrets.filter((s) => !s.isConfigured).length})</option>
              <option value="REQUIRED_MISSING">Required Missing Only ({secretsData?.requiredMissingCount || 0})</option>
            </select>

            {/* Storage Source Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            >
              <option value="ALL">All Storage Sources</option>
              <option value="SECRET_MANAGER">GCP Secret Manager</option>
              <option value="ENVIRONMENT">Environment Variable</option>
              <option value="MISSING">Not Initialized</option>
            </select>

            {/* Group By Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={groupBy}
              onChange={(e) => {
                setGroupBy(e.target.value as GroupByMode);
                setCollapsedGroups({});
              }}
            >
              <option value="category">Group by Category</option>
              <option value="customer">Group by Tenant/Customer</option>
              <option value="none">Flat List (No Groups)</option>
            </select>

            {/* Expand / Collapse All Toggle Button */}
            {groupBy !== 'none' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                onClick={() => {
                  const anyExpanded = groupedData.some((g) => {
                    const collapsed = searchQuery.trim() !== ''
                      ? (collapsedGroups[g.key] === true)
                      : (collapsedGroups[g.key] !== undefined ? collapsedGroups[g.key] : true);
                    return !collapsed;
                  });
                  const next: Record<string, boolean> = {};
                  groupedData.forEach((g) => {
                    next[g.key] = anyExpanded; // If any are expanded, collapse all (true); else expand all (false)
                  });
                  setCollapsedGroups(next);
                }}
                title="Toggle expand/collapse all groups"
              >
                <span>
                  {groupedData.some((g) => {
                    const collapsed = searchQuery.trim() !== ''
                      ? (collapsedGroups[g.key] === true)
                      : (collapsedGroups[g.key] !== undefined ? collapsedGroups[g.key] : true);
                    return !collapsed;
                  })
                    ? 'Collapse All'
                    : 'Expand All'}
                </span>
              </button>
            )}

            {/* Sort Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              <option value="requirement">Sort: Required Missing First</option>
              <option value="key-asc">Sort: Secret Key (A-Z)</option>
              <option value="key-desc">Sort: Secret Key (Z-A)</option>
              <option value="category">Sort: Category Name</option>
              <option value="status">Sort: Configured First</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills (Smooth Touch Horizontal Scroll) */}
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            paddingBottom: '2px',
          }}
        >
          {categories.map((cat) => {
            const countInfo = categoryCounts[cat] || { total: 0, missing: 0 };
            const isSelected = selectedCategory === cat;

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  borderRadius: 'var(--radius-full)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  fontSize: '0.775rem',
                  padding: '0.35rem 0.75rem',
                }}
              >
                {cat !== 'ALL' && <ThemeIcon name={getCategoryIcon(cat) as any} size={13} />}
                <span>{cat}</span>
                <span
                  style={{
                    fontSize: '0.675rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.2)' : 'var(--bg-main)',
                    color: 'inherit',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                  }}
                >
                  {countInfo.total}
                </span>
                {countInfo.missing > 0 && (
                  <span
                    style={{
                      fontSize: '0.625rem',
                      padding: '1px 5px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(244, 63, 94, 0.35)' : 'rgba(244, 63, 94, 0.15)',
                      color: isSelected ? '#FFFFFF' : 'var(--rose-bright)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                    }}
                    title={`${countInfo.missing} missing secrets`}
                  >
                    {countInfo.missing} missing
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filter Indicators & Result Summary */}
      {(selectedCategory !== 'ALL' || statusFilter !== 'ALL' || sourceFilter !== 'ALL' || searchQuery) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            padding: '0 0.25rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            Showing <strong>{filteredSecrets.length}</strong> of {secrets.length} secrets
            {selectedCategory !== 'ALL' && <span> in <strong>{selectedCategory}</strong></span>}
            {statusFilter !== 'ALL' && <span> with status <strong>{statusFilter}</strong></span>}
            {searchQuery && <span> matching <strong>"{searchQuery}"</strong></span>}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '2px 8px', fontSize: '0.725rem' }}
            onClick={() => {
              setSelectedCategory('ALL');
              setStatusFilter('ALL');
              setSourceFilter('ALL');
              setSearchQuery('');
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Empty State */}
      {filteredSecrets.length === 0 && (
        <div
          className="glass-card"
          style={{
            padding: '3.5rem 1.5rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <ThemeIcon name="search" size={32} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            No secrets found
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', maxWidth: '400px' }}>
            No Secret Manager credentials match your active category, status, or search query filters.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '0.5rem' }}
            onClick={() => {
              setSelectedCategory('ALL');
              setStatusFilter('ALL');
              setSourceFilter('ALL');
              setSearchQuery('');
            }}
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* =========================================================================
          GROUPED SECRET RENDERING (BY CATEGORY, CUSTOMER, OR FLAT)
          ========================================================================= */}
      {groupedData.map((group) => {
        const isCollapsed = searchQuery.trim() !== ''
          ? (collapsedGroups[group.key] === true)
          : (collapsedGroups[group.key] !== undefined ? collapsedGroups[group.key] : true);
        const groupConfiguredCount = group.secrets.filter((s) => s.isConfigured).length;
        const groupTotalCount = group.secrets.length;
        const groupMissingCount = groupTotalCount - groupConfiguredCount;

        if (group.secrets.length === 0) return null;

        return (
          <div key={group.key} className="secrets-section-group">
            {/* Group Header (if grouping enabled) */}
            {groupBy !== 'none' && (
              <div className="secrets-section-header" onClick={() => toggleGroupCollapse(group.key)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <ThemeIcon name={group.icon as any} size={16} />
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          margin: 0,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {group.title}
                      </h3>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'nowrap' }}>
                        <span
                          className="badge badge-muted"
                          style={{
                            fontSize: '0.675rem',
                            padding: '2px 7px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            textTransform: 'none',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {groupConfiguredCount}/{groupTotalCount} configured
                        </span>

                        {groupMissingCount > 0 && (
                          <span
                            className="badge badge-rose"
                            style={{
                              fontSize: '0.675rem',
                              padding: '2px 7px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              textTransform: 'none',
                              letterSpacing: '0.02em',
                            }}
                          >
                            <span className="pulse-dot" />
                            {groupMissingCount} missing
                          </span>
                        )}
                      </div>
                    </div>

                    {group.subtitle && (
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {group.subtitle}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
                  <span
                    style={{
                      display: 'inline-block',
                      transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                      transition: 'transform 0.15s ease',
                      fontSize: '0.7rem',
                    }}
                  >
                    ▾
                  </span>
                </div>
              </div>
            )}

            {/* Group Body */}
            {!isCollapsed && (
              <div className="secrets-section-body">
                {/* -----------------------------------------------------------------
                    VIEW MODE 1: STRUCTURED CARDS GRID (DEFAULT & MOBILE READY)
                    ----------------------------------------------------------------- */}
                {viewMode === 'cards' ? (
                  <div className="secrets-cards-grid">
                    {group.secrets.map((secret) => (
                      <div
                        key={secret.key}
                        className={`secret-vault-card ${
                          secret.isConfigured ? 'card-configured' : 'card-missing'
                        }`}
                      >
                        {/* Top Secret Key + Copy Button + Status Badge */}
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: '0.5rem',
                              marginBottom: '0.5rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span
                                className="code-font"
                                style={{
                                  fontWeight: 700,
                                  color: 'var(--text-primary)',
                                  fontSize: '0.875rem',
                                  wordBreak: 'break-all',
                                }}
                              >
                                {secret.key}
                              </span>

                              <button
                                onClick={(e) => handleCopyKey(secret.key, e)}
                                title="Copy Secret Key Name"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '4px',
                                  padding: '2px 5px',
                                  cursor: 'pointer',
                                  color: copiedKey === secret.key ? 'var(--emerald-bright)' : 'var(--text-muted)',
                                  fontSize: '0.675rem',
                                  fontFamily: 'var(--font-mono)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <ThemeIcon name={copiedKey === secret.key ? 'check' : 'document'} size={10} />
                                <span>{copiedKey === secret.key ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>

                            <div>
                              {secret.isConfigured ? (
                                <span className="badge badge-emerald" style={{ fontSize: '0.675rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  <span className="pulse-dot" />
                                  CONFIGURED
                                </span>
                              ) : (
                                <span className="badge badge-rose" style={{ fontSize: '0.675rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  <span className="pulse-dot" />
                                  MISSING
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Category & Tenant Badges */}
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                            <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.675rem' }}>
                              <ThemeIcon name={getCategoryIcon(secret.category) as any} size={10} />
                              <span>{secret.category}</span>
                            </span>

                            {secret.required ? (
                              <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                REQUIRED
                              </span>
                            ) : (
                              <span className="badge badge-muted" style={{ fontSize: '0.65rem', padding: '1px 5px', opacity: 0.7 }}>
                                OPTIONAL
                              </span>
                            )}

                            {secret.isCustomInstance && (
                              <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                {secret.customerName || 'Customer Instance'}
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <p
                            style={{
                              margin: 0,
                              color: 'var(--text-secondary)',
                              fontSize: '0.8rem',
                              lineHeight: 1.45,
                              minHeight: '2.8em',
                            }}
                          >
                            {secret.description}
                          </p>
                        </div>

                        {/* Bottom Storage Source + Action Button */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem',
                            paddingTop: '0.65rem',
                            borderTop: '1px solid var(--border-subtle)',
                            marginTop: '0.35rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <ThemeIcon
                                name={secret.status === 'SECRET_MANAGER' ? 'shield' : secret.status === 'ENVIRONMENT' ? 'cog' : 'alert'}
                                size={12}
                              />
                              <span>
                                {secret.status === 'SECRET_MANAGER'
                                  ? 'GCP Secret Manager'
                                  : secret.status === 'ENVIRONMENT'
                                  ? 'Environment Variable'
                                  : 'Not Initialized'}
                              </span>
                            </span>

                            {secret.required && !secret.isConfigured && (
                              <span style={{ color: 'var(--rose-bright)', fontWeight: 600, fontSize: '0.7rem' }}>
                                Action Required
                              </span>
                            )}
                          </div>

                          <button
                            className={`btn btn-sm ${!secret.isConfigured ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => onOpenUpdateModal(secret)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem',
                              padding: '0.55rem 0.85rem',
                            }}
                          >
                            <ThemeIcon name={!secret.isConfigured ? 'plus' : 'edit'} size={13} />
                            <span>
                              {!secret.isConfigured ? 'Initialize in Secret Manager' : 'Update Secret Value'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* -----------------------------------------------------------------
                      VIEW MODE 2: CLASSIC DATA TABLE
                      ----------------------------------------------------------------- */
                  <div className="table-container" style={{ margin: 0 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>SECRET KEY</th>
                          <th>CATEGORY & CUSTOMER</th>
                          <th>PURPOSE & USAGE</th>
                          <th>STATUS</th>
                          <th>STORAGE SOURCE</th>
                          <th style={{ textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.secrets.map((secret) => (
                          <tr key={secret.key}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span className="code-font" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {secret.key}
                                </span>
                                <button
                                  onClick={(e) => handleCopyKey(secret.key, e)}
                                  title="Copy Secret Key"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: copiedKey === secret.key ? 'var(--emerald-bright)' : 'var(--text-muted)',
                                    padding: '2px',
                                  }}
                                >
                                  <ThemeIcon name={copiedKey === secret.key ? 'check' : 'document'} size={11} />
                                </button>
                                {secret.required && (
                                  <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                    REQUIRED
                                  </span>
                                )}
                              </div>
                            </td>

                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                                <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <ThemeIcon name={getCategoryIcon(secret.category) as any} size={11} />
                                  <span>{secret.category}</span>
                                </span>
                                {secret.isCustomInstance && (
                                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                    {secret.customerName || 'Customer'}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={{ maxWidth: '340px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                              {secret.description}
                            </td>

                            <td>
                              {secret.isConfigured ? (
                                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                                  <span className="pulse-dot" />
                                  CONFIGURED
                                </span>
                              ) : (
                                <span className="badge badge-rose" style={{ fontSize: '0.7rem' }}>
                                  <span className="pulse-dot" />
                                  MISSING
                                </span>
                              )}
                            </td>

                            <td style={{ fontSize: '0.775rem' }}>
                              {secret.status === 'SECRET_MANAGER' && (
                                <span style={{ color: 'var(--accent-bright)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <ThemeIcon name="shield" size={12} />
                                  <span>GCP Secret Manager</span>
                                </span>
                              )}
                              {secret.status === 'ENVIRONMENT' && (
                                <span style={{ color: 'var(--amber-bright)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <ThemeIcon name="cog" size={12} />
                                  <span>Environment</span>
                                </span>
                              )}
                              {secret.status === 'MISSING' && (
                                <span style={{ color: 'var(--text-dim)' }}>— (Not initialized)</span>
                              )}
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <button
                                className={`btn btn-sm ${!secret.isConfigured ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => onOpenUpdateModal(secret)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                              >
                                <ThemeIcon name={!secret.isConfigured ? 'plus' : 'edit'} size={12} />
                                <span>{!secret.isConfigured ? 'Initialize' : 'Update'}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
