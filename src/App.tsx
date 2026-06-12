import { createSignal, onMount, createEffect, on, onCleanup, Switch, Match, type JSX } from 'solid-js';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { OfflineInputPage } from './components/OfflineInputPage';
import { ManualModePage } from './components/ManualModePage';
import { getUserNameFromToken, getTenantIdFromToken } from './utils/tokenUtils';
import { getTenants } from './services/azureService';
import { KeyVault, RoleDefinition } from './types';

type OfflineData = { vaults: KeyVault[]; roles: RoleDefinition[] } | null;

const App = (): JSX.Element => {
    const [armToken, setArmToken] = createSignal<string | null>(null);
    const [graphToken, setGraphToken] = createSignal<string | null>(null);
    const [theme, setTheme] = createSignal<'light' | 'dark'>('light');
    const [organizationName, setOrganizationName] = createSignal<string | null>(null);

    // Offline Mode State
    const [isOfflineInput, setIsOfflineInput] = createSignal(false);
    const [offlineData, setOfflineData] = createSignal<OfflineData>(null);

    // Manual / Interactive Mode State
    const [isManualInput, setIsManualInput] = createSignal(false);

    // Apply the saved theme or system preference on first paint.
    onMount(() => {
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
    });

    // Resolve the organization (tenant) name whenever the ARM token changes.
    createEffect(
        on(armToken, (token) => {
            let active = true;
            const fetchOrgName = async () => {
                if (token) {
                    const tid = getTenantIdFromToken(token);
                    if (tid) {
                        const tenants = await getTenants(token);
                        if (active && tenants[tid]) {
                            setOrganizationName(tenants[tid]);
                        }
                    }
                } else {
                    setOrganizationName(null);
                }
            };
            fetchOrgName();
            onCleanup(() => {
                active = false;
            });
        })
    );

    const toggleTheme = () => {
        const newTheme = theme() === 'light' ? 'dark' : 'light';
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

    const headerUser = () =>
        armToken() ? getUserNameFromToken(armToken()!) : offlineData() ? 'Offline User' : null;

    return (
        <div class="min-h-screen bg-neutral-100 dark:bg-neutral-900 font-sans text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
            <Header
                user={headerUser()}
                organization={organizationName()}
                onLogout={handleLogout}
                theme={theme()}
                onToggleTheme={toggleTheme}
            />
            <main>
                <Switch
                    fallback={
                        <LoginScreen
                            onLogin={handleLogin}
                            onOffline={() => setIsOfflineInput(true)}
                            onManual={() => setIsManualInput(true)}
                            theme={theme()}
                            onToggleTheme={toggleTheme}
                        />
                    }
                >
                    <Match when={armToken() || offlineData()}>
                        <Dashboard
                            armToken={armToken() || ''}
                            graphToken={graphToken() || undefined}
                            theme={theme()}
                            offlineData={offlineData()}
                        />
                    </Match>
                    <Match when={isOfflineInput()}>
                        <OfflineInputPage
                            onStart={handleOfflineStart}
                            onBack={() => setIsOfflineInput(false)}
                            theme={theme()}
                        />
                    </Match>
                    <Match when={isManualInput()}>
                        <ManualModePage onBack={() => setIsManualInput(false)} theme={theme()} />
                    </Match>
                </Switch>
            </main>
        </div>
    );
};

export default App;
