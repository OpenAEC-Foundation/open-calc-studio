/**
 * Extension system types for Open Calc Studio.
 * Modeled after Open 2D Studio's extension architecture.
 */

// ── Categories & Permissions ──

export type ExtensionCategory =
  | 'Import/Export'
  | 'Calculation'
  | 'Reporting'
  | 'Utility'
  | 'Other';

export type ExtensionPermission =
  | 'commands'
  | 'ribbon'
  | 'backstage'
  | 'events'
  | 'filesystem'
  | 'network';

export type ExtensionStatus = 'enabled' | 'disabled' | 'error' | 'loading';

// ── Manifest (manifest.json in extension folder) ──

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  author: string;
  description: string;
  category: ExtensionCategory;
  main: string;              // relative path to main.js
  permissions: ExtensionPermission[];
  repository?: string;
  tags?: string[];
  icon?: string;             // SVG string or emoji
}

// ── Installed Extension (runtime record) ──

export interface InstalledExtension {
  id: string;
  manifest: ExtensionManifest;
  status: ExtensionStatus;
  error?: string;
  path?: string;             // filesystem path (Tauri) or blob URL (browser)
}

// ── Plugin Interface (what main.js exports) ──

export interface ExtensionPlugin {
  onLoad(api: ExtensionApi): void | Promise<void>;
  onUnload?(): void | Promise<void>;
}

// ── Extension API (passed to onLoad) ──

export interface ExtensionApi {
  readonly extensionId: string;

  /** Import/export registration */
  importers: {
    register(def: ImporterDefinition): void;
    unregister(id: string): void;
  };

  /** Cost item data access */
  data: {
    getItems(): any[];
    getSchedule(): any;
    setItems(items: any[]): void;
    setSchedule(schedule: any): void;
    recalculate(): void;
    pushHistory(label: string): void;
  };

  /** Event bus */
  events: {
    on(event: string, listener: (data: any) => void): () => void;
    off(event: string, listener: (data: any) => void): void;
    emit(event: string, data?: any): void;
  };

  /** UI registration */
  ui: {
    addRibbonButton(reg: RibbonButtonRegistration): void;
    addBackstagePanel(reg: BackstagePanelRegistration): void;
    showNotification(message: string, type?: 'info' | 'warning' | 'error'): void;
  };

  /** Scoped settings */
  settings: {
    get<T>(key: string, defaultValue: T): T;
    set<T>(key: string, value: T): void;
  };

  /** Internal cleanup — called on disable */
  _cleanup(): void;
}

// ── Importer Definition ──

export interface ImporterDefinition {
  id: string;
  name: string;
  description: string;
  fileExtensions: string[];   // e.g., ['.xls', '.xlsx']
  icon?: string;
  handler: (file: File) => Promise<ImportResult>;
}

export interface ImportResult {
  schedule: any;
  items: any[];
  companyInfo?: any;
}

// ── UI Registration Types ──

export interface RibbonButtonRegistration {
  tab: string;
  group: string;
  label: string;
  icon?: string;
  onClick: () => void;
  tooltip?: string;
}

export interface BackstagePanelRegistration {
  id: string;
  label: string;
  icon?: string;
  render: (container: HTMLElement) => void | (() => void);
  order?: number;
}

// ── Extension Catalog (remote registry) ──

export interface ExtensionCatalog {
  version: number;
  lastUpdated: string;
  extensions: CatalogEntry[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: ExtensionCategory;
  tags: string[];
  minAppVersion: string;
  repository: string;
  downloadUrl: string;
  icon?: string;
}
