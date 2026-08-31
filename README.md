# Enterprise Multi-Service MCP Server (`enterprise-mcp-server`)

[![CI Pipeline](https://github.com/Nick-DCA/enterprise-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Nick-DCA/enterprise-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

Enterprise-grade Model Context Protocol (MCP) server written in TypeScript and optimized for containerized execution on Google Cloud Run over **StreamableHTTP**. Built to connect **Google Gemini Enterprise** (via custom data store actions) and LLM agents with enterprise data sources: **Xero Accounting**, **Google BigQuery**, **Google Cloud Firestore**, and **Sage HR** (59 standardized tools).

---

## ⚡ Quickstart: Deploy in Under 2 Minutes

Deploy this server into your Google Cloud environment in under 2 minutes using either the **Local Web Studio** (Recommended) or the **Interactive Terminal Bootstrapper**:

### Option 1: Local Web Deployment Studio (`setup:web`) — Recommended
```bash
# 1. Clone repository & install dependencies
git clone https://github.com/Nick-DCA/enterprise-mcp-server.git
cd enterprise-mcp-server
npm install

# 2. Start the local deployment studio (auto-opens your browser with token pre-filled)
npm run setup:web
```
*Automatically launches `http://localhost:3000/admin/setup?token=...` in your default browser with your active Google account auto-detected, setup token pre-filled, IAM diagnostics, region selector, and live streaming Cloud Run deployer.*

---

### Option 2: Interactive Terminal Bootstrapper (`setup:cli`)
```bash
# 1. Clone repository & install dependencies (if not already done)
git clone https://github.com/Nick-DCA/enterprise-mcp-server.git
cd enterprise-mcp-server
npm install

# 2. Run the interactive cloud bootstrapper in your terminal
npm run setup:cli
```
*Prompts for your GCP Project ID, corporate email domain, region, and database mode (Standard vs. Enterprise). Automatically enables APIs, provisions Secret Manager, deploys to Cloud Run, and prints your Gemini Enterprise configuration blueprint.*

---

## Architecture Overview

```
                          ┌─────────────────────────────────────┐
                          │     Google Gemini Enterprise /      │
                          │        AI Orchestrator Agent        │
                          └──────────────────┬──────────────────┘
                                             │
                                   HTTPS / StreamableHTTP
                               (Bearer JWT + OAuth 2.0 PKCE)
                                             ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       Google Cloud Run (Node.js 22 Express Host)                       │
│                                                                                        │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌─────────────────────────┐  │
│  │   OAuth 2.0 Engine    │   │  StreamableHTTP Server │   │      ToolRegistry       │  │
│  │  (/oauth/authorize,   │   │  Transport (/mcp, /)   │   │  (Filter via            │  │
│  │   /oauth/token)       │   │                        │   │   ENABLED_DOMAINS)      │  │
│  └───────────────────────┘   └────────────────────────┘   └────────────┬────────────┘  │
│                                                                        │               │
│                 ┌───────────────────┬──────────────────────────────────┼───────────┐   │
│                 ▼                   ▼                                  ▼           ▼   │
│      ┌────────────────────┐ ┌────────────────────┐         ┌───────────────┐ ┌───────┐ │
│      │  Xero SaaS Adapter │ │  BigQuery Adapter  │         │   Firestore   │ │Sage HR│ │
│      │  (xero-node SDK +  │ │ (@google-cloud/bq  │         │    Adapter    │ │Adapter│ │
│      │  2-Tier RateLimit) │ │ + Cost Guardrails) │         │(Privacy Shield│ │(PII   │ │
│      └──────────┬─────────┘ └─────────┬──────────┘         └───────┬───────┘ └───┬───┘ │
└─────────────────┼─────────────────────┼────────────────────────────┼─────────────┼─────┘
                  ▼                     ▼                            ▼             ▼
          ┌──────────────┐      ┌──────────────┐              ┌────────────┐ ┌─────────┐
          │  Xero Cloud  │      │ Google Cloud │              │Google Cloud│ │ Sage HR │
          │Accounting API│      │   BigQuery   │              │ Firestore  │ │ REST API│
          └──────────────┘      └──────────────┘              └────────────┘ └─────────┘
```

---

## Key Features

- **StreamableHTTP Protocol**: Implements JSON-RPC 2.0 streaming HTTP responses over POST/GET endpoints, natively compatible with Google Gemini Enterprise without external protocol gateway proxies.
- **Stateless OAuth 2.0 PKCE Engine**: Zero-state authorization server with cryptographic HMAC authorization codes and HS256 JWT bearer tokens designed for rapid autoscaling on Cloud Run.
- **Embedded Web Admin Portal**: Single-container React 18 SPA (`/admin`) for real-time connector management, Secret Manager vaulting, and Google Workspace SSO access governance.
- **Server-Side Privacy & Cost Guards**:
  - **Sage HR**: Multi-tier attribute classification engine masking PII, salaries, and medical notes before LLM serialization.
  - **BigQuery**: Read-only query enforcement, dry-run cost estimation, and hard scan limit caps (`maximumBytesBilled`).
  - **Firestore**: Collection allowlist enforcement, mutation write locks, and recursive sensitive field redaction.
  - **Xero**: Two-tier leaky bucket rate limiting with exponential backoff on HTTP 429 and error formatting for LLM self-correction.

---

## Standardized Tool Catalog (59 Tools)

All tools adhere to the `{product}-{verb}-{resource}` kebab-case naming standard and contain prompt-optimized discovery descriptions.

### 1. Sage HR Domain Tools (`sagehr-*`) — 12 Tools

> [!IMPORTANT]
> **Server-Side Privacy Guarantee**: All attribute filtering, field blocking, and PII masking occur server-side before response serialization. Blocked fields are completely omitted from JSON payloads, and sensitive fields (ID numbers, salary, bank details, medical notes) are masked with `[REDACTED]`. The LLM never sees blocked data.

- **Employee Directory & Profiles**:
  - `sagehr-list-employees`: Retrieve company employee directory (email, name, title, department). Automatically excludes personal and salary data.
  - `sagehr-get-employee`: Retrieve employee profile by ID with multi-tier attribute protection.
- **Leave & Time-Off Management**:
  - `sagehr-list-out-of-office-today`: Query who is out of office or on approved leave today.
  - `sagehr-list-time-off-requests`: Retrieve employee leave requests without sensitive medical notes.
  - `sagehr-get-time-off-balances`: Retrieve remaining leave balances (allowance, taken, remaining).
  - `sagehr-list-time-off-policies`: List configured company leave policy types.
  - `sagehr-create-time-off-request`: Submit a leave request on behalf of an employee (`SAGE_HR_ALLOW_WRITES=true`).
  - `sagehr-cancel-time-off-request`: Cancel/delete an existing leave request (`destructiveHint: true`).
- **Expense Management**:
  - `sagehr-list-expenses`: Query employee expense claims with status (submitted, approved, paid) and date bounds.
  - `sagehr-get-expense`: Retrieve detailed expense claim information and receipt metadata.
  - `sagehr-list-expense-categories`: Retrieve configured company expense categories.
  - `sagehr-create-expense`: Submit a new employee expense claim.

### 2. BigQuery Domain Tools (`bigquery-*`) — 5 Tools

| Tool Name | Type | Read-Only | Description |
| :--- | :---: | :---: | :--- |
| `bigquery-list-datasets` | Discovery | Yes | List all accessible BigQuery dataset IDs within the configured Google Cloud project. |
| `bigquery-list-tables` | Discovery | Yes | List table and view IDs in a dataset (filtered against `BIGQUERY_ALLOWED_TABLES`). |
| `bigquery-get-table-schema` | Schema | Yes | Retrieve schema metadata, column types, and field descriptions for a table/view. |
| `bigquery-dry-run-query` | Cost Guard | Yes | Dry run SQL to validate syntax and estimate bytes scanned before execution. |
| `bigquery-execute-query-readonly` | Execution | Yes | Execute read-only `SELECT` / `WITH` queries with automated scan caps and row limits. |

### 3. Firestore Domain Tools (`firestore-*`) — 6 Tools

| Tool Name | Type | Read-Only | Description |
| :--- | :---: | :---: | :--- |
| `firestore-list-collections` | Discovery | Yes | List accessible root collection IDs (filtered against `FIRESTORE_ALLOWED_COLLECTIONS`). |
| `firestore-get-collection-schema` | Schema | Yes | Sample documents to infer field structures, types, and nested schemas. |
| `firestore-list-subcollections` | Discovery | Yes | List child subcollections nested under a parent document path. |
| `firestore-get-document` | Read | Yes | Retrieve a single document with automatic sensitive field masking (`[REDACTED]`). |
| `firestore-query-documents` | Query | Yes | Query documents with structured where filters, ordering, and pagination bounds. |
| `firestore-set-document` | Write | No | Create or merge document data (active only when `FIRESTORE_ALLOW_WRITES=true`). |

### 4. Xero Accounting Domain Tools (`xero-*`) — 36 Tools

- **Chart of Accounts**: `xero-list-accounts`, `xero-get-account`, `xero-create-account`
- **Invoices**: `xero-list-invoices`, `xero-get-invoice`, `xero-create-invoice`, `xero-update-invoice`
- **Credit Notes**: `xero-list-credit-notes`, `xero-create-credit-note`, `xero-update-credit-note`
- **Manual Journals**: `xero-list-manual-journals`, `xero-create-manual-journal`, `xero-update-manual-journal`
- **Payments**: `xero-list-payments`, `xero-create-payment`
- **Tax & Items**: `xero-list-tax-rates`, `xero-list-items`, `xero-create-item`, `xero-update-item`
- **Bank Transactions & Quotes**: `xero-list-bank-transactions`, `xero-create-bank-transaction`, `xero-update-bank-transaction`, `xero-list-quotes`, `xero-create-quote`, `xero-list-tracking-categories`
- **Contacts & CRM**: `xero-list-contacts`, `xero-get-contact`, `xero-create-contact`, `xero-update-contact`, `xero-list-contact-groups`, `xero-get-aged-receivables-by-contact`, `xero-get-aged-payables-by-contact`
- **Financial Reports**: `xero-get-profit-and-loss`, `xero-get-balance-sheet`, `xero-get-trial-balance`, `xero-get-organisation-details`

---

## Configuration & Environment Variables

The server dynamically loads configuration from **GCP Secret Manager** in production (via Application Default Credentials) and falls back to local `.env` variables.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP port | `8080` (Cloud Run) / `3000` (local) |
| `MCP_CLIENT_ID` | OAuth Client ID for Gemini Enterprise | Required |
| `MCP_CLIENT_SECRET` | OAuth Client Secret for Gemini Enterprise | Required |
| `MCP_JWT_SECRET` | Secret key for signing/verifying Bearer JWTs | Required |
| `MCP_ALLOWED_REDIRECT_URIS` | Allowed OAuth callback URIs (or `*`) | `https://oauth.pstmn.io/v1/callback` |
| `ENABLED_DOMAINS` | Active domains filter (e.g. `xero,bigquery,firestore,sagehr`) | All enabled if unset |
| `XERO_CLIENT_ID` | Xero Custom Connection Client ID | Required for Xero |
| `XERO_CLIENT_SECRET` | Xero Custom Connection Client Secret | Required for Xero |
| `XERO_SCOPES` | Requested OAuth scopes from Xero | `accounting.transactions ...` |
| `BIGQUERY_PROJECT_ID` | Target GCP project ID for BigQuery | Auto-resolved via GCP |
| `BIGQUERY_ALLOWED_TABLES` | Table allowlist (comma-separated) | `*` (All allowed) |
| `BIGQUERY_MAX_BYTES_BILLED` | Query scan cap in bytes | `1073741824` (1 GB) |
| `FIRESTORE_PROJECT_ID` | Target GCP project ID for Firestore | Auto-resolved via GCP |
| `FIRESTORE_ALLOWED_COLLECTIONS` | Collection allowlist | `*` (All allowed) |
| `FIRESTORE_ALLOW_WRITES` | Enable/disable document mutation tools | `false` |
| `FIRESTORE_EXCLUDED_FIELDS` | Redacted sensitive document keys | `password,token,apikey,ssn` |
| `SAGE_HR_API_KEY` | Sage HR API Key (`X-Auth-Token`) | Required for Sage HR |
| `SAGE_HR_SUBDOMAIN` | Sage HR Company Subdomain (`https://{subdomain}.sage.hr`) | Required for Sage HR |
| `SAGE_HR_ALLOW_WRITES` | Enable/disable leave and expense mutations | `true` |
| `SAGE_HR_MASKED_FIELDS` | Sensitive attributes replaced with `[REDACTED]` | `id_number,national_id,passport_number,ssn,nin,salary,hourly_rate,bank_account,iban,medical_notes,emergency_phone` |
| `SAGE_HR_BLOCKED_FIELDS` | Attributes completely stripped from JSON | `""` (Empty) |
| `SAGE_HR_SAFE_ATTRIBUTES` | Strict allowlist mode of safe fields | `*` (All unmasked) |
| `SAGE_HR_ALLOWED_TEAMS` | Permitted team/department names | `*` (All allowed) |
| `SAGE_HR_BLOCKED_POSITIONS` | Blocked leadership/executive positions | `""` (Empty) |

---

## 🧩 Adding a New SaaS or Cloud Service (Step-by-Step Guide)

`enterprise-mcp-server` is built with a modular architecture that makes it easy to integrate new SaaS connectors, databases, and cloud services (such as **Google Cloud Storage (GCS)**, Salesforce, HubSpot, Stripe, or PostgreSQL).

Follow this step-by-step checklist to implement a new service connector adhering to gateway conventions:

```
src/services/
└── <service-id>/               # e.g., gcs/
    ├── client.ts               # SDK initialization & connection wrapper
    ├── config.ts               # Runtime settings resolution & caching
    ├── errors.ts               # LLM self-correction error formatter
    ├── types.ts                # TypeScript interfaces & domain types
    └── tools/
        ├── index.ts            # Aggregated tool export array
        ├── buckets.ts          # Bucket-level tool definitions
        └── objects.ts          # Object-level tool definitions
```

---

### Step 1: Implement the Service Adapter Layer (`src/services/<service>/`)

Create your service directory (e.g. `src/services/gcs/`) containing:
1. **SDK Client & Auth (`client.ts`)**:
   - Initialize your SDK (e.g., `@google-cloud/storage`) using Application Default Credentials (ADC) or credentials resolved dynamically from Secret Manager.
2. **Runtime Configuration (`config.ts`)**:
   - Provide helper functions to read instance-specific settings from `runtimeConfig.getServiceConfig('<service-id>')` (e.g., `allowedBuckets`, `allowWrites`, `maxDownloadBytes`).
3. **LLM Self-Correction Error Formatter (`errors.ts`)**:
   - Format API errors into clear, actionable messages so the AI agent knows how to self-correct (e.g., `"Bucket 'finance-bucket' not found. Available buckets in this tenant: [...]"`).
4. **Modular Tool Definitions (`tools/*.ts`)**:
   - Structure tools using standardized MCP conventions:
     - **Naming Pattern**: `{service}-{action}-{target}` (e.g., `gcs-list-buckets`, `gcs-get-object-content`, `gcs-upload-object`).
     - **Schemas**: Strict Zod schemas with descriptive parameter hints.
     - **Annotations**: Always declare `annotations: { readOnlyHint: boolean, destructiveHint: boolean }`.
     - **Export Bundle**: Aggregate all tools into a single array (`gcsTools`) in `tools/index.ts`.

---

### Step 2: Register in Core MCP Server & Tool Registry

1. **Update Domain Types**:
   - Add your service domain (e.g. `'gcs'`) to `DomainName` in [`src/mcp/types.ts`](src/mcp/types.ts).
2. **Hook Error Formatter**:
   - Add your error formatting helper to `ToolRegistry.formatErrorMessage()` in [`src/mcp/registry.ts`](src/mcp/registry.ts).
3. **Register Tools**:
   - Import `gcsTools` in [`src/mcp/server.ts`](src/mcp/server.ts) and register them with:
     ```typescript
     registry.registerDomainTools(server, 'gcs', gcsTools);
     ```

---

### Step 3: Configure Runtime State & Multi-Tenant Mesh

1. **Update `ServiceId`**:
   - Add `'gcs'` to `ServiceId` union type in [`src/config/runtimeConfig.ts`](src/config/runtimeConfig.ts).
2. **Define Default Configuration & Guardrails**:
   - Add default metadata and runtime guardrail settings to `DEFAULT_SERVICE_CONFIGS` in [`src/config/runtimeConfig.ts`](src/config/runtimeConfig.ts):
     ```typescript
     gcs: {
       name: 'Google Cloud Storage',
       description: 'Cloud storage bucket inspection, object retrieval, and guarded upload capabilities.',
       toolCount: 5,
       settings: {
         allowedBuckets: '*',
         allowWrites: false,
         maxDownloadBytes: 10485760, // 10 MB
       },
     },
     ```

---

### Step 4: Provision Secrets in Google Secret Manager & Secret Vault

If the new service requires dedicated API keys, client secrets, or private tokens (e.g., `GCS_HMAC_KEY_*`, `GCS_SECRET_*`):
1. **Secret Manager Engine**: Register secret descriptors in `ALL_KNOWN_SECRETS` in [`src/config/secretManager.ts`](src/config/secretManager.ts).
2. **Frontend Secret Vault (`/admin/secrets`)**: Ensure secret descriptors include helpful labels and placeholder masks so administrators can safely view status and update keys in the web UI.
3. **Vault Inventory Test**: Update the Secret Vault inventory in [`tests/server/test-secrets-api.ts`](tests/server/test-secrets-api.ts).

---

### Step 5: Update Frontend Admin Portal (Services Mesh & User Access Control)

To manage the new service in the Web UI:
1. **API Client**: Add `'gcs'` to `ServiceId` in [`frontend/src/api/client.ts`](frontend/src/api/client.ts).
2. **Services & Mesh Configs (`/admin/services`)**:
   - Add a service configuration card/panel in [`frontend/src/pages/ServicesPage.tsx`](frontend/src/pages/ServicesPage.tsx) allowing administrators to configure bucket allowlists, write toggles, and size limits.
   - Add a service icon and initial default settings in [`frontend/src/components/AddServiceInstanceModal.tsx`](frontend/src/components/AddServiceInstanceModal.tsx) to allow provisioning multi-tenant customer instances.
3. **User Access Control & Permissions (`/admin/users`)**:
   - Update [`frontend/src/components/EditPermissionsModal.tsx`](frontend/src/components/EditPermissionsModal.tsx) and [`frontend/src/pages/UsersPage.tsx`](frontend/src/pages/UsersPage.tsx) to include the new service checkbox, enabling administrators to selectively grant or revoke user access to this service domain.

> [!NOTE]
> **Keep Setup Lean**: The initial setup wizard (`npm run setup:web` / `setup:cli`) is intentionally kept lightweight and only handles core GCP project configuration, Firestore database selection, Google Workspace OAuth, and Gemini integration credentials. All SaaS connectors (Xero, BigQuery, Firestore, Sage HR, GCS, etc.) are activated and configured post-setup in the Admin Portal.

---

### Step 6: Add Automated Tests & CI Verification

1. **Unit & Integration Tests**: Create `tests/gcs/test-gcs-service.ts` validating tool schemas, client error handling, and runtime guardrails.
2. **Master Schema Validator**: Add `gcsTools` to `allTools` and prefix verification (`gcs-`) in [`tests/test-tools-schema.ts`](tests/test-tools-schema.ts).
3. **Master Test Runner**: Register the new test suite in `TEST_SUITES` within [`tests/runner.ts`](tests/runner.ts).
4. **Compile & Verify**:
   ```bash
   npm run build
   npm test
   ```

---

## Build & Test Suite

### Build Platform
```bash
# Compile both backend TypeScript and frontend Vite SPA
npm run build
```

### Run Tests
```bash
# Run full automated test suite (18 test suites)
npm test
```

### Development Mode
```bash
# Hot-reloading backend development server
npm run dev

# In a separate terminal: Vite React frontend development server
npm run dev:frontend
```

---

## Contributing & Security

- **Contributing**: Please review [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on code standards and submitting Pull Requests.
- **Code of Conduct**: This project adheres to the Contributor Covenant [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security Policy**: For reporting security vulnerabilities, please refer to [SECURITY.md](SECURITY.md).

---

## License

This project is licensed under the [MIT License](LICENSE).
