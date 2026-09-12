import React, { useState, useEffect, useMemo } from 'react';
import { UserAccessItem, ServiceId } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface UsersPageProps {
  users: UserAccessItem[];
  currentUserEmail: string;
  onOpenAddModal: () => void;
  onOpenEditModal: (user: UserAccessItem) => void;
  onToggleUser: (email: string, isEnabled: boolean) => Promise<void>;
  onDeleteUser: (email: string) => Promise<void>;
  onRevokeUserSessions?: (email: string) => Promise<void>;
  onRevokeAllSessions: () => Promise<void>;
  onUpdatePermissions?: (
    email: string,
    permissions: {
      fullName?: string;
      isAdmin?: boolean;
      allowedServices?: ServiceId[];
      readOnlyOnly?: boolean;
    }
  ) => Promise<void>;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

type ViewMode = 'cards' | 'table';
type GroupByMode = 'role' | 'status' | 'restriction' | 'none';
type StatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';
type RoleFilter = 'ALL' | 'ADMIN' | 'MEMBER';
type RestrictionFilter = 'ALL' | 'READ_ONLY' | 'FULL_EXECUTION';
type SortOption = 'role' | 'name-asc' | 'email-asc' | 'status';

const ALL_SERVICES: { id: ServiceId; label: string; icon: any }[] = [
  { id: 'xero', label: 'Xero', icon: 'xero' },
  { id: 'bigquery', label: 'BigQuery', icon: 'bigquery' },
  { id: 'firestore', label: 'Firestore', icon: 'firestore' },
  { id: 'sagehr', label: 'Sage HR', icon: 'sagehr' },
  { id: 'slack', label: 'Slack', icon: 'slack' },
];

export const UsersPage: React.FC<UsersPageProps> = ({
  users,
  currentUserEmail,
  onOpenAddModal,
  onOpenEditModal,
  onToggleUser,
  onDeleteUser,
  onRevokeUserSessions,
  onRevokeAllSessions,
  onUpdatePermissions,
  onShowToast,
}) => {
  // View & Structure states with persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('mcp_users_view_mode') as ViewMode) || 'cards';
    } catch {
      return 'cards';
    }
  });

  const [groupBy, setGroupBy] = useState<GroupByMode>('role');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filter & Search states
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [restrictionFilter, setRestrictionFilter] = useState<RestrictionFilter>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('role');

  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Persist viewMode
  useEffect(() => {
    try {
      localStorage.setItem('mcp_users_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.isEnabled).length;
  const adminUsers = users.filter((u) => u.isAdmin).length;
  const memberUsers = totalUsers - adminUsers;
  const readOnlyUsers = users.filter((u) => u.readOnlyOnly).length;

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const handleToggle = async (email: string, isEnabled: boolean) => {
    try {
      setTogglingEmail(email);
      await onToggleUser(email, isEnabled);
      if (onShowToast) {
        onShowToast(`User account ${email} ${isEnabled ? 'enabled' : 'disabled'}`, 'info');
      }
    } finally {
      setTogglingEmail(null);
    }
  };

  const handleToggleRole = async (user: UserAccessItem) => {
    if (!onUpdatePermissions) return;
    try {
      setUpdatingKey(`${user.userEmail}_role`);
      const newAdminState = !user.isAdmin;
      await onUpdatePermissions(user.userEmail, { isAdmin: newAdminState });
      if (onShowToast) {
        onShowToast(`Role updated to ${newAdminState ? 'Admin' : 'Member'} for ${user.userEmail}`, 'success');
      }
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleToggleRestrictions = async (user: UserAccessItem) => {
    if (!onUpdatePermissions) return;
    try {
      setUpdatingKey(`${user.userEmail}_ro`);
      const newRo = !user.readOnlyOnly;
      await onUpdatePermissions(user.userEmail, { readOnlyOnly: newRo });
      if (onShowToast) {
        onShowToast(`Access mode set to ${newRo ? 'Read-Only' : 'Full Execution'} for ${user.userEmail}`, 'info');
      }
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleToggleServiceChip = async (user: UserAccessItem, serviceId: ServiceId) => {
    if (!onUpdatePermissions) return;
    const currentServices = user.allowedServices || [];
    const isCurrentlyAllowed = currentServices.includes(serviceId);
    const updatedServices = isCurrentlyAllowed
      ? currentServices.filter((s) => s !== serviceId)
      : [...currentServices, serviceId];

    try {
      setUpdatingKey(`${user.userEmail}_${serviceId}`);
      await onUpdatePermissions(user.userEmail, { allowedServices: updatedServices });
      if (onShowToast) {
        onShowToast(`${isCurrentlyAllowed ? 'Removed' : 'Granted'} ${serviceId.toUpperCase()} access for ${user.userEmail}`, 'info');
      }
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleRevokeUser = async (email: string) => {
    if (!onRevokeUserSessions) return;
    if (window.confirm(`Kick out and immediately revoke all active sessions for ${email}?`)) {
      try {
        setRevoking(true);
        await onRevokeUserSessions(email);
        if (onShowToast) {
          onShowToast(`Active sessions revoked for ${email}`, 'info');
        }
      } catch (err: any) {
        if (onShowToast) {
          onShowToast(`Failed to revoke sessions: ${err.message}`, 'error');
        }
      } finally {
        setRevoking(false);
      }
    }
  };

  const handleRevokeAll = async () => {
    if (window.confirm('Are you sure you want to revoke all active admin sessions? You will need to log back in.')) {
      try {
        setRevoking(true);
        await onRevokeAllSessions();
        if (onShowToast) {
          onShowToast('All active sessions revoked', 'info');
        }
      } finally {
        setRevoking(false);
      }
    }
  };

  // Filter and Sort Pipeline
  const filteredUsers = useMemo(() => {
    return users
      .filter((u) => {
        // Role filter
        if (roleFilter === 'ADMIN' && !u.isAdmin) return false;
        if (roleFilter === 'MEMBER' && u.isAdmin) return false;

        // Status filter
        if (statusFilter === 'ACTIVE' && !u.isEnabled) return false;
        if (statusFilter === 'DISABLED' && u.isEnabled) return false;

        // Restriction filter
        if (restrictionFilter === 'READ_ONLY' && !u.readOnlyOnly) return false;
        if (restrictionFilter === 'FULL_EXECUTION' && u.readOnlyOnly) return false;

        // Connector access filter
        if (serviceFilter !== 'ALL' && (!u.allowedServices || !u.allowedServices.includes(serviceFilter as ServiceId))) {
          return false;
        }

        // Search query
        const q = searchQuery.toLowerCase().trim();
        if (q) {
          const matchesName = u.fullName.toLowerCase().includes(q);
          const matchesEmail = u.userEmail.toLowerCase().includes(q);
          const matchesService = (u.allowedServices || []).some((s) => s.toLowerCase().includes(q));
          if (!matchesName && !matchesEmail && !matchesService) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'role') {
          if (a.isAdmin && !b.isAdmin) return -1;
          if (!a.isAdmin && b.isAdmin) return 1;
          return a.fullName.localeCompare(b.fullName);
        } else if (sortOption === 'name-asc') {
          return a.fullName.localeCompare(b.fullName);
        } else if (sortOption === 'email-asc') {
          return a.userEmail.localeCompare(b.userEmail);
        } else if (sortOption === 'status') {
          if (a.isEnabled && !b.isEnabled) return -1;
          if (!a.isEnabled && b.isEnabled) return 1;
          return a.fullName.localeCompare(b.fullName);
        }
        return 0;
      });
  }, [users, roleFilter, statusFilter, restrictionFilter, serviceFilter, searchQuery, sortOption]);

  // Grouped Data Structures
  const groupedData = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'ALL', title: 'All Authorized Users', users: filteredUsers, icon: 'users' }];
    }

    const map = new Map<string, { key: string; title: string; users: UserAccessItem[]; icon: string; subtitle?: string }>();

    filteredUsers.forEach((u) => {
      let groupKey = 'Members';
      let icon = 'users';
      let subtitle: string | undefined;

      if (groupBy === 'role') {
        groupKey = u.isAdmin ? 'Administrators' : 'Members';
        icon = u.isAdmin ? 'shield' : 'users';
        subtitle = u.isAdmin ? 'Full platform governance & configuration access' : 'Restricted tool execution permissions';
      } else if (groupBy === 'status') {
        groupKey = u.isEnabled ? 'Active Accounts' : 'Disabled Accounts';
        icon = u.isEnabled ? 'check' : 'alert';
        subtitle = u.isEnabled ? 'Accounts permitted to authenticate and call MCP tools' : 'Revoked / blocked access';
      } else if (groupBy === 'restriction') {
        groupKey = u.readOnlyOnly ? 'Read-Only Enforced' : 'Full Tool Execution';
        icon = u.readOnlyOnly ? 'secrets' : 'lightning';
        subtitle = u.readOnlyOnly ? 'Restricted to analytical and read queries only' : 'Permitted to trigger write/mutation actions';
      }

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          title: groupKey,
          users: [],
          icon,
          subtitle,
        });
      }
      map.get(groupKey)!.users.push(u);
    });

    return Array.from(map.values());
  }, [filteredUsers, groupBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="users" size={24} />
            <h2>Access Governance & Tool Permissions</h2>
          </div>
          <p>
            Manage authorized teammates, restrict SaaS connector scopes, and enforce read-only tool guardrails with 1-click inline editing.
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

          <button className="btn btn-danger btn-sm" onClick={handleRevokeAll} disabled={revoking}>
            <ThemeIcon name="alert" size={13} />
            <span>{revoking ? 'Revoking Sessions...' : 'Revoke All Sessions'}</span>
          </button>

          <button className="btn btn-primary btn-sm" onClick={onOpenAddModal}>
            <ThemeIcon name="plus" size={13} />
            <span>Add User Access</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Stats (Clickable to Filter) */}
      <div className="stats-grid">
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setRoleFilter('ALL');
            setStatusFilter('ALL');
            setRestrictionFilter('ALL');
          }}
          title="Click to reset user filters"
        >
          <div className="stat-icon cyan">
            <ThemeIcon name="users" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalUsers}</div>
            <div className="stat-label">REGISTERED USERS</div>
          </div>
        </div>

        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
          title="Click to toggle active platform accounts filter"
        >
          <div className="stat-icon emerald">
            <ThemeIcon name="check" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{activeUsers}</div>
            <div className="stat-label">ACTIVE ACCOUNTS</div>
          </div>
        </div>

        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setRoleFilter(roleFilter === 'ADMIN' ? 'ALL' : 'ADMIN')}
          title="Click to toggle portal administrators filter"
        >
          <div className="stat-icon indigo">
            <ThemeIcon name="shield" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{adminUsers}</div>
            <div className="stat-label">PORTAL ADMINISTRATORS</div>
          </div>
        </div>

        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setRestrictionFilter(restrictionFilter === 'READ_ONLY' ? 'ALL' : 'READ_ONLY')}
          title="Click to toggle read-only enforced users filter"
        >
          <div className="stat-icon amber">
            <ThemeIcon name="secrets" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{readOnlyUsers}</div>
            <div className="stat-label">READ-ONLY ENFORCED</div>
          </div>
        </div>
      </div>

      {/* Filter & Structure Toolbar */}
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
        {/* Top Controls: Search, Status, Role, Group By, Sort */}
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
              placeholder="Search by name, email, connector..."
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
              <option value="ALL">All Statuses ({totalUsers})</option>
              <option value="ACTIVE">Active Accounts Only ({activeUsers})</option>
              <option value="DISABLED">Disabled Accounts Only ({totalUsers - activeUsers})</option>
            </select>

            {/* Role Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admins Only ({adminUsers})</option>
              <option value="MEMBER">Members Only ({memberUsers})</option>
            </select>

            {/* Restrictions Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={restrictionFilter}
              onChange={(e) => setRestrictionFilter(e.target.value as RestrictionFilter)}
            >
              <option value="ALL">All Permissions</option>
              <option value="READ_ONLY">Read-Only Enforced ({readOnlyUsers})</option>
              <option value="FULL_EXECUTION">Full Execution Access ({totalUsers - readOnlyUsers})</option>
            </select>

            {/* Connector Scope Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            >
              <option value="ALL">All Connectors</option>
              <option value="xero">Xero Authorized</option>
              <option value="bigquery">BigQuery Authorized</option>
              <option value="firestore">Firestore Authorized</option>
              <option value="sagehr">Sage HR Authorized</option>
            </select>

            {/* Group By Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
            >
              <option value="role">Group by Role</option>
              <option value="status">Group by Account Status</option>
              <option value="restriction">Group by Restrictions</option>
              <option value="none">Flat List (No Groups)</option>
            </select>

            {/* Sort Dropdown */}
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              <option value="role">Sort: Admins First</option>
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="email-asc">Sort: Email (A-Z)</option>
              <option value="status">Sort: Active Accounts First</option>
            </select>
          </div>
        </div>

        {/* Role & Scope Quick Pills */}
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
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`btn btn-sm ${roleFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
          >
            <span>All Users</span>
            <span style={{ fontSize: '0.675rem', padding: '1px 6px', borderRadius: '10px', backgroundColor: roleFilter === 'ALL' ? 'rgba(255,255,255,0.2)' : 'var(--bg-main)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {totalUsers}
            </span>
          </button>

          <button
            onClick={() => setRoleFilter(roleFilter === 'ADMIN' ? 'ALL' : 'ADMIN')}
            className={`btn btn-sm ${roleFilter === 'ADMIN' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
          >
            <ThemeIcon name="shield" size={13} />
            <span>Administrators</span>
            <span style={{ fontSize: '0.675rem', padding: '1px 6px', borderRadius: '10px', backgroundColor: roleFilter === 'ADMIN' ? 'rgba(255,255,255,0.2)' : 'var(--bg-main)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {adminUsers}
            </span>
          </button>

          <button
            onClick={() => setRoleFilter(roleFilter === 'MEMBER' ? 'ALL' : 'MEMBER')}
            className={`btn btn-sm ${roleFilter === 'MEMBER' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
          >
            <ThemeIcon name="users" size={13} />
            <span>Members</span>
            <span style={{ fontSize: '0.675rem', padding: '1px 6px', borderRadius: '10px', backgroundColor: roleFilter === 'MEMBER' ? 'rgba(255,255,255,0.2)' : 'var(--bg-main)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {memberUsers}
            </span>
          </button>

          {ALL_SERVICES.map((srv) => {
            const count = users.filter((u) => u.allowedServices?.includes(srv.id)).length;
            const isSelected = serviceFilter === srv.id;

            return (
              <button
                key={srv.id}
                onClick={() => setServiceFilter(isSelected ? 'ALL' : srv.id)}
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 'var(--radius-full)', padding: '0.35rem 0.75rem', fontSize: '0.775rem', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <ThemeIcon name={srv.icon} size={13} />
                <span>{srv.label} Scope</span>
                <span style={{ fontSize: '0.675rem', padding: '1px 6px', borderRadius: '10px', backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--bg-main)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filter Indicators & Result Summary */}
      {(roleFilter !== 'ALL' || statusFilter !== 'ALL' || restrictionFilter !== 'ALL' || serviceFilter !== 'ALL' || searchQuery) && (
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
            Showing <strong>{filteredUsers.length}</strong> of {totalUsers} authorized users
            {roleFilter !== 'ALL' && <span> with role <strong>{roleFilter}</strong></span>}
            {statusFilter !== 'ALL' && <span> with status <strong>{statusFilter}</strong></span>}
            {restrictionFilter !== 'ALL' && <span> with restriction <strong>{restrictionFilter}</strong></span>}
            {serviceFilter !== 'ALL' && <span> allowed on <strong>{serviceFilter.toUpperCase()}</strong></span>}
            {searchQuery && <span> matching <strong>"{searchQuery}"</strong></span>}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '2px 8px', fontSize: '0.725rem' }}
            onClick={() => {
              setRoleFilter('ALL');
              setStatusFilter('ALL');
              setRestrictionFilter('ALL');
              setServiceFilter('ALL');
              setSearchQuery('');
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Empty State */}
      {filteredUsers.length === 0 && (
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
          <ThemeIcon name="users" size={32} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            No authorized users found
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', maxWidth: '400px' }}>
            No user accounts match your active role, status, connector, or search query filters.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '0.5rem' }}
            onClick={() => {
              setRoleFilter('ALL');
              setStatusFilter('ALL');
              setRestrictionFilter('ALL');
              setServiceFilter('ALL');
              setSearchQuery('');
            }}
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* =========================================================================
          GROUPED USERS RENDERING (BY ROLE, STATUS, RESTRICTION, OR FLAT)
          ========================================================================= */}
      {groupedData.map((group) => {
        const isCollapsed = collapsedGroups[group.key] || false;
        const groupActiveCount = group.users.filter((u) => u.isEnabled).length;
        const groupTotalCount = group.users.length;

        if (group.users.length === 0) return null;

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
                          {groupTotalCount} {groupTotalCount === 1 ? 'user' : 'users'}
                        </span>

                        <span
                          className="badge badge-emerald"
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
                          {groupActiveCount} active
                        </span>
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
                  <div className="users-cards-grid">
                    {group.users.map((user) => {
                      const isSelf = user.userEmail.toLowerCase() === currentUserEmail.toLowerCase();
                      const isToggling = togglingEmail === user.userEmail;

                      return (
                        <div
                          key={user.userEmail}
                          className={`user-access-card ${
                            !user.isEnabled
                              ? 'card-disabled'
                              : user.isAdmin
                              ? 'card-admin'
                              : 'card-member'
                          }`}
                        >
                          {/* Top Identity & 1-Click Role Toggle */}
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                marginBottom: '0.75rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                                <div
                                  className="user-avatar"
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    fontSize: '0.9rem',
                                    flexShrink: 0,
                                  }}
                                >
                                  {user.fullName
                                    ? user.fullName.charAt(0).toUpperCase()
                                    : user.userEmail.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      color: 'var(--text-primary)',
                                      fontSize: '0.9rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <span>{user.fullName}</span>
                                    {isSelf && (
                                      <span
                                        className="badge badge-cyan"
                                        style={{ fontSize: '0.6rem', padding: '1px 5px' }}
                                      >
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      color: 'var(--text-muted)',
                                      fontSize: '0.75rem',
                                      fontFamily: 'var(--font-mono)',
                                      wordBreak: 'break-all',
                                    }}
                                  >
                                    {user.userEmail}
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => !isSelf && handleToggleRole(user)}
                                disabled={isSelf || updatingKey === `${user.userEmail}_role`}
                                className={`badge ${user.isAdmin ? 'badge-cyan' : 'badge-muted'}`}
                                style={{
                                  cursor: isSelf ? 'default' : 'pointer',
                                  border: 'none',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                  padding: '0.25rem 0.6rem',
                                }}
                                title={isSelf ? 'Cannot modify your own admin status' : 'Click to toggle Admin / Member role'}
                              >
                                <ThemeIcon name={user.isAdmin ? 'shield' : 'users'} size={11} />
                                <span>{user.isAdmin ? 'ADMIN' : 'MEMBER'}</span>
                                {!isSelf && <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>▾</span>}
                              </button>
                            </div>

                            {/* Status and Restrictions 1-Click Toggles */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                flexWrap: 'wrap',
                                padding: '0.5rem 0',
                                borderTop: '1px solid var(--border-subtle)',
                                borderBottom: '1px solid var(--border-subtle)',
                                marginBottom: '0.75rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <label className="switch-container">
                                  <input
                                    type="checkbox"
                                    className="switch-input"
                                    checked={user.isEnabled}
                                    disabled={isSelf || isToggling}
                                    onChange={(e) => handleToggle(user.userEmail, e.target.checked)}
                                  />
                                  <span className="switch-slider" />
                                </label>
                                <button
                                  onClick={() => !isSelf && handleToggle(user.userEmail, !user.isEnabled)}
                                  disabled={isSelf || isToggling}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: isSelf ? 'default' : 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: user.isEnabled ? 'var(--emerald-bright)' : 'var(--rose-bright)',
                                    padding: 0,
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  {user.isEnabled ? 'Active' : 'Disabled'}
                                </button>
                              </div>

                              <button
                                onClick={() => handleToggleRestrictions(user)}
                                disabled={updatingKey === `${user.userEmail}_ro`}
                                className={`badge ${user.readOnlyOnly ? 'badge-amber' : 'badge-muted'}`}
                                style={{ cursor: 'pointer', border: 'none', padding: '0.25rem 0.55rem' }}
                                title="Click to toggle Read-Only vs Full Execution"
                              >
                                <ThemeIcon name={user.readOnlyOnly ? 'secrets' : 'lightning'} size={11} />
                                <span>{user.readOnlyOnly ? 'Read-Only' : 'Full Access'}</span>
                                <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>▾</span>
                              </button>
                            </div>

                            {/* SaaS Connector Permissions (1-Click Chips) */}
                            <div>
                              <div
                                style={{
                                  fontSize: '0.675rem',
                                  color: 'var(--text-muted)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  marginBottom: '0.35rem',
                                  fontWeight: 700,
                                }}
                              >
                                Allowed Connectors (1-Click Toggle)
                              </div>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {ALL_SERVICES.map((srv) => {
                                  const isAllowed = user.allowedServices?.includes(srv.id);
                                  const isChipUpdating = updatingKey === `${user.userEmail}_${srv.id}`;

                                  return (
                                    <button
                                      key={srv.id}
                                      disabled={isChipUpdating}
                                      onClick={() => handleToggleServiceChip(user, srv.id)}
                                      className={`badge ${isAllowed ? 'badge-emerald' : 'badge-muted'}`}
                                      style={{
                                        cursor: 'pointer',
                                        opacity: isAllowed ? 1 : 0.5,
                                        padding: '0.25rem 0.55rem',
                                        fontSize: '0.725rem',
                                        transition: 'all 0.15s ease',
                                      }}
                                      title={`Click to ${isAllowed ? 'revoke' : 'grant'} ${srv.label} access`}
                                    >
                                      <ThemeIcon name={srv.icon} size={11} />
                                      <span>{srv.label}</span>
                                      <span style={{ fontSize: '0.65rem', fontWeight: 800 }}>
                                        {isAllowed ? '✓' : '+'}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Action Row */}
                          <div
                            style={{
                              display: 'flex',
                              gap: '0.4rem',
                              paddingTop: '0.75rem',
                              borderTop: '1px solid var(--border-subtle)',
                              marginTop: '0.5rem',
                            }}
                          >
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                              onClick={() => onOpenEditModal(user)}
                            >
                              <ThemeIcon name="edit" size={12} />
                              <span>Edit</span>
                            </button>

                            {!isSelf && onRevokeUserSessions && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleRevokeUser(user.userEmail)}
                                disabled={revoking}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.3rem',
                                  padding: '0.35rem 0.6rem',
                                  color: 'var(--amber-bright)',
                                  borderColor: 'rgba(245, 158, 11, 0.3)',
                                }}
                                title="Kick out user and revoke active sessions immediately"
                              >
                                <ThemeIcon name="logout" size={12} />
                                <span>Kick Out</span>
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  if (window.confirm(`Delete user access for ${user.userEmail}?`)) {
                                    onDeleteUser(user.userEmail);
                                  }
                                }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', padding: 0 }}
                                title="Delete User Access"
                              >
                                <ThemeIcon name="trash" size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* -----------------------------------------------------------------
                      VIEW MODE 2: CLASSIC DATA TABLE
                      ----------------------------------------------------------------- */
                  <div className="table-container" style={{ margin: 0 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>USER IDENTITY</th>
                          <th>ROLE (CLICK TO TOGGLE)</th>
                          <th>PLATFORM STATUS</th>
                          <th>ALLOWED SAAS SERVICES (CLICK TO TOGGLE)</th>
                          <th>RESTRICTIONS (CLICK TO TOGGLE)</th>
                          <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.users.map((user) => {
                          const isSelf = user.userEmail.toLowerCase() === currentUserEmail.toLowerCase();
                          const isToggling = togglingEmail === user.userEmail;

                          return (
                            <tr key={user.userEmail}>
                              {/* User Identity */}
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '0.85rem' }}>
                                    {user.fullName
                                      ? user.fullName.charAt(0).toUpperCase()
                                      : user.userEmail.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span>{user.fullName}</span>
                                      {isSelf && (
                                        <span className="badge badge-cyan" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                                          YOU
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                                      {user.userEmail}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 1-Click Inline Role Toggle */}
                              <td>
                                <button
                                  onClick={() => !isSelf && handleToggleRole(user)}
                                  disabled={isSelf || updatingKey === `${user.userEmail}_role`}
                                  className={`badge ${user.isAdmin ? 'badge-cyan' : 'badge-muted'}`}
                                  style={{
                                    cursor: isSelf ? 'default' : 'pointer',
                                    border: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.3rem 0.65rem',
                                  }}
                                  title={isSelf ? 'Cannot modify your own admin status' : 'Click to toggle Admin / Member role'}
                                >
                                  <ThemeIcon name={user.isAdmin ? 'shield' : 'users'} size={12} />
                                  <span>{user.isAdmin ? 'ADMIN' : 'MEMBER'}</span>
                                  {!isSelf && <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>▾</span>}
                                </button>
                              </td>

                              {/* 1-Click Platform Status Toggle */}
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                  <label className="switch-container">
                                    <input
                                      type="checkbox"
                                      className="switch-input"
                                      checked={user.isEnabled}
                                      disabled={isSelf || isToggling}
                                      onChange={(e) => handleToggle(user.userEmail, e.target.checked)}
                                    />
                                    <span className="switch-slider" />
                                  </label>
                                  <button
                                    onClick={() => !isSelf && handleToggle(user.userEmail, !user.isEnabled)}
                                    disabled={isSelf || isToggling}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      cursor: isSelf ? 'default' : 'pointer',
                                      fontSize: '0.8rem',
                                      fontWeight: 600,
                                      color: user.isEnabled ? 'var(--emerald-bright)' : 'var(--rose-bright)',
                                      padding: 0,
                                    }}
                                  >
                                    {user.isEnabled ? 'Active' : 'Disabled'}
                                  </button>
                                </div>
                              </td>

                              {/* 1-Click Inline SaaS Service Chips */}
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                  {ALL_SERVICES.map((srv) => {
                                    const isAllowed = user.allowedServices?.includes(srv.id);
                                    const isChipUpdating = updatingKey === `${user.userEmail}_${srv.id}`;

                                    return (
                                      <button
                                        key={srv.id}
                                        disabled={isChipUpdating}
                                        onClick={() => handleToggleServiceChip(user, srv.id)}
                                        className={`badge ${isAllowed ? 'badge-emerald' : 'badge-muted'}`}
                                        style={{
                                          cursor: 'pointer',
                                          opacity: isAllowed ? 1 : 0.45,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.3rem',
                                          padding: '0.25rem 0.55rem',
                                          fontSize: '0.725rem',
                                        }}
                                        title={`Click to ${isAllowed ? 'remove' : 'grant'} access to ${srv.label}`}
                                      >
                                        <ThemeIcon name={srv.icon} size={11} />
                                        <span>{srv.label}</span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 800 }}>
                                          {isAllowed ? '✓' : '+'}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>

                              {/* 1-Click Inline Restrictions Toggle */}
                              <td>
                                <button
                                  onClick={() => handleToggleRestrictions(user)}
                                  disabled={updatingKey === `${user.userEmail}_ro`}
                                  className={`badge ${user.readOnlyOnly ? 'badge-amber' : 'badge-muted'}`}
                                  style={{
                                    cursor: 'pointer',
                                    border: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.3rem 0.65rem',
                                  }}
                                  title="Click to toggle Read-Only vs Full Execution"
                                >
                                  <ThemeIcon name={user.readOnlyOnly ? 'secrets' : 'lightning'} size={12} />
                                  <span>{user.readOnlyOnly ? 'Read-Only' : 'Full Access'}</span>
                                  <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>▾</span>
                                </button>
                              </td>

                              {/* Actions */}
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => onOpenEditModal(user)}
                                    title="Edit Details"
                                  >
                                    <ThemeIcon name="edit" size={12} />
                                    <span>Edit</span>
                                  </button>

                                  {!isSelf && onRevokeUserSessions && (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => handleRevokeUser(user.userEmail)}
                                      disabled={revoking}
                                      style={{
                                        color: 'var(--amber-bright)',
                                        borderColor: 'rgba(245, 158, 11, 0.3)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                      }}
                                      title="Kick out user and revoke all active sessions"
                                    >
                                      <ThemeIcon name="logout" size={12} />
                                      <span>Kick Out</span>
                                    </button>
                                  )}

                                  {!isSelf && (
                                    <button
                                      className="btn btn-danger btn-sm"
                                      onClick={() => {
                                        if (window.confirm(`Delete user access for ${user.userEmail}?`)) {
                                          onDeleteUser(user.userEmail);
                                        }
                                      }}
                                      title="Delete User Access"
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px' }}
                                    >
                                      <ThemeIcon name="trash" size={12} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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
