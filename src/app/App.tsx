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

/**
 * Root component. The app has four top-level views, switched by state (no
 * router): the live Dashboard (online or offline data), the Offline input
 * page, the Manual / Interactive mode, and the Login screen.
 */
function App() {
  const [armToken, setArmToken] = useState<string | null>(null);
  const [graphToken, setGraphToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  // Offline Mode State
  const [isOfflineInput, setIsOfflineInput] = useState(false);
  const [offlineData, setOfflineData] = useState<{ vaults: KeyVault[]; roles: RoleDefinition[] } | null>(null);

  // Manual / Interactive Mode State
  const [isManualInput, setIsManualInput] = useState(false);

  useEffect(() => {
    // Check for saved theme or system preference
    const initial = resolveInitialTheme();
    setTheme(initial);
    applyTheme(initial, false);
  }, []);

  useEffect(() => {
    let active = true;
    const fetchOrgName = async () => {
      if (armToken) {
        const tid = getTenantIdFromToken(armToken);
        if (tid) {
          const tenants = await getTenants(armToken);
          if (active && tenants[tid]) {
            setOrganizationName(tenants[tid]);
          }
        }
      } else {
        setOrganizationName(null);
      }
    };
    fetchOrgName();
    return () => {
      active = false;
    };
  }, [armToken]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    applyTheme(newTheme, true);
  };

  const handleLogin = (newArmToken: string, newGraphToken: string) => {
    setArmToken(newArmToken);
    setGraphToken(newGraphToken);
    setIsOfflineInput(false);
    setIsManualInput(false);
    setOfflineData(null);
  };

  const handleLogout = () => {
    setArmToken(null);
    setGraphToken(null);
    setOrganizationName(null);
    setIsOfflineInput(false);
    setIsManualInput(false);
    setOfflineData(null);
  };

  const handleOfflineStart = (vaults: KeyVault[], roles: RoleDefinition[]) => {
    setOfflineData({ vaults, roles });
    setIsOfflineInput(false);
  };

  const renderContent = () => {
    // 1. Dashboard (Online or Offline)
    if (armToken || offlineData) {
      return (
        <Dashboard
          armToken={armToken || ''} // Empty when running on offline data
          graphToken={graphToken || undefined}
          theme={theme}
          offlineData={offlineData}
        />
      );
    }

    // 2. Offline Input Page
    if (isOfflineInput) {
      return (
        <OfflineInputPage
          onStart={handleOfflineStart}
          onBack={() => setIsOfflineInput(false)}
        />
      );
    }

    // 3. Manual / Interactive Mode
    if (isManualInput) {
      return <ManualModePage onBack={() => setIsManualInput(false)} />;
    }

    // 4. Login Screen
    return (
      <LoginScreen
        onLogin={handleLogin}
        onOffline={() => setIsOfflineInput(true)}
        onManual={() => setIsManualInput(true)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 font-sans text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <Header
        user={armToken ? getUserNameFromToken(armToken) : (offlineData ? 'Offline User' : null)}
        organization={organizationName}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
