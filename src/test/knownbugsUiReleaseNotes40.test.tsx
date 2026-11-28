import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18next from '@/i18n/config';

vi.mock('@/services/buildFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/buildFlags')>()),
  allowsExternalServices: () => true,
}));
vi.mock('@/services/file/nativeFileService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/file/nativeFileService')>()),
  isTauriEnvironment: () => true,
}));

import { ReleaseNotesPanel } from '@/components/welcome/ReleaseNotesPanel';

afterEach(() => { vi.unstubAllGlobals(); localStorage.removeItem('ocs-releases-cache-v1'); });

describe('knownbug 40: "Wat is nieuw" offline', () => {
  it('houdt de releases uit de cache als GitHub niet bereikbaar is', async () => {
    await i18next.changeLanguage('en');
    localStorage.setItem('ocs-releases-cache-v1', JSON.stringify({
      ts: Date.now(),
      data: [{ tag_name: 'v9999.1.0', name: 'Cached only release', body: '', published_at: '', html_url: '' }],
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ReleaseNotesPanel />); });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain('Cached only release');
    await act(async () => { root.unmount(); });
    host.remove();
  });
});
