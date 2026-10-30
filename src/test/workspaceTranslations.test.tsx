import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import i18n, { changeLanguage } from '@/i18n/config';
import { PdfViewer } from '@/components/viewers/PdfViewer';
import { SubSheetTabBar } from '@/components/grid/SubSheetTabBar';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { createDefaultOfferte } from '@/state/slices/offerteSlice';
import { getBuiltInTemplates } from '@/services/offerte/templateService';
import { measurePoints } from '@/services/pdf/pdfWorkspace';
import { parseLocalBudgetCommand } from '@/services/assistant/assistantActions';
import { buildAssistantSystemPrompt } from '@/services/assistant/promptLanguage';

let container: HTMLDivElement;
let root: Root | undefined;
async function renderUi(node: ReactNode) {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(node); });
}
function button(name: string) {
  return [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === name) ?? null;
}

beforeEach(async () => {
  await changeLanguage('en');
  useAppStore.setState({ documents: [], activeDocumentId: '', subSheets: [], resourceLibrary: [], resourcePickerOpen: false });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); vi.restoreAllMocks(); });

describe('workspace language selection', () => {
  it('renders the PDF workspace and navigation in English and reacts to a language switch', async () => {
    await renderUi(<><SubSheetTabBar /><PdfViewer /></>);
    expect(button('Prompt & Estimate')).toBeInTheDocument();
    expect(button('3D & Estimate')).toBeInTheDocument();
    expect(button('Add PDF')).toBeInTheDocument();
    expect(button('Finish measurement')).toBeInTheDocument();
    expect(container.textContent).not.toContain('Nog niet gekalibreerd');
    await act(async () => { await changeLanguage('nl'); });
    expect(button('Prompt & Begroot')).toBeInTheDocument();
    expect(button('PDF toevoegen')).toBeInTheDocument();
    expect(container.textContent).toContain('Nog niet gekalibreerd');
  });

  it('localizes price-library guidance without changing imported resource content', async () => {
    useAppStore.setState({ resourcePickerOpen: true, resourcePickerParentId: null });
    await renderUi(<ResourcePicker />);
    expect(container.textContent).toContain('Dutch starter library');
    expect(container.textContent).toContain('Select an estimate item before adding a resource.');
  });

  it('creates new surcharge rows and quotation defaults in the language selected at creation time', async () => {
    const english = createDefaultOfferte();
    expect(createDefaultItems()[0].description).toBe('Overheads on subcontracting:');
    expect(english.betalingstermijnen[0].beschrijving).toBe('On signing the letter of intent');
    expect(getBuiltInTemplates()[0].name).toBe('Floating home');
    await changeLanguage('nl');
    expect(createDefaultItems()[0].description).toBe('Algemene kosten over onderaanneming:');
    expect(createDefaultOfferte().betalingstermijnen[0].beschrijving).toBe('Bij tekenen intentieovereenkomst');
    expect(getBuiltInTemplates()[0].name).toBe('Waterwoning');
    expect(english.betalingstermijnen[0].beschrijving).toBe('On signing the letter of intent');
  });

  it('localizes measurement validation and interpolated errors', async () => {
    expect(() => measurePoints([], 'length', 0)).toThrow('Calibrate the scale first.');
    await changeLanguage('nl');
    expect(() => measurePoints([], 'length', 0)).toThrow('Kalibreer eerst de schaal.');
    expect(i18n.t('workspace.pdf.pointsChosen', { count: 1 })).toContain('1 punt gekozen');
    expect(i18n.t('workspace.pdf.pointsChosen', { count: 2 })).toContain('2 punten gekozen');
  });

  it('keeps English fallback text for languages without these workspace translations', async () => {
    await changeLanguage('de');
    await renderUi(<PdfViewer />);
    expect(button('Add PDF')).toBeInTheDocument();
    expect(container.textContent).not.toContain('PDF toevoegen');
  });

  it('uses the UI language for assistant replies while preserving the action protocol', () => {
    const protocol = '{"acties":[{"type":"add_regel","aantal":12}]}';
    expect(buildAssistantSystemPrompt('en', protocol)).toContain('Respond in English');
    expect(buildAssistantSystemPrompt('nl', protocol)).toContain('Respond in Dutch');
    expect(buildAssistantSystemPrompt('de', protocol)).toContain('Respond in German');
    expect(buildAssistantSystemPrompt('en', protocol)).toContain(protocol);
  });

  it('accepts both translated and Dutch offline command examples with the same action schema', () => {
    const english = parseLocalBudgetCommand('Add under 21.01 a line: 12 m³ Concrete C30 at €145');
    expect(english).toEqual([{ type: 'add_regel', onderNr: '21.01', aantal: 12, eenheid: 'm³', omschrijving: 'Concrete C30', prijs: 145 }]);
    expect(parseLocalBudgetCommand('Voeg onder 21.01 een regel toe: 12 m³ Beton C30 à €145')).toMatchObject([{ type: 'add_regel', onderNr: '21.01', aantal: 12, prijs: 145 }]);
  });
});
