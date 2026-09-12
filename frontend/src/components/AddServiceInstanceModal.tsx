import React, { useState, useEffect } from 'react';
import { ServiceId } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface AddServiceInstanceModalProps {
  isOpen: boolean;
  initialServiceId?: ServiceId;
  onClose: () => void;
  onCreate: (instanceData: {
    serviceId: ServiceId;
    customerName: string;
    name: string;
    description: string;
    settings: Record<string, any>;
    requiredSecrets?: string[];
  }) => Promise<void>;
}

export const AddServiceInstanceModal: React.FC<AddServiceInstanceModalProps> = ({
  isOpen,
  initialServiceId = 'bigquery',
  onClose,
  onCreate,
}) => {
  const [serviceId, setServiceId] = useState<ServiceId>(initialServiceId);
  const [customerName, setCustomerName] = useState('');
  const [customName, setCustomName] = useState('');
  const [description, setDescription] = useState('');
  const [tableUrl, setTableUrl] = useState('my-project.analytics_dataset.invoices_table');
  const [location, setLocation] = useState('EU');
  const [tenantId, setTenantId] = useState('');
  const [customSecretPrefix, setCustomSecretPrefix] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setServiceId(initialServiceId);
      setCustomerName('');
      setCustomName('');
      setDescription('');
      setTableUrl('my-project.analytics_dataset.invoices_table');
      setLocation('EU');
      setTenantId('');
      setCustomSecretPrefix('');
    }
  }, [isOpen, initialServiceId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    setLoading(true);
    try {
      const cleanCustomer = customerName.trim();
      const defaultName =
        serviceId === 'bigquery'
          ? `Google BigQuery (${cleanCustomer})`
          : serviceId === 'xero'
          ? `Xero Accounting (${cleanCustomer})`
          : serviceId === 'firestore'
          ? `Cloud Firestore (${cleanCustomer})`
          : serviceId === 'sagehr'
          ? `Sage HR (${cleanCustomer})`
          : `Slack Federated Search (${cleanCustomer})`;

      let initialSettings: Record<string, any> = {};
      let requiredSecrets: string[] = [];

      if (serviceId === 'bigquery') {
        initialSettings = {
          location,
          tables: tableUrl ? [tableUrl.trim()] : [],
          maxBytesBilled: 1073741824, // 1 GB
          maxRowsReturned: 100,
        };
        if (customSecretPrefix) {
          requiredSecrets = [`BIGQUERY_KEY_${customSecretPrefix.toUpperCase()}`];
        }
      } else if (serviceId === 'xero') {
        const secSuffix = (customSecretPrefix || cleanCustomer).toUpperCase().replace(/[^A-Z0-9]/g, '_');
        initialSettings = {
          tenantId: tenantId.trim(),
          scopes: 'accounting.transactions accounting.contacts accounting.settings accounting.reports.read',
          rateLimitMaxPerMin: 60,
        };
        requiredSecrets = [
          `XERO_CLIENT_ID_${secSuffix}`,
          `XERO_CLIENT_SECRET_${secSuffix}`,
        ];
      } else if (serviceId === 'firestore') {
        initialSettings = {
          databaseId: '(default)',
          collections: [],
          blockedCollections: ['system_metadata', 'services_config', 'users_access', 'user_sessions', 'sessions', 'audit_logs'],
          excludedFields: ['password', 'token', 'ssn', 'apikey'],
          allowWrites: false,
          maxDocuments: 50,
        };
      } else if (serviceId === 'sagehr') {
        const secSuffix = (customSecretPrefix || cleanCustomer).toUpperCase().replace(/[^A-Z0-9]/g, '_');
        initialSettings = {
          subdomain: cleanCustomer.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          maskedFields: ['salary', 'bank_account', 'national_id', 'passport_number'],
          allowWrites: true,
        };
        requiredSecrets = [`SAGE_HR_API_KEY_${secSuffix}`];
      } else if (serviceId === 'slack') {
        const secSuffix = (customSecretPrefix || cleanCustomer).toUpperCase().replace(/[^A-Z0-9]/g, '_');
        initialSettings = {
          maxResults: 10,
          defaultResults: 5,
          rateLimitPerMinute: 10,
          includeDMs: true,
          maxSnippetLength: 500,
        };
        requiredSecrets = [
          `SLACK_CLIENT_ID_${secSuffix}`,
          `SLACK_CLIENT_SECRET_${secSuffix}`,
        ];
      }

      await onCreate({
        serviceId,
        customerName: cleanCustomer,
        name: customName.trim() || defaultName,
        description: description.trim() || `Customer SaaS connector instance configured for ${cleanCustomer}.`,
        settings: initialSettings,
        requiredSecrets,
      });

      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '560px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="plus" size={20} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Add Customer Connector Instance</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Service Connector Type Selector */}
          <div className="form-group">
            <label className="form-label">Select Connector Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${serviceId === 'bigquery' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setServiceId('bigquery')}
                style={{ justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
              >
                <ThemeIcon name="bigquery" size={16} />
                <span>Google BigQuery</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${serviceId === 'xero' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setServiceId('xero')}
                style={{ justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
              >
                <ThemeIcon name="xero" size={16} />
                <span>Xero Accounting</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${serviceId === 'firestore' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setServiceId('firestore')}
                style={{ justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
              >
                <ThemeIcon name="firestore" size={16} />
                <span>Cloud Firestore</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${serviceId === 'sagehr' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setServiceId('sagehr')}
                style={{ justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
              >
                <ThemeIcon name="sagehr" size={16} />
                <span>Sage HR</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${serviceId === 'slack' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setServiceId('slack')}
                style={{ justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
              >
                <ThemeIcon name="search" size={16} />
                <span>Slack Federated</span>
              </button>
            </div>
          </div>

          {/* Customer Name */}
          <div className="form-group">
            <label className="form-label">Customer / Organization Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Acme Corp UK, Finance Dept, Logistics Group"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
            <div className="form-hint">Partitions configuration, rate quotas, and secret vault keys by customer.</div>
          </div>

          {/* Optional Display Label Override */}
          <div className="form-group">
            <label className="form-label">Instance Display Name (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder={customerName ? `${serviceId.toUpperCase()} (${customerName})` : 'Leave empty for auto-generated name'}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Instance Description</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. Financial analytics connector for customer invoicing..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Specific Initial Settings based on Service */}
          {serviceId === 'bigquery' && (
            <>
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Initial BigQuery Target Resource</label>
                  {(() => {
                    const raw = tableUrl.trim().replace(':', '.');
                    const parts = raw.split('.').filter(Boolean);
                    if (parts.length >= 3) {
                      return <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>Single Table Scope</span>;
                    } else if (parts.length === 2) {
                      return <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>Dataset Scope (All Tables)</span>;
                    } else if (parts.length === 1 && raw) {
                      return <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>Entire Project Scope</span>;
                    }
                    return null;
                  })()}
                </div>
                <input
                  type="text"
                  className="form-input code-font"
                  placeholder="e.g. project.dataset.table, project.dataset, or project"
                  value={tableUrl}
                  onChange={(e) => setTableUrl(e.target.value)}
                />
                <div className="form-hint" style={{ marginTop: '0.35rem', lineHeight: 1.4 }}>
                  {(() => {
                    const raw = tableUrl.trim().replace(':', '.');
                    const parts = raw.split('.').filter(Boolean);
                    if (parts.length >= 3) {
                      return `🎯 Strict table scope: Only table/view [${parts[2]}] will be accessible through MCP.`;
                    } else if (parts.length === 2) {
                      return `📁 Dataset scope: All tables and views in dataset [${parts[1]}] will be queryable.`;
                    } else if (parts.length === 1 && raw) {
                      return `🌐 Project scope: All datasets in project [${parts[0]}] will be queryable.`;
                    }
                    return 'Enter project.dataset.table (single table), project.dataset (all tables in dataset), or project (entire project).';
                  })()}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">GCP Dataset Location</label>
                <select
                  className="form-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="EU">EU (Multi-Region Europe)</option>
                  <option value="US">US (Multi-Region United States)</option>
                  <option value="europe-west1">europe-west1 (Belgium)</option>
                  <option value="europe-west2">europe-west2 (London)</option>
                  <option value="us-central1">us-central1 (Iowa)</option>
                  <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
                </select>
              </div>
            </>
          )}

          {serviceId === 'xero' && (
            <>
              <div className="form-group">
                <label className="form-label">Xero Tenant ID (Optional UUID)</label>
                <input
                  type="text"
                  className="form-input code-font"
                  placeholder="e.g. 5b9f7a60-23a1-43e8-8d89-7cfdb2534571"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Customer Secret Manager Key Suffix</label>
                <input
                  type="text"
                  className="form-input code-font"
                  placeholder="e.g. ACME_UK (Creates XERO_CLIENT_ID_ACME_UK)"
                  value={customSecretPrefix}
                  onChange={(e) => setCustomSecretPrefix(e.target.value)}
                />
                <div className="form-hint">Will automatically register in the Secrets Vault for instant GCP Secret Manager initialization.</div>
              </div>
            </>
          )}

          <div className="modal-footer" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !customerName.trim()}>
              <ThemeIcon name="plus" size={14} />
              <span>{loading ? 'Creating...' : 'Create Connector Instance'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
