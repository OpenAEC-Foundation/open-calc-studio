import type { StateCreator } from 'zustand';

/**
 * OpenAEC Accounts: login-status en cloud-opslag.
 * De OAuth-flow en tokens leven volledig aan de Rust-kant (keyring);
 * dit slice praat alleen via Tauri-commands en bewaart geen geheimen.
 */

export interface AccountsUser {
  sub: string;
  name: string;
  email: string;
}

export interface CloudFile {
  id: string;
  name: string;
  size: number;
  contentType?: string;
  createdAt?: string;
}

export interface StorageInfo {
  usedBytes: number;
  quotaBytes: number;
  tier?: string;
}

export interface AccountsSlice {
  accountsUser: AccountsUser | null;
  accountsBusy: boolean;
  accountsError: string | null;
  cloudFiles: CloudFile[];
  storageInfo: StorageInfo | null;
  /** Resterend AI-tegoed (totaal) van het OpenAEC-account; null = onbekend. */
  aiCredits: number | null;
  /** Start de browser-loginflow; zet accountsUser bij succes. */
  accountsSignIn: () => Promise<void>;
  accountsSignOut: () => Promise<void>;
  /** Herstel de sessie uit de keyring (bij app-start). */
  accountsLoadUser: () => Promise<void>;
  /** Haal bestandslijst + opslag-info op. */
  cloudRefresh: () => Promise<void>;
  /** Sla de huidige begroting als .ifcCalc op in de cloud (optioneel in een map, met eigen naam). */
  cloudUploadCurrent: (path?: string[], fileName?: string) => Promise<void>;
  cloudDownload: (id: string) => Promise<string>;
  cloudDelete: (id: string) => Promise<void>;
  /** AI-completion via het OpenAEC-account (betaalt met credits). */
  accountsAiComplete: (prompt: string, system?: string) => Promise<string>;
  /** Haal het actuele creditsaldo op. */
  accountsLoadCredits: () => Promise<void>;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export const createAccountsSlice: StateCreator<AccountsSlice> = (set, get) => ({
  accountsUser: null,
  accountsBusy: false,
  accountsError: null,
  cloudFiles: [],
  storageInfo: null,
  aiCredits: null,

  accountsSignIn: async () => {
    // Eén login tegelijk: de loopback-poort kan maar één listener hebben.
    if (get().accountsBusy) return;
    set({ accountsBusy: true, accountsError: null });
    try {
      const user = await tauriInvoke<AccountsUser>('accounts_sign_in');
      set({ accountsUser: user, accountsBusy: false });
      // App registreren in "My apps" op het account (idempotent; 409 = al
      // toegevoegd) en het AI-tegoed alvast ophalen — fire-and-forget.
      tauriInvoke('accounts_fetch', {
        path: '/me/apps',
        method: 'POST',
        body: { slug: 'open-calc-studio' },
      }).catch(() => {});
      void (get() as AccountsSlice).accountsLoadCredits();
    } catch (e) {
      set({ accountsBusy: false, accountsError: String(e) });
      throw e;
    }
  },

  accountsSignOut: async () => {
    try {
      await tauriInvoke('accounts_sign_out');
    } catch {
      // browser-modus of command onbeschikbaar — lokaal uitloggen volstaat
    }
    set({ accountsUser: null, cloudFiles: [], storageInfo: null });
  },

  accountsLoadUser: async () => {
    try {
      const user = await tauriInvoke<AccountsUser | null>('accounts_get_user');
      if (user) set({ accountsUser: user });
    } catch {
      // geen Tauri (browser-modus) — stil overslaan
    }
  },

  cloudRefresh: async () => {
    const files = await tauriInvoke<CloudFile[]>('accounts_fetch', { path: '/me/files' });
    const storage = await tauriInvoke<StorageInfo>('accounts_fetch', { path: '/me/storage' });
    set({ cloudFiles: Array.isArray(files) ? files : [], storageInfo: storage });
  },

  cloudUploadCurrent: async (path?: string[], fileName?: string) => {
    const s = get() as any;
    const { serializeProject } = await import('@/services/file/fileService');
    const content = serializeProject(s.schedule, s.items, s.companyInfo, s.subSheets, s.offerte);
    const base = (fileName?.trim() || s.schedule?.name || s.schedule?.projectName || 'begroting') as string;
    const cleanBase = `${base.replace(/\.(ifcCalc|ocs|json)$/i, '')}.ifcCalc`;
    // Mappen via "/"-prefix — werkt zodra het platform paden in namen toestaat.
    const fullName = path && path.length ? `${path.join('/')}/${cleanBase}` : cleanBase;
    const storage = await tauriInvoke<StorageInfo>('accounts_upload_file', { fileName: fullName, content });
    set({ storageInfo: storage });
    await (get() as AccountsSlice).cloudRefresh();
  },

  cloudDownload: async (id: string) => {
    return tauriInvoke<string>('accounts_download_file', { id });
  },

  cloudDelete: async (id: string) => {
    const storage = await tauriInvoke<StorageInfo>('accounts_fetch', {
      path: `/me/files/${id}`,
      method: 'DELETE',
    });
    set({ storageInfo: storage && (storage as any).quotaBytes ? storage : (get() as AccountsSlice).storageInfo });
    await (get() as AccountsSlice).cloudRefresh();
  },

  accountsAiComplete: async (prompt: string, system?: string) => {
    const res = await tauriInvoke<{ text?: string; credits?: { total?: number } }>('accounts_fetch', {
      path: '/me/ai/complete',
      method: 'POST',
      body: { prompt, system, app: 'open-calc-studio' },
    });
    if (res?.credits && typeof res.credits.total === 'number') {
      set({ aiCredits: res.credits.total });
    }
    return res?.text ?? '';
  },

  accountsLoadCredits: async () => {
    try {
      const res = await tauriInvoke<{ total?: number }>('accounts_fetch', { path: '/me/credits' });
      if (typeof res?.total === 'number') set({ aiCredits: res.total });
    } catch {
      // niet ingelogd of geen Tauri — saldo blijft onbekend
    }
  },
});
