import React, { useState } from 'react';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface MerchantConfigPageProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  onNavigateTab?: (tab: string) => void;
}

export type PricingTier = 'starter' | 'growth' | 'enterprise';

export interface ProductConfigState {
  title: string;
  sku: string;
  category: string;
  isPublic: boolean;
  description: string;
  billingCycle: 'monthly' | 'annual';
  selectedTier: PricingTier;
  rpmLimit: number;
  connectors: {
    xero: boolean;
    xeroAccess: 'read' | 'write';
    bigquery: boolean;
    bigqueryAccess: 'read' | 'write';
    firestore: boolean;
    firestoreAccess: 'read' | 'write';
    sagehr: boolean;
    sagehrAccess: 'read' | 'write';
  };
  webhookUrl: string;
  hmacSecret: string;
}

export const MerchantConfigPage: React.FC<MerchantConfigPageProps> = ({ onShowToast }) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD');

  const [config, setConfig] = useState<ProductConfigState>({
    title: 'Enterprise Multi-SaaS Intelligence Suite',
    sku: 'MCP-PROD-9481',
    category: 'Cloud SaaS Connectors',
    isPublic: true,
    description: 'High-throughput single-container MCP engine binding Xero, BigQuery, Firestore, and Sage HR with Google Gemini.',
    billingCycle: 'monthly',
    selectedTier: 'growth',
    rpmLimit: 120,
    connectors: {
      xero: true,
      xeroAccess: 'write',
      bigquery: true,
      bigqueryAccess: 'read',
      firestore: true,
      firestoreAccess: 'write',
      sagehr: true,
      sagehrAccess: 'read',
    },
    webhookUrl: 'https://api.company.com/v1/mcp/webhooks',
    hmacSecret: 'whsec_98f7a2c4e1b0d5c8a3f9e2b1d4c7a0f6',
  });

  const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';

  const tierPrices = {
    starter: config.billingCycle === 'monthly' ? 49 : 39,
    growth: config.billingCycle === 'monthly' ? 199 : 159,
    enterprise: config.billingCycle === 'monthly' ? 899 : 719,
  };

  const handleDeployProduct = () => {
    if (onShowToast) {
      onShowToast(`Product "${config.title}" deployed to production catalog successfully!`, 'success');
    }
  };

  const handleRotateKey = () => {
    const newKey = `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setConfig((prev) => ({ ...prev, hmacSecret: newKey }));
    if (onShowToast) onShowToast('Rotated HMAC Signing Key', 'info');
  };

  return (
    <div className="merchant-page">
      {/* 1. Header with Store Identity & Actions */}
      <header className="merchant-header">
        <div className="merchant-header-left">
          <div className="merchant-store-badge">
            <ThemeIcon name="shop" size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Merchant Product Configurator
              </h2>
              <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                PRODUCTION v2.0
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Configure pricing, quota limits, SaaS connectors, and API packaging.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as any)}
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>

          <button className="merchant-btn-emerald" onClick={handleDeployProduct}>
            <ThemeIcon name="checkCircle" size={16} />
            <span>Publish to Storefront</span>
          </button>
        </div>
      </header>

      {/* 2. 5-Step Horizontal Stepper */}
      <div className="merchant-stepper">
        {[
          { step: 1, label: '1. Identity', icon: 'shop' as const },
          { step: 2, label: '2. Pricing & Quotas', icon: 'creditCard' as const },
          { step: 3, label: '3. SaaS Connectors', icon: 'lightning' as const },
          { step: 4, label: '4. Secret Vault', icon: 'shield' as const },
          { step: 5, label: '5. JSON Manifest', icon: 'code' as const },
        ].map((s) => (
          <button
            key={s.step}
            className={`merchant-step-btn ${activeStep === s.step ? 'active' : ''}`}
            onClick={() => setActiveStep(s.step)}
          >
            <span className="merchant-step-num">{s.step}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* 3. Main Workspace Grid (Left: Active Step Config, Right: Live Customer Mockup) */}
      <div className="merchant-grid">
        {/* Left Form View */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* STEP 1: Identity */}
          {activeStep === 1 && (
            <div className="merchant-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Step 1: Product Definition & Metadata
              </h3>

              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  placeholder="e.g. Finance & Analytics Pro"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Product SKU</label>
                  <input
                    type="text"
                    className="form-input code-font"
                    value={config.sku}
                    onChange={(e) => setConfig({ ...config, sku: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-input"
                    value={config.category}
                    onChange={(e) => setConfig({ ...config, category: e.target.value })}
                  >
                    <option value="Cloud SaaS Connectors">Cloud SaaS Connectors</option>
                    <option value="Accounting & Financials">Accounting & Financials</option>
                    <option value="AI Intelligence & Analytics">AI Intelligence & Analytics</option>
                    <option value="Security & Auth Vaults">Security & Auth Vaults</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Product Description</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={config.description}
                  onChange={(e) => setConfig({ ...config, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>Public Marketplace Visibility</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow external client apps to discover this product</div>
                </div>
                <label className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={config.isPublic}
                    onChange={(e) => setConfig({ ...config, isPublic: e.target.checked })}
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setActiveStep(2)}>
                <span>Next: Pricing & Quotas</span>
                <ThemeIcon name="chevronRight" size={14} />
              </button>
            </div>
          )}

          {/* STEP 2: Pricing & Quotas */}
          {activeStep === 2 && (
            <div className="merchant-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Step 2: Pricing Tier & Usage Quotas
                </h3>

                {/* Billing Cycle Switch */}
                <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-input)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
                  <button
                    className={`btn btn-sm ${config.billingCycle === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setConfig({ ...config, billingCycle: 'monthly' })}
                  >
                    Monthly
                  </button>
                  <button
                    className={`btn btn-sm ${config.billingCycle === 'annual' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setConfig({ ...config, billingCycle: 'annual' })}
                  >
                    Annual (20% OFF)
                  </button>
                </div>
              </div>

              {/* 3 Tier Cards */}
              <div className="merchant-tier-grid">
                {/* Starter */}
                <div
                  className={`merchant-tier-card ${config.selectedTier === 'starter' ? 'selected' : ''}`}
                  onClick={() => setConfig({ ...config, selectedTier: 'starter' })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Starter</span>
                    {config.selectedTier === 'starter' && <span className="badge badge-emerald">ACTIVE</span>}
                  </div>
                  <div className="merchant-tier-price">
                    {currencySymbol}{tierPrices.starter}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Up to 10k queries/month, 2 active SaaS connectors.
                  </p>
                </div>

                {/* Growth */}
                <div
                  className={`merchant-tier-card ${config.selectedTier === 'growth' ? 'selected' : ''}`}
                  onClick={() => setConfig({ ...config, selectedTier: 'growth' })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Growth</span>
                    {config.selectedTier === 'growth' && <span className="badge badge-emerald">ACTIVE</span>}
                  </div>
                  <div className="merchant-tier-price">
                    {currencySymbol}{tierPrices.growth}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Up to 100k queries/month, all 4 SaaS connectors, sub-50ms SLA.
                  </p>
                </div>

                {/* Enterprise */}
                <div
                  className={`merchant-tier-card ${config.selectedTier === 'enterprise' ? 'selected' : ''}`}
                  onClick={() => setConfig({ ...config, selectedTier: 'enterprise' })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Enterprise</span>
                    {config.selectedTier === 'enterprise' && <span className="badge badge-emerald">ACTIVE</span>}
                  </div>
                  <div className="merchant-tier-price">
                    {currencySymbol}{tierPrices.enterprise}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Unlimited volume, zero-exposure hardware vault, dedicated runner.
                  </p>
                </div>
              </div>

              {/* Rate Limit Slider */}
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label className="form-label">Client Rate Limit Cap</label>
                  <span style={{ fontWeight: 700, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
                    {config.rpmLimit} RPM
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="600"
                  step="30"
                  value={config.rpmLimit}
                  onChange={(e) => setConfig({ ...config, rpmLimit: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#10B981' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setActiveStep(1)}>
                  <ThemeIcon name="chevronLeft" size={14} />
                  <span>Back</span>
                </button>
                <button className="btn btn-primary" onClick={() => setActiveStep(3)}>
                  <span>Next: SaaS Connectors</span>
                  <ThemeIcon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SaaS Connectors */}
          {activeStep === 3 && (
            <div className="merchant-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Step 3: SaaS Connectors & Permission Scoping
              </h3>

              <div className="merchant-connector-grid">
                {/* Xero */}
                <div className={`merchant-connector-card ${config.connectors.xero ? 'enabled' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <ThemeIcon name="xero" size={20} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Xero Accounting</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>23 Tools &bull; Financials</div>
                    </div>
                  </div>
                  <label className="switch-container">
                    <input
                      type="checkbox"
                      className="switch-input"
                      checked={config.connectors.xero}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          connectors: { ...config.connectors, xero: e.target.checked },
                        })
                      }
                    />
                    <span className="switch-slider" />
                  </label>
                </div>

                {/* BigQuery */}
                <div className={`merchant-connector-card ${config.connectors.bigquery ? 'enabled' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <ThemeIcon name="bigquery" size={20} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Google BigQuery</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>12 Tools &bull; SQL Analytics</div>
                    </div>
                  </div>
                  <label className="switch-container">
                    <input
                      type="checkbox"
                      className="switch-input"
                      checked={config.connectors.bigquery}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          connectors: { ...config.connectors, bigquery: e.target.checked },
                        })
                      }
                    />
                    <span className="switch-slider" />
                  </label>
                </div>

                {/* Firestore */}
                <div className={`merchant-connector-card ${config.connectors.firestore ? 'enabled' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <ThemeIcon name="firestore" size={20} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Cloud Firestore</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>12 Tools &bull; NoSQL Storage</div>
                    </div>
                  </div>
                  <label className="switch-container">
                    <input
                      type="checkbox"
                      className="switch-input"
                      checked={config.connectors.firestore}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          connectors: { ...config.connectors, firestore: e.target.checked },
                        })
                      }
                    />
                    <span className="switch-slider" />
                  </label>
                </div>

                {/* Sage HR */}
                <div className={`merchant-connector-card ${config.connectors.sagehr ? 'enabled' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <ThemeIcon name="sagehr" size={20} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sage HR Privacy</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>12 Tools &bull; Employee Directory</div>
                    </div>
                  </div>
                  <label className="switch-container">
                    <input
                      type="checkbox"
                      className="switch-input"
                      checked={config.connectors.sagehr}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          connectors: { ...config.connectors, sagehr: e.target.checked },
                        })
                      }
                    />
                    <span className="switch-slider" />
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setActiveStep(2)}>
                  <ThemeIcon name="chevronLeft" size={14} />
                  <span>Back</span>
                </button>
                <button className="btn btn-primary" onClick={() => setActiveStep(4)}>
                  <span>Next: Secret Vault</span>
                  <ThemeIcon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Secret Vault & Webhooks */}
          {activeStep === 4 && (
            <div className="merchant-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Step 4: Secret Vault & Webhook Signatures
              </h3>

              <div className="form-group">
                <label className="form-label">Event Notification Webhook URL</label>
                <input
                  type="url"
                  className="form-input code-font"
                  value={config.webhookUrl}
                  onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                  placeholder="https://api.yourdomain.com/v1/mcp-events"
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>HMAC Signature Secret</label>
                  <button className="btn btn-secondary btn-sm" onClick={handleRotateKey}>
                    Rotate Key
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  className="form-input code-font"
                  value={config.hmacSecret}
                />
              </div>

              <div style={{ padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#10B981', fontSize: '0.85rem' }}>
                  <ThemeIcon name="shield" size={16} />
                  <span>Hardware-Backed Google Secret Manager Vault Active</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  OAuth tokens and RSA private keys are encrypted at rest with zero client plaintext exposure.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setActiveStep(3)}>
                  <ThemeIcon name="chevronLeft" size={14} />
                  <span>Back</span>
                </button>
                <button className="btn btn-primary" onClick={() => setActiveStep(5)}>
                  <span>Next: JSON Manifest</span>
                  <ThemeIcon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: JSON Manifest */}
          {activeStep === 5 && (
            <div className="merchant-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Step 5: Generated Deployment Manifest
                </h3>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                    if (onShowToast) onShowToast('Manifest copied to clipboard!', 'success');
                  }}
                >
                  <ThemeIcon name="download" size={14} />
                  <span>Copy JSON</span>
                </button>
              </div>

              <pre
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  color: '#10B981',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.775rem',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(config, null, 2)}
              </pre>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setActiveStep(4)}>
                  <ThemeIcon name="chevronLeft" size={14} />
                  <span>Back</span>
                </button>
                <button className="merchant-btn-emerald" onClick={handleDeployProduct}>
                  <ThemeIcon name="checkCircle" size={16} />
                  <span>Publish Product Live</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sticky Preview Box (Customer Storefront Mockup) */}
        <div>
          <div className="merchant-preview-box">
            <div className="merchant-preview-header">
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10B981', letterSpacing: '0.05em' }}>
                LIVE STOREFRONT CARD PREVIEW
              </span>
              <span className="badge badge-emerald">{config.selectedTier.toUpperCase()}</span>
            </div>

            <div>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF' }}>{config.title}</h4>
              <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.25rem', lineHeight: 1.4 }}>
                {config.description}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
                {currencySymbol}{tierPrices[config.selectedTier]}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>/ month</span>
            </div>

            {/* Active Feature Pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#E2E8F0' }}>
                <ThemeIcon name="check" size={14} />
                <span>Rate cap: <strong>{config.rpmLimit} Requests / Minute</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#E2E8F0' }}>
                <ThemeIcon name="check" size={14} />
                <span>
                  Active Connectors: <strong>{[
                    config.connectors.xero && 'Xero',
                    config.connectors.bigquery && 'BigQuery',
                    config.connectors.firestore && 'Firestore',
                    config.connectors.sagehr && 'Sage HR',
                  ].filter(Boolean).join(', ')}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#E2E8F0' }}>
                <ThemeIcon name="check" size={14} />
                <span>Hardware Vault: <strong>Google Secret Manager</strong></span>
              </div>
            </div>

            <button
              className="merchant-btn-emerald"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => onShowToast && onShowToast('Mock Checkout triggered: customer subscribed!', 'success')}
            >
              <span>Subscribe & Generate Token</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
