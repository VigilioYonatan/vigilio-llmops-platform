import { beforeEach, describe, expect, it } from 'vitest';
import {
  initializeNavigation,
  navigate,
  notify,
  route,
  selectedWorkspace,
  sidebarOpen,
  switchWorkspace,
  theme,
  toast,
} from './navigation';

describe('navigation and URL-derived workspace context', () => {
  beforeEach(() => {
    history.replaceState({}, '', '/app');
    route.value = '/app';
    sidebarOpen.value = false;
    toast.value = null;
  });

  it('derives workspace from URL rather than local storage', () => {
    navigate('/app/traces?workspace_id=abc');
    expect(selectedWorkspace()).toBe('abc');
  });

  it('switches workspace preserving current pathname', () => {
    navigate('/app/evaluations?other=1');
    switchWorkspace('ws-789');
    expect(selectedWorkspace()).toBe('ws-789');
    expect(route.value).toContain('/app/evaluations');
  });

  it('closes menu after navigation', () => {
    sidebarOpen.value = true;
    navigate('/app/datasets');
    expect(sidebarOpen.value).toBe(false);
  });

  it('rejects off-origin navigation', () => {
    expect(() => navigate('https://attacker.example')).toThrow();
  });

  it('sets and clears notifications with notify and toast signal', () => {
    notify('Operación completada', 'success');
    expect(toast.value).toEqual({
      message: 'Operación completada',
      kind: 'success',
    });

    notify('Error crítico', 'error');
    expect(toast.value).toEqual({ message: 'Error crítico', kind: 'error' });

    toast.value = null;
    expect(toast.value).toBeNull();
  });

  it('supports theme switching between dark and light', () => {
    theme.value = 'light';
    expect(theme.value).toBe('light');
    theme.value = 'dark';
    expect(theme.value).toBe('dark');
  });

  it('listens to popstate events with initializeNavigation', () => {
    initializeNavigation();
    history.pushState({}, '', '/app/prompts');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(route.value).toBe('/app/prompts');
  });
});
