import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18next from '@/i18n/config';
import { MobileWorkspace } from '@/components/mobile/MobileWorkspace';
import { mobileCellDisplay } from '@/components/mobile/mobileCellDisplay';
import { cellDisplayText } from '@/services/spreadsheet/cellDisplay';
import { setNumberFormatPreference } from '@/utils/formatting';
import { useAppStore } from '@/state/appStore';

const embed = vi.hoisted(() => ({ embedded: false }));
vi.mock('@/lib/hostRoot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hostRoot')>()),
  isEmbedded: () => embed.embedded,
}));

type StatsWindow = Window & { OpenAECStatistics?: { open: () => void } };

async function render() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<MobileWorkspace />); });
  return { host, cleanup: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function newDocument(name: string) {
  useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
  useAppStore.getState().addDocument({ fileName: name });
}

/** Bootst de loader uit index.html en het gedeelde script na: paneel, zwevende aan/uit-knop en open(). */
function installSharedStatistics({ withScript = true } = {}) {
  const loader = document.createElement('script');
  loader.id = 'openaec-analytics-loader';
  loader.type = 'text/plain';
  document.head.append(loader);
  const panel = document.createElement('section');
  const floating = document.createElement('button');
  const runScript = () => {
    panel.id = 'analytics-consent';
    panel.hidden = true;
    floating.id = 'analytics-settings';
    floating.setAttribute('aria-expanded', 'false');
    floating.onclick = () => { panel.hidden = !panel.hidden; floating.setAttribute('aria-expanded', String(!panel.hidden)); };
    (window as StatsWindow).OpenAECStatistics = { open: () => { panel.hidden = false; floating.setAttribute('aria-expanded', 'true'); } };
    document.body.append(panel, floating);
  };
  if (withScript) runScript();
  return { panel, floating, runScript, remove: () => { loader.remove(); panel.remove(); floating.remove(); } };
}

afterEach(async () => {
  delete (window as StatsWindow).OpenAECStatistics;
  embed.embedded = false;
  await i18next.changeLanguage('nl');
});

describe('mobile sheet cell display', () => {
  it('shows a formula result in the same notation as the desktop grid, with the formula underneath', () => {
    // Subbladen volgen de instelling "Getalnotatie" (#65); hier vast 1.234,56.
    setNumberFormatPreference('nl-NL');
    const cell = { value: '=A1*3', computed: 36 };
    expect(mobileCellDisplay(cell)).toEqual({ main: '36,00', formula: '=A1*3' });
    expect(mobileCellDisplay(cell).main).toBe(cellDisplayText(cell));
    expect(mobileCellDisplay({ value: '=A1', computed: 1250 }).main).toBe('1.250,00');
    expect(mobileCellDisplay({ value: '=A1', computed: 0.21, format: 'percentage', decimals: 0 }).main).toBe('21%');
    const money = { value: '=A1', computed: 1234.5, format: 'currency' as const };
    expect(mobileCellDisplay(money, 'USD').main).toBe(cellDisplayText(money, 'USD'));
  });

  it('formats plain numbers like the desktop grid and keeps text and unresolved formulas as typed', () => {
    expect(mobileCellDisplay({ value: '12,5', computed: 12.5 })).toEqual({ main: '12,50' });
    expect(mobileCellDisplay({ value: 'Wanden' })).toEqual({ main: 'Wanden' });
    expect(mobileCellDisplay({ value: '=XYZ(' })).toEqual({ main: '=XYZ(' });
    expect(mobileCellDisplay({ value: '=1/0', computed: Infinity })).toEqual({ main: '=1/0' });
  });

  it('never throws on odd values from a hand-edited file', () => {
    expect(mobileCellDisplay({ value: '=A1', computed: 5, decimals: 500 }).main).toBe('5,' + '0'.repeat(20));
    expect(mobileCellDisplay({ value: '=A1', computed: 5, decimals: -3 }).main).toBe('5');
    expect(mobileCellDisplay({ value: '=A1', computed: 5, decimals: Number.NaN }).main).toBe('5,00');
    expect(() => mobileCellDisplay({ value: '=A1', computed: 5, format: 'currency' }, 'not-a-code')).not.toThrow();
  });

  it('lists the computed value in the Sheets tab', async () => {
    await i18next.changeLanguage('nl');
    newDocument('Blad-test');
    const sheet = useAppStore.getState().addSubSheet('Maten');
    useAppStore.getState().setSubSheetCell(sheet, 'A1', '12');
    useAppStore.getState().setSubSheetCell(sheet, 'A2', '=A1*3');
    const { host, cleanup } = await render();
    try {
      await act(async () => { buttonByText(host, 'Bladen').click(); });
      const rows = [...host.querySelectorAll('.mobile-cell-list button')].map((row) => row.textContent);
      expect(rows).toEqual(['A112,00', 'A236,00=A1*3']);
    } finally { await cleanup(); }
  });
});

describe('mobile statistics button', () => {
  it('replaces the floating button with a header toggle that opens and closes the panel', async () => {
    const shared = installSharedStatistics();
    newDocument('Stat-test');
    const { host, cleanup } = await render();
    try {
      expect(document.documentElement.classList.contains('ocs-mobile-workspace')).toBe(true);
      const button = host.querySelector<HTMLButtonElement>('.mobile-header .mobile-statistics')!;
      expect(button.getAttribute('aria-expanded')).toBe('false');
      await act(async () => { button.click(); });
      expect(shared.panel.hidden).toBe(false);
      expect(button.getAttribute('aria-expanded')).toBe('true');
      await act(async () => { button.click(); });
      expect(shared.panel.hidden).toBe(true);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      // Het script zet aria-expanded ook zelf (bv. na Allow/Decline); de kopknop volgt.
      await act(async () => { shared.floating.setAttribute('aria-expanded', 'true'); await Promise.resolve(); });
      expect(button.getAttribute('aria-expanded')).toBe('true');
    } finally { await cleanup(); shared.remove(); }
    expect(document.documentElement.classList.contains('ocs-mobile-workspace')).toBe(false);
  });

  it('picks up a statistics script that loads after the workspace', async () => {
    const shared = installSharedStatistics({ withScript: false });
    newDocument('Laat');
    const { host, cleanup } = await render();
    try {
      expect(host.querySelector('.mobile-statistics')).toBeNull();
      expect(document.documentElement.classList.contains('ocs-mobile-workspace')).toBe(false);
      await act(async () => { shared.runScript(); await Promise.resolve(); });
      expect(host.querySelector('.mobile-statistics')).not.toBeNull();
      expect(document.documentElement.classList.contains('ocs-mobile-workspace')).toBe(true);
    } finally { await cleanup(); shared.remove(); }
  });

  it('leaves the host page alone when embedded', async () => {
    embed.embedded = true;
    const shared = installSharedStatistics();
    newDocument('Ingebouwd');
    const { host, cleanup } = await render();
    try {
      expect(host.querySelector('.mobile-statistics')).toBeNull();
      expect(document.documentElement.classList.contains('ocs-mobile-workspace')).toBe(false);
    } finally { await cleanup(); shared.remove(); }
  });

  it('shows no statistics button and hides nothing without the loader', async () => {
    newDocument('Geen-stat');
    const { host, cleanup } = await render();
    try {
      expect(host.querySelector('.mobile-statistics')).toBeNull();
      expect(document.documentElement.classList.contains('ocs-mobile-workspace')).toBe(false);
    } finally { await cleanup(); }
  });
});
