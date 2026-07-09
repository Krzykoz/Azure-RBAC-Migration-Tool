# Azure Key Vault RBAC Migrator

A self-contained Deno desktop app that helps you migrate Azure Key Vault access policies to modern RBAC role mappings. It also remains usable in a browser. The app runs entirely on the client, never stores tokens, and provides visual analysis of permissions.

## Overview

- **Token‑based authentication** – Paste Azure CLI tokens (Management and optional Graph) directly.
- **Manual / Interactive mode** – Hand‑pick Key Vault permissions and get live role suggestions, fully offline. See [Manual / Interactive Mode](#manual--interactive-mode).
- **Multi‑strategy analysis** – Three weighted greedy algorithms:
  - **Minimize Excess** – Strict, avoids unnecessary permissions.
  - **Balanced** – Good trade‑off between coverage and security.
  - **Max Coverage** – Prioritises full permission coverage.
- **Export results** – Download analysis as CSV, JSON, PowerShell script, or a
  self‑contained interactive HTML report you can share with a colleague (no server
  or install needed – just open the file in a browser).
- **Dark / Light mode** – Tailwind‑based theming with enhanced contrast for readability.

## Prerequisites

- [Deno 2.9 or newer](https://docs.deno.com/runtime/getting_started/installation/) for the desktop app.
- Node.js and npm for installing and building the existing Vite frontend.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed.
- Access to Azure subscriptions with Key Vaults.
- (Optional) Graph permissions to resolve identity names.

## Setup

```bash
# Clone the repo
git clone git@github.com:Krzykoz/Azure-RBAC-Migration-Tool.git
cd Azure-RBAC-Migration-Tool

# Install dependencies
npm install

# Open the desktop app with hot reload
npm run desktop:dev
```

Run `npm run dev` instead to use the browser version at `http://localhost:3000`.

## Build the Desktop App

```bash
npm run desktop:build
```

The self-contained application is emitted to `desktop-dist` using the native format for your platform. Run `npm run build` when you only need the browser bundle in `dist`.

## Usage

1. **Generate tokens**:
   ```bash
   # Management token (required)
   az account get-access-token --resource https://management.azure.com -o tsv --query accessToken

   # Graph token (optional, for name resolution)
   az account get-access-token --resource https://graph.microsoft.com -o tsv --query accessToken
   ```
2. Open the app, paste the Management token (and optionally the Graph token), and click **Connect**.
3. Select a subscription and a Key Vault, then click **Run Analysis**.
4. Review the recommended role combinations. Switch between the three strategies using the buttons.
5. Export the results via the **Export** button in the workspace header. Choose
   **HTML** to produce a single shareable file that mirrors the analysis view –
   identities, object IDs, App IDs, suggested roles per strategy, confidence, and
   covered/missing/excess permissions – with a built‑in light/dark toggle.

## Manual / Interactive Mode

Manual Mode lets you pick Key Vault permissions by hand and see matching RBAC
roles suggested **live** — no vault, subscription, or even an internet
connection required. Open it from the **Manual Mode** button on the login
screen.

1. **Pick a role source** (segmented control at the top):
   - **Built‑in (offline)** – Uses the bundled Azure Key Vault built‑in roles.
     This is the default and works with zero input. See
     [Updating Built‑in Roles](#updating-built-in-roles).
   - **Paste JSON** – Paste role definitions (e.g. `az role definition list`
     output, an ARM `{ "value": [...] }` response, or a single role object).
   - **Live token** – Paste a Management token, load subscriptions, and fetch
     role definitions directly from a subscription.
2. **Select permissions** – Tick the legacy Key Vault permissions you need
   across Keys, Secrets, Certificates, and Storage. The category checkbox
   selects/clears every permission in that category.
3. **Read the suggestions** – Role recommendations recompute automatically as
   you change the selection. Each suggestion shows:
   - **Coverage** – How much of your selection the role satisfies.
   - **Excess** – Extra Key Vault data actions the role grants beyond your
     selection (measured against known Key Vault data actions). Always review
     this — a high‑coverage role may grant more than you asked for.
   - **Missing** – Selected permissions the role does **not** cover.

   The best match (highest coverage, then least excess) is flagged
   **Recommended**.

## Updating Built‑in Roles

The offline built‑in roles are **data, not code**. They live in
`src/assets/builtInKeyVaultRoles.json` so they can be refreshed whenever Azure
adds or changes Key Vault roles, without touching application code.

To regenerate the file from live Azure metadata:

```bash
az login            # once, if not already authenticated
npm run update-roles
```

This runs `scripts/update-builtin-roles.mjs`, which calls
`az role definition list`, keeps only built-in roles that expose a Key Vault
data action, strips volatile fields, and rewrites the JSON in the shape the app
parses. The script aborts (without overwriting the bundled file) if no Key Vault
roles are returned. The JSON carries `_source` and `_generated` metadata
recording how and when it was produced.

## Architecture

The codebase is split into three layers: a framework‑agnostic **core** (domain
types, analysis engine, presentation rules, exporters), a thin **azure** API
layer (fetch + response parsing), and the React **ui/app** layer on top.

```
src/
├─ main.tsx                     # Entry point
├─ styles.css                   # Tailwind theme tokens + animations
├─ app/                         # Application shell
│   ├─ App.tsx                  # Root component / view switching
│   ├─ theme.ts                 # Light/dark theme resolution + persistence
│   └─ ErrorBoundary.tsx
├─ core/                        # Framework-agnostic domain logic (no React)
│   ├─ types.ts                 # Domain model
│   ├─ constants.ts             # API versions, strategy weights, UI constants
│   ├─ analysis/                # The role-mapping engine
│   │   ├─ permissionCatalog.ts # Legacy verb → RBAC action mapping (CSV-backed)
│   │   ├─ actionMatching.ts    # Wildcard-aware data-action matching
│   │   ├─ coverage.ts          # Per-role covered/excess computation
│   │   ├─ strategies.ts        # Weighted combination search per strategy
│   │   ├─ engine.ts            # analyzePolicies / analyzeExistingCoverage
│   │   └─ index.ts             # Facade bound to the default catalog
│   ├─ identity/                # Identity interpretation & grouping
│   │   ├─ identity.ts          # Compound detection, names, icon kinds
│   │   ├─ grouping.ts          # Type buckets, display sections, chart data
│   │   └─ policyKey.ts         # Stable composite row key
│   ├─ permissions/             # Legacy permission catalog & categories
│   ├─ roles/                   # Role-definition normalization + bundled roles
│   ├─ presentation/            # Shared display decisions (badges, charts, …)
│   ├─ export/                  # CSV/JSON/PowerShell + self-contained HTML report
│   └─ token/jwt.ts             # JWT claim extraction (name, tenant)
├─ azure/                       # Azure API layer
│   ├─ client.ts                # ARM/Graph fetch helpers, paging, batching
│   └─ parsers.ts               # Raw response → domain types
├─ ui/                          # React UI
│   ├─ icons.tsx                # Inline icon set
│   ├─ primitives/              # Checkbox, CopyableCommand
│   ├─ hooks/                   # useAzureData, useAnalysis, useExport, …
│   ├─ components/              # Workspace components (results, charts, …)
│   └─ screens/                 # LoginScreen, Dashboard, OfflineInputPage,
│                               # ManualModePage
├─ assets/
│   ├─ accessPolicyRbacMapping.csv   # Legacy permission → RBAC data action map
│   └─ builtInKeyVaultRoles.json     # Bundled built-in roles (see update-roles)
└─ testing/factories.ts         # Shared test factories

scripts/
└─ update-builtin-roles.mjs     # Regenerates builtInKeyVaultRoles.json (npm run update-roles)
```

The HTML export and the live React view share every *decision* (permission
ordering, confidence tiers, banner states, icons, chart geometry) through the
`core/presentation` helpers, so the two renderings cannot drift apart.

## How It Works

1. **Data fetching** – Retrieves subscriptions, vaults, role definitions, and access policies via Azure ARM APIs.
2. **Mapping** – Loads `accessPolicyRbacMapping.csv` to map legacy permissions to RBAC data actions.
3. **Analysis** – Runs three greedy algorithms to propose optimal role sets.
4. **Scoring** – Confidence reflects how much of the policy a role set covers; excess permissions are reported separately so you can review over-grants.
5. **Presentation** – Visual breakdowns with charts, tooltips, and export options.

## Security

- Tokens are kept **in memory only**; never persisted or sent to a server.
- No remote backend; all processing occurs client‑side.
- The app only sends tokens and requests to the Azure ARM and Graph endpoints you connect to.

## Troubleshooting

- **Token errors** – Ensure you use the correct token command for each field.
- **Expired tokens** – Tokens expire after ~1 hour; generate a new one.
- **GUIDs instead of names** – Provide the optional Graph token.
- **Build issues** – Run `npm install`; delete `node_modules` and `package-lock.json` then reinstall if problems persist.

## Technologies

- **React 19**
- **TypeScript**
- **Vite**
- **Deno Desktop 2.9+**
- **Tailwind CSS**
- **Recharts**

## License

MIT

## Contributing

Contributions are welcome! Open an issue or submit a pull request.
