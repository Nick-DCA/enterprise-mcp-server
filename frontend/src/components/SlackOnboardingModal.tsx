import React, { useState } from 'react';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface SlackOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSecrets?: (category: string) => void;
  onRunTest?: (serviceId: string) => void;
}

export const SlackOnboardingModal: React.FC<SlackOnboardingModalProps> = ({
  isOpen,
  onClose,
  onNavigateToSecrets,
  onRunTest,
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const PRODUCTION_ORIGIN = 'https://enterprise-mcp-server-1058873375196.europe-west1.run.app';
  const callbackUrl = `${PRODUCTION_ORIGIN}/api/connectors/slack/callback`;
  const scopesList = 'channels:read,groups:read,im:read,mpim:read,search:read,users:read,users:read.email';

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const toggleStepCompleted = (stepNum: number) => {
    setCompletedSteps((prev) => ({ ...prev, [stepNum]: !prev[stepNum] }));
  };

  const steps = [
    { num: 1, title: 'Create App' },
    { num: 2, title: 'Credentials' },
    { num: 3, title: 'Redirect URL' },
    { num: 4, title: 'User Scopes' },
    { num: 5, title: 'Install App' },
    { num: 6, title: 'Stage & Test' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '740px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(168, 85, 247, 0.15)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#C084FC',
              }}
            >
              <ThemeIcon name="sparkles" size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Slack Federated Search &bull; Admin Onboarding Guide
              </h3>
              <p style={{ margin: 0, marginTop: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Step-by-step procedure to create your Slack App, enable Token Rotation, and stage secrets.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Stepper Navigation */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0.65rem 1rem',
            gap: '0.35rem',
            overflowX: 'auto',
          }}
        >
          {steps.map((s) => {
            const isDone = Boolean(completedSteps[s.num]);
            const isCurrent = activeStep === s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setActiveStep(s.num)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: isCurrent
                    ? '1px solid rgba(168, 85, 247, 0.6)'
                    : '1px solid transparent',
                  background: isCurrent
                    ? 'rgba(168, 85, 247, 0.18)'
                    : isDone
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'transparent',
                  color: isCurrent ? '#E9D5FF' : isDone ? '#34D399' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: isDone ? '#10B981' : isCurrent ? '#A855F7' : 'var(--border-subtle)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                  }}
                >
                  {isDone ? '✓' : s.num}
                </span>
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body: Active Step Detail */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* STEP 1: CREATE APP */}
          {activeStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  STEP 1 OF 6
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(completedSteps[1])}
                    onChange={() => toggleStepCompleted(1)}
                  />
                  <span>Mark step as completed</span>
                </label>
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Create a New App in Slack Developer Portal
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Begin by opening the official Slack App Management console with your corporate Slack workspace administrator account.
                </p>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
                  <li>Click the button below to open the Slack App console in a new tab.</li>
                  <li>Click <strong>Create New App</strong> and select <strong>From scratch</strong>.</li>
                  <li>Set <strong>App Name</strong> to <code>Gemini Enterprise Search</code> (or your company preferred title).</li>
                  <li>Select your primary organization workspace in the <strong>Development Slack Workspace</strong> dropdown.</li>
                  <li>Click <strong>Create App</strong>.</li>
                </ol>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <a
                  href="https://api.slack.com/apps?new_app=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#7C3AED' }}
                >
                  <ThemeIcon name="globe" size={15} />
                  <span>Open Slack App Console (api.slack.com/apps)</span>
                </a>
              </div>
            </div>
          )}

          {/* STEP 2: CREDENTIALS */}
          {activeStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  STEP 2 OF 6
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(completedSteps[2])}
                    onChange={() => toggleStepCompleted(2)}
                  />
                  <span>Mark step as completed</span>
                </label>
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Copy App Credentials from Basic Information
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Your Slack App generates a Client ID and Client Secret that will authenticate the MCP gateway during OAuth code exchanges.
                </p>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
                  <li>In the left sidebar of your app, click on <strong>Settings &rarr; Basic Information</strong>.</li>
                  <li>Scroll down to the <strong>App Credentials</strong> section.</li>
                  <li>
                    Copy the <strong>Client ID</strong> (you will paste this into <code>SLACK_CLIENT_ID</code> in the Secrets Vault).
                  </li>
                  <li>
                    Click <em>Show</em> on <strong>Client Secret</strong> and copy it (you will paste this into <code>SLACK_CLIENT_SECRET</code> in the Secrets Vault).
                  </li>
                </ol>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.825rem', color: '#38BDF8' }}>
                <strong>Staging Pro-tip:</strong> You do not need to paste these immediately. Keep your Slack tab open, finish the settings in Steps 3–5, and in Step 6 we will jump directly to the Secrets Vault to stage them together!
              </div>
            </div>
          )}

          {/* STEP 3: REDIRECT URL */}
          {activeStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  STEP 3 OF 6
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(completedSteps[3])}
                    onChange={() => toggleStepCompleted(3)}
                  />
                  <span>Mark step as completed</span>
                </label>
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Configure OAuth 2.0 Redirect URL
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  When employees click the 1-click Slack authorization prompt in Gemini Enterprise, Slack redirects their browser back to this gateway endpoint to vault their token.
                </p>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
                  <li>In your Slack App console, click <strong>Features &rarr; OAuth & Permissions</strong> in the sidebar.</li>
                  <li>Scroll to the <strong>Redirect URLs</strong> section and click <strong>Add New Redirect URL</strong>.</li>
                  <li>Paste the production callback URL below, click <strong>Add</strong>, and then click <strong>Save URLs</strong>.</li>
                </ol>
              </div>

              {/* Copyable Callback URL box */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Production Gateway Redirect URL:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input code-font"
                    value={callbackUrl}
                    style={{ background: 'rgba(15, 23, 42, 0.8)', color: '#38BDF8', fontWeight: 600 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(callbackUrl, 'callback')}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {copiedField === 'callback' ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: USER SCOPES */}
          {activeStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  STEP 4 OF 6
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(completedSteps[4])}
                    onChange={() => toggleStepCompleted(4)}
                  />
                  <span>Mark step as completed</span>
                </label>
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Configure User Token Scopes (Zero-Trust Delegation)
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Define the read-only scopes that allow delegated search across public channels, private channels, direct messages, and user identities.
                </p>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.825rem', color: '#F87171' }}>
                <strong>CRITICAL SECURITY DIRECTIVE:</strong> Add these under <strong>User Token Scopes</strong>, NEVER under Bot Token Scopes! User scopes guarantee that search results strictly honor each employee's personal workspace membership and channel permissions.
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  Under <strong>OAuth & Permissions &rarr; Scopes &rarr; User Token Scopes</strong>, click <strong>Add an OAuth Scope</strong> and add all 7 scopes:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>channels:read</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        View basic information about public channels in a workspace
                      </div>
                    </div>
                    <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>Public Channels</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>groups:read</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        View basic information about a user's private channels
                      </div>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>Private Channels</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>im:read</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        View basic information about a user's direct messages
                      </div>
                    </div>
                    <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>Direct Messages</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>mpim:read</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        View basic information about a user's group direct messages
                      </div>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>Group DMs</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>search:read</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Search a workspace's content
                      </div>
                    </div>
                    <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>Federated Search</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>users:read</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        View people in a workspace
                      </div>
                    </div>
                    <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>People & Profiles</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div>
                      <code style={{ color: '#34D399', fontWeight: 700 }}>users:read.email</code>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        View email addresses of people in a workspace
                      </div>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>Email Mapping</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopy(scopesList, 'scopes')}
                >
                  {copiedField === 'scopes' ? 'Copied' : 'Copy Scopes List'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: TOKEN ROTATION */}
          {activeStep === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  STEP 5 OF 6
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(completedSteps[5])}
                    onChange={() => toggleStepCompleted(5)}
                  />
                  <span>Mark step as completed</span>
                </label>
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Opt-In to Token Rotation & Install App to Workspace
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Enable automated short-lived credential rotation (12h access / 90d refresh) and install the app into your Slack workspace.
                </p>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
                  <li>In <strong>Features &rarr; OAuth & Permissions</strong>, scroll down to the <strong>Token Rotation</strong> section.</li>
                  <li>Click <strong>"Opt-in to Token Rotation"</strong> and confirm the Slack modal. <em>(If Slack prompts for PKCE, click Cancel)</em>.</li>
                  <li>In the left sidebar under the <strong>Settings</strong> heading, click on <strong>Install App</strong>.</li>
                  <li>Click the green <strong>Install to Workspace</strong> button (or <strong>Reinstall to Workspace</strong> if updating existing permissions).</li>
                  <li>Review the 7 requested user permissions and click <strong>Allow</strong> (or submit for workspace admin approval if your organization requires it).</li>
                </ol>
              </div>

              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.825rem', color: '#34D399' }}>
                <strong>Automated Gateway Invariant:</strong> The MCP gateway server automatically monitors expiration and refreshes user access tokens 5 minutes before expiration (<code>now &gt;= expiresAt - 300s</code>) without any manual user intervention.
              </div>
            </div>
          )}

          {/* STEP 6: STAGE & TEST */}
          {activeStep === 6 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-emerald" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  FINAL STEP (6 OF 6)
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(completedSteps[6])}
                    onChange={() => toggleStepCompleted(6)}
                  />
                  <span>Mark onboarding as completed</span>
                </label>
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Stage Secrets in Secrets Vault & Run Live Diagnostics
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  You are ready to plug your credentials into the staging platform. Clicking below will jump directly to the Secrets Vault tab with the Slack category pre-selected.
                </p>
              </div>

              {/* Two Column Action Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-input)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#C084FC', marginBottom: '0.5rem' }}>
                    1. Stage in Secrets Vault
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', flex: 1 }}>
                    Store <code>SLACK_CLIENT_ID</code> and <code>SLACK_CLIENT_SECRET</code> securely in Google Secret Manager.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ background: '#9333EA', justifyContent: 'center' }}
                    onClick={() => {
                      onClose();
                      if (onNavigateToSecrets) {
                        onNavigateToSecrets('Slack');
                      }
                    }}
                  >
                    <ThemeIcon name="secrets" size={14} />
                    <span>Open Secrets Vault (Slack)</span>
                  </button>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34D399', marginBottom: '0.5rem' }}>
                    2. Run Diagnostic Test
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', flex: 1 }}>
                    Verify Slack API reachability, credential validity, and measure round-trip probe latency.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ borderColor: 'rgba(16, 185, 129, 0.5)', color: '#34D399', justifyContent: 'center' }}
                    onClick={() => {
                      onClose();
                      if (onRunTest) {
                        onRunTest('slack');
                      }
                    }}
                  >
                    <ThemeIcon name="lightning" size={14} />
                    <span>Run Diagnostic Probe</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActiveStep((prev) => Math.max(prev - 1, 1))}
            disabled={activeStep === 1}
          >
            Previous Step
          </button>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Step {activeStep} of 6
          </span>

          {activeStep < 6 ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ background: '#7C3AED' }}
              onClick={() => {
                setCompletedSteps((prev) => ({ ...prev, [activeStep]: true }));
                setActiveStep((prev) => Math.min(prev + 1, 6));
              }}
            >
              Next Step
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ background: '#059669' }}
              onClick={onClose}
            >
              Done / Close Guide
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
