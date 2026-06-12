import { Show, type JSX } from 'solid-js';
import { SunIcon, MoonIcon } from './Icons';

interface HeaderProps {
    user: string | null;
    organization?: string | null;
    onLogout: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

export const Header = (props: HeaderProps): JSX.Element => {
    return (
        <header class="bg-neutral-800 text-white h-12 flex items-center justify-between px-4 sticky top-0 z-50 shadow-md">
            <div class="flex items-center gap-4">
                <span class="font-semibold text-base tracking-tight">Key Vault Migrator</span>
                <div class="h-4 w-px bg-neutral-600 mx-1" />
                <h1 class="text-sm font-normal text-neutral-300">RBAC Assistant</h1>
            </div>

            <div class="flex items-center gap-4">
                <button
                    onClick={() => props.onToggleTheme()}
                    class="h-8 w-8 rounded hover:bg-neutral-700 flex items-center justify-center text-neutral-300 transition-colors"
                    title={`Switch to ${props.theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    <Show when={props.theme === 'light'} fallback={<SunIcon class="w-4 h-4" />}>
                        <MoonIcon class="w-4 h-4" />
                    </Show>
                </button>

                <Show when={props.user}>
                    {(user) => (
                        <div class="flex items-center gap-4 pl-2 border-l border-neutral-700">
                            <div class="hidden md:flex flex-col items-end leading-tight">
                                <span class="text-xs font-semibold">{user()}</span>
                                <Show when={props.organization}>
                                    <span class="text-[10px] text-neutral-400">{props.organization}</span>
                                </Show>
                            </div>
                            <button
                                onClick={() => props.onLogout()}
                                class="h-8 w-8 rounded-full bg-brand-600 hover:bg-brand-500 flex items-center justify-center text-xs font-bold transition-colors ring-2 ring-transparent hover:ring-white/20"
                                title="Sign out"
                            >
                                {user().charAt(0).toUpperCase()}
                            </button>
                        </div>
                    )}
                </Show>
            </div>
        </header>
    );
};
