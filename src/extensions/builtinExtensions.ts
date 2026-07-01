/**
 * Built-in extensions that ship with Open Calc Studio.
 * These wrap existing importers as extensions so they appear
 * in the Extension Manager and can be enabled/disabled.
 */
import type { InstalledExtension, ExtensionManifest } from './types';
import { useAppStore } from '../state/appStore';
import { importBasCalcFile } from '../services/importers/bascalcImporter';
import { importRsx } from '../services/importers/rsxImporter';
// WpCalc importer is lazy-loaded because mdb-reader needs Buffer polyfill
// import { importWpCalcFile } from '../services/importers/wpcalcImporter';
import { recalculateItems } from '../services/calculation/calculator';

// ── BasCalc Importer ──

const bascalcManifest: ExtensionManifest = {
  id: 'builtin-bascalc-importer',
  name: 'BasCalc Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Importeer begrotingen uit BasCalc/BasData Excel-bestanden (.xls, .xlsx). Ondersteunt kostprijsblad, staartkosten en bedrijfsgegevens.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['bascalc', 'basdata', 'excel', 'xls', 'import'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2d8a4e" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h3M8 17h3M13 13h3M13 17h3"/></svg>',
};

const wpcalcManifest: ExtensionManifest = {
  id: 'builtin-wpcalc-importer',
  name: 'WpCalc Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Importeer begrotingen uit WpCalc (.calc) bestanden. Leest hoofdstukken, posten, staartkosten en tariefgroepen uit de Access-database.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['wpcalc', 'calc', 'access', 'mdb', 'import', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const inschrijfstaatManifest: ExtensionManifest = {
  id: 'builtin-inschrijfstaat-importer',
  name: 'Inschrijfstaat Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Importeer inschrijfstaten uit RAW Excel-bestanden (.xls, .xlsx). Leest besteksposten, hoeveelheden en prijzen.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['inschrijfstaat', 'raw', 'excel', 'xls', 'import'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const wpcalcExporterManifest: ExtensionManifest = {
  id: 'builtin-wpcalc-exporter',
  name: 'WpCalc Exporter',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Exporteer begrotingen naar WpCalc (.calc) Access-bestanden. Schrijft hoofdstukken, posten, staartkosten en tariefgroepen.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events', 'filesystem'],
  tags: ['wpcalc', 'calc', 'access', 'mdb', 'export', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><polyline points="17 8 12 3 7 8" stroke="#f59e0b" stroke-width="1.5"/></svg>',
};

const xtbManifest: ExtensionManifest = {
  id: 'builtin-xtb-importer',
  name: 'IBIS-TRAD Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Importeer begrotingen uit IBIS-TRAD (.xtb) SQLite-bestanden. Leest hoofdstukken, posten, kostenposten, middelen (arbeid/materiaal/materieel/onderaanneming) en uurloon-codes.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['ibis', 'ibis-trad', 'xtb', 'sqlite', 'import', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><ellipse cx="12" cy="14" rx="4" ry="2"/><path d="M8 14v3a4 2 0 008 0v-3"/></svg>',
};

const dncManifest: ExtensionManifest = {
  id: 'builtin-dnc-importer',
  name: 'DNC Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Importeer STABU-directiebegrotingen uit .dnc-bestanden (7z-archief met dBASE-tabellen). Leest hoofdstukken, posten en middelen (arbeid/materiaal/onderaanneming), uurtarief, staartpercentages en kengetallen.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['dnc', 'stabu', 'directiebegroting', 'dbase', '7z', 'import', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const rsxManifest: ExtensionManifest = {
  id: 'builtin-rsx-importer',
  name: 'RAW Bestek Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: 'Open Calc Studio',
  description: 'Importeer RAW bestekken uit .rsx bestanden. Converteert besteksposten, hoofdstukken en hoeveelheden naar Open Calc Studio formaat.',
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['raw', 'bestek', 'rsx', 'import', 'gww'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>',
};

/**
 * Register built-in extensions on first startup.
 * Unlike user extensions (stored in IndexedDB), these are always available
 * and are registered directly in the Zustand store.
 */
export function registerBuiltinExtensions(): void {
  const store = useAppStore.getState();

  // BasCalc Importer
  const bascalcExt: InstalledExtension = {
    id: 'builtin-bascalc-importer',
    manifest: bascalcManifest,
    status: 'enabled',
  };
  store.registerExtension(bascalcExt);
  store.addExtensionImporter({
    extensionId: 'builtin-bascalc-importer',
    id: 'bascalc-import',
    name: 'BasCalc / BasData (.xls)',
    description: 'Importeer begrotingen uit BasCalc/BasData Excel-bestanden',
    fileExtensions: ['.xls', '.xlsx'],
    icon: bascalcManifest.icon,
    handler: async (file: File) => {
      const buffer = await file.arrayBuffer();
      const result = importBasCalcFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // WpCalc Importer
  const wpcalcExt: InstalledExtension = {
    id: 'builtin-wpcalc-importer',
    manifest: wpcalcManifest,
    status: 'enabled',
  };
  store.registerExtension(wpcalcExt);
  store.addExtensionImporter({
    extensionId: 'builtin-wpcalc-importer',
    id: 'wpcalc-import',
    name: 'WpCalc (.calc)',
    description: 'Importeer begrotingen uit WpCalc Access-bestanden',
    fileExtensions: ['.calc', '.mdb'],
    icon: wpcalcManifest.icon,
    handler: async (file: File) => {
      const { importWpCalcFile } = await import('../services/importers/wpcalcImporter');
      const buffer = await file.arrayBuffer();
      const result = importWpCalcFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // RSX Importer
  const rsxExt: InstalledExtension = {
    id: 'builtin-rsx-importer',
    manifest: rsxManifest,
    status: 'enabled',
  };
  store.registerExtension(rsxExt);
  store.addExtensionImporter({
    extensionId: 'builtin-rsx-importer',
    id: 'rsx-import',
    name: 'RAW Bestek (.rsx)',
    description: 'Importeer RAW bestekken uit .rsx bestanden',
    fileExtensions: ['.rsx'],
    icon: rsxManifest.icon,
    handler: async (file: File) => {
      const text = await file.text();
      const result = importRsx(text);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // Inschrijfstaat Importer
  const inschrijfstaatExt: InstalledExtension = {
    id: 'builtin-inschrijfstaat-importer',
    manifest: inschrijfstaatManifest,
    status: 'enabled',
  };
  store.registerExtension(inschrijfstaatExt);
  store.addExtensionImporter({
    extensionId: 'builtin-inschrijfstaat-importer',
    id: 'inschrijfstaat-import',
    name: 'Inschrijfstaat (.xls)',
    description: 'Importeer inschrijfstaten uit RAW Excel-bestanden',
    fileExtensions: ['.xls', '.xlsx'],
    icon: inschrijfstaatManifest.icon,
    handler: async (file: File) => {
      const { importInschrijfstaatFile } = await import('../services/importers/inschrijfstaatImporter');
      const buffer = await file.arrayBuffer();
      const result = await importInschrijfstaatFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // WpCalc Exporter (informational registration — export is handled in Backstage)
  const wpcalcExporterExt: InstalledExtension = {
    id: 'builtin-wpcalc-exporter',
    manifest: wpcalcExporterManifest,
    status: 'enabled',
  };
  store.registerExtension(wpcalcExporterExt);

  // DNC (STABU-directiebegroting) Importer
  const dncExt: InstalledExtension = {
    id: 'builtin-dnc-importer',
    manifest: dncManifest,
    status: 'enabled',
  };
  store.registerExtension(dncExt);
  store.addExtensionImporter({
    extensionId: 'builtin-dnc-importer',
    id: 'dnc-import',
    name: 'STABU-directiebegroting (.dnc)',
    description: 'Importeer STABU-directiebegrotingen uit .dnc-bestanden',
    fileExtensions: ['.dnc'],
    icon: dncManifest.icon,
    handler: async (file: File) => {
      const { importDncFile } = await import('../services/importers/dncImporter');
      const buffer = await file.arrayBuffer();
      const result = await importDncFile(buffer, file.name);
      // Een .dnc is een STABU-directiebegroting → toon meteen het bijpassende
      // directiebegroting-rapport in plaats van het standaard (Bouw 1) rapport.
      useAppStore.getState().setReportView('directie');
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items, result.schedule.tarieven),
      };
    },
  });

  // IBIS-TRAD .xtb Importer
  const xtbExt: InstalledExtension = {
    id: 'builtin-xtb-importer',
    manifest: xtbManifest,
    status: 'enabled',
  };
  store.registerExtension(xtbExt);
  store.addExtensionImporter({
    extensionId: 'builtin-xtb-importer',
    id: 'xtb-import',
    name: 'IBIS-TRAD (.xtb)',
    description: 'Importeer IBIS-TRAD begrotingen uit .xtb SQLite-bestanden',
    fileExtensions: ['.xtb'],
    icon: xtbManifest.icon,
    handler: async (file: File) => {
      const { importXtbFile } = await import('../services/importers/xtbImporter');
      const buffer = await file.arrayBuffer();
      const result = await importXtbFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
      };
    },
  });
}
