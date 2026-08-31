
import React, { useEffect, useState } from 'react';
import { api, GeminiBlueprint } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface GeminiConfigPageProps {
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenUpdateSecret?: (key: string) => void;
}

const DEFAULT_PRODUCTION_URL = 'https://enterprise-mcp-server-1058873375196.europe-west1.run.app';

export const GeminiConfigPage: React.FC<GeminiConfigPageProps> = ({ onShowToast, onOpenUpdateSecret }) => {
  const [blueprint, setBlueprint] = useState<GeminiBlueprint | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [baseUrlOverride, setBaseUrlOverride] = useState<string>(DEFAULT_PRODUCTION_URL);
  const [activeView, setActiveView] = useState<'form-mirror' | 'cards' | 'json'>('form-mirror');

  const fetchBlueprint = async () => {
    setLoading(true);
    try {
      const res = await api.getGeminiBlueprint();
      if (res.success && res.blueprint) {
        setBlueprint(res.blueprint);
        if (res.blueprint.serverBaseUrl && !res.blueprint.serverBaseUrl.includes('localhost') && !res.blueprint.serverBaseUrl.includes('127.0.0.1')) {
          setBaseUrlOverride(res.blueprint.serverBaseUrl);
        }
      }
    } catch (err: any) {
      onShowToast(err.message || 'Failed to load Gemini Enterprise configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlueprint();
  }, []);

  const handleCopy = (key: string, textToCopy: string, label: string) => {
    if (!textToCopy) {
      onShowToast(`No value available for ${label}`, 'error');
      return;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopiedKey(key);
    onShowToast(`Copied ${label} to clipboard!`, 'success');
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const copyAllJson = () => {
    const cleanBase = baseUrlOverride.trim().replace(/\/+$/, '');
    const jsonPayload = {
      mcp_server_url: `${cleanBase}/mcp`,
      authorization_url: `${cleanBase}/oauth/authorize`,
      authorization_url_parameters: '',
      token_url: `${cleanBase}/oauth/token`,
      client_id: blueprint?.clientId || 'gemini-enterprise-mcp',
      client_secret: blueprint?.clientSecret || '',
      scopes: blueprint?.scopes || 'all',
      enable_pkce: true,
      use_http_basic_auth: true,
    };
    navigator.clipboard.writeText(JSON.stringify(jsonPayload, null, 2));
    onShowToast('Copied full Gemini Enterprise JSON payload to clipboard!', 'success');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '380px', gap: '1rem' }}>
        <div className="spinner-slow" style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-bright)', borderRadius: '50%' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading Gemini Enterprise production blueprint...</span>
      </div>
    );
  }

  const cleanBase = (baseUrlOverride || DEFAULT_PRODUCTION_URL).trim().replace(/\/+$/, '');
  const mcpServerUrl = `${cleanBase}/mcp`;
  const authUrl = `${cleanBase}/oauth/authorize`;
  const tokenUrl = `${cleanBase}/oauth/token`;
  const clientId = blueprint?.clientId || 'gemini-enterprise-mcp';
  const clientSecret = blueprint?.clientSecret || '';
  const isClientSecretSet = Boolean(clientSecret);
  const scopes = blueprint?.scopes || 'all';

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
              }}
            >
              <ThemeIcon name="sparkles" size={18} />
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Gemini Enterprise MCP Config
            </h1>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Production configuration values for <strong>Google Gemini Enterprise &rarr; Agent Builder &rarr; Data Stores &rarr; Custom MCP Server</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            className="mono-btn-secondary"
            onClick={copyAllJson}
            title="Copy full JSON configuration payload"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            <ThemeIcon name="download" size={14} />
            <span>Copy Full JSON</span>
          </button>
          <a
            href="https://console.cloud.google.com/gen-app-builder/data-stores"
            target="_blank"
            rel="noopener noreferrer"
            className="mono-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.45rem 0.85rem', textDecoration: 'none' }}
          >
            <ThemeIcon name="globe" size={14} />
            <span>Open Google Cloud Console ↗</span>
          </a>
        </div>
      </div>

      {/* Production Target Environment Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          backgroundColor: '#18181B',
          border: '1px solid #27272A',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FAFAFA' }}>Target Production URL:</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, maxWidth: '520px' }}>
          <input
            type="text"
            className="form-input"
            value={baseUrlOverride}
            onChange={(e) => setBaseUrlOverride(e.target.value)}
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              background: '#09090B',
              borderColor: '#3F3F46',
              color: '#34D399',
            }}
            placeholder="https://enterprise-mcp-server-...run.app"
          />
          <button
            className="mono-btn-secondary"
            onClick={() => setBaseUrlOverride(DEFAULT_PRODUCTION_URL)}
            style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem', whiteSpace: 'nowrap' }}
            title="Reset to default Cloud Run production URL"
          >
            Reset URL
          </button>
        </div>
      </div>

      {/* Missing Secret Warning */}
      {!isClientSecretSet && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '1.25rem',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ThemeIcon name="alert" size={18} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F87171' }}>
                Action Required: MCP_CLIENT_SECRET is missing in Secret Manager
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Gemini Enterprise requires an OAuth client secret for the token exchange handshake.
              </div>
            </div>
          </div>
          {onOpenUpdateSecret && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onOpenUpdateSecret('MCP_CLIENT_SECRET')}
              style={{ whiteSpace: 'nowrap' }}
            >
              Set MCP_CLIENT_SECRET
            </button>
          )}
        </div>
      )}

      {/* View Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setActiveView('form-mirror')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeView === 'form-mirror' ? '2px solid var(--accent-bright)' : '2px solid transparent',
            color: activeView === 'form-mirror' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeView === 'form-mirror' ? 700 : 500,
            fontSize: '0.85rem',
            padding: '0.5rem 0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <ThemeIcon name="sparkles" size={14} />
          <span>Gemini Modal Form Mirror (1:1 Layout)</span>
        </button>
        <button
          onClick={() => setActiveView('json')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeView === 'json' ? '2px solid var(--accent-bright)' : '2px solid transparent',
            color: activeView === 'json' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeView === 'json' ? 700 : 500,
            fontSize: '0.85rem',
            padding: '0.5rem 0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <ThemeIcon name="code" size={14} />
          <span>Raw Manifest (JSON)</span>
        </button>
      </div>

      {/* VIEW 1: EXACT 1:1 REPLICA OF THE GOOGLE GEMINI ENTERPRISE MODAL */}
      {activeView === 'form-mirror' && (
        <div
          style={{
            backgroundColor: '#131316',
            border: '1px solid #27272A',
            borderRadius: '10px',
            padding: '1.5rem',
            boxShadow: '0 12px 36px -8px rgba(0, 0, 0, 0.6)',
          }}
        >
          {/* Modal Title Banner */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272A', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FAFAFA', margin: '0 0 0.2rem 0' }}>
                Update authentication
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                Copy and paste each parameter directly into the Google Cloud Gemini Enterprise popup.
              </span>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34D399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              1:1 GOOGLE CONSOLE MIRROR
            </span>
          </div>

          {/* Authentication Method Radio */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#FAFAFA', marginBottom: '0.75rem' }}>
              Select your authentication method
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: '#FAFAFA', fontWeight: 600 }}>
                <input type="radio" name="authMethod" checked readOnly style={{ accentColor: '#3B82F6', width: '16px', height: '16px' }} />
                <span>OAuth 2.0</span>
                <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', padding: '1px 6px', borderRadius: '4px' }}>SELECTED</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'not-allowed', fontSize: '0.85rem', color: '#71717A' }}>
                <input type="radio" name="authMethod" disabled style={{ width: '16px', height: '16px' }} />
                <span>No authentication</span>
              </label>
            </div>
          </div>

          {/* Field 1: MCP Server URL * */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                MCP Server URL <span style={{ color: '#F87171' }}>*</span>
              </label>
              <span style={{ fontSize: '0.7rem', color: '#71717A' }}>Field 1</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={mcpServerUrl}
                style={{
                  width: '100%',
                  padding: '0.6rem 4.5rem 0.6rem 0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#09090B',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  color: '#FAFAFA',
                  outline: 'none',
                }}
              />
              <button
                className={copiedKey === 'mcpServerUrl' ? 'mono-btn-primary' : 'mono-btn-secondary'}
                onClick={() => handleCopy('mcpServerUrl', mcpServerUrl, 'MCP Server URL')}
                style={{ position: 'absolute', right: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                {copiedKey === 'mcpServerUrl' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              The base URL of your hosted MCP server (e.g., https://mcp.example.com).
            </span>
          </div>

          {/* Field 2: Authorization URL * */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                Authorization URL <span style={{ color: '#F87171' }}>*</span>
              </label>
              <span style={{ fontSize: '0.7rem', color: '#71717A' }}>Field 2</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={authUrl}
                style={{
                  width: '100%',
                  padding: '0.6rem 4.5rem 0.6rem 0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#09090B',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  color: '#FAFAFA',
                  outline: 'none',
                }}
              />
              <button
                className={copiedKey === 'authUrl' ? 'mono-btn-primary' : 'mono-btn-secondary'}
                onClick={() => handleCopy('authUrl', authUrl, 'Authorization URL')}
                style={{ position: 'absolute', right: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                {copiedKey === 'authUrl' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              The OAuth 2.0 authorization endpoint URL.
            </span>
          </div>

          {/* Field 3: Authorization URL Parameters */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                Authorization URL Parameters
              </label>
              <span style={{ fontSize: '0.65rem', color: '#10B981', fontWeight: 600 }}>LEAVE BLANK (OPTIONAL)</span>
            </div>
            <input
              type="text"
              readOnly
              placeholder="(Leave blank)"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: '#09090B',
                border: '1px solid #27272A',
                borderRadius: '6px',
                color: '#71717A',
                outline: 'none',
              }}
            />
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              Additional parameters required by the Authorization URL, if any. Format: &amp;key1=value1&amp;key2=value2
            </span>
          </div>

          {/* Field 4: Token URL * */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                Token URL <span style={{ color: '#F87171' }}>*</span>
              </label>
              <span style={{ fontSize: '0.7rem', color: '#71717A' }}>Field 4</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={tokenUrl}
                style={{
                  width: '100%',
                  padding: '0.6rem 4.5rem 0.6rem 0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#09090B',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  color: '#FAFAFA',
                  outline: 'none',
                }}
              />
              <button
                className={copiedKey === 'tokenUrl' ? 'mono-btn-primary' : 'mono-btn-secondary'}
                onClick={() => handleCopy('tokenUrl', tokenUrl, 'Token URL')}
                style={{ position: 'absolute', right: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                {copiedKey === 'tokenUrl' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              The OAuth 2.0 token exchange endpoint URL.
            </span>
          </div>

          {/* Field 5: Client ID * */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                Client ID <span style={{ color: '#F87171' }}>*</span>
              </label>
              <span style={{ fontSize: '0.7rem', color: '#71717A' }}>Field 5</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={clientId}
                style={{
                  width: '100%',
                  padding: '0.6rem 4.5rem 0.6rem 0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#09090B',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  color: '#FAFAFA',
                  outline: 'none',
                }}
              />
              <button
                className={copiedKey === 'clientId' ? 'mono-btn-primary' : 'mono-btn-secondary'}
                onClick={() => handleCopy('clientId', clientId, 'Client ID')}
                style={{ position: 'absolute', right: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                {copiedKey === 'clientId' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              The Client ID for your MCP server's OAuth application.
            </span>
          </div>

          {/* Field 6: Client Secret (Zero-exposure visual masking) */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                  Client Secret
                </label>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    backgroundColor: isClientSecretSet ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isClientSecretSet ? '#34D399' : '#F87171',
                  }}
                >
                  {isClientSecretSet ? 'STORED IN GSM' : 'NOT CONFIGURED'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#71717A' }}>Field 6</span>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                readOnly
                value={clientSecret || '••••••••••••••••••••••••••••••••••••'}
                style={{
                  width: '100%',
                  padding: '0.6rem 7.5rem 0.6rem 0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#09090B',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  color: isClientSecretSet ? '#FAFAFA' : '#71717A',
                  outline: 'none',
                }}
              />

              <div style={{ position: 'absolute', right: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {isClientSecretSet && (
                  <button
                    className="mono-btn-secondary"
                    onClick={() => setShowSecret(!showSecret)}
                    style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem' }}
                    title={showSecret ? 'Mask Secret' : 'Reveal Secret'}
                  >
                    {showSecret ? 'Hide' : 'Reveal'}
                  </button>
                )}
                <button
                  className={copiedKey === 'clientSecret' ? 'mono-btn-primary' : 'mono-btn-secondary'}
                  onClick={() => handleCopy('clientSecret', clientSecret, 'Client Secret')}
                  disabled={!isClientSecretSet}
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                >
                  {copiedKey === 'clientSecret' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              The Client Secret for your MCP server's OAuth application. (Protected: Click Copy to copy without revealing).
            </span>
          </div>

          {/* Field 7: Scopes */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E4E4E7' }}>
                Scopes
              </label>
              <span style={{ fontSize: '0.7rem', color: '#71717A' }}>Field 7</span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={scopes}
                style={{
                  width: '100%',
                  padding: '0.6rem 4.5rem 0.6rem 0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#09090B',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  color: '#FAFAFA',
                  outline: 'none',
                }}
              />
              <button
                className={copiedKey === 'scopes' ? 'mono-btn-primary' : 'mono-btn-secondary'}
                onClick={() => handleCopy('scopes', scopes, 'Scopes')}
                style={{ position: 'absolute', right: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                {copiedKey === 'scopes' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginTop: '0.3rem' }}>
              Space-separated list of OAuth scopes.
            </span>
          </div>

          {/* Checkbox 1: Enable PKCE Support */}
          <div style={{ marginBottom: '1.25rem', padding: '0.75rem 0.85rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid #27272A' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'default' }}>
              <input
                type="checkbox"
                checked
                readOnly
                style={{ accentColor: '#10B981', width: '16px', height: '16px', marginTop: '2px' }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FAFAFA' }}>
                    Enable PKCE Support
                  </span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34D399', padding: '1px 5px', borderRadius: '4px' }}>
                    CHECK THIS BOX (REQUIRED)
                  </span>
                </div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#A1A1AA', marginTop: '0.2rem' }}>
                  Enable PKCE (RFC 7636) for additional OAuth security. Recommended if your MCP server's OAuth provider supports PKCE.
                </span>
              </div>
            </label>
          </div>

          {/* Checkbox 2: Use HTTP Basic Authentication */}
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem 0.85rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid #27272A' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'default' }}>
              <input
                type="checkbox"
                checked
                readOnly
                style={{ accentColor: '#10B981', width: '16px', height: '16px', marginTop: '2px' }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FAFAFA' }}>
                    Use HTTP Basic Authentication
                  </span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34D399', padding: '1px 5px', borderRadius: '4px' }}>
                    CHECK THIS BOX (SUPPORTED)
                  </span>
                </div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#A1A1AA', marginTop: '0.2rem' }}>
                  Use HTTP Basic auth (sends client ID and secret in Authorization header) instead of including them in the request body.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Guide Notes */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #27272A', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#A1A1AA' }}>
              <ThemeIcon name="check" size={14} />
              <span>After filling in the fields, click <strong>Verify Auth</strong> in Google Cloud to test the connection.</span>
            </div>
            <a
              href="https://console.cloud.google.com/gen-app-builder/data-stores"
              target="_blank"
              rel="noopener noreferrer"
              className="mono-btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', textDecoration: 'none' }}
            >
              Open Data Stores ↗
            </a>
          </div>
        </div>
      )}

      {/* VIEW 2: RAW JSON PAYLOAD */}
      {activeView === 'json' && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Gemini Enterprise Integration Blueprint JSON
            </span>
            <button
              className="mono-btn-secondary"
              onClick={copyAllJson}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
            >
              Copy JSON Manifest
            </button>
          </div>
          <pre
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-subtle)',
              padding: '1rem',
              borderRadius: '6px',
              color: '#34D399',
              fontSize: '0.8rem',
              overflowX: 'auto',
              fontFamily: 'monospace',
              margin: 0,
            }}
          >
            {JSON.stringify(
              {
                mcp_server: {
                  name: 'enterprise-mcp-server',
                  version: '1.0.0',
                  protocol: '2024-11-05',
                  endpoint: mcpServerUrl,
                  base_url: cleanBase,
                },
                authentication: {
                  type: 'oauth2_pkce',
                  grant_type: 'authorization_code',
                  response_type: 'code',
                  code_challenge_method: 'S256',
                  authorization_url: authUrl,
                  token_url: tokenUrl,
                  client_id: clientId,
                  client_secret: isClientSecretSet ? '***STORED_IN_GSM***' : '***MISSING***',
                  scopes: scopes,
                  enable_pkce: true,
                  use_http_basic_auth: true,
                },
                capabilities: {
                  tools_count: 59,
                  services: ['bigquery', 'xero', 'firestore', 'sagehr'],
                },
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
};
