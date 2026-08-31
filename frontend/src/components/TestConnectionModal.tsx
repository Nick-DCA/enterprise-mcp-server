import React, { useState } from 'react';
import { DiagnosticTestResult } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface TestConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: DiagnosticTestResult | null;
  loading: boolean;
  serviceName: string;
}

export const TestConnectionModal: React.FC<TestConnectionModalProps> = ({
  isOpen,
  onClose,
  result,
  loading,
  serviceName,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showRawDetails, setShowRawDetails] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="lightning" size={20} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              Upstream Diagnostic Probe: {serviceName}
            </h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  margin: '0 auto 1.25rem',
                  border: '3px solid var(--border-subtle)',
                  borderTopColor: 'var(--accent-bright)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                Executing Capability & Permission Probes...
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', margin: 0, maxWidth: '440px', marginInline: 'auto' }}>
                Testing Google Cloud IAM bindings, query engine job creation, tenant linkages, and dataset boundaries.
              </p>
            </div>
          ) : result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Telemetry Metrics Strip */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1.15rem',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: '0.85rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Health Status
                  </span>
                  <span
                    className={`badge ${result.status === 'HEALTHY' ? 'badge-emerald' : result.status === 'WARNING' ? 'badge-amber' : 'badge-rose'}`}
                    style={{ marginTop: '4px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span className="pulse-dot" />
                    <span>{result.status}</span>
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Response Latency
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: result.latencyMs < 1000 ? 'var(--emerald-bright)' : 'var(--amber-bright)',
                      fontSize: '1.1rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {result.latencyMs} ms
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Instance ID
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {result.instanceId || serviceName}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Probe Timestamp
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Upstream Error Banner (if any) */}
              {result.error && (
                <div
                  style={{
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--rose-bright)',
                    fontSize: '0.825rem',
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Upstream Diagnostic Error:</strong>
                  <span>{result.error}</span>
                </div>
              )}

              {/* View Dependency Alert Banner (if any) */}
              {result.details?.viewDependencyAlert && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--amber-bright)',
                    fontSize: '0.825rem',
                    lineHeight: 1.45,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                    <ThemeIcon name="alert" size={16} />
                    <span>View Source Dependency Notice</span>
                  </div>
                  <span>{result.details.viewDependencyAlert}. See the required IAM remediation command in the matrix below.</span>
                </div>
              )}

              {/* Scope Level & Resource Summary Card */}
              {result.details?.scopeBadge && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Resource Scope:</span>
                    <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
                      {result.details.scopeBadge}
                    </span>
                    {result.details.tableType && result.details.tableType !== 'AUTO' && (
                      <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                        {result.details.tableType}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {result.details.testedResource}
                  </span>
                </div>
              )}

              {/* Granular IAM & Permission Probes Checklist */}
              {result.permissions && result.permissions.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Access Permissions & Capability Matrix
                    </label>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      {result.permissions.filter((p) => p.status === 'PASS').length} of {result.permissions.length} Passed
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {result.permissions.map((perm, idx) => {
                      const isPass = perm.status === 'PASS';
                      const isWarn = perm.status === 'WARNING';

                      return (
                        <div
                          key={perm.id || idx}
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            border: `1px solid ${isPass ? 'var(--border-subtle)' : isWarn ? 'rgba(245, 158, 11, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: '0.85rem 1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.45rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  backgroundColor: isPass ? 'rgba(16, 185, 129, 0.15)' : isWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                  color: isPass ? 'var(--emerald-bright)' : isWarn ? 'var(--amber-bright)' : 'var(--rose-bright)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                }}
                              >
                                {isPass ? '✓' : isWarn ? '!' : '✕'}
                              </div>
                              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                                {perm.name}
                              </span>
                            </div>

                            <span
                              className={`badge ${isPass ? 'badge-emerald' : isWarn ? 'badge-amber' : 'badge-rose'}`}
                              style={{ fontSize: '0.675rem', padding: '2px 7px' }}
                            >
                              {perm.role}
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {perm.description}
                          </p>

                          {/* Specific Error & Remediation Command */}
                          {perm.fixCommand && (
                            <div
                              style={{
                                marginTop: '0.35rem',
                                backgroundColor: 'var(--bg-main)',
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                borderRadius: '4px',
                                padding: '0.65rem 0.85rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--amber-bright)', fontWeight: 600, textTransform: 'uppercase' }}>
                                  Least-Privilege gcloud Remediation Command
                                </span>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                  onClick={() => copyToClipboard(perm.fixCommand!, idx)}
                                >
                                  {copiedIndex === idx ? 'Copied ✓' : 'Copy Command'}
                                </button>
                              </div>
                              <code
                                style={{
                                  display: 'block',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.725rem',
                                  color: 'var(--accent-bright)',
                                  wordBreak: 'break-all',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {perm.fixCommand}
                              </code>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Technical Diagnostic Metadata Accordion */}
              {result.details && (
                <div style={{ marginTop: '0.25rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'space-between' }}
                    onClick={() => setShowRawDetails(!showRawDetails)}
                  >
                    <span>Technical Diagnostic Parameters & Configuration</span>
                    <span>{showRawDetails ? '▲ Hide' : '▼ View'}</span>
                  </button>

                  {showRawDetails && (
                    <pre
                      style={{
                        marginTop: '0.5rem',
                        background: 'var(--bg-input)',
                        padding: '0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.725rem',
                        overflowX: 'auto',
                        maxHeight: '200px',
                      }}
                    >
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              No diagnostic test results available.
            </p>
          )}
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close Probe
          </button>
        </div>
      </div>
    </div>
  );
};
