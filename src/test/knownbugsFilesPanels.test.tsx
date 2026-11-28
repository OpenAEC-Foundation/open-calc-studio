import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Backstage from '@/components/backstage/Backstage';
import { CloudPanel } from '@/components/backstage/CloudPanel';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
import { localStore } from '@/utils/browserStorage';
import { serializeProject } from '@/services/file/fileService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { importBudget } from '@/lib/importers';
import { exportTradxml } from '@/services/exporters';
import { makeCostItem } from '@/services/importers/core';
import { hostRecentPath } from '@/services/file/siteHost';

vi.mock('@/hooks/useFileOperations', () => ({
  useFileOperations: () => ({ newFile: () => useAppStore.getState().addDocument({ items: [] }), saveFile: vi.fn(), saveFileAs: vi.fn(), openFile: vi.fn(), openRecentFile: vi.fn() }),
}));

const initial = useAppStore.getState();
const s = () => useAppStore.getState();
let node: HTMLDivElement, root: Root;
let picker: ReturnType<typeof vi.spyOn>;
let alerts: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState(initial, true);
  s().addDocument({ id: 'panels', items: [] });
  picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  alerts = vi.spyOn(window, 'alert').mockImplementation(() => {});
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); });

const tr = (key: string) => i18next.t(key, { ns: 'backstage' });
async function openMenu(key: string) {
  await act(async () => root.render(<Backstage open onClose={() => {}} onOpenSettings={() => {}} />));
  const label = tr(key);
  const item = [...node.querySelectorAll<HTMLButtonElement>('.backstage-item')].find((b) => b.querySelector('.backstage-item-label')?.textContent === label);
  await act(async () => item!.click());
}
/** Kies een bestand in het zojuist geopende bestandsvenster. */
async function pick(file: File) {
  const input = picker.mock.contexts[0] as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => { await (input.onchange as unknown as (e: { target: HTMLInputElement }) => unknown)?.({ target: input }); });
}

describe('Bestand > Importeren meldt fouten (knownbug 68)', () => {
  it('een kapotte xlsx bij de algemene Excel/CSV-import', async () => {
    await openMenu('import');
    const buttons = node.querySelectorAll<HTMLButtonElement>('.bs-panel-options button:not([data-library-import])');
    await act(async () => buttons[2].click());
    await vi.waitFor(() => expect(picker).toHaveBeenCalledOnce());
    expect((picker.mock.contexts[0] as HTMLInputElement).accept).toContain('.xlsx');
    await pick(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], 'kapot.xlsx'));
    expect(alerts).toHaveBeenCalledWith(expect.stringContaining('ZIP'));
  });

  it('een kapot IFCX-bestand', async () => {
    await openMenu('import');
    const buttons = node.querySelectorAll<HTMLButtonElement>('.bs-panel-options button:not([data-library-import])');
    await act(async () => buttons[0].click());
    await pick(new File(['{ geen json'], 'kapot.ifcx'));
    await vi.waitFor(() => expect(alerts).toHaveBeenCalledOnce());
  });
});

describe('Recente bestanden van de site (knownbug 69)', () => {
  it('toont de bestandsnaam in plaats van ocs-host:…', async () => {
    localStore.setItem('ocs-host-name:abc 1', 'Raming.ifcCalc');
    s().updateSettings({ recentFiles: [hostRecentPath('abc 1')] });
    await openMenu('open');
    const name = node.querySelector('.bs-recent-item-name')?.textContent;
    expect(name).toBe('Raming.ifcCalc');
    expect(node.querySelector('.bs-recent-item-path')?.textContent).toBe('');
  });
});

describe('Openen vanuit de cloud (knownbug 70)', () => {
  it('laadt offerte, bedrijfsgegevens, spreadsheets, snapshots en projectinfo', async () => {
    const schedule = { ...createDefaultSchedule(), name: 'Cloud', projectInfo: { ...createDefaultSchedule().projectInfo!, architect: 'Kantoor' } } as never;
    const project = JSON.parse(serializeProject(schedule, [], { ...s().companyInfo, name: 'Bouwbedrijf X' }, [{ id: 'sheet', name: 'Blad', columns: 1, rows: 1, cells: {} }]));
    project.offerte = { ...s().offerte, offerteNummer: 'Offerte cloud' };
    project.snapshots = [{ id: 'snap', name: 'Versie 1', createdAt: '2026-01-01T00:00:00.000Z', items: [], schedule }];
    useAppStore.setState({
      accountsUser: { sub: 'u', name: 'U' } as never,
      cloudFiles: [{ id: 'f1', name: 'Raming.ifcCalc', size: 10 }],
      cloudRefresh: async () => {},
      cloudDownload: async () => JSON.stringify(project),
    } as never);
    await act(async () => root.render(<CloudPanel onClose={() => {}} />));
    const open = [...node.querySelectorAll<HTMLButtonElement>('.cloud-row-btn')].find((b) => !b.classList.contains('danger'))!;
    await act(async () => { open.click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(s().companyInfo.name).toBe('Bouwbedrijf X');
    expect(s().subSheets.map((x) => x.id)).toEqual(['sheet']);
    expect(s().offerte.offerteNummer).toBe('Offerte cloud');
    expect(s().snapshots.map((x) => x.id)).toEqual(['snap']);
    expect(s().projectInfo.architect).toBe('Kantoor');
    expect(s().documents.find((d) => d.id === s().activeDocumentId)?.fileName).toBe('Raming');
  });
});

describe('TRADXML (.xml) via de algemene import (knownbug 112)', () => {
  it('gaat naar de TRADXML-importer, niet naar XPWE', async () => {
    const chapter = makeCostItem({ rowType: 'chapter', code: '10', description: 'Grondwerk' });
    const post = makeCostItem({ rowType: 'begrotingspost', parentId: chapter.id, depth: 1, description: 'Ontgraven', unit: 'm³', quantity: 12, materialPrice: 8 });
    const { xml } = exportTradxml({ schedule: { ...createDefaultSchedule(), name: 'Trad' }, items: [chapter, post] });
    const result = await importBudget(new TextEncoder().encode(xml).buffer, 'export.xml');
    expect(result.items.map((i) => i.description)).toEqual(['Grondwerk', 'Ontgraven']);
  });
});
