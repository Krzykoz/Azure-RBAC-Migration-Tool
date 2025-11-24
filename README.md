# Azure Key Vault RBAC Migrator

A browser‑only tool that helps you migrate Azure Key Vault access policies to modern RBAC role mappings. The app runs entirely in the client, never stores tokens, and provides visual analysis of permissions.

## Overview

- **Token‑based authentication** – Paste Azure CLI tokens (Management and optional Graph) directly.
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

The app will be available at `http://localhost:3000` (Vite default).

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

## Architecture

```
src/
├─ components/               # React UI components
│   ├─ Dashboard.tsx          # Main workspace
│   ├─ LoginScreen.tsx        # Token entry UI (copy icons centered)
│   ├─ Header.tsx
│   ├─ SidePanel.tsx
│   ├─ AnalysisResults.tsx
│   ├─ PermissionVisualizer.tsx
│   ├─ CoverageBanner.tsx
│   ├─ Icons.tsx
│   └─ ErrorBoundary.tsx
├─ services/                 # Azure API wrappers
│   ├─ azureService.ts
│   └─ analysisService.ts
├─ utils/                    # Helper utilities
│   ├─ tokenUtils.ts          # JWT decode & username extraction
│   └─ exportUtils.ts         # CSV/JSON/PowerShell export
├─ assets/                   # Static files (CSV mapping)
├─ types.ts
├─ App.tsx                   # Root component
└─ vite-env.d.ts             # TypeScript typings for Vite globals (optional)
```

## How It Works

1. **Data fetching** – Retrieves subscriptions, vaults, role definitions, and access policies via Azure ARM APIs.
2. **Mapping** – Loads `AcessPolicyRBACMapping.csv` to map legacy permissions to RBAC data actions.
3. **Analysis** – Runs three greedy algorithms to propose optimal role sets.
4. **Scoring** – Calculates confidence scores based on coverage and excess permissions.
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
