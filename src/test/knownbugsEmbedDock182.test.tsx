// Knownbug 182: ingebouwd op een gastpagina met ?file= in de URL dacht App dat hij een
// losgekoppeld documentvenster was: knop "Dock to main window" en geen mobiele layout.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, expect, it, vi } from 'vitest';

vi.mock('@/services/mcp/mcpBridge', () => ({ initMcpBridge: async () => () => {} }));
vi.mock('@/extensions', () => ({ loadAllExtensions: async () => {} }));
vi.mock('@/services/system/osUser', () => ({ initOsUsername: () => {} }));

let root: Root | undefined;
let node: HTMLDivElement | undefined;
afterAll(async () => {
  if (root) await act(async () => root!.unmount());
  node?.remove();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('does not show the dock button when embedded on a page whose URL has ?file=', { timeout: 60000 }, async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.history.replaceState(null, '', '/host-page?file=report.pdf');
  const { OpenCalcStudio } = await import('@/lib/index');
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<OpenCalcStudio lang="en" />));
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  expect(node.querySelector('.oa-app')).not.toBeNull();
  expect(node.querySelector('.dock-handle')).toBeNull();
});
