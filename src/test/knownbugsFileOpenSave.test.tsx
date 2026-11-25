import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { serializeProject } from '@/services/file/fileService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import type { SubSheet } from '@/types/costModel';

// Desktop (Tauri) nagebootst: bestanden komen uit deze map.
const disk = vi.hoisted(() => new Map<string, Uint8Array>());
const saved = vi.hoisted(() => [] as string[]);
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (path: string) => {
    const bytes = disk.get(path);
    if (!bytes) throw Error(`missing ${path}`);
    return new TextDecoder().decode(bytes);
  },
}));
vi.mock('@/services/file/nativeFileService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/file/nativeFileService')>();
  return {
    ...real,
    isTauriEnvironment: () => true,
    readBinaryFileByPath: async (path: string) => {
      const bytes = disk.get(path);
      if (!bytes) throw Error(`missing ${path}`);
      return bytes.slice().buffer;
    },
    saveFileToPath: async (_path: string, json: string) => { saved.push(json); },
    showError: vi.fn(async () => {}),
  };
});

const { useFileOperations, toIfcCalcPath } = await import('@/hooks/useFileOperations');
const { showError } = await import('@/services/file/nativeFileService');

const initial = useAppStore.getState();
const s = () => useAppStore.getState();
const enc = (text: string) => new TextEncoder().encode(text);
const sheet = (id: string, name: string): SubSheet => ({ id, name, columns: 2, rows: 2, cells: {} });

let ops: ReturnType<typeof useFileOperations>;
function Harness() { ops = useFileOperations(); return null; }
let node: HTMLDivElement, root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.setState(initial, true);
  disk.clear(); saved.length = 0;
  vi.mocked(showError).mockClear();
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

const projectJson = (extra: Record<string, unknown> = {}) => {
  const project = JSON.parse(serializeProject({ ...createDefaultSchedule(), name: 'Project' }, [], undefined, [sheet('s1', 'Blad 1'), sheet('s2', 'Blad 2')]));
  return JSON.stringify({ ...project, ...extra });
};

describe('Recente bestanden en Openen op de desktop (knownbug 61)', () => {
  it('opent een recente .dnc via zijn importeur en houdt hem in de lijst', async () => {
    const handler = vi.fn(async () => ({ schedule: { ...createDefaultSchedule(), name: 'DNC' }, items: [] }));
    useAppStore.setState({ extensionImporters: [{ extensionId: 'x', id: 'dnc', name: 'DNC', description: '', fileExtensions: ['.dnc'], handler }] } as never);
    s().updateSettings({ recentFiles: ['C:/p/raming.dnc'] });
    disk.set('C:/p/raming.dnc', new Uint8Array([0x00, 0x01, 0xff, 0x7b]));
    await act(async () => { await ops.openRecentFile('C:/p/raming.dnc'); });
    expect(handler).toHaveBeenCalledOnce();
    expect(s().settings.recentFiles).toContain('C:/p/raming.dnc');
    expect(s().documents[s().documents.length - 1]?.fileName).toBe('raming');
  });

  it('opent een recente CSV via de algemene import in plaats van als JSON', async () => {
    disk.set('C:/p/lijst.csv', enc('Omschrijving;Eenheid;Hoeveelheid;Prijs\nBeton;m3;10;95'));
    await act(async () => { await ops.openRecentFile('C:/p/lijst.csv'); });
    expect(showError).not.toHaveBeenCalled();
    expect(s().items.some((i) => i.description === 'Beton')).toBe(true);
  });
});

describe('Een .calc met native JSON houdt zijn spreadsheets (knownbug 62)', () => {
  it('laadt spreadsheets.sheets', async () => {
    disk.set('C:/p/oud.calc', enc(projectJson()));
    await act(async () => { await ops.openRecentFile('C:/p/oud.calc'); });
    expect(s().subSheets.map((x) => x.id)).toEqual(['s1', 's2']);
  });
});

describe('Voorgestelde opslagnaam bij een punt in de naam (knownbug 63)', () => {
  it('knipt alleen een bekende extensie weg', () => {
    expect(toIfcCalcPath(null, 'Begroting v1.2')).toBe('Begroting v1.2.ifcCalc');
    expect(toIfcCalcPath(null, 'Begroting v1.2.xls')).toBe('Begroting v1.2.ifcCalc');
    expect(toIfcCalcPath('C:\\p\\Begroting v1.2', null)).toBe('C:\\p\\Begroting v1.2.ifcCalc');
    expect(toIfcCalcPath('C:\\p\\Begroting v1.2.xls', null)).toBe('C:\\p\\Begroting v1.2.ifcCalc');
  });
});

describe('Opslaan bewaart aanmaakdatum en actief spreadsheet (knownbugs 110, 111)', () => {
  it('houdt createdAt van het geopende bestand', async () => {
    disk.set('C:/p/project.ifcCalc', enc(projectJson({ createdAt: '2020-01-02T03:04:05.000Z' })));
    await act(async () => { await ops.openRecentFile('C:/p/project.ifcCalc'); });
    await act(async () => { await ops.saveFile(); });
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0]).createdAt).toBe('2020-01-02T03:04:05.000Z');
  });

  it('bewaart en herstelt het actieve spreadsheet', async () => {
    disk.set('C:/p/project.ifcCalc', enc(projectJson()));
    await act(async () => { await ops.openRecentFile('C:/p/project.ifcCalc'); });
    s().setActiveSubSheet('s2');
    await act(async () => { await ops.saveFile(); });
    expect(JSON.parse(saved[0]).spreadsheets.activeSheetId).toBe('s2');
    expect(s().documents.find((d) => d.id === s().activeDocumentId)?.isModified).toBe(false);

    disk.set('C:/p/project2.ifcCalc', enc(saved[0]));
    await act(async () => { await ops.openRecentFile('C:/p/project2.ifcCalc'); });
    expect(s().activeSubSheetId).toBe('s2');
  });
});
