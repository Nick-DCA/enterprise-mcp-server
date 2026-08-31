import React from 'react';
import { AuthProfile } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

export type TabKey = 'overview' | 'services' | 'secrets' | 'users' | 'gemini' | 'audit' | 'dev';

interface NavbarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  user: AuthProfile | null;
  onLogout: () => void;
  onOpenAudit: () => void;
  configuredSecretsCount?: number;
  totalSecretsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  user,
  onLogout,
  onOpenAudit,
}) => {

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <div className="brand-container">
          <div className="brand-logo">
            <ThemeIcon name="mcp" size={20} />
          </div>
          <div className="brand-text">
            <h1>MCP Gateway</h1>
            <span>Admin Portal v2.0</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onTabChange('overview')}
          >
            <ThemeIcon name="sparkles" size={16} />
            <span>Overview</span>
          </button>

          <button
            className={`nav-tab ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => onTabChange('services')}
          >
            <ThemeIcon name="services" size={16} />
            <span>Services & Runtime</span>
          </button>

          <button
            className={`nav-tab ${activeTab === 'secrets' ? 'active' : ''}`}
            onClick={() => onTabChange('secrets')}
          >
            <ThemeIcon name="secrets" size={16} />
            <span>Secrets Vault</span>
          </button>

          <button
            className={`nav-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => onTabChange('users')}
          >
            <ThemeIcon name="users" size={16} />
            <span>Users & Access</span>
          </button>

          <button
            className={`nav-tab ${activeTab === 'dev' ? 'active' : ''}`}
            onClick={() => onTabChange('dev')}
          >
            <ThemeIcon name="dev" size={16} />
            <span>DEV Studio</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="navbar-actions">
          {/* Quick Layout Mode Switcher */}


          <button className="btn btn-secondary btn-sm" onClick={onOpenAudit} title="View Audit Logs">
            <ThemeIcon name="audit" size={14} />
            <span>Audit Trail</span>
          </button>

          {user && (
            <div className="user-chip">
              <div className="user-avatar">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </div>
              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.fullName || user.email}
              </span>
              {user.isAdmin && <span className="badge badge-cyan" style={{ padding: '2px 6px', fontSize: '0.675rem' }}>ADMIN</span>}
            </div>
          )}

          <button className="btn btn-secondary btn-sm" onClick={onLogout} title="Sign Out">
            <ThemeIcon name="logout" size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
