import React, { useEffect, useState } from 'react';
import {
  api,
  AuthProfile,
  ServiceConfig,
  ServiceId,
  SecretsStatusResponse,
  SecretItem,
  UserAccessItem,
  DiagnosticTestResult,
} from './api/client.js';
import { SetupWizardPage } from './pages/SetupWizardPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { ServicesPage } from './pages/ServicesPage.js';
import { SecretsPage } from './pages/SecretsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { GeminiConfigPage } from './pages/GeminiConfigPage.js';
import { AuditPage } from './pages/AuditPage.js';
import { DevPage } from './pages/DevPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { UpdateSecretModal } from './components/UpdateSecretModal.js';
import { AddUserModal } from './components/AddUserModal.js';
import { AddServiceInstanceModal } from './components/AddServiceInstanceModal.js';
import { EditPermissionsModal } from './components/EditPermissionsModal.js';
import { TestConnectionModal } from './components/TestConnectionModal.js';
import { Toast, ToastMessage } from './components/Toast.js';
import { useTheme, ThemeIcon } from './theme/ThemeContext.js';

export type TabKey = 'overview' | 'services' | 'secrets' | 'users' | 'gemini' | 'audit' | 'dev';

export const App: React.FC = () => {
  const { theme } = useTheme();

  const [user, setUser] = useState<AuthProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isSetupCompleted, setIsSetupCompleted] = useState<boolean>(true);
  const [isSetupRoute, setIsSetupRoute] = useState<boolean>(false);
  const [authConfig, setAuthConfig] = useState<{
    googleOAuthConfigured: boolean;
    allowedDomains: string[];
    devModeAllowed: boolean;
    diagnostics?: {
      projectId: string;
      revision?: string;
      region?: string;
      ramMb?: number;
      instancesCount: number;
      uptimeHours: number;
      isCloudRun?: boolean;
    };
  }>({
    googleOAuthConfigured: false,
    allowedDomains: [],
    devModeAllowed: true,
  });

  const [viewMode, setViewMode] = useState<'auto' | 'login' | 'setup'>('auto');

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [secretsData, setSecretsData] = useState<SecretsStatusResponse | null>(null);
  const [users, setUsers] = useState<UserAccessItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Modals
  const [activeSecretModal, setActiveSecretModal] = useState<SecretItem | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addInstanceModal, setAddInstanceModal] = useState<{
    isOpen: boolean;
    initialServiceId?: ServiceId;
  }>({
    isOpen: false,
    initialServiceId: 'bigquery',
  });
  const [activeEditUserModal, setActiveEditUserModal] = useState<UserAccessItem | null>(null);
  const [testModal, setTestModal] = useState<{
    isOpen: boolean;
    result: DiagnosticTestResult | null;
    loading: boolean;
    serviceName: string;
  }>({
    isOpen: false,
    result: null,
    loading: false,
    serviceName: '',
  });

  const addToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initial Auth & Setup Check
  useEffect(() => {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (path.includes('/setup') || urlToken) {
      setIsSetupRoute(true);
      if (urlToken) {
        setUser(null);
        setViewMode('setup');
      }
    }
    checkSession();

    // Listen for session-expired events from the global API interceptor
    const handleSessionExpired = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setUser(null);
      addToast('error', detail?.message || 'Session expired. Please log in again.');
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);

  const checkSession = async () => {
    try {
      // Check setup status first
      try {
        const setupRes = await api.setup.getStatus();
        setIsSetupCompleted(setupRes.isCompleted);
      } catch {
        // Fallback
      }

      const configRes = await api.getAuthStatus();
      setAuthConfig(configRes);

      const me = await api.getMe();
      setUser(me);
      await loadDashboardData();
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const loadDashboardData = async () => {
    try {
      const [servicesRes, secretsRes, usersRes] = await Promise.all([
        api.getServices(),
        api.getSecretsStatus(),
        api.getUsers(),
      ]);
      setServices(servicesRes.services || []);
      setSecretsData(secretsRes);
      setUsers(usersRes.users || []);
    } catch (err: any) {
      addToast('error', `Failed to load portal telemetry: ${err.message}`);
    }
  };

  const handleDevLogin = async (email: string) => {
    try {
      await api.devLogin(email);
      const me = await api.getMe();
      setUser(me);
      addToast('success', `Welcome back, ${me.fullName || me.email}!`);
      await loadDashboardData();
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      addToast('info', 'Signed out successfully');
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleToggleService = async (instanceId: string, enabled: boolean) => {
    try {
      const res = await api.toggleService(instanceId, enabled);
      setServices((prev) =>
        prev.map((s) => (s.instanceId === instanceId ? res.service : s))
      );
      addToast(
        enabled ? 'success' : 'info',
        `${res.service.name} ${enabled ? 'enabled' : 'disabled'}`
      );
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleUpdateServiceConfig = async (
    instanceId: string,
    settings: Record<string, any>,
    meta?: { name?: string; description?: string; customerName?: string; requiredSecrets?: string[] }
  ) => {
    try {
      const res = await api.updateServiceConfig(instanceId, settings, meta);
      setServices((prev) =>
        prev.map((s) => (s.instanceId === instanceId ? res.service : s))
      );
      // Refresh secrets status in background since requiredSecrets or custom prefixes might have changed
      api.getSecretsStatus().then((sec) => setSecretsData(sec)).catch(() => {});
      addToast('success', `Updated configuration for "${res.service.name}"`);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleCreateServiceInstance = async (instanceData: {
    serviceId: ServiceId;
    customerName: string;
    name: string;
    description: string;
    settings: Record<string, any>;
    requiredSecrets?: string[];
  }) => {
    try {
      const res = await api.createServiceInstance(instanceData);
      setServices((prev) => [...prev, res.service]);
      // Refresh secrets status to show newly registered customer secrets in the Secrets Vault
      const updatedSecrets = await api.getSecretsStatus();
      setSecretsData(updatedSecrets);
      addToast('success', `Created instance "${res.service.name}" for customer "${instanceData.customerName}"`);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleDeleteServiceInstance = async (instanceId: string) => {
    try {
      await api.deleteServiceInstance(instanceId);
      setServices((prev) => prev.filter((s) => s.instanceId !== instanceId));
      const updatedSecrets = await api.getSecretsStatus();
      setSecretsData(updatedSecrets);
      addToast('info', `Connector instance "${instanceId}" removed`);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleTestConnection = async (instanceId: string): Promise<DiagnosticTestResult> => {
    const srv = services.find((s) => s.instanceId === instanceId);
    setTestModal({
      isOpen: true,
      result: null,
      loading: true,
      serviceName: srv ? srv.name : instanceId.toUpperCase(),
    });

    try {
      const result = await api.testService(instanceId);
      setTestModal({
        isOpen: true,
        result,
        loading: false,
        serviceName: srv ? srv.name : instanceId.toUpperCase(),
      });
      return result;
    } catch (err: any) {
      const errorResult: DiagnosticTestResult = {
        serviceId: (srv?.serviceId || 'xero') as ServiceId,
        instanceId,
        status: 'ERROR',
        success: false,
        latencyMs: 0,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      setTestModal({
        isOpen: true,
        result: errorResult,
        loading: false,
        serviceName: srv ? srv.name : instanceId.toUpperCase(),
      });
      return errorResult;
    }
  };

  const handleSaveSecret = async (secretName: string, value: string) => {
    try {
      await api.updateSecret(secretName, value);
      addToast('success', `Secret ${secretName} initialized & updated in Secret Manager`);
      const updatedStatus = await api.getSecretsStatus();
      setSecretsData(updatedStatus);
      setActiveSecretModal(null);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleAddUser = async (userData: {
    userEmail: string;
    fullName: string;
    isAdmin: boolean;
    allowedServices: ServiceId[];
    readOnlyOnly: boolean;
  }) => {
    try {
      const res = await api.createUser({
        userEmail: userData.userEmail,
        fullName: userData.fullName,
        isAdmin: userData.isAdmin,
        allowedServices: userData.allowedServices,
        readOnlyOnly: userData.readOnlyOnly,
      });
      setUsers((prev) => [...prev, res.user]);
      addToast('success', `User ${userData.userEmail} authorized`);
      setIsAddUserModalOpen(false);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleUpdateUserPermissions = async (
    userEmail: string,
    permissions: {
      allowedServices?: ServiceId[];
      isAdmin?: boolean;
      readOnlyOnly?: boolean;
      fullName?: string;
    }
  ) => {
    try {
      const res = await api.updateUserPermissions(userEmail, permissions);
      setUsers((prev) => prev.map((u) => (u.userEmail === userEmail ? res.user : u)));
      addToast('success', `Permissions updated for ${userEmail}`);
      setActiveEditUserModal(null);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleToggleUser = async (email: string, isEnabled: boolean) => {
    try {
      const res = await api.toggleUser(email, isEnabled);
      setUsers((prev) => prev.map((u) => (u.userEmail === email ? res.user : u)));
      addToast(isEnabled ? 'success' : 'info', `User ${email} ${isEnabled ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleDeleteUser = async (email: string) => {
    try {
      await api.deleteUser(email);
      setUsers((prev) => prev.filter((u) => u.userEmail !== email));
      addToast('info', `User ${email} removed`);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleRevokeUserSessions = async (email: string) => {
    try {
      const res = await api.revokeUserSessions(email);
      addToast('info', res.message || `Revoked ${res.revokedCount} session(s) for ${email}`);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      const res = await api.revokeAllSessions();
      addToast('info', `${res.revokedSessionsCount} sessions revoked. Signing out...`);
      setTimeout(() => {
        setUser(null);
      }, 1000);
    } catch (err: any) {
      addToast('error', err.message);
    }
  };

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090B',
          color: '#FAFAFA',
          fontFamily: 'var(--font-sans)',
          gap: '1.25rem',
          userSelect: 'none',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '6px',
              backgroundColor: '#18181B',
              border: '1px solid #27272A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FAFAFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.08em', color: '#FAFAFA', textTransform: 'uppercase' }}>
            MCP Gateway
          </div>
          <div style={{ fontSize: '0.725rem', color: '#71717A', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            AUTHENTICATING RUNTIME SESSION
          </div>
        </div>

        <div
          style={{
            width: '120px',
            height: '2px',
            backgroundColor: '#18181B',
            borderRadius: '2px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '40%',
              backgroundColor: '#FAFAFA',
              borderRadius: '2px',
              animation: 'indeterminateSlide 1.2s infinite ease-in-out',
            }}
          />
        </div>
      </div>
    );
  }

  if (!user) {
    const shouldShowSetup =
      viewMode === 'setup' ||
      (isSetupRoute && viewMode !== 'login') ||
      (!isSetupCompleted && !authConfig.googleOAuthConfigured && viewMode !== 'login');

    if (shouldShowSetup) {
      return (
        <SetupWizardPage
          onSetupComplete={async () => {
            setIsSetupCompleted(true);
            setIsSetupRoute(false);
            setViewMode('login');
            await checkSession();
          }}
          onGoToLogin={() => setViewMode('login')}
        />
      );
    }

    return (
      <LoginPage
        onDevLogin={handleDevLogin}
        googleOAuthConfigured={authConfig.googleOAuthConfigured}
        allowedDomains={authConfig.allowedDomains}
        devModeAllowed={authConfig.devModeAllowed}
        diagnostics={authConfig.diagnostics}
        onOpenSetup={() => setViewMode('setup')}
      />
    );
  }

  // Active Tab Content Helper
  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewPage
            user={user}
            services={services}
            secretsData={secretsData}
            users={users}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenAudit={() => setActiveTab('audit')}
            onOpenAddInstanceModal={() => setAddInstanceModal({ isOpen: true, initialServiceId: 'bigquery' })}
            onOpenAddUserModal={() => setIsAddUserModalOpen(true)}
            onOpenSecretModal={(secret) => setActiveSecretModal(secret)}
          />
        );
      case 'services':
        return (
          <ServicesPage
            services={services}
            onToggle={handleToggleService}
            onUpdateConfig={handleUpdateServiceConfig}
            onDeleteInstance={handleDeleteServiceInstance}
            onTestConnection={handleTestConnection}
            onOpenAddInstanceModal={(srvId) =>
              setAddInstanceModal({ isOpen: true, initialServiceId: srvId || 'bigquery' })
            }
          />
        );
      case 'secrets':
        return (
          <SecretsPage
            secretsData={secretsData}
            onOpenUpdateModal={(secret) => setActiveSecretModal(secret)}
            onShowToast={(msg, type) => addToast(type, msg)}
            onRefresh={async () => {
              const res = await api.getSecretsStatus();
              setSecretsData(res);
              addToast('info', 'Secret statuses refreshed');
            }}
          />
        );
      case 'users':
        return (
          <UsersPage
            users={users}
            currentUserEmail={user.email}
            onOpenAddModal={() => setIsAddUserModalOpen(true)}
            onOpenEditModal={(u) => setActiveEditUserModal(u)}
            onToggleUser={handleToggleUser}
            onDeleteUser={handleDeleteUser}
            onRevokeUserSessions={handleRevokeUserSessions}
            onRevokeAllSessions={handleRevokeAllSessions}
            onUpdatePermissions={handleUpdateUserPermissions}
            onShowToast={(msg, type) => addToast(type, msg)}
          />
        );
      case 'gemini':
        return (
          <GeminiConfigPage
            onShowToast={(msg, type) => addToast(type || 'info', msg)}
            onOpenUpdateSecret={(key) => {
              const item: SecretItem = secretsData?.secrets.find((s) => s.key === key) || {
                key,
                category: 'Platform',
                description: 'OAuth Client Secret expected from Google Gemini Enterprise during /oauth/token exchanges.',
                status: 'MISSING',
                isConfigured: false,
                required: true,
              };
              setActiveSecretModal(item);
            }}
          />
        );
      case 'audit':
        return <AuditPage onShowToast={(msg, type) => addToast(type || 'info', msg)} />;
      case 'dev':
        return <DevPage onShowToast={(msg, type) => addToast(type, msg)} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />

      {/* =========================================================================
          LAYOUT MODE 1: MONOCHROME MINIMALIST SIDEBAR PORTAL
          ========================================================================= */}
      {theme.layoutMode === 'sidebar' && (
        <div className="mono-portal-layout" style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden', borderRadius: 0, border: 'none' }}>
          {/* Mobile Sidebar Backdrop */}
          {isMobileSidebarOpen && (
            <div className="mono-sidebar-backdrop" onClick={() => setIsMobileSidebarOpen(false)} />
          )}

          {/* Left Sidebar */}
          <aside className={`mono-sidebar ${isMobileSidebarOpen ? 'open' : ''}`}>
            {/* Workspace Switcher */}
            <div className="mono-ws-header">
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
              {/* Core Platform Links */}
              <div className="mono-nav-group">
                <div className="mono-group-label">Core Platform</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <button
                    className={`mono-nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('overview');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="sparkles" size={14} />
                      <span>Command Center</span>
                    </span>
                  </button>

                  <button
                    className={`mono-nav-link ${activeTab === 'services' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('services');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="services" size={14} />
                      <span>Services & Mesh</span>
                    </span>
                  </button>

                  <button
                    className={`mono-nav-link ${activeTab === 'secrets' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('secrets');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="secrets" size={14} />
                      <span>Secrets Vault</span>
                    </span>
                  </button>

                  <button
                    className={`mono-nav-link ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('users');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="users" size={14} />
                      <span>Users & Access</span>
                    </span>
                  </button>

                  <button
                    className={`mono-nav-link ${activeTab === 'gemini' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('gemini');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="sparkles" size={14} />
                      <span>Gemini Enterprise MCP Config</span>
                    </span>
                  </button>

                  <button
                    className={`mono-nav-link ${activeTab === 'dev' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('dev');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="dev" size={14} />
                      <span>DEV Studio</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Operations */}
              <div className="mono-nav-group">
                <div className="mono-group-label">Operations</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <button
                    className={`mono-nav-link ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('audit');
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="audit" size={14} />
                      <span>Audit Trail</span>
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
                    {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FFFFFF', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.fullName || user.email}
                  </span>
                </div>
                <button
                  className="mono-btn-secondary"
                  style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                  onClick={handleLogout}
                >
                  Log Out
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Body */}
          <main className="mono-main-content">
            {/* Mobile Header Bar (< 768px) */}
            <div className="mono-mobile-header">
              <button
                style={{
                  background: '#18181B',
                  border: '1px solid #27272A',
                  color: '#FAFAFA',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span style={{ fontWeight: 600 }}>Menu</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FAFAFA', letterSpacing: '0.04em' }}>
                  MCP GATEWAY
                </span>
              </div>

              <button
                className="mono-btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setActiveTab('audit')}
                title="View Audit Logs"
              >
                <ThemeIcon name="audit" size={14} />
              </button>
            </div>
            <header className="mono-topbar">
              <div className="mono-search-box">
                <ThemeIcon name="search" size={14} />
                <input
                  type="text"
                  className="mono-search-input"
                  placeholder="Search services, secrets, or users..."
                />
                <span className="mono-kbd">⌘K</span>
              </div>
            </header>

            <div className="mono-body">
              {renderActiveTabContent()}
            </div>
          </main>
        </div>
      )}

      {/* Modals */}
      <UpdateSecretModal
        secret={activeSecretModal}
        isOpen={Boolean(activeSecretModal)}
        onClose={() => setActiveSecretModal(null)}
        onSave={handleSaveSecret}
      />

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onAddUser={handleAddUser}
      />

      {/* Add Customer Service Instance Modal */}
      <AddServiceInstanceModal
        isOpen={addInstanceModal.isOpen}
        initialServiceId={addInstanceModal.initialServiceId}
        onClose={() => setAddInstanceModal((prev) => ({ ...prev, isOpen: false }))}
        onCreate={handleCreateServiceInstance}
      />

      {/* Edit Permissions Modal */}
      <EditPermissionsModal
        user={activeEditUserModal}
        currentUserEmail={user?.email}
        isOpen={Boolean(activeEditUserModal)}
        onClose={() => setActiveEditUserModal(null)}
        onUpdate={handleUpdateUserPermissions}
      />

      {/* Upstream Diagnostic Test Modal */}
      <TestConnectionModal
        isOpen={testModal.isOpen}
        onClose={() => setTestModal((prev) => ({ ...prev, isOpen: false }))}
        result={testModal.result}
        loading={testModal.loading}
        serviceName={testModal.serviceName}
      />
    </div>
  );
};
