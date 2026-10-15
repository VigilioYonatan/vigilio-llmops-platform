import { signal } from '@preact/signals';
export const route = signal(
  typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : '/',
);
export const sidebarOpen = signal(false);
export const theme = signal<'dark' | 'light'>('dark');
export const toast = signal<{
  message: string;
  kind: 'success' | 'error';
} | null>(null);
export function navigate(path: string) {
  const url = new URL(path, window.location.href);
  if (url.origin !== window.location.origin)
    throw new Error('Cross-origin navigation denied');
  window.history.pushState({}, '', url.pathname + url.search);
  route.value = url.pathname + url.search;
  sidebarOpen.value = false;
  if (
    typeof window.scrollTo === 'function' &&
    !window.navigator?.userAgent?.includes('jsdom')
  ) {
    try {
      window.scrollTo({ top: 0 });
    } catch {
      // ignore
    }
  }
}
export function initializeNavigation() {
  window.addEventListener('popstate', () => {
    route.value = window.location.pathname + window.location.search;
  });
}
export function selectedWorkspace() {
  return new URLSearchParams(route.value.split('?')[1] ?? '').get(
    'workspace_id',
  );
}
export function switchWorkspace(workspace_id: string) {
  const current = new URL(window.location.href);
  current.searchParams.set('workspace_id', workspace_id);
  navigate(current.pathname + current.search);
}
export function notify(message: string, kind: 'success' | 'error' = 'success') {
  toast.value = { message, kind };
}
