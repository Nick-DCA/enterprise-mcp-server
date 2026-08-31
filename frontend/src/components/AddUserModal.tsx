import React, { useState } from 'react';
import { ServiceId } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddUser: (data: {
    userEmail: string;
    fullName: string;
    isAdmin: boolean;
    allowedServices: ServiceId[];
    readOnlyOnly: boolean;
  }) => Promise<void>;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onAddUser }) => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [readOnlyOnly, setReadOnlyOnly] = useState(false);
  const [allowedServices, setAllowedServices] = useState<ServiceId[]>([
    'xero',
    'bigquery',
    'firestore',
    'sagehr',
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleService = (id: ServiceId) => {
    if (allowedServices.includes(id)) {
      setAllowedServices(allowedServices.filter((s) => s !== id));
    } else {
      setAllowedServices([...allowedServices, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onAddUser({
        userEmail: email.trim(),
        fullName: fullName.trim() || email.split('@')[0],
        isAdmin,
        readOnlyOnly,
        allowedServices,
      });
      setEmail('');
      setFullName('');
      setIsAdmin(false);
      setReadOnlyOnly(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="users" size={20} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Add Authorized User Access
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
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.725rem', letterSpacing: '0.05em' }}>
              CORPORATE EMAIL ADDRESS
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.725rem', letterSpacing: '0.05em' }}>
              FULL NAME
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Sarah Jenkins"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <span>Administrator (Full platform governance & configuration access)</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={readOnlyOnly}
                onChange={(e) => setReadOnlyOnly(e.target.checked)}
              />
              <span>Enforce Read-Only Only (Restricted to read queries)</span>
            </label>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.725rem', letterSpacing: '0.05em' }}>
              PERMITTED SAAS SERVICES
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              {(['xero', 'bigquery', 'firestore', 'sagehr'] as ServiceId[]).map((id) => {
                const isSelected = allowedServices.includes(id);
                return (
                  <label
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      background: isSelected ? 'var(--bg-input)' : 'var(--bg-card)',
                      border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.825rem',
                      color: 'var(--text-primary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleService(id)}
                    />
                    <ThemeIcon name={id as any} size={14} />
                    <span style={{ textTransform: 'capitalize' }}>
                      {id === 'sagehr' ? 'Sage HR' : id === 'bigquery' ? 'BigQuery' : id}
                    </span>
                  </label>
                );
              })}
            </div>
            {error && <p style={{ color: 'var(--rose-bright)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}
          </div>

          <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !email.trim()}>
              <ThemeIcon name="plus" size={13} />
              <span>{loading ? 'Adding User...' : 'Grant User Access'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
