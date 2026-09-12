import React, { useState, useEffect } from 'react';
import { UserAccessItem, ServiceId } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface EditPermissionsModalProps {
  user: UserAccessItem | null;
  currentUserEmail?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (
    email: string,
    permissions: {
      fullName: string;
      isAdmin: boolean;
      allowedServices: ServiceId[];
      readOnlyOnly: boolean;
    }
  ) => Promise<void>;
}

export const EditPermissionsModal: React.FC<EditPermissionsModalProps> = ({
  user,
  currentUserEmail,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [fullName, setFullName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [readOnlyOnly, setReadOnlyOnly] = useState(false);
  const [allowedServices, setAllowedServices] = useState<ServiceId[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setIsAdmin(user.isAdmin);
      setReadOnlyOnly(user.readOnlyOnly);
      setAllowedServices(user.allowedServices || []);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const isSelf = user.userEmail.toLowerCase() === currentUserEmail?.toLowerCase();

  const toggleService = (id: ServiceId) => {
    if (allowedServices.includes(id)) {
      setAllowedServices(allowedServices.filter((s) => s !== id));
    } else {
      setAllowedServices([...allowedServices, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await onUpdate(user.userEmail, {
        fullName,
        isAdmin,
        readOnlyOnly,
        allowedServices,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="edit" size={20} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Edit User Permissions
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
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              USER ACCOUNT
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {user.userEmail} {isSelf && <span className="badge badge-cyan" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>YOU</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.725rem', letterSpacing: '0.05em' }}>
              FULL NAME
            </label>
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: isSelf ? 'not-allowed' : 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', opacity: isSelf ? 0.7 : 1 }}>
              <input
                type="checkbox"
                checked={isAdmin}
                disabled={isSelf}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <span>
                Administrator Privileges (Can manage portal & configs)
                {isSelf && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>(You cannot revoke your own administrator privileges)</span>}
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={readOnlyOnly}
                onChange={(e) => setReadOnlyOnly(e.target.checked)}
              />
              <span>Strict Read-Only Mode (Restricted to read queries)</span>
            </label>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.725rem', letterSpacing: '0.05em' }}>
              ALLOWED SAAS CONNECTORS
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              {(['xero', 'bigquery', 'firestore', 'sagehr', 'slack'] as ServiceId[]).map((id) => {
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
                      {id === 'sagehr' ? 'Sage HR' : id === 'bigquery' ? 'BigQuery' : id === 'slack' ? 'Slack' : id}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {error && <p style={{ color: 'var(--rose-bright)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}

          <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <ThemeIcon name="edit" size={13} />
              <span>{loading ? 'Saving Changes...' : 'Save Permissions'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
