export type Theme = 'light' | 'dark';

/**
 * Resolve the initial theme: saved preference in localStorage wins, otherwise
 * the OS color-scheme preference. Also syncs the `.dark` class on <html>,
 * which is what Tailwind's class-based dark variant keys off.
 */
export const resolveInitialTheme = (): Theme =>
  localStorage.theme === 'dark' ||
  (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark'
    : 'light';

/** Apply a theme to the document root and persist it when asked. */
export const applyTheme = (theme: Theme, persist: boolean): void => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  if (persist) {
    localStorage.theme = theme;
  }
};
