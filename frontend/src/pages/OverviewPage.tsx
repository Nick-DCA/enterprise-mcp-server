import React from 'react';
import {
  AuthProfile,
  ServiceConfig,
  SecretsStatusResponse,
  UserAccessItem,
  SecretItem,
} from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';
import { TabKey } from '../App.js';

interface OverviewPageProps {
  user: AuthProfile | null;
  services: ServiceConfig[];
  secretsData: SecretsStatusResponse | null;
  users: UserAccessItem[];
  onNavigateTab: (tab: TabKey) => void;
  onOpenAudit: () => void;
  onOpenAddInstanceModal: () => void;
  onOpenAddUserModal: () => void;
  onOpenSecretModal: (secret: SecretItem) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  user,
  services,
  secretsData,
  users,
  onNavigateTab,
  onOpenAudit,
  onOpenAddInstanceModal,
  onOpenAddUserModal,
  onOpenSecretModal,
}) => {
  // Service Metrics
  const totalServices = services.length;
  const activeServices = services.filter((s) => s.enabled).length;
  const xeroInstances = services.filter((s) => s.serviceId === 'xero');
  const bqInstances = services.filter((s) => s.serviceId === 'bigquery');
  const firestoreInstances = services.filter((s) => s.serviceId === 'firestore');
  const sageInstances = services.filter((s) => s.serviceId === 'sagehr');

  // Estimate total RPC methods
  let totalTools = 0;
  if (xeroInstances.some((s) => s.enabled)) totalTools += 25;
  if (bqInstances.some((s) => s.enabled)) totalTools += 5;
  if (firestoreInstances.some((s) => s.enabled)) totalTools += 6;
  if (sageInstances.some((s) => s.enabled)) totalTools += 12;

  // Secrets Metrics
  const totalSecrets = secretsData?.totalCount || 0;
  const configuredSecrets = secretsData?.configuredCount || 0;
  const requiredMissingCount = secretsData?.requiredMissingCount || 0;
  const secretsList = secretsData?.secrets || [];
  const missingRequiredSecrets = secretsList.filter((s) => s.required && !s.isConfigured);

  // IAM Metrics
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.isEnabled).length;
  const adminUsers = users.filter((u) => u.isAdmin).length;
  const readOnlyUsers = users.filter((u) => u.readOnlyOnly).length;

  const displayName = user?.fullName || user?.email?.split('@')[0] || 'Administrator';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* =========================================================================
          1. EXECUTIVE HERO BANNER & QUICK ACTIONS
          ========================================================================= */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              flexShrink: 0,
            }}
          >
            <ThemeIcon name="sparkles" size={20} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Welcome back, {displayName}
              </h2>
              <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                <span className="pulse-dot" />
                GATEWAY OPERATIONAL
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
              Enterprise Model Context Protocol runtime & SaaS mesh telemetry.
            </p>
          </div>
        </div>

        {/* Action Jump Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onOpenAudit}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ThemeIcon name="audit" size={13} />
            <span>Admin Audit Logs</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onOpenAddInstanceModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ThemeIcon name="plus" size={13} />
            <span>Add Connector</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onNavigateTab('services')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ThemeIcon name="services" size={13} />
            <span>Manage Services</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. CORE TELEMETRY METRICS GRID (CLICKABLE TO JUMP)
          ========================================================================= */}
      <div className="stats-grid">
        {/* Metric 1: Services Mesh */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigateTab('services')}
          title="Click to view Services & Connector Mesh"
        >
          <div
            className="stat-icon"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ThemeIcon name="services" size={18} />
          </div>
          <div className="stat-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="stat-value">{activeServices} / {totalServices}</span>
              {activeServices > 0 && (
                <span className="badge badge-emerald" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                  <span className="pulse-dot" />
                  ACTIVE
                </span>
              )}
            </div>
            <div className="stat-label">ACTIVE SAAS CONNECTORS</div>
          </div>
        </div>

        {/* Metric 2: MCP RPC Methods */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigateTab('services')}
          title="Click to view bound MCP tool RPCs"
        >
          <div
            className="stat-icon"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ThemeIcon name="lightning" size={18} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalTools} Tools</div>
            <div className="stat-label">BOUND RPC METHODS</div>
          </div>
        </div>

        {/* Metric 3: Secret Manager Health */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigateTab('secrets')}
          title="Click to view Secret Manager Vault"
        >
          <div
            className="stat-icon"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ThemeIcon name="secrets" size={18} />
          </div>
          <div className="stat-info">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span className="stat-value">{configuredSecrets} / {totalSecrets}</span>
              {requiredMissingCount > 0 && (
                <span
                  className="badge badge-rose"
                  style={{
                    fontSize: '0.625rem',
                    padding: '1px 5px',
                  }}
                >
                  <span className="pulse-dot" />
                  {requiredMissingCount} REQUIRED MISSING
                </span>
              )}
            </div>
            <div className="stat-label">SECRETS CONFIGURED</div>
          </div>
        </div>

        {/* Metric 4: Authorized IAM Users */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigateTab('users')}
          title="Click to view Access & IAM"
        >
          <div
            className="stat-icon"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ThemeIcon name="users" size={18} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalUsers} Users</div>
            <div className="stat-label">{adminUsers} ADMIN &bull; {readOnlyUsers} READ-ONLY</div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. REQUIRED MISSING SECRETS ALERT (IF ANY)
          ========================================================================= */}
      {missingRequiredSecrets.length > 0 && (
        <div
          style={{
            backgroundColor: 'rgba(244, 63, 94, 0.07)',
            border: '1px solid rgba(244, 63, 94, 0.28)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                backgroundColor: 'rgba(244, 63, 94, 0.14)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FB7185',
                flexShrink: 0,
              }}
            >
              <ThemeIcon name="alert" size={16} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  Action Required: {missingRequiredSecrets.length} Mandatory {missingRequiredSecrets.length === 1 ? 'Secret' : 'Secrets'} Not Initialized
                </span>
                <span className="badge badge-rose" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                  REQUIRED
                </span>
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Certain MCP connectors and features cannot execute until these keys are pushed to GCP Secret Manager.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onOpenSecretModal(missingRequiredSecrets[0])}
            >
              <span>Initialize {missingRequiredSecrets[0].key}</span>
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => onNavigateTab('secrets')}
            >
              <span>View All Vault Secrets</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. TWO-COLUMN DASHBOARD HIGHLIGHT PANELS
          ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Panel 1: Services & SaaS Mesh Highlights */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ThemeIcon name="services" size={16} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  SaaS Connector Mesh
                </h3>
              </div>
              <span className="badge badge-muted" style={{ fontSize: '0.675rem' }}>
                {totalServices} INSTANCES
              </span>
            </div>

            {/* Category Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Xero */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ThemeIcon name="xero" size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                      Xero Accounting
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      25 Accounting RPCs
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                    {xeroInstances.length} {xeroInstances.length === 1 ? 'INSTANCE' : 'INSTANCES'}
                  </span>
                  <span className={`badge ${xeroInstances.some((s) => s.enabled) ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.65rem' }}>
                    {xeroInstances.some((s) => s.enabled) ? (
                      <>
                        <span className="pulse-dot" />
                        ACTIVE
                      </>
                    ) : (
                      'DISABLED'
                    )}
                  </span>
                </div>
              </div>

              {/* BigQuery */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ThemeIcon name="bigquery" size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                      Google BigQuery
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      5 GoogleSQL RPCs
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                    {bqInstances.length} {bqInstances.length === 1 ? 'INSTANCE' : 'INSTANCES'}
                  </span>
                  <span className={`badge ${bqInstances.some((s) => s.enabled) ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.65rem' }}>
                    {bqInstances.some((s) => s.enabled) ? (
                      <>
                        <span className="pulse-dot" />
                        ACTIVE
                      </>
                    ) : (
                      'DISABLED'
                    )}
                  </span>
                </div>
              </div>

              {/* Firestore */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ThemeIcon name="firestore" size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                      Cloud Firestore
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      6 NoSQL RPCs
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                    {firestoreInstances.length} {firestoreInstances.length === 1 ? 'INSTANCE' : 'INSTANCES'}
                  </span>
                  <span className={`badge ${firestoreInstances.some((s) => s.enabled) ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.65rem' }}>
                    {firestoreInstances.some((s) => s.enabled) ? (
                      <>
                        <span className="pulse-dot" />
                        ACTIVE
                      </>
                    ) : (
                      'DISABLED'
                    )}
                  </span>
                </div>
              </div>

              {/* Sage HR */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ThemeIcon name="sagehr" size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                      Sage HR
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      12 HR RPCs
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                    {sageInstances.length} {sageInstances.length === 1 ? 'INSTANCE' : 'INSTANCES'}
                  </span>
                  <span className={`badge ${sageInstances.some((s) => s.enabled) ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.65rem' }}>
                    {sageInstances.some((s) => s.enabled) ? (
                      <>
                        <span className="pulse-dot" />
                        ACTIVE
                      </>
                    ) : (
                      'DISABLED'
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigateTab('services')}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <span>Open Services & Configurator</span>
            <ThemeIcon name="chevronRight" size={12} />
          </button>
        </div>

        {/* Panel 2: Secret Manager Vault Highlights */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ThemeIcon name="secrets" size={16} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Secret Manager Vault
                </h3>
              </div>
              <span className="badge badge-muted" style={{ fontSize: '0.675rem' }}>
                GCP ZERO-EXPOSURE
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                <span>Vault Coverage</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {totalSecrets > 0 ? Math.round((configuredSecrets / totalSecrets) * 100) : 0}% Initialized
                </strong>
              </div>
              <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${totalSecrets > 0 ? (configuredSecrets / totalSecrets) * 100 : 0}%`,
                    background: requiredMissingCount > 0 ? '#FB7185' : 'var(--emerald-primary)',
                    borderRadius: '3px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Breakdown List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Configured in Secret Manager</span>
                <span className="code-font" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {secretsList.filter((s) => s.status === 'SECRET_MANAGER').length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Environment Fallback</span>
                <span className="code-font" style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {secretsList.filter((s) => s.status === 'ENVIRONMENT').length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.4rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Missing / Unset</span>
                <span className="code-font" style={{ fontWeight: 700, color: requiredMissingCount > 0 ? '#FB7185' : 'var(--text-muted)' }}>
                  {secretsList.filter((s) => s.status === 'MISSING').length} {requiredMissingCount > 0 ? `(${requiredMissingCount} required)` : ''}
                </span>
              </div>
            </div>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigateTab('secrets')}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <span>Open Secret Manager Vault</span>
            <ThemeIcon name="chevronRight" size={12} />
          </button>
        </div>

        {/* Panel 3: Access & Team IAM Highlights */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ThemeIcon name="users" size={16} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Access Governance & IAM
                </h3>
              </div>
              <span className="badge badge-muted" style={{ fontSize: '0.675rem' }}>
                {activeUsers} / {totalUsers} ACTIVE
              </span>
            </div>

            {/* Quick User List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {users.slice(0, 3).map((u) => (
                <div
                  key={u.userEmail}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <div
                      className="user-avatar"
                      style={{
                        width: '26px',
                        height: '26px',
                        fontSize: '0.75rem',
                        flexShrink: 0,
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {u.fullName ? u.fullName.charAt(0).toUpperCase() : u.userEmail.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.fullName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {u.userEmail}
                      </div>
                    </div>
                  </div>

                  <span className={`badge ${u.isAdmin ? 'badge-emerald' : 'badge-muted'}`} style={{ fontSize: '0.625rem' }}>
                    {u.isAdmin ? 'ADMIN' : 'MEMBER'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onOpenAddUserModal}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <ThemeIcon name="plus" size={12} />
              <span>Add User</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigateTab('users')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <span>Manage Access</span>
              <ThemeIcon name="chevronRight" size={12} />
            </button>
          </div>
        </div>

        {/* Panel 4: Quick Launch Toolkit */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ThemeIcon name="lightning" size={16} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Platform Toolkit
                </h3>
              </div>
              <span className="badge badge-muted" style={{ fontSize: '0.675rem' }}>
                READY
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigateTab('gemini')}
                style={{ padding: '0.75rem 0.5rem', flexDirection: 'column', gap: '0.35rem', height: 'auto', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.4)' }}
              >
                <ThemeIcon name="sparkles" size={15} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34D399' }}>Gemini Enterprise MCP Config</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={onOpenAddInstanceModal}
                style={{ padding: '0.75rem 0.5rem', flexDirection: 'column', gap: '0.35rem', height: 'auto', textAlign: 'center' }}
              >
                <ThemeIcon name="plus" size={15} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>New Connector</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigateTab('secrets')}
                style={{ padding: '0.75rem 0.5rem', flexDirection: 'column', gap: '0.35rem', height: 'auto', textAlign: 'center' }}
              >
                <ThemeIcon name="secrets" size={15} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Vault Sync</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={onOpenAudit}
                style={{ padding: '0.75rem 0.5rem', flexDirection: 'column', gap: '0.35rem', height: 'auto', textAlign: 'center' }}
              >
                <ThemeIcon name="audit" size={15} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Audit Logs</span>
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            Model Context Protocol Gateway &bull; v2.0 Production
          </div>
        </div>
      </div>
    </div>
  );
};
