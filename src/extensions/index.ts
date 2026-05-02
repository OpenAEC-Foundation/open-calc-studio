export type {
  ExtensionManifest,
  ExtensionPlugin,
  ExtensionApi,
  ExtensionCategory,
  ExtensionPermission,
  ExtensionStatus,
  InstalledExtension,
  ImporterDefinition,
  ImportResult,
  RibbonButtonRegistration,
  BackstagePanelRegistration,
  CatalogEntry,
  ExtensionCatalog,
} from './types';

export { createExtensionApi, emitExtensionEvent } from './extensionApi';
export {
  loadAllExtensions,
  enableExtension,
  disableExtension,
  getActivePlugins,
} from './extensionLoader';
export {
  fetchCatalog,
  installFromCatalog,
  installFromFile,
  installFromJsFile,
  removeExtension,
} from './extensionService';
