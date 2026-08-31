import React, { useState, useEffect } from 'react';
import { api, GcpDiagnosticsResponse, FirestoreDatabaseInfo, GeminiEnterpriseConfig } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface SetupWizardPageProps {
  onSetupComplete: () => void;
  onGoToLogin?: () => void;
}

// Curated GCP Regions with European Union data centers listed first
const GCP_REGIONS = [
  { code: 'europe-west1', name: 'Belgium (europe-west1) — Recommended', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west4', name: 'Netherlands (europe-west4) — Low Carbon', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west3', name: 'Frankfurt, Germany (europe-west3)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west2', name: 'London, United Kingdom (europe-west2)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west9', name: 'Paris, France (europe-west9)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-north1', name: 'Hamina, Finland (europe-north1)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west6', name: 'Zurich, Switzerland (europe-west6)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-southwest1', name: 'Madrid, Spain (europe-southwest1)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west8', name: 'Milan, Italy (europe-west8)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-west12', name: 'Turin, Italy (europe-west12)', group: '🇪🇺 European Union (Tier 1 Primary)' },
  { code: 'europe-central2', name: 'Warsaw, Poland (europe-central2)', group: '🇪🇺 European Union (Tier 1 Primary)' },

  { code: 'africa-south1', name: 'Johannesburg, South Africa (africa-south1)', group: '🌍 Africa & Middle East' },
  { code: 'me-west1', name: 'Tel Aviv, Israel (me-west1)', group: '🌍 Africa & Middle East' },
  { code: 'me-central1', name: 'Doha, Qatar (me-central1)', group: '🌍 Africa & Middle East' },

  { code: 'us-central1', name: 'Iowa, USA (us-central1)', group: '🇺🇸 North & South America' },
  { code: 'us-east1', name: 'South Carolina, USA (us-east1)', group: '🇺🇸 North & South America' },
  { code: 'us-east4', name: 'Northern Virginia, USA (us-east4)', group: '🇺🇸 North & South America' },
  { code: 'us-west1', name: 'Oregon, USA (us-west1)', group: '🇺🇸 North & South America' },
  { code: 'southamerica-east1', name: 'São Paulo, Brazil (southamerica-east1)', group: '🇺🇸 North & South America' },

  { code: 'asia-east1', name: 'Taiwan (asia-east1)', group: '🌏 Asia-Pacific' },
  { code: 'asia-southeast1', name: 'Singapore (asia-southeast1)', group: '🌏 Asia-Pacific' },
  { code: 'asia-northeast1', name: 'Tokyo, Japan (asia-northeast1)', group: '🌏 Asia-Pacific' },
  { code: 'australia-southeast1', name: 'Sydney, Australia (australia-southeast1)', group: '🌏 Asia-Pacific' },
];

export const SetupWizardPage: React.FC<SetupWizardPageProps> = ({ onSetupComplete, onGoToLogin }) => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showTokenHelp, setShowTokenHelp] = useState<boolean>(false);

  // Setup Track & Modular SaaS Options (All unchecked by default)
  const [selectedServices, setSelectedServices] = useState<{
    bigquery: boolean;
    xero: boolean;
    firestore: boolean;
    sagehr: boolean;
  }>({
    bigquery: false,
    xero: false,
    firestore: false,
    sagehr: false,
  });

  // Step 1: Token & Intro
  const [setupToken, setSetupToken] = useState<string>('');
  const [isDev, setIsDev] = useState<boolean>(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [step1PrecheckLoading, setStep1PrecheckLoading] = useState<boolean>(false);
  const [step1PrecheckResult, setStep1PrecheckResult] = useState<{
    success: boolean;
    allPassed: boolean;
    passedCount: number;
    totalCount: number;
    message: string;
  } | null>(null);

  // Step 2: GCP & IAM
  const [gcpProjectId, setGcpProjectId] = useState<string>('');
  const [detectedRegion, setDetectedRegion] = useState<string>('europe-west1');
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>('');
  const [callbackUri, setCallbackUri] = useState<string>('');
  const [diagnostics, setDiagnostics] = useState<GcpDiagnosticsResponse['diagnostics'] | null>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(false);

  // Step 3: Firestore
  const [databaseId, setDatabaseId] = useState<string>('(default)');
  const [firestoreMode, setFirestoreMode] = useState<'standard' | 'enterprise'>('standard');
  const [firestoreSuccess, setFirestoreSuccess] = useState<boolean>(false);
  const [firestoreLatency, setFirestoreLatency] = useState<number | null>(null);
  const [firestoreMsg, setFirestoreMsg] = useState<string | null>(null);
  const [firestoreGcloudCmd, setFirestoreGcloudCmd] = useState<string | null>(null);
  const [firestoreIamFixCmd, setFirestoreIamFixCmd] = useState<string | null>(null);
  const [firestorePermissionDenied, setFirestorePermissionDenied] = useState<boolean>(false);
  const [firestoreCreating, setFirestoreCreating] = useState<boolean>(false);
  const [firestoreTested, setFirestoreTested] = useState<boolean>(false);
  const [firestoreCreateError, setFirestoreCreateError] = useState<string | null>(null);

  // Step 4: GWS OAuth & Secrets
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [googleClientSecret, setGoogleClientSecret] = useState<string>('');
  const [showClientSecret, setShowClientSecret] = useState<boolean>(false);
  const [allowedDomains, setAllowedDomains] = useState<string>('');
  const [jwtSecret, setJwtSecret] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('');
  const [detectedAdminAccount, setDetectedAdminAccount] = useState<string | null>(null);
  const [magicLinkVerified, setMagicLinkVerified] = useState<boolean>(false);

  // Step 5: Gemini Enterprise & MCP Gateway Credentials
  const [geminiClientId, setGeminiClientId] = useState<string>('gemini-enterprise-mcp');
  const [geminiClientSecret, setGeminiClientSecret] = useState<string>('');
  const [geminiJwtSecret, setGeminiJwtSecret] = useState<string>('');
  const [showGeminiSecret, setShowGeminiSecret] = useState<boolean>(false);
  const [geminiConfig, setGeminiConfig] = useState<GeminiEnterpriseConfig | null>(null);
  const [geminiProvisioned, setGeminiProvisioned] = useState<boolean>(false);
  const [geminiConfirmed, setGeminiConfirmed] = useState<boolean>(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);
  const [isProvisioningGsm, setIsProvisioningGsm] = useState<boolean>(false);
  const [isSavingGwsGsm, setIsSavingGwsGsm] = useState<boolean>(false);
  const [deployElapsedSec, setDeployElapsedSec] = useState<number>(0);

  // Step 6 / Local-to-Cloud Deployer
  const [apisEnabling, setApisEnabling] = useState<boolean>(false);
  const [apisEnabledSuccess, setApisEnabledSuccess] = useState<boolean | null>(null);
  const [cloudRunDeploying, setCloudRunDeploying] = useState<boolean>(false);
  const [cloudRunDeployLogs, setCloudRunDeployLogs] = useState<string[]>([]);
  const [cloudRunDeploySuccess, setCloudRunDeploySuccess] = useState<boolean | null>(null);
  const [cloudRunServiceUrl, setCloudRunServiceUrl] = useState<string | null>(null);

  const [shellType, setShellType] = useState<'powershell' | 'bash' | 'cmd'>('powershell');
  const [discoveredDatabases, setDiscoveredDatabases] = useState<FirestoreDatabaseInfo[]>([]);

  const handleGenerateFreshToken = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hexToken = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
    setSetupToken(hexToken);
  };

  const formatCommandsForShell = (cmdText: string | string[], shell: 'powershell' | 'bash' | 'cmd'): string => {
    const text = Array.isArray(cmdText) ? cmdText.join('\n\n') : cmdText;
    if (shell === 'powershell') {
      return text.replace(/ \\\r?\n/g, ' `\n');
    }
    if (shell === 'cmd') {
      return text.replace(/ \\\r?\n/g, ' ^\n').replace(/ `\r?\n/g, ' ^\n');
    }
    // bash
    return text.replace(/ `\r?\n/g, ' \\\n').replace(/ \^\r?\n/g, ' \\\n');
  };

  // Load initial status on mount
  useEffect(() => {
    loadSetupStatus();
  }, []);

  const loadSetupStatus = async () => {
    try {
      setLoading(true);
      const res = await api.setup.getStatus();
      setGcpProjectId(res.detectedProjectId || '');
      if (res.detectedRegion) {
        setDetectedRegion(res.detectedRegion);
      }
      setServiceAccountEmail(res.serviceAccountEmail || '');
      setCallbackUri(res.callbackUri || '');
      setIsDev(Boolean(res.isDev));
      if (res.devBootstrapToken) {
        setDevToken(res.devBootstrapToken);
        setSetupToken((prev) => prev || res.devBootstrapToken!);
      }
      if (res.activeGoogleAccount) {
        setDetectedAdminAccount(res.activeGoogleAccount);
        if (!adminEmail) {
          setAdminEmail(res.activeGoogleAccount);
          setAdminName(res.activeGoogleAccount.split('@')[0]);
        }
        if (!allowedDomains && res.activeGoogleAccount.includes('@')) {
          setAllowedDomains(res.activeGoogleAccount.split('@')[1]);
        }
      }
      if (res.existingDatabases && res.existingDatabases.length > 0) {
        setDiscoveredDatabases(res.existingDatabases);
      }
      if (res.currentDatabaseId) {
        setDatabaseId(res.currentDatabaseId);
        if (res.currentDatabaseId !== '(default)') {
          setFirestoreMode('enterprise');
        }
      }
      if (res.isCompleted) {
        onSetupComplete();
        return;
      }

      // Check if magic link token or email is in URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const urlEmail = urlParams.get('email');

      if (urlEmail) {
        setAdminEmail(urlEmail);
      }

      if (urlToken && urlToken.trim().length >= 16) {
        setSetupToken(urlToken.trim());
        // Clean URL to prevent token leakage in address bar
        window.history.replaceState({}, document.title, window.location.pathname);
        
        try {
          await api.setup.verifyToken(urlToken.trim());
          setMagicLinkVerified(true);
          // Stay on Step 1 so user enters their admin email and confirms GCP project ID!
        } catch {
          // Fall back to Step 1 with pre-filled token
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load setup status');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleGenerateJwtSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hex = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
    setJwtSecret(hex);
  };

  const handleToggleServiceSelection = (service: 'bigquery' | 'xero' | 'firestore' | 'sagehr') => {
    setSelectedServices((prev) => ({
      ...prev,
      [service]: !prev[service],
    }));
  };

  // Step 1: Pre-check GCP Project & IAM Readiness
  const handlePrecheckProject = async () => {
    if (!gcpProjectId.trim()) {
      setError('Please enter a Google Cloud Project ID to verify.');
      return;
    }
    setError(null);
    setStep1PrecheckLoading(true);
    setStep1PrecheckResult(null);
    try {
      const res = await api.setup.runGcpDiagnostics(gcpProjectId.trim());
      setDiagnostics(res.diagnostics);
      if (res.diagnostics.serviceAccountEmail) {
        setServiceAccountEmail(res.diagnostics.serviceAccountEmail);
      }
      if (res.existingDatabases && res.existingDatabases.length > 0) {
        setDiscoveredDatabases(res.existingDatabases);
      }
      if (res.detectedRegion) {
        setDetectedRegion(res.detectedRegion);
      }
      const passed = res.diagnostics.permissions.filter((p) => p.status === 'PASS').length;
      const total = res.diagnostics.permissions.length;
      setStep1PrecheckResult({
        success: true,
        allPassed: res.diagnostics.allPassed,
        passedCount: passed,
        totalCount: total,
        message: res.diagnostics.allPassed
          ? `Project '${gcpProjectId.trim()}' verified: All ${passed}/${total} Core IAM permissions ready.`
          : `Project '${gcpProjectId.trim()}' verified: ${passed}/${total} Core IAM permissions ready. ${total - passed} role(s) require assignment in Step 2.`,
      });
    } catch (err: any) {
      setStep1PrecheckResult({
        success: false,
        allPassed: false,
        passedCount: 0,
        totalCount: 3,
        message: `Project verification failed: ${err.message || 'Unable to access GCP project'}`,
      });
    } finally {
      setStep1PrecheckLoading(false);
    }
  };

  // Step 1: Verify Bootstrap Token & Confirm Project
  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim()) {
      setError('Please enter your Corporate Administrator Email address.');
      return;
    }
    if (!gcpProjectId.trim()) {
      setError('Please enter or confirm your Google Cloud Project ID.');
      return;
    }
    if (!setupToken.trim()) {
      setError('Please enter the Bootstrap Setup Token.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (!magicLinkVerified) {
        await api.setup.verifyToken(setupToken.trim());
        setMagicLinkVerified(true);
      }
      setStep(2);
      // Auto-run diagnostics on Step 2 entry with confirmed project ID
      runGcpDiagnostics(gcpProjectId.trim());
    } catch (err: any) {
      setError(err.message || 'Invalid Bootstrap Setup Token');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Run GCP IAM Diagnostics
  const runGcpDiagnostics = async (projectIdToTest?: string) => {
    setDiagLoading(true);
    setError(null);
    try {
      const targetProj = projectIdToTest || gcpProjectId;
      const res = await api.setup.runGcpDiagnostics(targetProj);
      setDiagnostics(res.diagnostics);
      if (res.diagnostics.serviceAccountEmail) {
        setServiceAccountEmail(res.diagnostics.serviceAccountEmail);
      }
      if (res.existingDatabases && res.existingDatabases.length > 0) {
        setDiscoveredDatabases(res.existingDatabases);
        setDatabaseId(res.existingDatabases[0].databaseId);
      }
      if (res.detectedRegion) {
        setDetectedRegion(res.detectedRegion);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run GCP diagnostics');
    } finally {
      setDiagLoading(false);
    }
  };

  const handleEnableAllApis = async () => {
    if (!gcpProjectId.trim()) return;
    setApisEnabling(true);
    setError(null);
    try {
      await api.setup.enableApis(gcpProjectId.trim());
      setApisEnabledSuccess(true);
      await runGcpDiagnostics(gcpProjectId.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to enable required Google Cloud APIs');
      setApisEnabledSuccess(false);
    } finally {
      setApisEnabling(false);
    }
  };

  // Step 3: Test & Init Firestore Database
  const handleInitFirestore = async () => {
    if (!databaseId.trim()) {
      setError('Firestore Database ID cannot be empty.');
      return;
    }
    setError(null);
    setLoading(true);
    setFirestoreTested(true);
    setFirestoreGcloudCmd(null);
    setFirestoreIamFixCmd(null);
    setFirestorePermissionDenied(false);
    setFirestoreCreateError(null);
    try {
      const res = await api.setup.initFirestore(databaseId.trim(), gcpProjectId.trim());
      if (res.connected) {
        setFirestoreSuccess(true);
        setFirestoreLatency(res.latencyMs || null);
        setFirestoreMsg(res.message || `Successfully connected to Firestore database '${databaseId.trim()}' (${res.latencyMs || 0}ms latency).`);
        setFirestoreGcloudCmd(null);
        setFirestoreIamFixCmd(null);
        setFirestorePermissionDenied(false);
        setFirestoreCreateError(null);
      } else if (res.permissionDenied) {
        setFirestoreSuccess(false);
        setFirestorePermissionDenied(true);
        setError(res.message);
        if (res.iamFixCommand) {
          setFirestoreIamFixCmd(res.iamFixCommand);
        }
      } else if (res.databaseNotFound) {
        setFirestoreSuccess(false);
        setFirestorePermissionDenied(false);
        if (res.gcloudCreateCommand) {
          setFirestoreGcloudCmd(res.gcloudCreateCommand);
        }
      } else {
        setFirestoreSuccess(false);
        setError(res.message);
      }
    } catch (err: any) {
      setFirestoreSuccess(false);
      setError(err.message || 'Failed to connect to Firestore database');
      const cleanDb = databaseId.trim() || '(default)';
      const createCmd = cleanDb === '(default)'
        ? `gcloud firestore databases create \\\n  --project=${gcpProjectId.trim()} \\\n  --location=${detectedRegion || 'europe-west1'} \\\n  --type=firestore-native`
        : `gcloud firestore databases create \\\n  --project=${gcpProjectId.trim()} \\\n  --database="${cleanDb}" \\\n  --location=${detectedRegion || 'europe-west1'} \\\n  --type=firestore-native`;
      setFirestoreGcloudCmd(createCmd);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: 1-Click Automated Firestore Database Creation with Fallback
  const handleCreateFirestoreDb = async () => {
    if (!gcpProjectId.trim()) {
      setError('GCP Project ID is required.');
      return;
    }
    setError(null);
    setFirestoreCreateError(null);
    setFirestoreCreating(true);
    try {
      const res = await api.setup.createFirestore(
        gcpProjectId.trim(),
        databaseId.trim() || '(default)',
        detectedRegion || 'europe-west1'
      );
      if (res.success) {
        setFirestoreSuccess(true);
        setFirestoreTested(true);
        setFirestoreLatency(res.latencyMs || 42);
        setFirestoreMsg(res.message || `Successfully created and verified Firestore database '${databaseId.trim() || '(default)'}' in region ${detectedRegion || 'europe-west1'}.`);
        setFirestoreCreateError(null);
        setFirestoreGcloudCmd(null);
        setFirestoreIamFixCmd(null);
        setFirestorePermissionDenied(false);
        setError(null);
      } else {
        setFirestoreCreateError(res.message);
        const cleanDb = databaseId.trim() || '(default)';
        const createCmd = cleanDb === '(default)'
          ? `gcloud firestore databases create \\\n  --project=${gcpProjectId.trim()} \\\n  --location=${detectedRegion || 'europe-west1'} \\\n  --type=firestore-native`
          : `gcloud firestore databases create \\\n  --project=${gcpProjectId.trim()} \\\n  --database="${cleanDb}" \\\n  --location=${detectedRegion || 'europe-west1'} \\\n  --type=firestore-native`;
        setFirestoreGcloudCmd(createCmd);
      }
    } catch (err: any) {
      setFirestoreCreateError(err.message || 'Failed to create Firestore database automatically');
      const cleanDb = databaseId.trim() || '(default)';
      const createCmd = cleanDb === '(default)'
        ? `gcloud firestore databases create \\\n  --project=${gcpProjectId.trim()} \\\n  --location=${detectedRegion || 'europe-west1'} \\\n  --type=firestore-native`
        : `gcloud firestore databases create \\\n  --project=${gcpProjectId.trim()} \\\n  --database="${cleanDb}" \\\n  --location=${detectedRegion || 'europe-west1'} \\\n  --type=firestore-native`;
      setFirestoreGcloudCmd(createCmd);
    } finally {
      setFirestoreCreating(false);
    }
  };

  // Step 4: Provision Secrets & Deploy to Cloud Run
  const handleDeployCloudRunLive = async () => {
    if (!gcpProjectId.trim()) return;
    setCloudRunDeploying(true);
    setCloudRunDeployLogs([]);
    setCloudRunDeploySuccess(null);
    setDeployElapsedSec(0);
    setError(null);

    const timer = setInterval(() => {
      setDeployElapsedSec((prev) => prev + 1);
    }, 1000);

    try {
      // 1. Automatically ensure gateway secrets exist in Secret Manager before deploying
      if (!geminiProvisioned) {
        setCloudRunDeployLogs((prev) => [...prev, '[INFO] Pre-provisioning MCP secrets in GCP Secret Manager...\n']);
        await api.setup.configureGeminiEnterprise({
          clientId: geminiClientId.trim() || 'gemini-enterprise-mcp',
          clientSecret: geminiClientSecret.trim() || undefined,
          jwtSecret: geminiJwtSecret.trim() || undefined,
        });
        setGeminiProvisioned(true);
      }

      // 2. Deploy to Cloud Run
      const success = await api.setup.deployCloudRun(
        {
          projectId: gcpProjectId.trim(),
          region: detectedRegion || 'europe-west1',
          serviceName: 'enterprise-mcp-server',
          databaseId: databaseId.trim() || '(default)',
          allowedDomains: allowedDomains.trim(),
        },
        (chunk: string) => {
          setCloudRunDeployLogs((prev) => [...prev, chunk]);
          const match = chunk.match(/https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.run\.app/);
          if (match) {
            setCloudRunServiceUrl(match[0]);
          }
        }
      );
      setCloudRunDeploySuccess(success);
    } catch (err: any) {
      setError(err.message || 'Failed to deploy to Google Cloud Run');
      setCloudRunDeploySuccess(false);
    } finally {
      clearInterval(timer);
      setCloudRunDeploying(false);
    }
  };

  // Step 5: Configure Google Workspace OAuth
  const handleConfigureGwsOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleClientId.trim()) {
      setError('Google OAuth Client ID is required.');
      return;
    }
    if (!googleClientSecret.trim()) {
      setError('Google OAuth Client Secret is required.');
      return;
    }
    if (!adminEmail.trim()) {
      setError('Primary Administrator Email is required.');
      return;
    }

    setError(null);
    setIsSavingGwsGsm(true);
    try {
      await api.setup.configureGwsOAuth({
        googleClientId: googleClientId.trim(),
        googleClientSecret: googleClientSecret.trim(),
        allowedDomains: allowedDomains.trim(),
        jwtSecret: jwtSecret.trim() || undefined,
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim() || adminEmail.split('@')[0],
      });
      // Move to Step 6 and load Gemini blueprint with live Cloud Run URL
      setStep(6);
      loadGeminiConfig(cloudRunServiceUrl || undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to persist Google Workspace OAuth credentials');
    } finally {
      setIsSavingGwsGsm(false);
    }
  };

  // Step 6: Gemini Enterprise Config & Blueprint Generation
  const loadGeminiConfig = async (overrideBaseUrl?: string) => {
    try {
      const res = await api.setup.getGeminiConfig();
      if (res.clientId) setGeminiClientId(res.clientId);
      if (res.clientSecret) {
        setGeminiClientSecret(res.clientSecret);
        setGeminiProvisioned(true);
      } else {
        handleGenerateGeminiSecrets();
      }
      if (res.jwtSecret) setGeminiJwtSecret(res.jwtSecret);

      const effectiveBaseUrl = overrideBaseUrl || cloudRunServiceUrl || res.geminiConfig.serverBaseUrl;
      setGeminiConfig({
        ...res.geminiConfig,
        serverBaseUrl: effectiveBaseUrl,
        mcpEndpoint: `${effectiveBaseUrl}/mcp`,
        authorizationUrl: `${effectiveBaseUrl}/oauth/authorize`,
        tokenUrl: `${effectiveBaseUrl}/oauth/token`,
      });
    } catch (_err) {
      handleGenerateGeminiSecrets();
    }
  };

  const handleGenerateGeminiSecrets = async () => {
    setIsGeneratingKeys(true);
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 650));
    const randHex = (bytes: number) => {
      const array = new Uint8Array(bytes);
      crypto.getRandomValues(array);
      return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    setGeminiClientSecret(`mcp_sec_${randHex(20)}`);
    setGeminiJwtSecret(randHex(32));
    if (!geminiClientId) setGeminiClientId('gemini-enterprise-mcp');
    setGeminiProvisioned(false);
    setIsGeneratingKeys(false);
  };

  const handleProvisionGeminiSecrets = async () => {
    setError(null);
    setIsProvisioningGsm(true);
    try {
      const res = await api.setup.configureGeminiEnterprise({
        clientId: geminiClientId.trim() || 'gemini-enterprise-mcp',
        clientSecret: geminiClientSecret.trim() || undefined,
        jwtSecret: geminiJwtSecret.trim() || undefined,
      });
      setGeminiConfig(res.geminiConfig);
      if (res.geminiConfig.clientSecret) setGeminiClientSecret(res.geminiConfig.clientSecret);
      if (res.geminiConfig.clientId) setGeminiClientId(res.geminiConfig.clientId);
      setGeminiProvisioned(true);
    } catch (err: any) {
      setError(err.message || 'Failed to provision Gemini Enterprise secrets to Secret Manager');
      setGeminiProvisioned(false);
    } finally {
      setIsProvisioningGsm(false);
    }
  };

  const handleCopyAllGeminiSettings = () => {
    if (!geminiConfig) return;
    const effectiveBase = cloudRunServiceUrl || geminiConfig.serverBaseUrl;
    const text = `Google Gemini Enterprise MCP Server Configuration:
• Server / MCP Endpoint: ${effectiveBase}/mcp
• Authentication Type: ${geminiConfig.authType}
• Authorization URL: ${effectiveBase}/oauth/authorize
• Token URL: ${effectiveBase}/oauth/token
• Client ID: ${geminiConfig.clientId}
• Client Secret: ${geminiConfig.clientSecret}
• Scopes: ${geminiConfig.scopes}`;
    handleCopy(text, 'gemini_all');
  };

  // Step 6: Final Complete Setup & Launch
  const handleCompleteSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      const configuredList = ['gws_auth', 'platform'];
      const pendingList: string[] = [];

      if (selectedServices.bigquery) configuredList.push('bigquery');
      else pendingList.push('bigquery');

      if (selectedServices.xero) configuredList.push('xero');
      else pendingList.push('xero');

      if (selectedServices.firestore) configuredList.push('firestore');
      else pendingList.push('firestore');

      if (selectedServices.sagehr) configuredList.push('sagehr');
      else pendingList.push('sagehr');

      await api.setup.completeSetup({
        adminEmail: adminEmail.trim() || 'admin@company.com',
        adminName: adminName.trim() || 'System Administrator',
        setupMode: pendingList.length > 0 ? 'CUSTOM_MODULAR' : 'QUICKSTART_CORE',
        configuredServices: configuredList,
        pendingServices: pendingList,
      });
      onSetupComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to complete platform setup');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // Design Tokens & High-Contrast Button Styling Helpers
  // =========================================================================
  const primaryBtnStyle: React.CSSProperties = {
    backgroundColor: '#FAFAFA',
    color: '#09090B',
    border: '1px solid #FAFAFA',
    borderRadius: '6px',
    padding: '0.7rem 1.4rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    boxSizing: 'border-box',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
    transition: 'all 0.15s ease',
  };

  const secondaryBtnStyle: React.CSSProperties = {
    backgroundColor: '#18181B',
    color: '#FAFAFA',
    border: '1px solid #3F3F46',
    borderRadius: '6px',
    padding: '0.7rem 1.4rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  };

  const utilityBtnStyle: React.CSSProperties = {
    backgroundColor: '#27272A',
    color: '#FAFAFA',
    border: '1px solid #3F3F46',
    borderRadius: '6px',
    padding: '0.55rem 1rem',
    fontSize: '0.825rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.45rem',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 0.875rem',
    backgroundColor: '#121215',
    border: '1px solid #27272A',
    borderRadius: '6px',
    color: '#FAFAFA',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#09090B',
        color: '#FAFAFA',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        fontFamily: 'var(--font-sans, "Inter", -apple-system, sans-serif)',
        position: 'relative',
      }}
    >
      {/* Global Dynamic Blocking Modal Loader */}
      {(diagLoading || firestoreCreating || isGeneratingKeys || isProvisioningGsm || cloudRunDeploying || isSavingGwsGsm) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(9, 9, 11, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '2rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#18181B',
              border: '1px solid #38BDF8',
              borderRadius: '12px',
              padding: cloudRunDeploying ? '2rem 2.5rem' : '2.5rem 3rem',
              maxWidth: cloudRunDeploying ? '720px' : '480px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {/* Smooth Rotating Vector Spinner */}
            <div style={{ position: 'relative', width: '60px', height: '60px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                className="spinner-slow"
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '3px solid rgba(56, 189, 248, 0.18)',
                  borderTopColor: '#38BDF8',
                  borderRightColor: 'rgba(56, 189, 248, 0.7)',
                  boxSizing: 'border-box',
                }}
              />
              <ThemeIcon
                name={
                  diagLoading || isSavingGwsGsm
                    ? 'shield'
                    : firestoreCreating
                    ? 'firestore'
                    : isGeneratingKeys
                    ? 'sparkles'
                    : isProvisioningGsm
                    ? 'secrets'
                    : 'cloud'
                }
                size={24}
              />
            </div>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FAFAFA', margin: '0 0 0.5rem 0' }}>
              {diagLoading && 'Scanning Google Cloud IAM Permissions'}
              {firestoreCreating && 'Creating Firestore Database in GCP'}
              {isGeneratingKeys && 'Generating Cryptographic Secure Keys'}
              {isProvisioningGsm && 'Vaulting Platform Secrets in GSM'}
              {cloudRunDeploying && 'Deploying Container to Google Cloud Run'}
              {isSavingGwsGsm && 'Vaulting Google Workspace OAuth Secrets in GSM'}
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#A1A1AA', lineHeight: 1.5, margin: 0, maxWidth: '440px' }}>
              {diagLoading && `Probing Secret Manager, Cloud Firestore, and Service Usage API access for compute service account on project '${gcpProjectId}'...`}
              {firestoreCreating && `Creating database '${databaseId}' in region '${detectedRegion}' on project '${gcpProjectId}'. This takes 30–60s on GCP...`}
              {isGeneratingKeys && 'Generating 256-bit cryptographically secure random secret keys (MCP_CLIENT_SECRET, MCP_JWT_SECRET) using Web Crypto CSPRNG...'}
              {isProvisioningGsm && `Encrypting and writing MCP_CLIENT_ID, MCP_CLIENT_SECRET, and MCP_JWT_SECRET to Google Secret Manager on project '${gcpProjectId}'...`}
              {cloudRunDeploying && `Building container, syncing environment secrets, and deploying Cloud Run revision in '${detectedRegion}' (Elapsed: ${deployElapsedSec}s)...`}
              {isSavingGwsGsm && `Encrypting and writing GOOGLE_WORKSPACE_CLIENT_ID, GOOGLE_WORKSPACE_CLIENT_SECRET, ALLOWED_EMAIL_DOMAINS, and admin profile to Google Secret Manager on project '${gcpProjectId}'...`}
            </p>

            {/* Embedded Live Streaming Terminal for Cloud Run Deploy */}
            {cloudRunDeploying && (
              <div style={{ width: '100%', marginTop: '1.25rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#121215', padding: '6px 12px', borderTopLeftRadius: '6px', borderTopRightRadius: '6px', border: '1px solid #27272A', borderBottom: 'none' }}>
                  <span style={{ fontSize: '0.725rem', fontFamily: 'var(--font-mono, monospace)', color: '#38BDF8', fontWeight: 600 }}>
                    ● LIVE CLOUD RUN BUILD & DEPLOY LOG STREAM
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#38BDF8', fontFamily: 'var(--font-mono, monospace)' }}>
                    {deployElapsedSec}s elapsed
                  </span>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '0.85rem',
                    backgroundColor: '#030712',
                    border: '1px solid #27272A',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    color: '#E2E8F0',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.5,
                  }}
                >
                  {cloudRunDeployLogs.join('') || 'Initiating Cloud Run container deployment...\n'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: '880px',
          width: '100%',
          minHeight: '740px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#18181B',
          border: '1px solid #27272A',
          borderRadius: '10px',
          padding: '2.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header Branding */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #27272A',
            paddingBottom: '1.25rem',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                backgroundColor: '#27272A',
                border: '1px solid #3F3F46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FAFAFA',
              }}
            >
              <ThemeIcon name="shield" size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#FAFAFA' }}>
                Enterprise MCP Gateway Initialisation
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.825rem', color: '#A1A1AA' }}>
                Security, Google Workspace Identity & Dynamic Multi-SaaS Mesh
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {onGoToLogin && (
              <button
                type="button"
                onClick={onGoToLogin}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #3F3F46',
                  color: '#FAFAFA',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <span>Sign In to Existing Portal →</span>
              </button>
            )}
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#A1A1AA',
                backgroundColor: '#27272A',
                padding: '4px 10px',
                borderRadius: '9999px',
                border: '1px solid #3F3F46',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              STEP {step} OF 6
            </div>
          </div>
        </div>

        {/* Progress Step Indicator (Zero Horizontal Scroll - Stacked & Centered 2-Line Layout) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '6px',
            marginBottom: '2.5rem',
            position: 'relative',
            width: '100%',
          }}
        >
          {[
            { id: 1, line1: 'Welcome &', line2: 'Region' },
            { id: 2, line1: 'GCP &', line2: 'IAM Scan' },
            { id: 3, line1: 'Firestore', line2: 'Database' },
            { id: 4, line1: 'Cloud Run', line2: 'Deploy' },
            { id: 5, line1: 'GWS OAuth', line2: 'SSO Setup' },
            { id: 6, line1: 'Gemini', line2: 'Enterprise' },
          ].map((s) => {
            const isDone = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: isDone ? 'rgba(16, 185, 129, 0.18)' : isCurrent ? '#FAFAFA' : '#27272A',
                    color: isDone ? '#34D399' : isCurrent ? '#09090B' : '#71717A',
                    border: isDone ? '1px solid #10B981' : isCurrent ? '1px solid #FAFAFA' : '1px solid #3F3F46',
                    boxShadow: isCurrent ? '0 0 10px rgba(250, 250, 250, 0.3)' : 'none',
                    marginBottom: '6px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isDone ? '✓' : s.id}
                </div>
                <div
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? '#FAFAFA' : isDone ? '#D4D4D8' : '#71717A',
                    lineHeight: 1.25,
                    textAlign: 'center',
                    wordBreak: 'break-word',
                  }}
                >
                  <div>{s.line1}</div>
                  <div>{s.line2}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              backgroundColor: '#1C1215',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              color: '#FB7185',
              padding: '0.85rem 1.15rem',
              borderRadius: '6px',
              marginBottom: '1.75rem',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <ThemeIcon name="alert" size={18} />
            <div style={{ flex: 1 }}>{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: '#FB7185', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1: Welcome Intro, Modular Checkboxes & Bootstrap Token Entry         */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ marginBottom: '1.75rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#FAFAFA' }}>
                Welcome to your MCP Gateway Setup
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#A1A1AA', lineHeight: 1.6, margin: 0 }}>
                This wizard will initialise your Google Cloud security foundation, custom Firestore session store, and Google Workspace Single Sign-On. Choose which SaaS services you want to configure today or defer for later.
              </p>
            </div>

            {/* Modular Setup Options (Tickboxes) */}
            <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.75rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: '#FAFAFA' }}>
                Select Configuration Scope:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                {/* Core Foundation (Locked & Always Checked) */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '0.75rem', backgroundColor: '#18181B', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px' }}>
                  <input type="checkbox" checked disabled style={{ marginTop: '3px', accentColor: '#10B981' }} />
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Core Security & Identity <span style={{ fontSize: '0.7rem', color: '#34D399', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>Required</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                      GCP IAM, Custom Firestore DB, GWS OAuth & Session Store
                    </div>
                  </div>
                </div>

                {/* BigQuery Checkbox */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '0.75rem', backgroundColor: '#18181B', border: selectedServices.bigquery ? '1px solid #3F3F46' : '1px solid #27272A', borderRadius: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedServices.bigquery}
                    onChange={() => handleToggleServiceSelection('bigquery')}
                    style={{ marginTop: '3px', accentColor: '#FAFAFA' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>
                      Google BigQuery
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                      Datasets discovery, schemas & read-only GoogleSQL
                    </div>
                  </div>
                </label>

                {/* Xero Checkbox */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '0.75rem', backgroundColor: '#18181B', border: selectedServices.xero ? '1px solid #3F3F46' : '1px solid #27272A', borderRadius: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedServices.xero}
                    onChange={() => handleToggleServiceSelection('xero')}
                    style={{ marginTop: '3px', accentColor: '#FAFAFA' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>
                      Xero Accounting
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                      Invoices, accounts, payments & financial reports
                    </div>
                  </div>
                </label>

                {/* Sage HR Checkbox */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '0.75rem', backgroundColor: '#18181B', border: selectedServices.sagehr ? '1px solid #3F3F46' : '1px solid #27272A', borderRadius: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedServices.sagehr}
                    onChange={() => handleToggleServiceSelection('sagehr')}
                    style={{ marginTop: '3px', accentColor: '#FAFAFA' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>
                      Sage HR
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                      Employee directory, time-off balances & expenses
                    </div>
                  </div>
                </label>
              </div>

              <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: '#71717A' }}>
                💡 <em>All optional connectors are unchecked by default. You can skip any services now and configure them anytime from the <strong>Pending Onboarding Hub</strong> on the dashboard.</em>
              </div>
            </div>

            {/* Instruction Help Card: How to get the token */}
            <div style={{ backgroundColor: '#09090B', border: '1px solid #27272A', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.875rem', color: '#38BDF8' }}>
                  <ThemeIcon name="shield" size={16} />
                  How to retrieve your Bootstrap Setup Token
                </div>
                <button
                  type="button"
                  onClick={() => setShowTokenHelp(!showTokenHelp)}
                  style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {showTokenHelp ? 'Hide Instructions' : 'Show Instructions'}
                </button>
              </div>

              {showTokenHelp && (
                <div style={{ fontSize: '0.8rem', color: '#A1A1AA', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 0.6rem 0' }}>
                    To ensure absolute zero unauthorized access during container deployment, a temporary <strong>32-byte cryptographic token</strong> is generated and output to the server logs on startup.
                  </p>

                  <div style={{ backgroundColor: '#030712', border: '1px solid #27272A', borderRadius: '6px', padding: '0.75rem', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.775rem', color: '#E2E8F0', marginBottom: '0.75rem' }}>
                    <div style={{ color: '#FBBF24', marginBottom: '4px' }}>⚡ [INITIAL SETUP REQUIRED] Enterprise MCP Gateway</div>
                    <div>Admin Setup URL:  http://localhost:3000/admin/setup</div>
                    <div>Bootstrap Token:  &lt;your-32-byte-hexadecimal-token&gt;</div>
                  </div>

                  <ul style={{ margin: '0 0 0.5rem 1.25rem', padding: 0 }}>
                    <li><strong>Running Locally in Terminal</strong>: Look at your VS Code terminal running <code>npm run local</code> or <code>node dist/index.js</code>.</li>
                    <li><strong>Google Cloud Run</strong>: Open <em>Cloud Run &gt; Logs Explorer</em> and filter for <code>⚡ [INITIAL SETUP REQUIRED]</code>.</li>
                    <li><strong>Pre-configured Env</strong>: If you set <code>SETUP_ADMIN_TOKEN</code> in your environment, enter that value below.</li>
                  </ul>

                  {isDev && devToken && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '6px', padding: '0.5rem 0.85rem' }}>
                      <span style={{ fontSize: '0.775rem', color: '#7DD3FC', fontWeight: 600 }}>
                        Local Development Detected: Token is available from your active dev server.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSetupToken(devToken);
                          if (!adminEmail) setAdminEmail('admin@yourcompany.com');
                        }}
                        style={{
                          backgroundColor: '#0284C7',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#0369A1')}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0284C7')}
                      >
                        Auto-Fill Dev Token
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleVerifyToken} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              {detectedAdminAccount && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '0.775rem',
                    color: '#34D399',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '1.25rem',
                  }}
                >
                  <ThemeIcon name="shield" size={15} />
                  <span>
                    ✓ <strong>Active Google Account Detected:</strong> <code>{detectedAdminAccount}</code> (Auto-assigned as Administrator identity)
                  </span>
                </div>
              )}

              {magicLinkVerified && (
                <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34D399', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ThemeIcon name="shield" size={16} />
                  <span>✓ <strong>1-Click Magic Link Token Verified</strong>: Please enter your Administrator Email and confirm your Google Cloud Project to proceed.</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                    Administrator Corporate Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. admin@yourcompany.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    style={inputStyle}
                  />
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.725rem', color: '#71717A' }}>
                    Your primary Super Admin identity in Google Workspace.
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                    Google Cloud Project ID *
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      placeholder="e.g. your-gcp-project-id"
                      value={gcpProjectId}
                      onChange={(e) => {
                        setGcpProjectId(e.target.value);
                        setStep1PrecheckResult(null);
                      }}
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)', flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handlePrecheckProject}
                      disabled={step1PrecheckLoading || !gcpProjectId.trim()}
                      style={{
                        backgroundColor: '#27272A',
                        border: '1px solid #3F3F46',
                        color: '#FAFAFA',
                        padding: '0 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: step1PrecheckLoading || !gcpProjectId.trim() ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: step1PrecheckLoading || !gcpProjectId.trim() ? 0.6 : 1,
                      }}
                      onMouseOver={(e) => {
                        if (!step1PrecheckLoading && gcpProjectId.trim()) e.currentTarget.style.backgroundColor = '#3F3F46';
                      }}
                      onMouseOut={(e) => {
                        if (!step1PrecheckLoading && gcpProjectId.trim()) e.currentTarget.style.backgroundColor = '#27272A';
                      }}
                    >
                      <ThemeIcon name="shield" size={13} />
                      {step1PrecheckLoading ? 'Verifying...' : 'Verify Project'}
                    </button>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.725rem', color: '#71717A' }}>
                    Host Cloud Run Project ({detectedRegion || 'europe-west1'}).
                  </p>

                  {step1PrecheckResult && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: step1PrecheckResult.allPassed
                          ? 'rgba(16, 185, 129, 0.12)'
                          : step1PrecheckResult.success
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(244, 63, 94, 0.12)',
                        border: step1PrecheckResult.allPassed
                          ? '1px solid rgba(16, 185, 129, 0.4)'
                          : step1PrecheckResult.success
                          ? '1px solid rgba(245, 158, 11, 0.4)'
                          : '1px solid rgba(244, 63, 94, 0.4)',
                        color: step1PrecheckResult.allPassed
                          ? '#34D399'
                          : step1PrecheckResult.success
                          ? '#FBBF24'
                          : '#FB7185',
                      }}
                    >
                      <span>{step1PrecheckResult.allPassed ? '✓' : step1PrecheckResult.success ? '⚠️' : '✕'}</span>
                      <span>{step1PrecheckResult.message}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* GCP Cloud Run Region & Regional Alignment Advisory */}
              <div
                style={{
                  backgroundColor: '#09090B',
                  border: '1px solid #27272A',
                  borderRadius: '8px',
                  padding: '1rem 1.15rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38BDF8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <ThemeIcon name="globe" size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>
                      Cloud Run Primary Deployment Region *
                    </label>
                    <span style={{ fontSize: '0.725rem', color: '#38BDF8', fontWeight: 600 }}>
                      🇪🇺 EU Data Centers Ranked First
                    </span>
                  </div>

                  <select
                    value={detectedRegion}
                    onChange={(e) => setDetectedRegion(e.target.value)}
                    style={{
                      ...inputStyle,
                      backgroundColor: '#18181B',
                      border: '1px solid #3F3F46',
                      color: '#38BDF8',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {Object.entries(
                      GCP_REGIONS.reduce((acc, r) => {
                        acc[r.group] = acc[r.group] || [];
                        acc[r.group].push(r);
                        return acc;
                      }, {} as Record<string, typeof GCP_REGIONS>)
                    ).map(([group, regions]) => (
                      <optgroup key={group} label={group} style={{ backgroundColor: '#18181B', color: '#A1A1AA' }}>
                        {regions.map((r) => (
                          <option key={r.code} value={r.code} style={{ backgroundColor: '#09090B', color: '#FAFAFA' }}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  <p style={{ margin: '0.45rem 0 0 0', fontSize: '0.725rem', color: '#A1A1AA', lineHeight: 1.5 }}>
                    💡 <strong>Regional Service Alignment:</strong> Regional dependencies (like <strong>Cloud Firestore databases</strong> and <strong>BigQuery datasets</strong>) should use the same region (<code>{detectedRegion}</code>) to guarantee low query latency, prevent cross-region egress costs, and maintain GDPR compliance.
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>
                    Bootstrap Setup Token *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {devToken && setupToken === devToken && (
                      <span style={{ fontSize: '0.7rem', color: '#34D399', fontWeight: 600 }}>
                        ✓ Auto-Inserted
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleGenerateFreshToken}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38BDF8',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '2px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Generate a fresh random 32-byte cryptographic setup token"
                    >
                      <ThemeIcon name="sparkles" size={13} />
                      Generate Fresh Token
                    </button>
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    placeholder="32-byte hex token"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)', paddingRight: magicLinkVerified ? '110px' : '12px' }}
                  />
                  {magicLinkVerified && (
                    <span
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#34D399',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      ✓ Verified
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.725rem', color: '#71717A' }}>
                  Cryptographic single-use token auto-vaulted in GCP Secret Manager and auto-inserted on local launch.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #27272A', paddingTop: '1.5rem', marginTop: 'auto' }}>
                <button
                  type="submit"
                  disabled={loading || !setupToken.trim() || !adminEmail.trim() || !gcpProjectId.trim()}
                  style={
                    loading || !setupToken.trim() || !adminEmail.trim() || !gcpProjectId.trim()
                      ? { ...secondaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }
                      : primaryBtnStyle
                  }
                  onMouseOver={(e) => {
                    if (!loading && setupToken.trim() && adminEmail.trim() && gcpProjectId.trim()) {
                      e.currentTarget.style.backgroundColor = '#E4E4E7';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!loading && setupToken.trim() && adminEmail.trim() && gcpProjectId.trim()) {
                      e.currentTarget.style.backgroundColor = '#FAFAFA';
                    }
                  }}
                >
                  {loading ? 'Verifying & Initializing...' : 'Confirm & Continue to Step 2: GCP & IAM →'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: GCP Project & IAM Permission Diagnostics                         */}
        {/* ========================================================================= */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FAFAFA' }}>
              Step 2: GCP Project Verification & IAM Permissions
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#A1A1AA', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Confirm your Google Cloud Project and verify that your runtime Service Account has the required IAM permissions to operate Firestore and Secret Manager.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.5rem' }}>
                  Target GCP Project ID
                </label>
                <input
                  type="text"
                  value={gcpProjectId}
                  onChange={(e) => setGcpProjectId(e.target.value)}
                  placeholder="e.g. your-gcp-project-id"
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.5rem' }}>
                  Cloud Run Service Account
                </label>
                <input
                  type="text"
                  readOnly
                  title={serviceAccountEmail || 'Resolving Service Account...'}
                  value={serviceAccountEmail}
                  style={{ ...inputStyle, backgroundColor: '#18181B', color: '#A1A1AA', cursor: 'default', fontFamily: 'var(--font-mono, monospace)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.75rem', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => runGcpDiagnostics(gcpProjectId)}
                disabled={diagLoading || apisEnabling}
                style={utilityBtnStyle}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3F3F46')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
              >
                <ThemeIcon name="cog" size={15} />
                {diagLoading ? 'Scanning IAM Permissions...' : 'Re-run IAM Permissions Check'}
              </button>

              <button
                type="button"
                onClick={handleEnableAllApis}
                disabled={apisEnabling || diagLoading || !gcpProjectId.trim()}
                style={{
                  ...utilityBtnStyle,
                  backgroundColor: apisEnabledSuccess ? 'rgba(16, 185, 129, 0.15)' : '#18181B',
                  borderColor: apisEnabledSuccess ? '#10B981' : '#3F3F46',
                  color: apisEnabledSuccess ? '#34D399' : '#38BDF8',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = apisEnabledSuccess ? 'rgba(16, 185, 129, 0.15)' : '#18181B')}
              >
                <ThemeIcon name="lightning" size={15} />
                {apisEnabling ? 'Enabling GCP APIs...' : apisEnabledSuccess ? 'GCP APIs Enabled' : 'Enable Required GCP APIs'}
              </button>
            </div>

            {/* Scanning In-Progress Indicator Banner */}
            {diagLoading && (
              <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ position: 'relative', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid #38BDF8', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                  <ThemeIcon name="shield" size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38BDF8' }}>
                    Scanning Google Cloud IAM Permissions in progress...
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                    Probing Secret Manager, Cloud Firestore, and Service Usage API access for <code>{serviceAccountEmail || 'Cloud Run Service Account'}</code> on project <code>{gcpProjectId}</code>.
                  </div>
                </div>
              </div>
            )}

            {/* Diagnostics Results Table */}
            {diagnostics && !diagLoading && (
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FAFAFA' }}>
                    IAM Role Diagnostics ({diagnostics.permissions.filter((p) => p.status === 'PASS').length}/{diagnostics.permissions.length} Passed)
                  </span>
                  {diagnostics.allPassed ? (
                    <span style={{ color: '#34D399', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✓ All Permissions Granted
                    </span>
                  ) : (
                    <span style={{ color: '#F87171', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✕ Action Required: Missing Roles
                    </span>
                  )}
                </div>

                <div style={{ border: '1px solid #27272A', borderRadius: '8px', overflow: 'hidden' }}>
                  {diagnostics.permissions.map((perm, idx) => (
                    <div
                      key={perm.role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.85rem 1rem',
                        backgroundColor: idx % 2 === 0 ? '#121215' : '#18181B',
                        borderBottom: idx < diagnostics.permissions.length - 1 ? '1px solid #27272A' : 'none',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>{perm.name}</span>
                          <span style={{ fontSize: '0.725rem', fontFamily: 'var(--font-mono, monospace)', color: '#A1A1AA', backgroundColor: '#27272A', padding: '1px 6px', borderRadius: '4px' }}>
                            {perm.role}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#71717A', marginTop: '2px' }}>{perm.description}</div>
                        {perm.error && (
                          <div style={{ fontSize: '0.725rem', color: '#FB7185', marginTop: '3px' }}>
                            Error: {perm.error}
                          </div>
                        )}
                      </div>

                      <div style={{ flexShrink: 0, minWidth: '82px', display: 'flex', justifyContent: 'center' }}>
                        {perm.status === 'PASS' ? (
                          <span
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#34D399',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '5px 12px',
                              borderRadius: '9999px',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              minWidth: '82px',
                              justifyContent: 'center',
                            }}
                          >
                            <span>✓</span>
                            <span>PASS</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              backgroundColor: 'rgba(244, 63, 94, 0.15)',
                              color: '#FB7185',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '5px 12px',
                              borderRadius: '9999px',
                              border: '1px solid rgba(244, 63, 94, 0.4)',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              minWidth: '82px',
                              justifyContent: 'center',
                            }}
                          >
                            <span>✕</span>
                            <span>MISSING</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* gcloud Remediation Box if any role failed */}
                {!diagnostics.allPassed && (
                  <div style={{ marginTop: '1.25rem', backgroundColor: '#09090B', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '8px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FBBF24', fontSize: '0.85rem', fontWeight: 600 }}>
                        <ThemeIcon name="code" size={16} />
                        Run these gcloud commands in your terminal to grant permissions:
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Shell Type Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '6px', padding: '2px' }}>
                          {(['powershell', 'bash', 'cmd'] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setShellType(s)}
                              style={{
                                backgroundColor: shellType === s ? '#27272A' : 'transparent',
                                color: shellType === s ? '#FAFAFA' : '#71717A',
                                border: shellType === s ? '1px solid #3F3F46' : '1px solid transparent',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '0.725rem',
                                fontWeight: shellType === s ? 700 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              {s === 'powershell' ? 'PowerShell' : s === 'bash' ? 'Bash' : 'CMD'}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopy(formatCommandsForShell(diagnostics.remediationCommands, shellType), 'gcloud_all')}
                          style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.5)',
                            color: '#FBBF24',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {copiedKey === 'gcloud_all' ? '✓ Copied!' : `Copy for ${shellType === 'powershell' ? 'PowerShell' : shellType === 'bash' ? 'Bash' : 'CMD'}`}
                        </button>
                      </div>
                    </div>
                    <pre style={{ margin: 0, padding: '0.85rem', backgroundColor: '#030712', border: '1px solid #27272A', borderRadius: '6px', color: '#E2E8F0', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)', overflowX: 'auto', lineHeight: 1.5 }}>
                      {formatCommandsForShell(diagnostics.remediationCommands, shellType)}
                    </pre>

                    <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', fontSize: '0.75rem', color: '#FCD34D', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>⏱️</span>
                      <div>
                        <strong>Google Cloud IAM Propagation Notice:</strong> IAM policy bindings and Cloud Run service account access tokens typically take <strong>1 to 5 minutes</strong> to propagate across Google's infrastructure. If you just ran the command, please wait 2–3 minutes before clicking <em>Re-run IAM Permissions Check</em>.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #27272A', paddingTop: '1.5rem', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={secondaryBtnStyle}
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                style={primaryBtnStyle}
              >
                Continue to Firestore DB →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: Firestore Database Architecture Setup                             */}
        {/* ========================================================================= */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FAFAFA' }}>
              Step 3: Firestore Database Architecture
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#A1A1AA', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Select between a <strong>Standard</strong> single-database instance or an <strong>Enterprise</strong> custom-named database. Host region: <code style={{ color: '#38BDF8' }}>{detectedRegion}</code>.
            </p>

            {/* Mode Selection Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Standard Card */}
              <div
                onClick={() => {
                  setFirestoreMode('standard');
                  setDatabaseId('(default)');
                  setFirestoreSuccess(false);
                  setFirestoreGcloudCmd(null);
                  setFirestoreIamFixCmd(null);
                }}
                style={{
                  padding: '1rem 1.25rem',
                  backgroundColor: firestoreMode === 'standard' ? 'rgba(56, 189, 248, 0.1)' : '#121215',
                  border: firestoreMode === 'standard' ? '2px solid #38BDF8' : '1px solid #27272A',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#FAFAFA' }}>
                    Standard Instance
                  </span>
                  {firestoreMode === 'standard' && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                      ✓ SELECTED
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#38BDF8', marginBottom: '0.35rem' }}>
                  (default)
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#A1A1AA', lineHeight: 1.4 }}>
                  Default single-database Firestore instance. Free tier eligible, ideal for standard multi-SaaS deployments.
                </p>
              </div>

              {/* Enterprise Card */}
              <div
                onClick={() => {
                  setFirestoreMode('enterprise');
                  if (databaseId === '(default)' || !databaseId) {
                    setDatabaseId(gcpProjectId ? `${gcpProjectId}-mcp` : 'mcp-gateway-db');
                  }
                  setFirestoreSuccess(false);
                  setFirestoreGcloudCmd(null);
                  setFirestoreIamFixCmd(null);
                }}
                style={{
                  padding: '1rem 1.25rem',
                  backgroundColor: firestoreMode === 'enterprise' ? 'rgba(56, 189, 248, 0.1)' : '#121215',
                  border: firestoreMode === 'enterprise' ? '2px solid #38BDF8' : '1px solid #27272A',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#FAFAFA' }}>
                    Enterprise Instance
                  </span>
                  {firestoreMode === 'enterprise' && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                      ✓ SELECTED
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#38BDF8', marginBottom: '0.35rem' }}>
                  Custom Named Database
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#A1A1AA', lineHeight: 1.4 }}>
                  Multi-database enterprise mode. Provides isolated database container per tenant or workload.
                </p>
              </div>
            </div>

            {/* Discovered Existing Databases in GCP Project */}
            {discoveredDatabases.length > 0 && (
              <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#38BDF8', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ThemeIcon name="firestore" size={15} />
                  Found Existing Firestore Databases in Project:
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {discoveredDatabases.map((db) => {
                    const isSelected = databaseId === db.databaseId;
                    return (
                      <button
                        key={db.databaseId}
                        type="button"
                        onClick={() => {
                          setDatabaseId(db.databaseId);
                          setFirestoreMode(db.databaseId === '(default)' ? 'standard' : 'enterprise');
                          setFirestoreSuccess(false);
                          setFirestoreGcloudCmd(null);
                          setFirestoreIamFixCmd(null);
                        }}
                        style={{
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#18181B',
                          border: isSelected ? '1px solid #38BDF8' : '1px solid #3F3F46',
                          color: isSelected ? '#38BDF8' : '#FAFAFA',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{db.databaseId}</strong>
                        <span style={{ fontSize: '0.7rem', color: '#A1A1AA', backgroundColor: '#27272A', padding: '1px 5px', borderRadius: '3px' }}>
                          {db.locationId}
                        </span>
                        {isSelected && <span style={{ color: '#38BDF8', fontWeight: 700 }}>✓ Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.5rem' }}>
                Active Target Firestore Database ID
              </label>

              <input
                type="text"
                value={databaseId}
                onChange={(e) => {
                  setDatabaseId(e.target.value);
                  setFirestoreTested(false);
                  setFirestoreSuccess(false);
                  setFirestoreGcloudCmd(null);
                  setFirestoreIamFixCmd(null);
                  setFirestoreCreateError(null);
                }}
                placeholder="e.g. (default) or my-mcp-db"
                style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)' }}
              />
              <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#71717A' }}>
                Using standard <code>(default)</code> or custom named database.
              </p>
            </div>

            {/* Action Buttons: Stable Left-to-Right Order with Dynamic Visual CTA Highlighting */}
            {(() => {
              const isDbMissing = firestoreTested && !firestoreSuccess && !firestorePermissionDenied;
              return (
                <div style={{ marginBottom: '1.75rem', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Button 1 (Always Left): Test Firestore Connection */}
                  <button
                    type="button"
                    onClick={handleInitFirestore}
                    disabled={loading || firestoreCreating}
                    style={{
                      backgroundColor: isDbMissing ? '#18181B' : firestoreSuccess ? '#18181B' : '#0284C7',
                      border: isDbMissing ? '1px solid #3F3F46' : firestoreSuccess ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid #38BDF8',
                      color: isDbMissing ? '#A1A1AA' : firestoreSuccess ? '#34D399' : '#FAFAFA',
                      padding: '9px 18px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: isDbMissing ? 600 : 700,
                      cursor: loading || firestoreCreating ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: !isDbMissing && !firestoreSuccess ? '0 0 12px rgba(2, 132, 199, 0.35)' : 'none',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                      if (!loading && !firestoreCreating) {
                        e.currentTarget.style.backgroundColor = isDbMissing ? '#27272A' : firestoreSuccess ? '#27272A' : '#0369A1';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!loading && !firestoreCreating) {
                        e.currentTarget.style.backgroundColor = isDbMissing ? '#18181B' : firestoreSuccess ? '#18181B' : '#0284C7';
                      }
                    }}
                  >
                    <ThemeIcon name="firestore" size={16} />
                    {loading ? 'Testing & Verifying Schema...' : firestoreSuccess ? '✓ Re-test Connection' : isDbMissing ? 'Re-test Connection' : 'Test Firestore Connection'}
                  </button>

                  {/* Button 2 (Always Right): Create Database in GCP */}
                  <button
                    type="button"
                    onClick={handleCreateFirestoreDb}
                    disabled={!isDbMissing || firestoreSuccess || firestoreCreating || loading || !gcpProjectId.trim()}
                    title={!firestoreTested ? 'Run Test Firestore Connection first' : undefined}
                    style={{
                      backgroundColor: isDbMissing ? '#0284C7' : '#18181B',
                      border: isDbMissing ? '1px solid #38BDF8' : '1px solid #3F3F46',
                      color: isDbMissing ? '#FAFAFA' : '#71717A',
                      padding: '9px 18px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: isDbMissing ? 700 : 600,
                      opacity: isDbMissing ? 1 : 0.5,
                      cursor: isDbMissing && !firestoreCreating && !loading ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: isDbMissing ? '0 0 16px rgba(2, 132, 199, 0.45)' : 'none',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                      if (isDbMissing && !firestoreCreating && !loading) {
                        e.currentTarget.style.backgroundColor = '#0369A1';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (isDbMissing && !firestoreCreating && !loading) {
                        e.currentTarget.style.backgroundColor = '#0284C7';
                      }
                    }}
                  >
                    <ThemeIcon name="plus" size={16} />
                    {firestoreCreating ? 'Creating Database in GCP...' : `Create '${databaseId}' Database in ${detectedRegion}`}
                  </button>

                  {!firestoreTested && (
                    <span style={{ fontSize: '0.75rem', color: '#71717A', fontStyle: 'italic' }}>
                      (Click "Test Firestore Connection" to verify existing database or create new)
                    </span>
                  )}
                  {isDbMissing && (
                    <span style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 600 }}>
                      ← Click "Create Database" to provision in Google Cloud
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Success Box - Green Banner */}
            {firestoreSuccess && (
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#34D399', padding: '1rem 1.25rem', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 16px rgba(16, 185, 129, 0.15)' }}>
                  <span style={{ fontSize: '1.25rem', lineHeight: 1, fontWeight: 700 }}>✓</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>Database Online & Verified</div>
                    <div>{firestoreMsg || `Successfully connected to Firestore database '${databaseId}' in ${detectedRegion} with ${firestoreLatency || 0}ms latency.`} Ready to proceed to Step 4!</div>
                  </div>
                </div>
              </div>
            )}

            {/* 1-Click Creation Error Banner */}
            {firestoreCreateError && !firestoreSuccess && (
              <div style={{ marginBottom: '1.25rem', backgroundColor: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.5)', color: '#FDA4AF', padding: '0.85rem 1.15rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <strong>1-Click Database Creation Failed:</strong> {firestoreCreateError}
                  <div style={{ marginTop: '4px', color: '#A1A1AA' }}>
                    Please run the equivalent <code>gcloud</code> command below in your terminal, then click <em>Test Firestore Connection</em> again.
                  </div>
                </div>
              </div>
            )}

            {/* Permission Denied Box - Shows IAM Fix Command with Propagation Notice */}
            {firestorePermissionDenied && firestoreIamFixCmd && (
              <div style={{ marginBottom: '1.75rem', backgroundColor: '#09090B', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '8px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FB7185', fontSize: '0.85rem', fontWeight: 600 }}>
                    <ThemeIcon name="alert" size={16} />
                    Permission Denied: Run this command to grant 'roles/datastore.user':
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '6px', padding: '2px' }}>
                      {(['powershell', 'bash', 'cmd'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setShellType(s)}
                          style={{
                            backgroundColor: shellType === s ? '#27272A' : 'transparent',
                            color: shellType === s ? '#FAFAFA' : '#71717A',
                            border: shellType === s ? '1px solid #3F3F46' : '1px solid transparent',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '0.725rem',
                            fontWeight: shellType === s ? 700 : 500,
                            cursor: 'pointer',
                          }}
                        >
                          {s === 'powershell' ? 'PowerShell' : s === 'bash' ? 'Bash' : 'CMD'}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(formatCommandsForShell(firestoreIamFixCmd, shellType), 'gcloud_iam_fs')}
                      style={{
                        backgroundColor: 'rgba(244, 63, 94, 0.15)',
                        border: '1px solid rgba(244, 63, 94, 0.5)',
                        color: '#FB7185',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedKey === 'gcloud_iam_fs' ? '✓ Copied!' : `Copy for ${shellType === 'powershell' ? 'PowerShell' : shellType === 'bash' ? 'Bash' : 'CMD'}`}
                    </button>
                  </div>
                </div>
                <pre style={{ margin: 0, padding: '0.85rem', backgroundColor: '#030712', border: '1px solid #27272A', borderRadius: '6px', color: '#E2E8F0', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)', overflowX: 'auto', lineHeight: 1.5 }}>
                  {formatCommandsForShell(firestoreIamFixCmd, shellType)}
                </pre>

                <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: '6px', fontSize: '0.75rem', color: '#FDA4AF', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>⏱️</span>
                  <div>
                    <strong>IAM Propagation Delay:</strong> If you just executed the command above, Google Cloud IAM and Cloud Run access token caches typically take <strong>1 to 5 minutes</strong> to refresh before permissions take effect. Please wait 2–3 minutes, then click <em>Test Firestore Connection</em> again.
                  </div>
                </div>
              </div>
            )}

            {/* Database Not Found Box - Shows Create Command with Detected Region */}
            {firestoreGcloudCmd && !firestoreSuccess && (
              <div style={{ marginBottom: '1.75rem', backgroundColor: '#09090B', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '8px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38BDF8' }}>
                    Database '{databaseId}' Not Found: Run this command to create it in region '{detectedRegion}':
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '6px', padding: '2px' }}>
                      {(['powershell', 'bash', 'cmd'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setShellType(s)}
                          style={{
                            backgroundColor: shellType === s ? '#27272A' : 'transparent',
                            color: shellType === s ? '#FAFAFA' : '#71717A',
                            border: shellType === s ? '1px solid #3F3F46' : '1px solid transparent',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '0.725rem',
                            fontWeight: shellType === s ? 700 : 500,
                            cursor: 'pointer',
                          }}
                        >
                          {s === 'powershell' ? 'PowerShell' : s === 'bash' ? 'Bash' : 'CMD'}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(formatCommandsForShell(firestoreGcloudCmd, shellType), 'gcloud_db')}
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.5)',
                        color: '#38BDF8',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedKey === 'gcloud_db' ? '✓ Copied!' : `Copy for ${shellType === 'powershell' ? 'PowerShell' : shellType === 'bash' ? 'Bash' : 'CMD'}`}
                    </button>
                  </div>
                </div>
                <pre style={{ margin: 0, padding: '0.85rem', backgroundColor: '#030712', border: '1px solid #27272A', borderRadius: '6px', color: '#E2E8F0', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)', overflowX: 'auto', lineHeight: 1.5 }}>
                  {formatCommandsForShell(firestoreGcloudCmd, shellType)}
                </pre>
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #27272A', paddingTop: '1.5rem', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={secondaryBtnStyle}
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!firestoreSuccess}
                style={
                  !firestoreSuccess
                    ? { ...secondaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }
                    : primaryBtnStyle
                }
                onMouseOver={(e) => {
                  if (firestoreSuccess) e.currentTarget.style.backgroundColor = '#E4E4E7';
                }}
                onMouseOut={(e) => {
                  if (firestoreSuccess) e.currentTarget.style.backgroundColor = '#FAFAFA';
                }}
              >
                Continue to Step 4: Deploy to Cloud Run →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: Platform Secrets Provisioning & 1-Click Cloud Run Deployer Studio */}
        {/* ========================================================================= */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FAFAFA' }}>
              Step 4: Platform Secrets & Cloud Run Deployment
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#A1A1AA', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Provision internal cryptographic gateway secrets to Google Secret Manager and deploy the container directly to <strong>Google Cloud Run</strong> in <code>{detectedRegion}</code> to generate your live production HTTPS URL.
            </p>

            {/* Target Architecture Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>GCP PROJECT</div>
                <div style={{ fontSize: '0.825rem', color: '#FAFAFA', fontWeight: 700, marginTop: '2px', fontFamily: 'var(--font-mono, monospace)' }}>
                  {gcpProjectId}
                </div>
              </div>

              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>REGION (EU FIRST)</div>
                <div style={{ fontSize: '0.825rem', color: '#38BDF8', fontWeight: 700, marginTop: '2px' }}>
                  {detectedRegion}
                </div>
              </div>

              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>TARGET FIRESTORE DB</div>
                <div style={{ fontSize: '0.825rem', color: '#34D399', fontWeight: 700, marginTop: '2px', fontFamily: 'var(--font-mono, monospace)' }}>
                  {databaseId}
                </div>
              </div>
            </div>

            {/* Sub-step 4A: Core Secrets Provisioning */}
            <div
              style={{
                backgroundColor: '#121215',
                border: geminiProvisioned ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid #38BDF8',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.25rem',
                boxShadow: geminiProvisioned ? 'none' : '0 0 16px rgba(56, 189, 248, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: geminiProvisioned ? 'rgba(16, 185, 129, 0.2)' : '#0284C7',
                      color: geminiProvisioned ? '#34D399' : '#FAFAFA',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: geminiProvisioned ? '1px solid #10B981' : '1px solid #38BDF8',
                    }}
                  >
                    {geminiProvisioned ? '✓ COMPLETED' : 'SUB-STEP 4A'}
                  </span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#FAFAFA' }}>
                    Generate & Provision Platform Secrets to Google Secret Manager
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateGeminiSecrets}
                  style={{
                    backgroundColor: '#27272A',
                    border: '1px solid #3F3F46',
                    color: '#38BDF8',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ThemeIcon name="sparkles" size={13} />
                  {geminiClientSecret ? 'Regenerate Secure Keys' : 'Generate Secure Keys'}
                </button>
              </div>

              <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.775rem', color: '#A1A1AA', lineHeight: 1.4 }}>
                1. First click <strong>"Generate Secure Keys"</strong> to produce 256-bit credentials. 2. Then click <strong>"Provision Secrets to GSM"</strong> to encrypt and store them in Secret Manager before deploying.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '0.25rem' }}>
                    MCP_CLIENT_ID
                  </label>
                  <input
                    type="text"
                    value={geminiClientId}
                    onChange={(e) => setGeminiClientId(e.target.value)}
                    placeholder="gemini-enterprise-mcp"
                    style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '0.25rem' }}>
                    MCP_CLIENT_SECRET
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showGeminiSecret ? 'text' : 'password'}
                      value={geminiClientSecret}
                      onChange={(e) => setGeminiClientSecret(e.target.value)}
                      placeholder="Click 'Generate Secure Keys' above"
                      style={{ ...inputStyle, padding: '0.5rem 2.5rem 0.5rem 0.75rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiSecret(!showGeminiSecret)}
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: '#27272A',
                        border: '1px solid #3F3F46',
                        color: '#FAFAFA',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                    >
                      {showGeminiSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: geminiProvisioned ? '#34D399' : '#A1A1AA', fontWeight: geminiProvisioned ? 600 : 400 }}>
                  {geminiProvisioned
                    ? '✓ Platform secrets successfully vaulted in Secret Manager.'
                    : !geminiClientSecret
                    ? 'Step 1: Click "Generate Secure Keys" to generate tokens.'
                    : 'Step 2: Click "Provision Secrets to GSM" below to vault in GCP.'}
                </span>

                <button
                  type="button"
                  onClick={handleProvisionGeminiSecrets}
                  disabled={isProvisioningGsm || !geminiClientId.trim() || !geminiClientSecret.trim()}
                  style={{
                    backgroundColor: geminiProvisioned ? 'rgba(16, 185, 129, 0.15)' : !geminiClientSecret ? '#27272A' : '#0284C7',
                    border: geminiProvisioned ? '1px solid #10B981' : !geminiClientSecret ? '1px solid #3F3F46' : '1px solid #38BDF8',
                    color: geminiProvisioned ? '#34D399' : !geminiClientSecret ? '#71717A' : '#FAFAFA',
                    padding: '6px 16px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isProvisioningGsm || !geminiClientSecret.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: geminiProvisioned || !geminiClientSecret ? 'none' : '0 0 12px rgba(2, 132, 199, 0.35)',
                  }}
                >
                  <ThemeIcon name="shield" size={14} />
                  {isProvisioningGsm ? 'Provisioning...' : geminiProvisioned ? 'Re-provision Secrets to GSM' : 'Provision Secrets to GSM (Required)'}
                </button>
              </div>
            </div>

            {/* Sub-step 4B: Cloud Run Deployment Studio */}
            <div
              style={{
                backgroundColor: '#09090B',
                border: !geminiProvisioned ? '1px solid #27272A' : '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                opacity: !geminiProvisioned ? 0.6 : 1,
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: geminiProvisioned ? 'rgba(56, 189, 248, 0.2)' : '#27272A',
                      color: geminiProvisioned ? '#38BDF8' : '#71717A',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: geminiProvisioned ? '1px solid #38BDF8' : '1px solid #3F3F46',
                    }}
                  >
                    SUB-STEP 4B
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ThemeIcon name="cloud" size={16} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: geminiProvisioned ? '#FAFAFA' : '#A1A1AA' }}>
                      Deploy Gateway Container to Google Cloud Run
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDeployCloudRunLive}
                  disabled={!geminiProvisioned || cloudRunDeploying || !gcpProjectId.trim()}
                  title={!geminiProvisioned ? 'Complete Sub-step 4A first' : undefined}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: !geminiProvisioned ? '#27272A' : cloudRunDeploySuccess ? '#10B981' : '#0284C7',
                    borderColor: !geminiProvisioned ? '#3F3F46' : cloudRunDeploySuccess ? '#10B981' : '#38BDF8',
                    color: !geminiProvisioned ? '#71717A' : '#FAFAFA',
                    fontWeight: 700,
                    cursor: !geminiProvisioned || cloudRunDeploying || !gcpProjectId.trim() ? 'not-allowed' : 'pointer',
                    boxShadow: geminiProvisioned && !cloudRunDeploySuccess ? '0 0 14px rgba(2, 132, 199, 0.4)' : 'none',
                    opacity: !geminiProvisioned ? 0.6 : 1,
                  }}
                >
                  <ThemeIcon name="cloud" size={15} />
                  {!geminiProvisioned
                    ? 'Locked: Complete Sub-step 4A First'
                    : cloudRunDeploying
                    ? 'Deploying to Cloud Run...'
                    : cloudRunDeploySuccess
                    ? 'Redeploy Gateway Container'
                    : 'Deploy Gateway to Cloud Run'}
                </button>
              </div>

              {!geminiProvisioned && (
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', fontSize: '0.75rem', color: '#FCD34D', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                  <ThemeIcon name="alert" size={14} />
                  <span><strong>Sub-step 4B is locked:</strong> Please click <em>"Provision Secrets to GSM"</em> in Sub-step 4A above. Cloud Run mounts these secrets at startup.</span>
                </div>
              )}

              {/* Live Streaming Logs Terminal Box */}
              {(cloudRunDeploying || cloudRunDeployLogs.length > 0) && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#18181B', padding: '6px 12px', borderTopLeftRadius: '6px', borderTopRightRadius: '6px', border: '1px solid #27272A', borderBottom: 'none' }}>
                    <span style={{ fontSize: '0.725rem', fontFamily: 'var(--font-mono, monospace)', color: '#A1A1AA' }}>
                      {cloudRunDeploying ? '● LIVE DEPLOYMENT LOG STREAM' : cloudRunDeploySuccess ? '✓ DEPLOYMENT SUCCESSFUL' : '✕ DEPLOYMENT LOGS'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: cloudRunDeploying ? '#38BDF8' : cloudRunDeploySuccess ? '#34D399' : '#FB7185' }}>
                      {cloudRunDeploying ? 'Building container & deploying...' : cloudRunDeploySuccess ? 'Ready' : 'Finished'}
                    </span>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '0.85rem',
                      backgroundColor: '#030712',
                      border: '1px solid #27272A',
                      borderBottomLeftRadius: '6px',
                      borderBottomRightRadius: '6px',
                      color: '#E2E8F0',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                    }}
                  >
                    {cloudRunDeployLogs.join('') || 'Waiting for build output...\n'}
                  </pre>
                </div>
              )}

              {cloudRunServiceUrl && (
                <div style={{ marginTop: '0.85rem', padding: '0.85rem 1.15rem', backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.5)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#A1A1AA', fontWeight: 600 }}>LIVE CLOUD RUN SERVICE URL: </span>
                    <strong style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem', color: '#34D399', marginLeft: '6px' }}>
                      {cloudRunServiceUrl}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(cloudRunServiceUrl, 'cloudrun_url')}
                    style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {copiedKey === 'cloudrun_url' ? '✓ Copied URL' : 'Copy Service URL'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #27272A', paddingTop: '1.5rem', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={() => setStep(3)}
                style={secondaryBtnStyle}
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={() => setStep(5)}
                disabled={!geminiProvisioned}
                style={
                  !geminiProvisioned
                    ? { ...secondaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }
                    : primaryBtnStyle
                }
              >
                Continue to Step 5: GWS OAuth SSO →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 5: Google Workspace Super Admin Identity & OAuth SSO                 */}
        {/* ========================================================================= */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FAFAFA' }}>
              Step 5: Google Workspace (GWS) OAuth SSO Configuration
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#A1A1AA', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Configure Single Sign-On for your corporate domain using Google Cloud OAuth 2.0 Web Client credentials.
            </p>

            {/* Step-by-Step Google Cloud Console Guide */}
            <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ThemeIcon name="shield" size={16} />
                  How to create your Google OAuth Client ID & Secret
                </div>
                <a
                  href={`https://console.cloud.google.com/apis/credentials?project=${encodeURIComponent(gcpProjectId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#0369A1')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0284C7')}
                >
                  <span>Open GCP Credentials Console</span>
                  <span style={{ fontSize: '0.9rem' }}>↗</span>
                </a>
              </div>

              <ol style={{ margin: '0 0 0 1.25rem', padding: 0, fontSize: '0.8rem', color: '#A1A1AA', lineHeight: 1.6 }}>
                <li>
                  Open the <strong style={{ color: '#FAFAFA' }}>Google Cloud Console Credentials</strong> page (using the button above).
                </li>
                <li>
                  Click <strong style={{ color: '#FAFAFA' }}>+ CREATE CREDENTIALS</strong> at the top bar and select <strong style={{ color: '#FAFAFA' }}>OAuth client ID</strong>.
                </li>
                <li>
                  Under <em>Application type</em>, select <strong style={{ color: '#FAFAFA' }}>Web application</strong>.
                </li>
                <li>
                  Under <strong style={{ color: '#FAFAFA' }}>Authorized redirect URIs</strong>, click <strong style={{ color: '#FAFAFA' }}>+ ADD URI</strong> and paste your live Cloud Run URI (and optional local/custom URIs) below.
                </li>
                <li>
                  Click <strong style={{ color: '#FAFAFA' }}>CREATE</strong>, then copy the generated <strong style={{ color: '#FAFAFA' }}>Client ID</strong> and <strong style={{ color: '#FAFAFA' }}>Client Secret</strong> into the form fields below.
                </li>
              </ol>
            </div>

            {/* Redirect URIs Multi-Environment & Custom Domain Guide */}
            <div style={{ backgroundColor: '#09090B', border: '1px solid #27272A', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#FAFAFA' }}>
                  📋 Authorized Redirect URIs (Paste into Google Cloud Console):
                </span>
                <span style={{ fontSize: '0.725rem', color: '#38BDF8', fontWeight: 600 }}>
                  Multi-Environment Ready
                </span>
              </div>

              {/* URI 1: Cloud Run Production Live URI */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '6px', marginBottom: '0.6rem' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#34D399', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>1. CLOUD RUN PRODUCTION REDIRECT URI</span>
                    {cloudRunServiceUrl && <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', padding: '1px 5px', borderRadius: '3px' }}>LIVE DEPLOYED</span>}
                  </div>
                  <code style={{ fontSize: '0.8rem', color: '#34D399', fontFamily: 'var(--font-mono, monospace)' }}>
                    {cloudRunServiceUrl ? `${cloudRunServiceUrl}/api/auth/callback` : `https://enterprise-mcp-server-<hash>.${detectedRegion}.run.app/api/auth/callback`}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(cloudRunServiceUrl ? `${cloudRunServiceUrl}/api/auth/callback` : `https://enterprise-mcp-server-<hash>.${detectedRegion}.run.app/api/auth/callback`, 'uri_prod')}
                  style={{
                    backgroundColor: '#27272A',
                    border: '1px solid #3F3F46',
                    color: '#FAFAFA',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginLeft: '8px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3F3F46')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
                >
                  {copiedKey === 'uri_prod' ? '✓ Copied' : 'Copy URI'}
                </button>
              </div>

              {/* URI 2: Local Dev Studio */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '6px', marginBottom: '0.6rem' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '2px' }}>
                    2. LOCAL DEVELOPMENT STUDIO:
                  </div>
                  <code style={{ fontSize: '0.8rem', color: '#38BDF8', fontFamily: 'var(--font-mono, monospace)' }}>{callbackUri}</code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(callbackUri, 'uri_local')}
                  style={{
                    backgroundColor: '#27272A',
                    border: '1px solid #3F3F46',
                    color: '#FAFAFA',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginLeft: '8px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3F3F46')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
                >
                  {copiedKey === 'uri_local' ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* URI 3: Custom Domain / CNAME */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '6px' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '2px' }}>
                    3. CUSTOM CORPORATE DOMAIN / CNAME REDIRECT:
                  </div>
                  <code style={{ fontSize: '0.8rem', color: '#FBBF24', fontFamily: 'var(--font-mono, monospace)' }}>
                    https://mcp.{allowedDomains.split(',')[0] || 'your-domain.com'}/api/auth/callback
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(`https://mcp.${allowedDomains.split(',')[0] || 'your-domain.com'}/api/auth/callback`, 'uri_custom')}
                  style={{
                    backgroundColor: '#27272A',
                    border: '1px solid #3F3F46',
                    color: '#FAFAFA',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginLeft: '8px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3F3F46')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
                >
                  {copiedKey === 'uri_custom' ? '✓ Copied' : 'Copy Template'}
                </button>
              </div>

              <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.725rem', color: '#A1A1AA', lineHeight: 1.5 }}>
                💡 <strong>Multi-Environment Pro-Tip:</strong> Google Cloud allows multiple Authorized Redirect URIs on a single OAuth Client ID. You can add all 3 URIs into the same credential so the same Client ID & Secret works across your local machine, Cloud Run URL, and corporate domain.
              </p>
            </div>

            <form onSubmit={handleConfigureGwsOAuth} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                    Google OAuth Client ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                    Google OAuth Client Secret *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showClientSecret ? 'text' : 'password'}
                      required
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      placeholder="GOCSPX-..."
                      style={{ ...inputStyle, paddingRight: '3.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowClientSecret(!showClientSecret)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: '#27272A',
                        border: '1px solid #3F3F46',
                        color: '#FAFAFA',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#3F3F46')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#27272A')}
                    >
                      {showClientSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                    Allowed Email Domains (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={allowedDomains}
                    onChange={(e) => setAllowedDomains(e.target.value)}
                    placeholder="e.g. company.com,corp.com"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA' }}>
                      Platform MCP JWT Secret
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateJwtSecret}
                      style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.725rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Generate Key
                    </button>
                  </div>
                  <input
                    type="text"
                    value={jwtSecret}
                    onChange={(e) => setJwtSecret(e.target.value)}
                    placeholder="256-bit Hex Key (Auto-generated if empty)"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)' }}
                  />
                </div>
              </div>

              {/* Primary Admin Account */}
              <div style={{ borderTop: '1px solid #27272A', paddingTop: '1.25rem', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#FAFAFA' }}>
                  Primary Administrator Account
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                      Admin Full Name
                    </label>
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="e.g. Super Admin"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#FAFAFA', marginBottom: '0.4rem' }}>
                      Admin Corporate Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@yourcompany.com"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #27272A', paddingTop: '1.5rem', marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  style={secondaryBtnStyle}
                >
                  ← Back
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  style={primaryBtnStyle}
                >
                  {loading ? 'Saving to Secret Manager...' : 'Save & Continue to Gemini Enterprise →'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 6: Gemini Enterprise Custom MCP Connector & Final Activation         */}
        {/* ========================================================================= */}
        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.4rem 0', color: '#FAFAFA' }}>
                Step 6: Google Gemini Enterprise Custom MCP Connector
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#A1A1AA', lineHeight: 1.5, margin: 0 }}>
                Register this MCP Gateway as an enterprise data store connector inside <strong>Google Gemini Enterprise</strong> using your live production HTTPS endpoints.
              </p>
            </div>

            {/* Gemini Enterprise Configuration Blueprint */}
            {geminiConfig && (
              <div
                style={{
                  backgroundColor: '#09090B',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ThemeIcon name="sparkles" size={16} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38BDF8' }}>
                      Enter these Parameters into Google Gemini Enterprise:
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyAllGeminiSettings}
                    style={{
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#7DD3FC',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <ThemeIcon name="document" size={12} />
                    <span>{copiedKey === 'gemini_all' ? '✓ All Copied!' : 'Copy All Parameters'}</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {/* MCP Endpoint */}
                  <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>MCP SERVER URL</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(geminiConfig.mcpEndpoint, 'gemini_mcp')}
                        style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                      >
                        {copiedKey === 'gemini_mcp' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#FAFAFA', wordBreak: 'break-all' }}>
                      {geminiConfig.mcpEndpoint}
                    </div>
                  </div>

                  {/* Auth Type */}
                  <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>AUTHENTICATION TYPE</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#34D399', fontWeight: 600 }}>
                      {geminiConfig.authType}
                    </div>
                  </div>

                  {/* Authorization URL */}
                  <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>AUTHORIZATION URL</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(geminiConfig.authorizationUrl, 'gemini_auth')}
                        style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                      >
                        {copiedKey === 'gemini_auth' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#FAFAFA', wordBreak: 'break-all' }}>
                      {geminiConfig.authorizationUrl}
                    </div>
                  </div>

                  {/* Token URL */}
                  <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>TOKEN URL</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(geminiConfig.tokenUrl, 'gemini_tok')}
                        style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                      >
                        {copiedKey === 'gemini_tok' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#FAFAFA', wordBreak: 'break-all' }}>
                      {geminiConfig.tokenUrl}
                    </div>
                  </div>

                  {/* Client ID */}
                  <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>CLIENT ID</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(geminiConfig.clientId, 'gemini_cid')}
                        style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                      >
                        {copiedKey === 'gemini_cid' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#FAFAFA', wordBreak: 'break-all' }}>
                      {geminiConfig.clientId}
                    </div>
                  </div>

                  {/* Client Secret */}
                  <div style={{ backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>CLIENT SECRET</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setShowGeminiSecret(!showGeminiSecret)}
                          style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                        >
                          {showGeminiSecret ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(geminiConfig.clientSecret, 'gemini_csec')}
                          style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          {copiedKey === 'gemini_csec' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: showGeminiSecret ? '#FAFAFA' : '#71717A', wordBreak: 'break-all', letterSpacing: showGeminiSecret ? 'normal' : '0.15em' }}>
                      {showGeminiSecret ? geminiConfig.clientSecret : '••••••••••••••••••••••••••••••••'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Architecture Verification Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ padding: '0.85rem 1rem', backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.7rem', color: '#A1A1AA' }}>FIRESTORE BACKEND</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#FAFAFA' }}>{databaseId}</div>
                <div style={{ fontSize: '0.725rem', color: '#34D399', marginTop: '2px' }}>✓ Connected & Initialized</div>
              </div>

              <div style={{ padding: '0.85rem 1rem', backgroundColor: '#121215', border: '1px solid #27272A', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.7rem', color: '#A1A1AA' }}>GWS IDENTITY DOMAIN</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#FAFAFA' }}>{allowedDomains || 'All Authorized Domains'}</div>
                <div style={{ fontSize: '0.725rem', color: '#34D399', marginTop: '2px' }}>✓ Stored in Secret Manager</div>
              </div>
            </div>

            {/* Mandatory Confirmation Gate */}
            <div
              style={{
                backgroundColor: geminiConfirmed ? 'rgba(16, 185, 129, 0.1)' : '#121215',
                border: `1px solid ${geminiConfirmed ? 'rgba(16, 185, 129, 0.4)' : '#27272A'}`,
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <input
                type="checkbox"
                id="gemini-confirm-tick"
                checked={geminiConfirmed}
                onChange={(e) => setGeminiConfirmed(e.target.checked)}
                style={{ marginTop: '3px', accentColor: '#10B981', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label
                htmlFor="gemini-confirm-tick"
                style={{
                  fontSize: '0.825rem',
                  color: geminiConfirmed ? '#34D399' : '#FAFAFA',
                  fontWeight: 600,
                  cursor: 'pointer',
                  lineHeight: 1.5,
                }}
              >
                I have registered these parameters into Google Gemini Enterprise and configured the custom MCP connector.
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #27272A', paddingTop: '1.5rem', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={() => setStep(5)}
                style={secondaryBtnStyle}
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={loading || !geminiConfirmed}
                style={
                  !geminiConfirmed
                    ? { ...secondaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }
                    : primaryBtnStyle
                }
              >
                {loading ? 'Activating Gateway...' : 'Complete Setup & Open Admin Portal'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
