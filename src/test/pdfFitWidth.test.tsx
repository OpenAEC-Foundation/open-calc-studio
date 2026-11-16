import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewer } from '@/components/viewers/PdfViewer';
import { nextZoomLevel } from '@/components/viewers/pdfZoomLevels';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';

// Synthetic page of 600 x 800 PDF units.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: () => {} }) }) }), destroy: async () => {} }) }));

const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement, stageWidth = 0;
const observers: Array<() => void> = [];
const tr = (key: string) => i18next.t('workspace.' + key, { defaultValue: i18next.t(key) });
const named = (label: string) => [...node.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label);
const zoom = () => useAppStore.getState().pdfZoom;
const fitButton = () => named(tr('pdf.fitWidth'))!;
const overlay = () => node.querySelectorAll('canvas')[1];
/** Width the viewer can use for the page: the scroll area minus its horizontal padding. */
function available() {
  const el = node.querySelector<HTMLElement>('.pdf-ws-scroll')!, style = getComputedStyle(el);
  return stageWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function mount() {
  await act(async () => root.render(<PdfViewer />));
  await vi.waitFor(async () => { await settle(); expect(named(tr('pdf.next'))).not.toBeDisabled(); });
  await settle();
}
async function click(button: HTMLElement) { await act(async () => button.click()); await settle(); }

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  void i18next.changeLanguage('en');
  useAppStore.setState(initial, true);
  const s = useAppStore.getState();
  s.addDocument({ id: 'pdf-fit-width', items: [] });
  s.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: 'pdf', sources: [{ id: 'pdf', fileName: 'Synthetic.pdf', dataBase64: 'JVBERi0=', pageScales: { '1': 1000 }, measurements: [] }] } });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  stageWidth = 1232; observers.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('pdf-ws-scroll') ? stageWidth : 0; });
  vi.stubGlobal('ResizeObserver', class { constructor(private callback: () => void) {} observe() { observers.push(this.callback); } disconnect() { const i = observers.indexOf(this.callback); if (i >= 0) observers.splice(i, 1); } unobserve() {} });
  const context = { setTransform: vi.fn(), clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {} };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  // The on-screen box of a canvas is its CSS size (not its pixel size), like in a browser.
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLCanvasElement) {
    const width = parseFloat(this.style.width) || this.width, height = parseFloat(this.style.height) || this.height;
    return { left: 10, top: 20, right: 10 + width, bottom: 20 + height, width, height, x: 10, y: 20, toJSON: () => ({}) };
  });
  vi.spyOn(window, 'prompt').mockReturnValue('5');
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true }); });

it('opening a PDF fits the page to the width of the drawing area and follows a resize', async () => {
  await mount();
  expect(zoom()).toBe(Math.floor(available() / 600 * 1000) / 1000);
  expect(zoom()).not.toBe(1.5);
  expect(fitButton().getAttribute('aria-pressed')).toBe('true');
  stageWidth = 632;
  await act(async () => observers.forEach(callback => callback())); await settle();
  expect(zoom()).toBe(Math.floor(available() / 600 * 1000) / 1000);
});

it('zoom out / in turn fit mode off, the fit button turns it back on and refits', async () => {
  stageWidth = 696; // fits at 116 %, between the levels 110 % and 125 %
  await mount();
  expect(zoom()).toBe(1.16);
  await click(named('+')!);
  expect(zoom()).toBe(1.25);
  expect(fitButton().getAttribute('aria-pressed')).toBe('false');
  stageWidth = 832; // a resize no longer changes the zoom
  await act(async () => observers.forEach(callback => callback())); await settle();
  expect(zoom()).toBe(1.25);
  await click(named('−')!);
  expect(zoom()).toBe(1.1);
  await click(fitButton());
  expect(fitButton().getAttribute('aria-pressed')).toBe('true');
  expect(zoom()).toBe(Math.floor(available() / 600 * 1000) / 1000);
});

it('zoom buttons step through the fixed levels and are disabled at 25 % and 500 %', async () => {
  await mount();
  const seen: number[] = [];
  for (let i = 0; i < 30 && !named('+')!.disabled; i++) { await click(named('+')!); seen.push(zoom()); }
  expect(seen).toEqual([2.5, 3, 4, 5]);
  expect(named('+')).toBeDisabled();
  for (let i = 0; i < 30 && !named('−')!.disabled; i++) await click(named('−')!);
  expect(zoom()).toBe(.25);
  expect(named('−')).toBeDisabled();
  expect(named('+')).not.toBeDisabled();
});

describe('nextZoomLevel', () => {
  it('steps from an arbitrary zoom to the nearest level in that direction', () => {
    expect(nextZoomLevel(1.16, 1)).toBe(1.25);
    expect(nextZoomLevel(1.16, -1)).toBe(1.1);
    expect(nextZoomLevel(0.3, -1)).toBe(.25);
    expect(nextZoomLevel(4.9, 1)).toBe(5);
  });
  it('steps one level from an exact level, within a small tolerance', () => {
    expect(nextZoomLevel(1.25, 1)).toBe(1.5);
    expect(nextZoomLevel(1.25, -1)).toBe(1.1);
    expect(nextZoomLevel(1, 1)).toBe(1.1);
    expect(nextZoomLevel(0.999, -1)).toBe(.9);
    expect(nextZoomLevel(1.003, 1)).toBe(1.1);
    expect(nextZoomLevel(1.003, -1)).toBe(.9);
  });
  it('returns null past the lowest and highest level', () => {
    expect(nextZoomLevel(.25, -1)).toBeNull();
    expect(nextZoomLevel(.252, -1)).toBeNull();
    expect(nextZoomLevel(5, 1)).toBeNull();
    expect(nextZoomLevel(4.998, 1)).toBeNull();
    expect(nextZoomLevel(.25, 1)).toBe(.33);
    expect(nextZoomLevel(5, -1)).toBe(4);
  });
});

it('renders sharp at devicePixelRatio 2 and still stores points in PDF units', async () => {
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  stageWidth = 0; // no layout: keep the stored zoom of 150 %
  await mount();
  expect(zoom()).toBe(1.5);
  const canvas = node.querySelectorAll('canvas')[0];
  expect(canvas.width).toBe(1800); expect(canvas.style.width).toBe('900px');
  expect(overlay().width).toBe(1800); expect(overlay().style.height).toBe('1200px');
  await click(named(tr('pdf.calibrate'))!);
  // CSS (150, 75) inside the page at 150 % = PDF point (100, 50), as before.
  await act(async () => overlay().dispatchEvent(new MouseEvent('click', { clientX: 10 + 150, clientY: 20 + 75, bubbles: true })));
  await act(async () => overlay().dispatchEvent(new MouseEvent('click', { clientX: 10 + 450, clientY: 20 + 75, bubbles: true })));
  await click(node.querySelector<HTMLButtonElement>('.pdf-ws-hint .oa-button--primary')!); // the hint's confirm button (labelled Calibrate while calibrating)
  // 300 CSS px at 150 % = 200 PDF units; 5 m over 200 units = 25 mm per unit.
  expect(useAppStore.getState().schedule.pdfWorkspace!.sources[0].pageScales['1']).toBe(25);
  await click(named(tr('pdf.length'))!);
  await act(async () => overlay().dispatchEvent(new MouseEvent('click', { clientX: 10 + 150, clientY: 20 + 75, bubbles: true })));
  await act(async () => overlay().dispatchEvent(new MouseEvent('click', { clientX: 10 + 150, clientY: 20 + 375, bubbles: true })));
  await click(named(tr('pdf.finish'))!);
  const [measurement] = useAppStore.getState().schedule.pdfWorkspace!.sources[0].measurements;
  expect(measurement.points).toEqual([{ x: 100, y: 50 }, { x: 100, y: 250 }]);
  expect(measurement.value).toBeCloseTo(5); // 200 units x 25 mm
});
