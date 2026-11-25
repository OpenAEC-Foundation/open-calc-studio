import { afterEach, describe, expect, it, vi } from 'vitest';

describe('knownbug 197: bewaarde RTL-taal bij het opstarten', () => {
  afterEach(() => {
    localStorage.removeItem('ocs-i18nextLng');
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('zet dir en lang al bij de eerste init, niet pas bij een taalwissel', async () => {
    localStorage.setItem('ocs-i18nextLng', 'ar');
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.setAttribute('lang', 'en');
    vi.resetModules();
    const { default: i18n } = await import('@/i18n/config');
    expect(i18n.language).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
  });
});
