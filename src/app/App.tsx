import { useState, useEffect } from 'react';
import { Header } from '../ui/components/Header';
import { LoginScreen } from '../ui/screens/LoginScreen';
import { Dashboard } from '../ui/screens/Dashboard';
import { OfflineInputPage } from '../ui/screens/OfflineInputPage';
import { ManualModePage } from '../ui/screens/ManualModePage';
import { getUserNameFromToken, getTenantIdFromToken } from '../core/token/jwt';
import { getTenants } from '../azure/client';
import { KeyVault, RoleDefinition } from '../core/types';
import { Theme, resolveInitialTheme, applyTheme } from './theme';

type OfflineData = { vaults: KeyVault[]; roles: RoleDefinition[] };

/** The four top-level screens; no router, the app switches between them by state. */
type View =
  | { name: 'login' }
  | { name: 'offline-input' }
  | { name: 'manual' }
  | { name: 'online'; armToken: string; graphToken: string }
  | { name: 'offline'; data: OfflineData };

function App() {
  const [view, setView] = useState<View>({ name: 'login' });
  // main.tsx applied this theme before the first render.
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const armToken = view.name === 'online' ? view.armToken : null;

  useEffect(() => {
    setOrganizationName(null);
    const tenantId = armToken && getTenantIdFromToken(armToken);
    if (!armToken || !tenantId) return;
    let active = true;
    void getTenants(armToken).then((tenants) => {
      if (active && tenants[tenantId]) setOrganizationName(tenants[tenantId]);
    });
    return () => {
      active = false;
    };
  }, [armToken]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    applyTheme(newTheme, true);
  };

  const goToLogin = () => setView({ name: 'login' });

  const renderContent = () => {
    switch (view.name) {
      case 'online':
        return <Dashboard armToken={view.armToken} graphToken={view.graphToken || undefined} theme={theme} />;
      case 'offline':
        return <Dashboard armToken="" theme={theme} offlineData={view.data} />;
      case 'offline-input':
        return (
          <OfflineInputPage
            onStart={(vaults, roles) => setView({ name: 'offline', data: { vaults, roles } })}
            onBack={goToLogin}
          />
        );
      case 'manual':
        return <ManualModePage onBack={goToLogin} />;
      case 'login':
        return (
          <LoginScreen
            onLogin={(newArmToken, newGraphToken) => setView({ name: 'online', armToken: newArmToken, graphToken: newGraphToken })}
            onOffline={() => setView({ name: 'offline-input' })}
            onManual={() => setView({ name: 'manual' })}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 font-sans text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <Header
        user={armToken ? getUserNameFromToken(armToken) : view.name === 'offline' ? 'Offline User' : null}
        organization={organizationName}
        onLogout={goToLogin}
        onToggleTheme={toggleTheme}
      />
      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
