import { ErrorBoundary as SolidErrorBoundary, type JSX } from 'solid-js';

/**
 * Full-page error boundary. Mirrors the previous React class component: it logs
 * the uncaught error and renders a recoverable fallback with a hard page reload.
 */
export const ErrorBoundary = (props: { children: JSX.Element }): JSX.Element => (
    <SolidErrorBoundary
        fallback={(error: unknown) => {
            console.error('Uncaught error:', error);
            const message = error instanceof Error ? error.message : String(error);
            return (
                <div class="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
                    <div class="max-w-md w-full bg-white dark:bg-neutral-800 shadow-lg rounded-lg border border-neutral-200 dark:border-neutral-700 p-8">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                                <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h2 class="text-xl font-semibold text-neutral-900 dark:text-white">
                                Something went wrong
                            </h2>
                        </div>

                        <p class="text-neutral-600 dark:text-neutral-400 mb-4">
                            The application encountered an unexpected error. Please try refreshing the page.
                        </p>

                        {message && (
                            <div class="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded p-3 mb-4">
                                <p class="text-xs font-mono text-neutral-700 dark:text-neutral-300 break-all">
                                    {message}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            class="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }}
    >
        {props.children}
    </SolidErrorBoundary>
);
