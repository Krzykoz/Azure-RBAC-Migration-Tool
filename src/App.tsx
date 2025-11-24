
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { getUserNameFromToken, getTenantIdFromToken } from './utils/tokenUtils';
import { getTenants } from './services/azureService';

function App() {
  const [armToken, setArmToken] = useState<string | null>(null);
  const [graphToken, setGraphToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [organizationName, setOrganizationName] = useState<string | null>(null);

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
  };

  const handleLogout = () => {
    setArmToken(null);
    setGraphToken(null);
    setOrganizationName(null);
  };


  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 font-sans text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <Header
        user={armToken ? getUserNameFromToken(armToken) : null}
        organization={organizationName}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      {armToken ? (
        <main>
          <Dashboard
            armToken={armToken}
            graphToken={graphToken || undefined}
            theme={theme}
          />
        </main>
      ) : (
        <LoginScreen
          onLogin={handleLogin}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
    </div>
  );
}

export default App;
