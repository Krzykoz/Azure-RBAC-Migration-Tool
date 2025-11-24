
import React from 'react';
import { SunIcon, MoonIcon } from './Icons';

interface HeaderProps {
  user: string | null;
  organization?: string | null;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, organization, onLogout, theme, onToggleTheme }) => {
  return (
    <header className="bg-neutral-800 text-white h-12 flex items-center justify-between px-4 sticky top-0 z-50 shadow-md">
      <div className="flex items-center gap-4">
        <span className="font-semibold text-base tracking-tight">Key Vault Migrator</span>
        <div className="h-4 w-px bg-neutral-600 mx-1"></div>
        <h1 className="text-sm font-normal text-neutral-300 hover:text-white transition-colors cursor-pointer">
          RBAC Assistant
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onToggleTheme}
          className="h-8 w-8 rounded hover:bg-neutral-700 flex items-center justify-center text-neutral-300 transition-colors"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
        </button>

        {user && (
          <div className="flex items-center gap-4 pl-2 border-l border-neutral-700">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold">{user}</span>
              {organization && (
                <span className="text-[10px] text-neutral-400">{organization}</span>
              )}
            </div>
            <button
              onClick={onLogout}
              className="h-8 w-8 rounded-full bg-brand-600 hover:bg-brand-500 flex items-center justify-center text-xs font-bold transition-colors ring-2 ring-transparent hover:ring-white/20"
              title="Sign out"
            >
              {user.charAt(0).toUpperCase()}
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
