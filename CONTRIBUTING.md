# Contributing to Enterprise MCP Server

Thank you for your interest in contributing to `enterprise-mcp-server`! We welcome community contributions, bug reports, feature enhancements, and documentation improvements.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it to understand the community standards.

---

## Getting Started

### Prerequisites
- **Node.js**: `20.x` or `22.x` (LTS recommended)
- **npm**: `10.x` or higher
- **Google Cloud SDK (`gcloud`)**: (Optional, for GCP integration testing)

### Local Development Setup

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/Nick-DCA/enterprise-mcp-server.git
   cd enterprise-mcp-server
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

3. **Set Up Local Environment**:
   ```bash
   cp .env.example .env
   ```

4. **Start Development Servers**:
   ```bash
   # Run backend with hot-reload
   npm run dev

   # In a separate terminal, run frontend SPA development server
   npm run dev:frontend
   ```

---

## Running Tests & Building

Before submitting a Pull Request, please ensure all build targets and tests pass cleanly:

```bash
# Build both backend TypeScript and frontend SPA
npm run build

# Run automated test suites
npm test
```

---

## Submitting Pull Requests

1. **Branch Naming**: Use descriptive branch names (e.g. `feat/new-saas-adapter`, `fix/rate-limiter-backoff`, `docs/setup-guide`).
2. **Atomic Commits**: Keep commits focused and provide clear, descriptive commit messages.
3. **Tests**: Add unit or integration tests under `tests/` for new features or bug fixes.
4. **Zero Secrets**: Ensure no sensitive keys, private URLs, or credentials are added.
5. **Open a PR**: Open a Pull Request against the `main` branch, filling out the PR template completely.

---

## Adding a New Service Connector

We actively welcome contributions for new SaaS, database, and cloud connectors! When contributing a new service (such as Google Cloud Storage, Stripe, Salesforce, or PostgreSQL):

1. Follow the **[Adding a New SaaS or Cloud Service Guide](README.md#-adding-a-new-saas-or-cloud-service-step-by-step-guide)** in the README.
2. Follow standardized tool naming: `{service}-{action}-{target}` (e.g. `gcs-list-buckets`, `stripe-list-invoices`).
3. Set accurate MCP annotations (`readOnlyHint`, `destructiveHint`).
4. **Secret Vault UI & Secret Manager**: Add any required API keys or secrets to `ALL_KNOWN_SECRETS` in [`src/config/secretManager.ts`](src/config/secretManager.ts) and verify it shows in the frontend Secret Vault (`/admin/secrets`).
5. **User Access Control**: Update [`frontend/src/components/EditPermissionsModal.tsx`](frontend/src/components/EditPermissionsModal.tsx) and [`frontend/src/pages/UsersPage.tsx`](frontend/src/pages/UsersPage.tsx) to allow granting/revoking access to the new service domain.
6. **Services & Mesh Configs**: Include runtime guardrail settings and default configs in `DEFAULT_SERVICE_CONFIGS` in [`src/config/runtimeConfig.ts`](src/config/runtimeConfig.ts) and add the configuration panel in [`frontend/src/pages/ServicesPage.tsx`](frontend/src/pages/ServicesPage.tsx).
7. **Automated Tests**: Add unit tests under `tests/`, add tools to [`tests/test-tools-schema.ts`](tests/test-tools-schema.ts), and register in [`tests/runner.ts`](tests/runner.ts).

---

## Coding Standards

- **TypeScript**: Strict type checking is enforced (`tsconfig.json`). Avoid `any` where possible.
- **MCP Annotations**: When adding new tools, always set appropriate `readOnlyHint` and `destructiveHint` annotations.
- **Privacy & Security**: Any tool returning sensitive employee or financial data must implement field masking or redaction before serialization.

Thank you for helping make `enterprise-mcp-server` better!
