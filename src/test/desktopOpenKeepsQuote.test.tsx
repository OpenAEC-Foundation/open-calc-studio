// knownbugs #58 / issue #66 punt 1: een .ifcCalc openen via dubbelklikken
// (bestandskoppeling) of slepen moet het hele project laden, ook de offerte en
// de snapshots. Anders zet addDocument een standaardofferte en een lege
// snapshotlijst neer en overschrijft Ctrl+S het originele bestand daarmee.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  // App leest bij het laden van de module of het de desktop-app is.
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  return {
    files: new Map<string, string>(),
    assoc: undefined as undefined | ((e: { payload: string }) => Promise<void>),
    drop: undefined as undefined | ((e: { payload: { type: string; paths: string[] } }) => Promise<void>),
  };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: (e: { payload: string }) => Promise<void>) => {
    if (name === 'file-association-open') m.assoc = handler;
    return () => {};
  },
  emit: async () => {},
}));
vi.mock('@tauri-apps/api/window', () => {
  const win = {
    label: 'main',
    onDragDropEvent: async (handler: typeof m.drop) => { m.drop = handler; return () => {}; },
    onCloseRequested: async () => () => {},
    onResized: async () => () => {},
    isMaximized: async () => false,
    setTitle: async () => {},
    minimize: async () => {}, toggleMaximize: async () => {}, close: async () => {}, destroy: async () => {},
  };
  return { getCurrentWindow: () => win };
});
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (path: string) => m.files.get(path) ?? '',
  readFile: async () => new Uint8Array(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => null }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'windows' }));
vi.mock('@/services/mcp/mcpBridge', () => ({ initMcpBridge: async () => () => {} }));
vi.mock('@/extensions', () => ({ loadAllExtensions: async () => {} }));
vi.mock('@/services/system/osUser', () => ({ initOsUsername: () => {} }));
// Geen voorbeeldbegroting die na het openen alsnog als actief tabblad binnenkomt.
vi.mock('@/services/file/sampleBudget', () => ({ loadSampleBudgetText: async () => { throw new Error('no sample in test'); } }));

import App from '@/App';
import { useAppStore } from '@/state/appStore';
import { serializeProject } from '@/services/file/fileService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { createDefaultOfferte } from '@/state/slices/offerteSlice';
import type { ProjectSnapshot } from '@/types/costModel';

let node: HTMLDivElement;
let root: Root;
const initial = useAppStore.getState();

function projectJson(tag: string): string {
  const schedule = createDefaultSchedule();
  const offerte = { ...createDefaultOfferte(), offerteNummer: `OFF-${tag}`, voorwaarden: `Voorwaarden ${tag}` };
  const snapshot: ProjectSnapshot = {
    id: `snap-${tag}`, label: `Versie ${tag}`, timestamp: '2026-11-01T10:00:00.000Z', type: 'verstuurd',
    notitie: '', schedule, items: [], totaalExclBtw: 0,
  };
  return serializeProject(schedule, [], undefined, undefined, offerte, [snapshot]);
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<App />));
  await vi.waitFor(() => { expect(m.assoc).toBeTypeOf('function'); expect(m.drop).toBeTypeOf('function'); });
  // Laat de opstart-timer voor de voorbeeldbegroting (50 ms) eerst aflopen.
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
});

afterAll(async () => {
  await act(async () => root.unmount());
  node.remove();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Elke test begint met de standaard-store (standaardofferte, geen snapshots).
  useAppStore.setState(initial, true);
});

it('opening a project by double-click (file association) keeps its quote and snapshots', async () => {
  const path = 'C:\\Projecten\\Dubbelklik.ifcCalc';
  m.files.set(path, projectJson('assoc'));
  await act(async () => { await m.assoc!({ payload: path }); });
  const s = useAppStore.getState();
  const doc = s.documents.find((d) => d.id === s.activeDocumentId)!;
  expect(doc.filePath).toBe(path);
  expect(doc.fileName).toBe('Dubbelklik');
  expect(s.offerte.offerteNummer).toBe('OFF-assoc');
  expect(s.offerte.voorwaarden).toBe('Voorwaarden assoc');
  expect(s.snapshots.map((x) => x.label)).toEqual(['Versie assoc']);
});

it('opening a project by drag-and-drop keeps its quote and snapshots', async () => {
  const path = 'C:\\Projecten\\Gesleept.ifcCalc';
  m.files.set(path, projectJson('drop'));
  await act(async () => { await m.drop!({ payload: { type: 'drop', paths: [path] } }); });
  const s = useAppStore.getState();
  const doc = s.documents.find((d) => d.id === s.activeDocumentId)!;
  expect(doc.filePath).toBe(path);
  expect(doc.fileName).toBe('Gesleept');
  expect(s.offerte.offerteNummer).toBe('OFF-drop');
  expect(s.offerte.voorwaarden).toBe('Voorwaarden drop');
  expect(s.snapshots.map((x) => x.label)).toEqual(['Versie drop']);
});
