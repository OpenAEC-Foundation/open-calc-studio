import { uiText } from '../../i18n/uiText';
import type { StateCreator } from 'zustand';
import type { ProjectSnapshot, SnapshotDiff, CostItem } from '@/types/costModel';

function genId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtDate(d: Date): string {
  return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
}

/** Compare two item arrays and produce diffs */
function computeDiffs(oldItems: CostItem[], newItems: CostItem[]): SnapshotDiff[] {
  const diffs: SnapshotDiff[] = [];
  const oldMap = new Map(oldItems.map(i => [i.id, i]));
  const newMap = new Map(newItems.map(i => [i.id, i]));

  // Removed items
  for (const old of oldItems) {
    if (!newMap.has(old.id)) {
      diffs.push({
        type: 'removed',
        itemId: old.id,
        description: uiText('versions.removed', "Removed: {{p0}} {{p1}}", { p0: old.nr || '', p1: old.description }),
      });
    }
  }

  // Added items
  for (const item of newItems) {
    if (!oldMap.has(item.id)) {
      diffs.push({
        type: 'added',
        itemId: item.id,
        description: uiText('versions.added', "Added: {{p0}} {{p1}}", { p0: item.nr || '', p1: item.description }),
      });
    }
  }

  // Changed items
  for (const item of newItems) {
    const old = oldMap.get(item.id);
    if (!old) continue;

    // Check key fields
    const fields: { key: keyof CostItem; label: string }[] = [
      { key: 'description', label: uiText('versions.description', "Description") },
      { key: 'quantity', label: uiText('versions.quantity', "Quantity") },
      { key: 'unitPrice', label: uiText('versions.unitPrice', "Unit price") },
      { key: 'total', label: uiText('versions.total', "Total") },
      { key: 'materialPrice', label: uiText('versions.materials', "Material price") },
      { key: 'laborPrice', label: uiText('versions.labour', "Labour price") },
      { key: 'unit', label: uiText('versions.unit', "Unit") },
    ];

    for (const f of fields) {
      const oldVal = old[f.key];
      const newVal = item[f.key];
      if (oldVal !== newVal) {
        diffs.push({
          type: 'changed',
          itemId: item.id,
          field: f.key,
          oldValue: oldVal as any,
          newValue: newVal as any,
          description: uiText('versions.changed', "{{p0}} {{p1}}: {{p2}} changed", { p0: item.nr || '', p1: item.description, p2: f.label }),
        });
      }
    }
  }

  return diffs;
}

export interface VersionSlice {
  snapshots: ProjectSnapshot[];
  selectedSnapshotId: string | null;

  createSnapshot: (label: string, type: ProjectSnapshot['type'], notitie?: string) => void;
  deleteSnapshot: (id: string) => void;
  setSelectedSnapshot: (id: string | null) => void;
  setSnapshots: (s: ProjectSnapshot[]) => void;
  getDiffsWithCurrent: (snapshotId: string) => SnapshotDiff[];
  getDiffsBetween: (oldId: string, newId: string) => SnapshotDiff[];
}

export const createVersionSlice: StateCreator<VersionSlice> = (set, get) => ({
  snapshots: [],
  selectedSnapshotId: null,

  createSnapshot: (label, type, notitie) => {
    const state = get() as any; // Full AppStore at runtime
    const now = new Date();
    const defaultLabel = label || uiText('versions.version', "Version {{p0}}", { p0: fmtDate(now) });

    // Calculate total
    const topChapters = state.items.filter((i: CostItem) => i.rowType === 'chapter' && i.depth === 0);
    const totaalExclBtw = topChapters.reduce((sum: number, i: CostItem) => sum + i.total, 0);

    const snapshot: ProjectSnapshot = {
      id: genId(),
      label: defaultLabel,
      timestamp: now.toISOString(),
      type,
      notitie: notitie || '',
      schedule: JSON.parse(JSON.stringify(state.schedule)),
      items: JSON.parse(JSON.stringify(state.items)),
      offerte: state.offerte ? JSON.parse(JSON.stringify(state.offerte)) : undefined,
      totaalExclBtw,
    };

    set((s) => ({ snapshots: [...s.snapshots, snapshot] }));
  },

  deleteSnapshot: (id) => set((s) => ({
    snapshots: s.snapshots.filter(snap => snap.id !== id),
    selectedSnapshotId: s.selectedSnapshotId === id ? null : s.selectedSnapshotId,
  })),

  setSelectedSnapshot: (id) => set({ selectedSnapshotId: id }),
  setSnapshots: (snapshots) => set({ snapshots }),

  getDiffsWithCurrent: (snapshotId) => {
    const state = get() as any;
    const snapshot = state.snapshots.find((s: ProjectSnapshot) => s.id === snapshotId);
    if (!snapshot) return [];
    return computeDiffs(snapshot.items, state.items);
  },

  getDiffsBetween: (oldId, newId) => {
    const state = get();
    const oldSnap = state.snapshots.find(s => s.id === oldId);
    const newSnap = state.snapshots.find(s => s.id === newId);
    if (!oldSnap || !newSnap) return [];
    return computeDiffs(oldSnap.items, newSnap.items);
  },
});
