import type { Component } from 'solid-js';

const App: Component = () => {
  return (
    <div class="min-h-screen bg-neutral-100 dark:bg-neutral-900 font-sans text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <main class="flex min-h-screen items-center justify-center">
        <p class="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      </main>
    </div>
  );
};

export default App;
