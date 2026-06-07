# Azure Key Vault RBAC Migrator

A browser‑only tool that helps you migrate Azure Key Vault access policies to modern RBAC role mappings. The app runs entirely in the client, never stores tokens, and provides visual analysis of permissions.

## Overview

- **Token‑based authentication** – Paste Azure CLI tokens (Management and optional Graph) directly.
- **Manual / Interactive mode** – Hand‑pick Key Vault permissions and get live role suggestions, fully offline. See [Manual / Interactive Mode](#manual--interactive-mode).
- **Multi‑strategy analysis** – Three weighted greedy algorithms:
  - **Minimize Excess** – Strict, avoids unnecessary permissions.
  - **Balanced** – Good trade‑off between coverage and security.
  - **Max Coverage** – Prioritises full permission coverage.
- **Export results** – Download analysis as CSV, JSON, or PowerShell script.
- **Dark / Light mode** – Tailwind‑based theming with enhanced contrast for readability.

## Prerequisites

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

# Run development server
npm run dev
```

The app will be available at `http://localhost:3000` (configured in `vite.config.ts`).

## Build for Production

```bash
npm run build
```

The production bundle is emitted to the `dist` folder, which is already ignored via `.gitignore`.

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
5. Export the results via the **Export** button in the workspace header.

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
`az role definition list`, keeps only built‑in roles that expose a Key Vault
data action, strips volatile fields, and rewrites the JSON in the shape the app
parses. The script aborts (without overwriting the bundled file) if no Key Vault
roles are returned. The JSON carries `_source` and `_generated` metadata
recording how and when it was produced.

## Architecture

```
src/
├─ components/               # React UI components
│   ├─ Dashboard.tsx          # Main workspace
│   ├─ LoginScreen.tsx        # Token entry UI (+ Manual / Offline mode entry)
│   ├─ ManualModePage.tsx     # Manual / interactive mode with live role suggestions
│   ├─ OfflineInputPage.tsx   # Offline analysis from pasted policies + roles
│   ├─ Header.tsx
│   ├─ SidePanel.tsx
│   ├─ AnalysisResults.tsx
│   ├─ PermissionVisualizer.tsx
│   ├─ CoverageBanner.tsx
│   ├─ Icons.tsx
│   ├─ ui/                    # Shared primitives (Checkbox, CopyableCommand)
│   └─ ErrorBoundary.tsx
├─ services/                 # Azure API wrappers
│   ├─ azureService.ts        # ARM/Graph fetch helpers
│   ├─ azureResponseParser.ts # Parses ARM/Graph responses into app types
│   └─ analysisService.ts     # Role-mapping analysis engine
├─ hooks/                    # React hooks (data fetching, analysis, export, clipboard)
├─ utils/                    # Helper utilities
│   ├─ tokenUtils.ts          # JWT decode & username extraction
│   ├─ exportUtils.ts         # CSV/JSON/PowerShell export
│   ├─ permissionDefinitions.ts # Legacy Key Vault permission catalog
│   ├─ roleNormalization.ts   # Normalizes role JSON from varied shapes
│   └─ builtInRoles.ts        # Loads bundled built-in roles
├─ assets/                   # Static files
│   ├─ AcessPolicyRBACMapping.csv  # Legacy permission → RBAC data action map
│   └─ builtInKeyVaultRoles.json   # Bundled built-in roles (see update-roles)
├─ types.ts
├─ App.tsx                   # Root component
└─ vite-env.d.ts             # TypeScript typings for Vite globals (optional)

scripts/
└─ update-builtin-roles.mjs  # Regenerates builtInKeyVaultRoles.json (npm run update-roles)
```

## How It Works

1. **Data fetching** – Retrieves subscriptions, vaults, role definitions, and access policies via Azure ARM APIs.
2. **Mapping** – Loads `AcessPolicyRBACMapping.csv` to map legacy permissions to RBAC data actions.
3. **Analysis** – Runs three greedy algorithms to propose optimal role sets.
4. **Scoring** – Confidence reflects how much of the policy a role set covers; excess permissions are reported separately so you can review over-grants.
5. **Presentation** – Visual breakdowns with charts, tooltips, and export options.

## Security

- Tokens are kept **in memory only**; never persisted or sent to a server.
- No backend; all processing occurs client‑side.
- The app does not transmit any data outside the browser.

## Troubleshooting

- **Token errors** – Ensure you use the correct token command for each field.
- **Expired tokens** – Tokens expire after ~1 hour; generate a new one.
- **GUIDs instead of names** – Provide the optional Graph token.
- **Build issues** – Run `npm install`; delete `node_modules` and `package-lock.json` then reinstall if problems persist.

## Technologies

- **React 19**
- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **Recharts**

## License

MIT

## Contributing

Contributions are welcome! Open an issue or submit a pull request.
