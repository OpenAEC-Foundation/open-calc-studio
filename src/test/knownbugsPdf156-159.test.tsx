import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewer } from '@/components/viewers/PdfViewer';
import { measurePoints, remeasure } from '@/services/pdf/pdfWorkspace';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
import type { SavedPdfMeasurement } from '@/types/pdfWorkspace';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: () => {} }) }) }), destroy: async () => {} }) }));

const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement;
const tr = (key: string) => i18next.t('workspace.' + key, { defaultValue: i18next.t(key) });
const named = (label: string) => [...node.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label);
const workspace = () => useAppStore.getState().schedule.pdfWorkspace!;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function click(key: string) { const b = named(tr(key)); expect(b, key).toBeTruthy(); await act(async () => b!.click()); }
async function mount() {
  await act(async () => root.render(<PdfViewer />));
  await vi.waitFor(async () => { await settle(); expect(named(tr('pdf.next'))).not.toBeDisabled(); });
}
async function point(x: number, y: number) { const overlay = node.querySelectorAll('canvas')[1]; await act(async () => overlay.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))); }

function setup(measurements: SavedPdfMeasurement[] = []) {
  const s = useAppStore.getState();
  s.addDocument({ id: 'pdf-kb', items: [] });
  s.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: 'pdf', sources: [{ id: 'pdf', fileName: 'Synthetic.pdf', dataBase64: 'JVBERi0=', pageScales: { '1': 1000, '3': 500 }, measurements }] } });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState(initial, true);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  const context = { setTransform: () => {}, clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {} };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLCanvasElement) { return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height, x: 0, y: 0, toJSON: () => ({}) }; });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); });

describe('knownbug 156: meetlabels herhalen zich niet na een verwijdering', () => {
  it('na het verwijderen van Length 1 heet de volgende meting Length 3, niet nog eens Length 2', async () => {
    const length2: SavedPdfMeasurement = { id: 'pdf:calc:2', label: `${tr('pdf.length')} 2`, type: 'length', page: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], mmPerPoint: 1000, value: 1, origin: 'open-calc-studio' };
    setup([length2]);
    await mount();
    await click('pdf.length'); await point(0, 0); await point(150, 0); await click('pdf.finish');
    const labels = workspace().sources[0].measurements.map(m => m.label);
    expect(labels).toEqual([`${tr('pdf.length')} 2`, `${tr('pdf.length')} 3`]);
  });
});

describe('knownbug 158: onafgemaakte punten gaan niet mee naar een andere pagina', () => {
  it('een paginawissel via de store (Open source) wist de geplaatste punten', async () => {
    setup();
    await mount();
    await click('pdf.length'); await point(0, 0); await point(150, 0);
    expect(named(tr('pdf.finish'))).toBeTruthy();
    await act(async () => useAppStore.setState({ pdfPage: 3 })); await settle();
    // Geen afrondknop meer: de punten van pagina 1 zijn weg en kunnen niet als meting op pagina 3 landen.
    expect(named(tr('pdf.finish'))).toBeUndefined();
    expect(workspace().sources[0].measurements).toHaveLength(0);
  });
});

describe('knownbug 159: zichzelf kruisende oppervlaktepolygoon', () => {
  it('een vlinderdas (kruisende randen) wordt geweigerd in plaats van oppervlakte 0', () => {
    expect(() => measurePoints([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }], 'area', 1000)).toThrow();
  });
  it('een gewone (ook concave) polygoon meet nog steeds', () => {
    expect(measurePoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'area', 1000)).toBeCloseTo(100);
    // L-vorm: 10x10 min 5x5 = 75
    expect(measurePoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }], 'area', 1000)).toBeCloseTo(75);
  });
  it('een oudere opgeslagen kruisende meting blokkeert opnieuw kalibreren niet', () => {
    const bowtie: SavedPdfMeasurement = { id: 'old', label: 'Area 1', type: 'area', page: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }], mmPerPoint: 1000, value: 4, origin: 'open-calc-studio' };
    expect(remeasure(bowtie, 2000)).toBeCloseTo(16);
    expect(remeasure({ ...bowtie, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }, 2000)).toBeCloseTo(400);
  });
  it('drie punten op één lijn (oppervlakte 0) worden geweigerd', () => {
    expect(() => measurePoints([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], 'area', 1000)).toThrow();
  });
});
