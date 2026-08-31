import React, { useState } from 'react';

interface LoginPageProps {
  onDevLogin: (email: string, fullName: string) => Promise<void>;
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
  onOpenSetup?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onDevLogin,
  googleOAuthConfigured,
  allowedDomains,
  devModeAllowed,
  diagnostics,
  onOpenSetup,
}) => {
  const [devEmail, setDevEmail] = useState('admin@company.com');
  const [devName, setDevName] = useState('System Administrator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check URL query parameters for errors
  const urlParams = new URLSearchParams(window.location.search);
  const urlError = urlParams.get('error');
  const notice = urlParams.get('notice');

  const handleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await onDevLogin(devEmail, devName);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#09090B',
        padding: '1.25rem',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          backgroundColor: '#18181B',
          border: '1px solid #27272A',
          borderRadius: '8px',
          padding: '2.25rem 2rem',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.9)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              margin: '0 auto 1.25rem',
              backgroundColor: '#09090B',
              border: '1px solid #27272A',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FAFAFA',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 4.5 11 L 12.5 3 A 2.2 2.2 0 0 1 15.6 6.1 L 9.2 12.5 A 1.5 1.5 0 0 0 11.3 14.6 L 17.3 8.6 A 2.2 2.2 0 0 1 20.4 11.7 L 13 19.1 C 12 20.1 12 21.3 13.8 23.1" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#FAFAFA',
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            MCP Gateway
          </h1>
          <p
            style={{
              color: '#71717A',
              fontSize: '0.8rem',
              marginTop: '0.4rem',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.02em',
            }}
          >
            ENTERPRISE ADMINISTRATION PORTAL
          </p>
        </div>

        {/* Notices and Errors */}
        {urlError && (
          <div
            style={{
              backgroundColor: '#1C1215',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              color: '#FB7185',
              fontSize: '0.8rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Authentication Error: {urlError}</span>
          </div>
        )}

        {notice === 'google_not_configured' && (
          <div
            style={{
              backgroundColor: '#18181B',
              border: '1px solid #3F3F46',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              color: '#D4D4D8',
              fontSize: '0.775rem',
              marginBottom: '1.5rem',
              lineHeight: 1.45,
            }}
          >
            Google Workspace OAuth is not yet configured in Secret Manager. Use the Development Administrator Login below to configure your initial secrets.
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: '#1C1215',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              color: '#FB7185',
              fontSize: '0.8rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Google Workspace Sign-In Button */}
        <div style={{ marginBottom: '1.75rem' }}>
          <a
            href="/api/auth/login"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
              backgroundColor: '#FAFAFA',
              color: '#09090B',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              boxSizing: 'border-box',
              transition: 'background-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#E4E4E7')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#FAFAFA')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Sign in with Google Workspace</span>
            {googleOAuthConfigured && (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  backgroundColor: '#09090B',
                  color: '#FAFAFA',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  marginLeft: 'auto',
                }}
              >
                OIDC ACTIVE
              </span>
            )}
          </a>
          <div
            style={{
              textAlign: 'center',
              marginTop: '0.6rem',
              fontSize: '0.725rem',
              color: '#71717A',
              fontFamily: 'var(--font-mono)',
            }}
          >
            AUTHORIZED DOMAINS: {allowedDomains.length > 0 ? allowedDomains.join(', ') : 'ALL'}
          </div>
        </div>

        {/* Development Login Alternative */}
        {devModeAllowed && (
          <div
            style={{
              borderTop: '1px solid #27272A',
              paddingTop: '1.5rem',
              marginTop: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#A1A1AA',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Local Dev / Bootstrap
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  backgroundColor: '#09090B',
                  border: '1px solid #27272A',
                  color: '#A1A1AA',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                BOOTSTRAP
              </span>
            </div>

            <form onSubmit={handleDevSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: '#71717A',
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Admin Email
                </label>
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: '#09090B',
                    border: '1px solid #27272A',
                    borderRadius: '6px',
                    padding: '0.6rem 0.85rem',
                    color: '#FAFAFA',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: '#71717A',
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: '#09090B',
                    border: '1px solid #27272A',
                    borderRadius: '6px',
                    padding: '0.6rem 0.85rem',
                    color: '#FAFAFA',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: '#27272A',
                  border: '1px solid #3F3F46',
                  color: '#FAFAFA',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginTop: '0.25rem',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3F3F46')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
              >
                {loading ? 'Authenticating Session...' : 'Authenticate Local Session'}
              </button>
            </form>
          </div>
        )}

        {/* Footer info */}
        <div
          style={{
            marginTop: '2rem',
            textAlign: 'center',
            fontSize: '0.725rem',
            color: '#71717A',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          Cloud Run &bull; Firestore &bull; Gemini Enterprise
        </div>

        {onOpenSetup && (
          <div style={{ marginTop: '1.25rem', textAlign: 'center', borderTop: '1px solid #27272A', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={onOpenSetup}
              style={{
                background: 'none',
                border: 'none',
                color: '#A1A1AA',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Need to re-run initial setup? Launch Setup Wizard →
            </button>
          </div>
        )}
      </div>

      {/* Minimalist Live Diagnostics Footer */}
      {diagnostics && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '0.85rem',
            fontSize: '0.7rem',
            color: '#71717A',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
            paddingInline: '1rem',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#52525B' }}>REV:</span>
            <span style={{ color: '#A1A1AA' }}>{diagnostics.revision || 'local-dev'}</span>
          </div>
          <span style={{ color: '#3F3F46' }}>&bull;</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#52525B' }}>REGION:</span>
            <span style={{ color: '#A1A1AA' }}>{diagnostics.region || 'europe-west1'}</span>
          </div>
          <span style={{ color: '#3F3F46' }}>&bull;</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#52525B' }}>RAM:</span>
            <span style={{ color: '#A1A1AA' }}>{diagnostics.ramMb ? `${diagnostics.ramMb}MB` : '64MB'}</span>
          </div>
          <span style={{ color: '#3F3F46' }}>&bull;</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#52525B' }}>INSTANCES:</span>
            <span style={{ color: '#10B981' }}>{diagnostics.instancesCount} RUNNING</span>
          </div>
          <span style={{ color: '#3F3F46' }}>&bull;</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#52525B' }}>UPTIME:</span>
            <span style={{ color: '#A1A1AA' }}>{diagnostics.uptimeHours.toFixed(1)}h</span>
          </div>
        </div>
      )}
    </div>
  );
};
