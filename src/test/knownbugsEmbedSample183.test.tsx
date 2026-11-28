// Knownbug 183: <OpenCalcStudio sample /> opende de voorbeeldbegroting twee keer
// (App én de component) als het laden van het voorbeeld langer dan 50 ms duurde.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterAll, expect, it, vi } from 'vitest';

vi.mock('@/services/mcp/mcpBridge', () => ({ initMcpBridge: async () => () => {} }));
vi.mock('@/extensions', () => ({ loadAllExtensions: async () => {} }));
vi.mock('@/services/system/osUser', () => ({ initOsUsername: () => {} }));
vi.mock('@/services/file/sampleBudget', () => ({
  loadSampleBudgetText: async () => {
    await new Promise((r) => setTimeout(r, 120));
    return readFileSync('src/data/samples/sample-en.ifcCalc', 'utf8');
  },
}));

let root: Root | undefined;
let node: HTMLDivElement | undefined;
afterAll(async () => {
  if (root) await act(async () => root!.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});

it('opens the sample estimate once when embedded with sample: true', { timeout: 60000 }, async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  const { OpenCalcStudio } = await import('@/lib/index');
  const { useAppStore } = await import('@/state/appStore');
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<OpenCalcStudio sample lang="en" />));
  await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
  expect(useAppStore.getState().documents).toHaveLength(1);
});
