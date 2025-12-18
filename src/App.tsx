
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { OfflineInputPage } from './components/OfflineInputPage';
import { getUserNameFromToken, getTenantIdFromToken } from './utils/tokenUtils';
import { getTenants } from './services/azureService';
import { KeyVault, RoleDefinition } from './types';

function App() {
  const [armToken, setArmToken] = useState<string | null>(null);
  const [graphToken, setGraphToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  // Offline Mode State
  const [isOfflineInput, setIsOfflineInput] = useState(false);
  const [offlineData, setOfflineData] = useState<{ vaults: KeyVault[], roles: RoleDefinition[] } | null>(null);

  useEffect(() => {
    // Check for saved theme or system preference
    if (
      localStorage.theme === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    const fetchOrgName = async () => {
      if (armToken) {
        const tid = getTenantIdFromToken(armToken);
        if (tid) {
          const tenants = await getTenants(armToken);
          if (tenants[tid]) {
            setOrganizationName(tenants[tid]);
          }
        }
      } else {
        setOrganizationName(null);
      }
    };
    fetchOrgName();
  }, [armToken]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  const handleLogin = (newArmToken: string, newGraphToken: string) => {
    setArmToken(newArmToken);
    setGraphToken(newGraphToken);
    setIsOfflineInput(false);
    setOfflineData(null);
  };

  const handleLogout = () => {
    setArmToken(null);
    setGraphToken(null);
    setOrganizationName(null);
    setIsOfflineInput(false);
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
          armToken={armToken || ''} // Handle empty if offline
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
          theme={theme}
        />
      );
    }

    // 3. Login Screen
    return (
      <LoginScreen
        onLogin={handleLogin}
        onOffline={() => setIsOfflineInput(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
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
