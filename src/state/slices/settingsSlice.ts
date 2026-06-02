import type { StateCreator } from 'zustand';
import { defaultSettings, saveSettings, type AppSettings } from '@/utils/settings';

export interface SettingsSlice {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  settings: { ...defaultSettings },

  setSettings: (settings) => set({ settings }),

  updateSettings: (partial) =>
    set((state) => {
      const updated = { ...state.settings, ...partial };
      void saveSettings(updated);
      return { settings: updated };
    }),
});
