/**
 * Creates a scoped API instance for each extension.
 * Provides controlled access to app functionality.
 */
import type {
  ExtensionApi,
  ExtensionPermission,
  ImporterDefinition,
  RibbonButtonRegistration,
  BackstagePanelRegistration,
} from './types';
import { useAppStore } from '../state/appStore';
import { recalculateItems } from '../services/calculation/calculator';

type EventListener = (data: any) => void;

// Global event bus for extensions
const eventListeners = new Map<string, Set<EventListener>>();

export function emitExtensionEvent(event: string, data?: any) {
  eventListeners.get(event)?.forEach((fn) => fn(data));
}

export function createExtensionApi(
  extensionId: string,
  permissions: ExtensionPermission[],
): ExtensionApi {
  const cleanupFns: (() => void)[] = [];

  function requirePermission(perm: ExtensionPermission) {
    if (!permissions.includes(perm)) {
      throw new Error(`Extension "${extensionId}" lacks permission: ${perm}`);
    }
  }

  // Scoped settings storage (localStorage-based)
  const settingsPrefix = `ext:${extensionId}:`;

  const api: ExtensionApi = {
    extensionId,

    importers: {
      register(def: ImporterDefinition) {
        const store = useAppStore.getState();
        store.addExtensionImporter({ ...def, extensionId });
        cleanupFns.push(() => {
          useAppStore.getState().removeExtensionImporter(extensionId, def.id);
        });
      },
      unregister(id: string) {
        useAppStore.getState().removeExtensionImporter(extensionId, id);
      },
    },

    data: {
      getItems() {
        return useAppStore.getState().items;
      },
      getSchedule() {
        return useAppStore.getState().schedule;
      },
      setItems(items: any[]) {
        useAppStore.getState().setItems(items);
      },
      setSchedule(schedule: any) {
        useAppStore.getState().setSchedule(schedule);
      },
      recalculate() {
        const store = useAppStore.getState();
        store.setItems(recalculateItems(store.items));
      },
      pushHistory(label: string) {
        const store = useAppStore.getState();
        store.pushHistory(store.items, label);
      },
    },

    events: {
      on(event: string, listener: EventListener) {
        requirePermission('events');
        if (!eventListeners.has(event)) {
          eventListeners.set(event, new Set());
        }
        eventListeners.get(event)!.add(listener);
        const unsub = () => eventListeners.get(event)?.delete(listener);
        cleanupFns.push(unsub);
        return unsub;
      },
      off(event: string, listener: EventListener) {
        eventListeners.get(event)?.delete(listener);
      },
      emit(event: string, data?: any) {
        requirePermission('events');
        emitExtensionEvent(event, data);
      },
    },

    ui: {
      addRibbonButton(reg: RibbonButtonRegistration) {
        requirePermission('ribbon');
        const store = useAppStore.getState();
        store.addExtensionRibbonButton({ ...reg, extensionId });
        cleanupFns.push(() => {
          useAppStore.getState().removeExtensionRibbonButton(extensionId, reg.label);
        });
      },
      addBackstagePanel(reg: BackstagePanelRegistration) {
        requirePermission('backstage');
        const store = useAppStore.getState();
        store.addExtensionBackstagePanel({ ...reg, extensionId });
        cleanupFns.push(() => {
          useAppStore.getState().removeExtensionBackstagePanel(extensionId, reg.id);
        });
      },
      showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info') {
        // Simple notification via console for now; can be wired to toast UI later
        const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`[${extensionId}] ${prefix} ${message}`);
      },
    },

    settings: {
      get<T>(key: string, defaultValue: T): T {
        try {
          const raw = localStorage.getItem(settingsPrefix + key);
          return raw !== null ? JSON.parse(raw) : defaultValue;
        } catch {
          return defaultValue;
        }
      },
      set<T>(key: string, value: T) {
        localStorage.setItem(settingsPrefix + key, JSON.stringify(value));
      },
    },

    _cleanup() {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.length = 0;
      useAppStore.getState().removeAllExtensionUI(extensionId);
    },
  };

  return api;
}
