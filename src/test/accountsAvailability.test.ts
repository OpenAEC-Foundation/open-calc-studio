import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type { AccountsSlice } from '@/state/slices/accountsSlice';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); invoke.mockReset(); delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; delete window.openaecHost; });
async function flags(platform = false) {
  vi.stubEnv('VITE_OPENAEC_ENABLED', 'true'); vi.stubEnv('VITE_PLATFORM_BUILD', String(platform));
  return import('@/services/buildFlags');
}
describe('desktop account availability', () => {
  it('does not expose sign-in in an ordinary browser even with the feature enabled', async () => {
    expect((await flags()).allowsAccounts()).toBe(false);
    const { createAccountsSlice } = await import('@/state/slices/accountsSlice');
    const store = create<AccountsSlice>()(createAccountsSlice);
    await expect(store.getState().accountsSignIn()).rejects.toThrow('configured desktop build');
    expect(invoke).not.toHaveBeenCalled();
    expect(store.getState().accountsBusy).toBe(false);
    expect(store.getState().accountsError).toContain('hosted app');
  });
  it('allows an explicitly enabled native build', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    expect((await flags()).allowsAccounts()).toBe(true);
  });
  it('keeps platform authentication owned by the host even with a native marker', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    expect((await flags(true)).allowsAccounts()).toBe(false);
  });
  it('exposes the native configuration error and resets busy state for retry', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    await flags();
    const { createAccountsSlice } = await import('@/state/slices/accountsSlice');
    const store = create<AccountsSlice>()(createAccountsSlice);
    invoke.mockRejectedValueOnce('OpenAEC sign-in is not configured.');
    await expect(store.getState().accountsSignIn()).rejects.toContain('not configured');
    expect(store.getState().accountsBusy).toBe(false);
    expect(store.getState().accountsError).toContain('not configured');
  });
});
