import React, { useState } from 'react';
import { SecretItem } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface UpdateSecretModalProps {
  secret: SecretItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (secretKey: string, secretValue: string) => Promise<void>;
}

export const UpdateSecretModal: React.FC<UpdateSecretModalProps> = ({
  secret,
  isOpen,
  onClose,
  onSave,
}) => {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !secret) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setError('Secret value cannot be empty');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSave(secret.key, value.trim());
      setValue('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update secret in Secret Manager');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="shield" size={20} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {secret.isConfigured ? 'Update Secret Version' : 'Initialize Secret'}
            </h3>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.15rem' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="code-font" style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                {secret.key}
              </span>
              {secret.required && (
                <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                  REQUIRED
                </span>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', margin: '0 0 0.85rem 0', lineHeight: 1.45 }}>
              {secret.description}
            </p>

            <div
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                padding: '0.75rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.775rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              Writing this value will immediately create a new version in <strong>Google Cloud Secret Manager</strong>. Under zero-exposure policy, secret values are never readable or transmitted back to this browser.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.725rem', letterSpacing: '0.05em' }}>
              NEW SECRET VALUE
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showValue ? 'text' : 'password'}
                className="form-input code-font"
                placeholder="Paste token, API key, private key, or client secret..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                required
                style={{ paddingRight: '4.5rem', fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                {showValue ? 'HIDE' : 'SHOW'}
              </button>
            </div>
            {error && <p style={{ color: 'var(--rose-bright)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}
          </div>

          <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !value.trim()}>
              <ThemeIcon name="shield" size={13} />
              <span>{loading ? 'Writing to Secret Manager...' : 'Save to Secret Manager'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
