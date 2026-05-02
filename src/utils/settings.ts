import { storeGet, storeSet } from './store';

export interface AppSettings {
  theme: string;
  locale: string;
  currency: string;
  autoSave: boolean;
  autoSaveInterval: number;
  recentFiles: string[];
}

const SETTINGS_KEY = 'settings';

export const defaultSettings: AppSettings = {
  theme: 'light',
  locale: 'nl',
  currency: 'EUR',
  autoSave: false,
  autoSaveInterval: 300000,
  recentFiles: [],
};

export async function loadSettings(): Promise<AppSettings> {
  const stored = await storeGet<AppSettings>(SETTINGS_KEY);
  return stored ? { ...defaultSettings, ...stored } : { ...defaultSettings };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await storeSet(SETTINGS_KEY, settings);
}
