/**
 * MCP Bridge — listens for Tauri events from the Rust WebSocket bridge
 * and applies mutations to the Zustand store so the UI updates live.
 */
import { useAppStore } from '@/state/appStore';
import type { CostItem, ResourceLibraryItem, SubSheetCell } from '@/types/costModel';

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
    const { invoke } = await import('@tauri-apps/api/core');

    const unlistenFn = await listen<McpMutation>('mcp-mutation', (event) => {
      handleMutation(event.payload);
    });
    console.log('[MCP Bridge] Listening for mcp-mutation events');

    // Push state snapshots to the Tauri-side `api_push_state` command so the
    // REST API can serve live data. Debounced to a few hundred ms to batch
    // bursts of mutations.
    let pushTimer: ReturnType<typeof setTimeout> | null = null;
    const pushSnapshot = () => {
      const s = useAppStore.getState();
      const payload = {
        schedule: s.schedule,
        items: s.items,
        companyInfo: s.companyInfo,
        subSheets: s.subSheets ?? [],
        branches: s.schedule?.branches ?? [],
        branchesEnabled: !!s.schedule?.branchesEnabled,
        activeBranchId: s.schedule?.activeBranchId ?? null,
        resourceLibrary: s.resourceLibrary ?? [],
        documents: (s.documents ?? []).map((d: any) => ({
          id: d.id, fileName: d.fileName, filePath: d.filePath, isModified: d.isModified,
        })),
        activeDocumentId: s.activeDocumentId ?? null,
        staartBreakdown: null,
      };
      invoke('api_push_state', payload).catch((e) =>
        console.warn('[MCP Bridge] api_push_state failed:', e),
      );
    };
    const schedulePush = () => {
      if (pushTimer) return;
      pushTimer = setTimeout(() => {
        pushTimer = null;
        pushSnapshot();
      }, 200);
    };
    // Push once on init
    pushSnapshot();
    // Push on every store change
    const unsubscribe = useAppStore.subscribe(schedulePush);

    return () => {
      unlistenFn();
      unsubscribe();
      if (pushTimer) clearTimeout(pushTimer);
    };
  } catch (e) {
    // Not running in Tauri (e.g. browser dev mode)
    console.log('[MCP Bridge] Not in Tauri environment, bridge inactive', e);
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

    // ── Spreadsheet (sub-sheet) actions ──
    case 'add_sheet': {
      const name = (data.name as string) ?? undefined;
      const id = store.addSubSheet(name);
      // If MCP supplied an explicit id, store doesn't know about it — but the
      // Zustand store generated its own. We accept that authoritative state
      // here lives in the UI; MCP shadow id is used only for its own bookkeeping.
      console.log(`[MCP Bridge] add_sheet -> UI id ${id}`);
      break;
    }

    case 'rename_sheet': {
      const id = data.id as string;
      const name = data.name as string;
      if (id && name) store.renameSubSheet(id, name);
      break;
    }

    case 'remove_sheet': {
      const id = data.id as string;
      if (id) store.removeSubSheet(id);
      break;
    }

    case 'set_cell': {
      const sheetId = data.sheetId as string;
      const ref = data.ref as string;
      const value = data.value as string;
      if (sheetId && ref) store.setSubSheetCell(sheetId, ref, value ?? '');
      break;
    }

    case 'set_cells_batch': {
      const sheetId = data.sheetId as string;
      const cells = data.cells as Array<{ ref: string; value: string }> | undefined;
      if (sheetId && Array.isArray(cells)) {
        const existing = store.subSheets.find((s) => s.id === sheetId);
        const merged: Record<string, SubSheetCell> = { ...(existing?.cells ?? {}) };
        for (const c of cells) {
          merged[c.ref] = { value: c.value };
        }
        store.setSubSheetCells(sheetId, merged);
      }
      break;
    }

    // ── Branches ──
    case 'add_branch': {
      const name = (data.name as string) ?? 'branch';
      const parentId = (data.parentId as string | null) ?? null;
      store.addBranch(name, parentId);
      break;
    }

    case 'remove_branch': {
      const id = data.id as string;
      if (id) store.removeBranch(id);
      break;
    }

    case 'rename_branch': {
      const id = data.id as string;
      const name = data.name as string;
      if (id && name) store.renameBranch(id, name);
      break;
    }

    case 'set_active_branch': {
      const id = (data.id as string) ?? undefined;
      store.setActiveBranch(id);
      break;
    }

    case 'toggle_branches_enabled':
      store.toggleBranchesEnabled();
      break;

    // ── Company / Project info ──
    case 'update_company_info': {
      const ci = { ...store.companyInfo };
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) (ci as any)[k] = v;
      }
      store.setCompanyInfo(ci);
      break;
    }

    // ── Resource library ──
    case 'add_resource': {
      const item = data.item as ResourceLibraryItem | undefined;
      if (item) {
        store.setResourceLibrary([...store.resourceLibrary, item]);
      }
      break;
    }

    case 'update_resource': {
      const id = data.id as string;
      const partial = data.partial as Partial<ResourceLibraryItem> | undefined;
      if (id && partial) {
        store.setResourceLibrary(
          store.resourceLibrary.map((r) => (r.id === id ? { ...r, ...partial } : r)),
        );
      }
      break;
    }

    case 'remove_resource': {
      const id = data.id as string;
      if (id) store.setResourceLibrary(store.resourceLibrary.filter((r) => r.id !== id));
      break;
    }

    case 'set_resource_library': {
      const items = data.items as ResourceLibraryItem[] | undefined;
      if (Array.isArray(items)) store.setResourceLibrary(items);
      break;
    }

    // ── Tree manipulation ──
    case 'move_items': {
      const ids = data.ids as string[] | undefined;
      const targetId = data.targetId as string;
      const position = data.position as 'before' | 'after' | 'inside' | undefined;
      if (Array.isArray(ids) && targetId && position) {
        store.moveItems(ids, targetId, position);
      }
      break;
    }

    case 'indent_item': {
      const id = data.id as string;
      if (id) store.indentItem(id);
      break;
    }

    case 'outdent_item': {
      const id = data.id as string;
      if (id) store.outdentItem(id);
      break;
    }

    case 'toggle_collapse': {
      const id = data.id as string;
      if (id) store.toggleCollapse(id);
      break;
    }

    // ── Document tabs ──
    case 'add_document': {
      const fileName = (data.fileName as string) ?? 'Nieuwe begroting';
      const filePath = (data.filePath as string | null) ?? null;
      store.addDocument({ fileName, filePath });
      break;
    }

    case 'switch_document': {
      const id = data.id as string;
      if (id) store.setActiveDocument(id);
      break;
    }

    case 'remove_document': {
      const id = data.id as string;
      if (id) store.removeDocument(id);
      break;
    }

    // ── Misc no-op / logging passthroughs ──
    case 'import_nsx':
      console.log('[MCP Bridge] NSX import received; no integration slice yet');
      break;

    default:
      console.warn(`[MCP Bridge] Unknown action: ${action}`);
  }
}
