/**
 * MCP Bridge — listens for Tauri events from the Rust WebSocket bridge
 * and applies mutations to the Zustand store so the UI updates live.
 */
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';

/** Shape of the payload emitted by the Rust WS bridge. */
interface McpMutation {
  action: string;
  data: Record<string, unknown>;
}

/**
 * Initialize the MCP bridge. Call once on app mount.
 * Returns a cleanup function to remove the event listener.
 */
export async function initMcpBridge(): Promise<() => void> {
  // Only works inside Tauri
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlistenFn = await listen<McpMutation>('mcp-mutation', (event) => {
      handleMutation(event.payload);
    });
    console.log('[MCP Bridge] Listening for mcp-mutation events');
    return () => {
      unlistenFn();
    };
  } catch {
    // Not running in Tauri (e.g. browser dev mode)
    console.log('[MCP Bridge] Not in Tauri environment, bridge inactive');
    return () => {};
  }
}

function handleMutation(mutation: McpMutation) {
  const { action, data } = mutation;
  const store = useAppStore.getState();

  console.log(`[MCP Bridge] Received action: ${action}`, data);

  switch (action) {
    case 'set_items':
      // Replace all items — ensure a document exists first
      if (Array.isArray(data.items)) {
        if (!store.activeDocumentId || store.documents.length === 0) {
          store.addDocument({ fileName: 'MCP Budget' });
        }
        store.setItems(data.items as CostItem[]);
        store.recalculate();
      }
      break;

    case 'open_budget':
      // Full budget load: create document tab, set schedule + items
      {
        const fileName = (data.fileName as string) || (data.schedule as any)?.name || 'MCP Budget';
        const filePath = (data.filePath as string) || undefined;
        store.addDocument({ fileName, filePath });
        if (data.schedule) {
          store.setSchedule(data.schedule as any);
        }
        if (Array.isArray(data.items)) {
          store.setItems(data.items as CostItem[]);
        }
        store.recalculate();
      }
      break;

    case 'add_chapter': {
      const parentId = (data.parentId as string) ?? null;
      const newId = store.addChapter(parentId);
      // If the MCP sent description/code, update immediately
      if (data.description && newId) {
        store.updateItem(newId, 'description', data.description as string);
      }
      if (data.code && newId) {
        store.updateItem(newId, 'code', data.code as string);
      }
      break;
    }

    case 'add_item': {
      const parentId = data.parentId as string;
      if (!parentId) break;

      const rowType = (data.rowType as string) ?? 'begrotingspost';
      let newId: string;

      if (rowType === 'bewakingspost') {
        newId = store.addBewakingspost(parentId);
      } else if (rowType === 'regel') {
        newId = store.addRegel(parentId);
      } else {
        newId = store.addItem(parentId);
      }

      if (!newId) break;

      // Apply provided fields
      const fields = ['description', 'code', 'unit', 'quantity', 'normUnitPrice',
        'normQuantity', 'normFactor', 'normDivisor', 'resourceType', 'tariefGroep'] as const;
      for (const field of fields) {
        if (data[field] !== undefined && data[field] !== null) {
          store.updateItem(newId, field, data[field] as string | number);
        }
      }
      break;
    }

    case 'update_item': {
      const id = data.id as string;
      if (!id) break;

      const updateFields = ['description', 'code', 'unit', 'quantity', 'normUnitPrice',
        'normQuantity', 'normFactor', 'normDivisor', 'resourceType', 'tariefGroep'] as const;
      for (const field of updateFields) {
        if (data[field] !== undefined) {
          store.updateItem(id, field, data[field] as string | number | null);
        }
      }
      break;
    }

    case 'remove_item': {
      const id = data.id as string;
      if (id) {
        store.deleteItem(id);
      }
      break;
    }

    case 'update_schedule': {
      // Update schedule fields
      if (data && typeof data === 'object') {
        const schedule = store.schedule;
        const updated = { ...schedule };
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) {
            (updated as any)[k] = v;
          }
        }
        store.setSchedule(updated);
      }
      break;
    }

    case 'recalculate':
      store.recalculate();
      break;

    default:
      console.warn(`[MCP Bridge] Unknown action: ${action}`);
  }
}
