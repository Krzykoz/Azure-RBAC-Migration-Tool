# Azure Key Vault RBAC Migrator

A desktop and browser tool that helps you migrate Azure Key Vault access policies to modern RBAC role assignments. The app runs entirely on the client, never stores tokens, and provides visual analysis of permissions with intelligent role recommendations.

Available as a downloadable Electron desktop app for **Windows**, **macOS**, and **Linux** (both x64 and ARM64), or as a browser-based web app.

## Features

### Authentication & Connectivity
- **Token‑based authentication** – Paste Azure CLI tokens (Management and optional Graph) directly; tokens are kept in memory only and never persisted.
- **Token validation** – Detects common mistakes such as pasting a Graph token into the Management field, or using an expired token.
- **Offline mode** – Paste raw JSON output from Azure CLI commands (`az keyvault show`, `az role definition list`) to run analysis without a live Azure connection.

### Identity Resolution
- **Graph API integration** – Resolves object IDs to display names using Microsoft Graph (`/directoryObjects/getByIds`), batched in chunks.
- **Principal type detection** – Infers identity types (User, Group, Application, ServicePrincipal) from role assignment data when Graph is unavailable.
- **Compound identity support** – Recognises access policies with both `objectId` and `applicationId` and displays them as "SP Name on behalf of (App Name)".
- **Tenant / organization display** – Shows the Azure AD tenant display name in the header after login.

### Analysis Engine
- **Multi‑strategy analysis** – Three weighted greedy algorithms, each configurable with coverage, excess, and role‑count weights:
  - **Minimize Excess** – Strict, avoids unnecessary permissions.
  - **Balanced** – Good trade‑off between coverage and security.
  - **Max Coverage** – Prioritises full permission coverage.
- **Strategy deduplication** – When two or more strategies produce identical role combinations, they are merged into a single recommendation.
- **Custom role toggle** – Include or exclude subscription‑specific custom roles from the analysis.
- **Confidence scoring** – Each recommendation receives a 0–100 % confidence score derived from the coverage ratio.
- **Existing RBAC coverage check** – Detects whether an identity already has full, partial, or no RBAC coverage via current role assignments scoped to the vault.
- **CSV permission mapping** – Uses a bundled `AcessPolicyRBACMapping.csv` to map legacy Key Vault access‑policy permissions (keys, secrets, certificates, storage) to RBAC data actions, including wildcard expansion.

### User Interface
- **Dark / Light mode** – Tailwind‑based theming with system preference auto‑detection and persistent toggle via `localStorage`.
- **Searchable side panel** – Filter subscriptions by name or ID and key vaults by name with live search.
- **Breadcrumb navigation** – Navigate between Home → Subscription → Key Vault.
- **Coverage banners** – Green "Fully Covered" or blue "Partially Covered" banners with expandable details for identities that already have RBAC assignments.
- **Per‑role permission breakdown** – Visual badges showing covered (green), excess (amber), and missing (red) permissions, grouped by role. Privileged operations like Purge and Release are highlighted.
- **Bar chart visualizations** – Recharts‑powered grouped bar charts comparing coverage, excess, and missing permission percentages across identities.
- **Selective export** – Checkbox selection (with select‑all/none) to choose which identities to include in exports; unknown identities are excluded by default.
- **Copyable CLI commands** – Click‑to‑copy command blocks on the login and offline input screens with visual feedback.
- **Error boundary** – Graceful error handling with a reload prompt when an unhandled exception occurs.

### Export
- **CSV** – Tabular summary with identity name, object ID, type, strategy, recommended role, confidence, and counts of missing/excess permissions.
- **JSON** – Structured export including original permissions, recommendation details, and per‑role breakdown.
- **PowerShell** – Ready‑to‑run `New-AzRoleAssignment` script categorised by identity type (Applications & Service Principals, Compound Identities, Groups, Users, Unknown), with inline warnings for missing and excess permissions.

### Desktop App
- **Electron packaging** – Runs as a native desktop app with context isolation and disabled Node integration for security.
- **Cross‑platform builds** – GitHub Actions workflow that produces installers for 6 targets on every version tag.

## Download

Pre-built desktop apps are available on the [Releases](../../releases) page for:

| Platform | Architecture | Format |
|----------|-------------|--------|
| Windows  | x64, ARM64  | NSIS installer, Portable |
| macOS    | x64, ARM64  | DMG |
| Linux    | x64, ARM64  | AppImage, DEB |

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed.
- Access to Azure subscriptions with Key Vaults.
- (Optional) Graph permissions to resolve identity names.

## Development Setup

```bash
# Clone the repo
git clone git@github.com:Krzykoz/Azure-RBAC-Migration-Tool.git
cd Azure-RBAC-Migration-Tool

# Install dependencies
npm install

# Run as web app (browser)
npm run dev

# Run as Electron app (desktop)
npm run dev:electron
```

The web app will be available at `http://localhost:3000`.

## Building

### Web Build

```bash
npm run build
```

The production bundle is emitted to the `dist` folder.

### Desktop App Build

```bash
# Build for your current platform
npm run dist

# Build for a specific platform
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

Built installers are output to the `release` folder.

## Automated Releases

The repository includes a GitHub Actions workflow that automatically builds desktop apps for all platforms when a version tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers builds for Windows (x64/ARM64), macOS (x64/ARM64), and Linux (x64/ARM64), and creates a draft GitHub Release with all artifacts attached.

## Usage

1. **Generate tokens**:
   ```bash
   # Management token (required)
   az account get-access-token --resource https://management.azure.com -o tsv --query accessToken

   # Graph token (optional, for name resolution)
   az account get-access-token --resource https://graph.microsoft.com -o tsv --query accessToken
   ```
2. Open the app, paste the Management token (and optionally the Graph token), and click **Connect**.
3. Select a subscription and a Key Vault from the filterable side panels, then click **Run Analysis**.
4. Review the recommended role combinations. When multiple strategies produce identical roles they are displayed as a single merged recommendation; otherwise switch between strategies using the buttons.
5. Expand the per‑role permission breakdown to inspect covered, excess, and missing permissions. Identities that are already covered via existing RBAC assignments will show a green or blue coverage banner.
6. Use the checkboxes to select which identities to include, then click **Export** to download as CSV, JSON, or PowerShell script.

### Offline Mode

If you cannot or prefer not to use live tokens:

1. Click **Offline Mode** on the login screen.
2. Run the displayed Azure CLI commands to generate JSON for your vault's access policies and Key Vault RBAC role definitions.
3. Paste the output into the two text areas and click **Analyze**.

## Project Structure

```
.github/
└─ workflows/
   └─ build.yml                  # CI/CD: multi-platform Electron builds & release
electron/
├─ main.ts                       # Electron main process
└─ preload.ts                    # Preload script (context bridge)
src/
├─ index.tsx                     # React entry point with ErrorBoundary
├─ App.tsx                       # Root component (routing, theme, auth state)
├─ types.ts                      # Shared TypeScript interfaces & enums
├─ constants.ts                  # API versions, strategy configs, UI constants
├─ vite-env.d.ts                 # Vite client type declarations
├─ assets/
│   └─ AcessPolicyRBACMapping.csv  # Legacy permission → RBAC data‑action mapping
├─ components/
│   ├─ Header.tsx                # Top bar (user info, org name, theme toggle)
│   ├─ LoginScreen.tsx           # Token entry with copyable CLI commands
│   ├─ OfflineInputPage.tsx      # JSON paste UI for offline analysis
│   ├─ Dashboard.tsx             # Main workspace (side panel + analysis area)
│   ├─ SidePanel.tsx             # Subscription & vault selection with search
│   ├─ AnalysisResults.tsx       # Results table with charts & strategy switching
│   ├─ CoverageBanner.tsx        # Existing RBAC coverage indicators
│   ├─ PermissionVisualizer.tsx  # Covered / excess / missing permission badges
│   ├─ Icons.tsx                 # SVG icon components
│   ├─ ErrorBoundary.tsx         # React error boundary
│   └─ ui/
│       ├─ index.ts              # Barrel export for UI primitives
│       ├─ Checkbox.tsx          # Custom checkbox (supports indeterminate)
│       └─ CopyableCommand.tsx   # Click‑to‑copy command block
├─ hooks/
│   ├─ index.ts                  # Barrel export for hooks
│   ├─ useAzureData.ts           # Subscriptions, vaults, roles, identity resolution
│   ├─ useAnalysis.ts            # Run analysis, strategy selection, export set
│   ├─ useExport.ts              # CSV / JSON / PowerShell export logic
│   └─ useClipboard.ts           # Clipboard copy with feedback state
├─ services/
│   ├─ azureService.ts           # Azure ARM & Graph API calls
│   ├─ azureResponseParser.ts    # Response normalisation & type inference
│   └─ analysisService.ts        # Greedy analysis engine & coverage calculator
└─ utils/
    ├─ tokenUtils.ts             # JWT decode, username & tenant extraction
    ├─ exportUtils.ts            # CSV / JSON / PowerShell file generation
    └─ permissionDefinitions.ts  # Legacy Key Vault permission reference lists
index.html                       # HTML shell (Tailwind CDN config, scrollbar styles)
vite.config.ts                   # Vite config with conditional Electron plugin
tsconfig.json                    # TypeScript compiler options
package.json                     # Dependencies, scripts & electron-builder config
```

## How It Works

1. **Data fetching** – Retrieves subscriptions, vaults (with concurrency‑limited detail calls), role definitions, and existing role assignments via Azure ARM APIs. Principal types are inferred from role assignment data.
2. **Identity resolution** – Optionally resolves object IDs to display names and types via Microsoft Graph in batched calls.
3. **Permission mapping** – Loads `AcessPolicyRBACMapping.csv` to translate legacy access‑policy permissions (including `all` / `*` wildcards) to RBAC data actions.
4. **Analysis** – Runs three weighted greedy algorithms that evaluate all combinations of Key Vault‑scoped roles to find the best coverage with minimal excess.
5. **Existing coverage** – Compares each identity's current role assignments (scoped to the vault) against the required permissions to determine if migration is already complete.
6. **Scoring** – Calculates a confidence percentage from the coverage ratio. Strategies with identical outputs are merged.
7. **Presentation** – Visual breakdowns with per‑role badges, bar charts, coverage banners, expandable details, and selective export.

## Security

- Tokens are kept **in memory only**; never persisted or sent to a server.
- No backend; all processing occurs client‑side.
- The app does not transmit any data outside the browser (except to Azure APIs using the tokens you provide).
- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.

## Troubleshooting

- **Token errors** – Ensure you use the correct token command for each field.
- **Expired tokens** – Tokens expire after ~1 hour; generate a new one.
- **GUIDs instead of names** – Provide the optional Graph token for identity name resolution.
- **Build issues** – Run `npm install`; delete `node_modules` and `package-lock.json` then reinstall if problems persist.

## Technologies

- **React 19** – UI framework
- **TypeScript** – Type‑safe codebase
- **Vite 7** – Dev server & bundler
- **Electron 40** – Desktop packaging
- **electron-builder** – Multi‑platform installers
- **Tailwind CSS 4** – Utility‑first styling
- **Recharts 3** – Data visualisation charts

## License

MIT

## Contributing

Contributions are welcome! Open an issue or submit a pull request.
