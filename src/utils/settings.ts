import { storeGet, storeSet } from './store';
import type { WorkspaceLayout } from '@/types/workspaceLayout';

export interface AppSettings {
  theme: string;
  locale: string;
  /**
   * Taal van afdrukken en PDF-rapporten. "auto" = volg de interfacetaal;
   * anders een taalcode uit LANGUAGES. Los van `locale`, zodat een bureau
   * met een Engelse interface toch Nederlandse rapporten kan afdrukken.
   */
  reportLocale: string;
  currency: string;
  autoSave: boolean;
  autoSaveInterval: number;
  recentFiles: string[];
  workspaceLayouts?: WorkspaceLayout[];
  lastWorkspaceLayoutId?: string | null;
}

const SETTINGS_KEY = 'settings';

export const defaultSettings: AppSettings = {
  theme: 'light',
  // Engels als standaard: de live demo en nieuwe installaties openen voor
  // iedereen in dezelfde, internationaal leesbare taal. Wie een eerdere
  // keuze heeft opgeslagen, houdt die.
  locale: 'en',
  reportLocale: 'auto',
  currency: 'EUR',
  autoSave: false,
  autoSaveInterval: 300000,
  recentFiles: [],
};

export async function loadSettings(): Promise<AppSettings> {
  const stored = await storeGet<AppSettings>(SETTINGS_KEY);
  const settings = stored ? { ...defaultSettings, ...stored } : { ...defaultSettings };
  settings.workspaceLayouts = sanitizeWorkspaceLayouts(settings.workspaceLayouts);
  return settings;
}

export function sanitizeWorkspaceLayouts(input: unknown): WorkspaceLayout[] {
  if (!Array.isArray(input)) return [];
  const views = new Set(['wizard', 'grid', 'promptBudget', 'urenstaart', 'rapport', 'samenvatting', 'ifc', 'offerte', 'spreadsheet', 'viewer3d', 'pdf']);
  const seen = new Set<string>(['measure', 'estimate', 'review']);
  return input.filter((layout): layout is WorkspaceLayout => {
    if (!layout || typeof layout !== 'object' || typeof layout.id !== 'string' || !layout.id || seen.has(layout.id) || typeof layout.name !== 'string' || !layout.name.trim() || !views.has(layout.activeContentTab)) return false;
    if (!['showSchedulePanel', 'showPropertiesPanel', 'showChatPanel'].every(key => typeof layout[key] === 'boolean')) return false;
    if (!['leftPanelWidth', 'rightPanelWidth', 'ifcSplitPercent', 'gridZoom', 'pdfZoom'].every(key => typeof layout[key] === 'number' && Number.isFinite(layout[key]))) return false;
    if (!['st', 'wpcalc', 'inschrijfstaat', 'simple'].includes(layout.gridView)) return false;
    seen.add(layout.id); return true;
  }).slice(0, 20).map(layout => ({ ...layout, name: layout.name.trim().slice(0, 80), leftPanelWidth: Math.max(160, Math.min(480, layout.leftPanelWidth)), rightPanelWidth: Math.max(200, Math.min(540, layout.rightPanelWidth)), ifcSplitPercent: Math.max(30, Math.min(70, layout.ifcSplitPercent)), gridZoom: Math.max(50, Math.min(200, layout.gridZoom)), pdfZoom: Math.max(.25, Math.min(5, layout.pdfZoom)), hiddenColumns: Object.fromEntries(Object.entries(layout.hiddenColumns ?? {}).filter(([key, value]) => key.length < 100 && typeof value === 'boolean').slice(0, 200)) }));
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await storeSet(SETTINGS_KEY, settings);
}
