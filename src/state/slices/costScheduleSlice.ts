import type { StateCreator } from 'zustand';
import type { CostSchedule, ProjectProperty, Branch } from '@/types/costModel';
import { createDefaultProjectProperties } from '@/types/costModel';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';

export interface CostScheduleSlice {
  schedule: CostSchedule;
  setSchedule: (schedule: Partial<CostSchedule>) => void;
  resetSchedule: () => void;
  updateTarieven: (tarieven: Record<string, number>) => void;
  updateProjectProperty: (id: string, field: keyof ProjectProperty, value: any) => void;
  addProjectProperty: () => void;
  removeProjectProperty: (id: string) => void;
  // Wijzigingen bijhouden ("track changes")
  /** Zet wijzigingen-bijhouden aan (baseline = nu) of uit (wist de markeringen). */
  toggleChangeTracking: () => void;
  /** Wis de huidige markeringen maar blijf bijhouden (baseline naar nu). */
  clearChangeMarks: () => void;
  /** Hoe gewijzigde regels gemarkeerd worden: hele regel of alleen de cel. */
  setChangeDisplayMode: (mode: 'row' | 'cell') => void;
  /** Of wijzigingsmarkeringen ook in de rapportage-PDF getoond worden. */
  setReportShowChanges: (show: boolean) => void;
  // Branches (budget variants)
  toggleBranchesEnabled: () => void;
  addBranch: (name: string, parentId: string | null) => string;
  removeBranch: (id: string) => void;
  renameBranch: (id: string, name: string) => void;
  setActiveBranch: (id: string | undefined) => void;
}

export const createCostScheduleSlice: StateCreator<CostScheduleSlice> = (set, get) => {
  /** Markeer het actieve document als gewijzigd (zelfde API als costItemsSlice). */
  const markModified = () => {
    const s = get() as any;
    if (s.activeDocumentId && s.updateDocument) {
      s.updateDocument(s.activeDocumentId, { isModified: true });
    }
  };

  return {
  schedule: createDefaultSchedule(),
  setSchedule: (partial) =>
    set((state) => ({ schedule: { ...state.schedule, ...partial } })),
  resetSchedule: () => set({ schedule: createDefaultSchedule() }),

  toggleChangeTracking: () => {
    set((state) => ({
      schedule: {
        ...state.schedule,
        changeTrackingSince: state.schedule.changeTrackingSince ? null : new Date().toISOString(),
      },
    }));
    markModified();
  },

  clearChangeMarks: () => {
    if (!get().schedule.changeTrackingSince) return;
    set((state) => ({
      schedule: { ...state.schedule, changeTrackingSince: new Date().toISOString() },
    }));
    markModified();
  },

  setChangeDisplayMode: (mode) => {
    set((state) => ({ schedule: { ...state.schedule, changeDisplayMode: mode } }));
    markModified();
  },

  setReportShowChanges: (show) => {
    set((state) => ({ schedule: { ...state.schedule, reportShowChanges: show } }));
    markModified();
  },
  updateProjectProperty: (id, field, value) =>
    set((state) => {
      const props = (state.schedule.projectProperties ?? createDefaultProjectProperties()).map((p) =>
        p.id === id ? { ...p, [field]: value } : p,
      );
      return { schedule: { ...state.schedule, projectProperties: props } };
    }),
  addProjectProperty: () =>
    set((state) => {
      const props = [...(state.schedule.projectProperties ?? createDefaultProjectProperties())];
      props.push({
        id: crypto.randomUUID(),
        name: '',
        value: null,
        unit: '',
        isDefault: false,
      });
      return { schedule: { ...state.schedule, projectProperties: props } };
    }),
  removeProjectProperty: (id) =>
    set((state) => {
      const props = (state.schedule.projectProperties ?? createDefaultProjectProperties()).filter(
        (p) => p.id !== id,
      );
      return { schedule: { ...state.schedule, projectProperties: props } };
    }),
  toggleBranchesEnabled: () =>
    set((state) => ({
      schedule: {
        ...state.schedule,
        branchesEnabled: !state.schedule.branchesEnabled,
        // Initialize with main branch if toggling on and no branches exist
        branches: !state.schedule.branchesEnabled && (!state.schedule.branches || state.schedule.branches.length === 0)
          ? [{ id: 'main', name: 'main', parentId: null, color: '#3b82f6' }]
          : state.schedule.branches,
      },
    })),
  addBranch: (name, parentId) => {
    const id = crypto.randomUUID();
    const branch: Branch = { id, name, parentId };
    set((state) => ({
      schedule: {
        ...state.schedule,
        branches: [...(state.schedule.branches ?? []), branch],
      },
    }));
    return id;
  },
  removeBranch: (id) =>
    set((state) => {
      if (id === 'main') return state; // cannot remove main
      // Remove branch and all descendants
      const toRemove = new Set<string>([id]);
      let changed = true;
      const branches = state.schedule.branches ?? [];
      while (changed) {
        changed = false;
        for (const b of branches) {
          if (b.parentId && toRemove.has(b.parentId) && !toRemove.has(b.id)) {
            toRemove.add(b.id);
            changed = true;
          }
        }
      }
      return {
        schedule: {
          ...state.schedule,
          branches: branches.filter(b => !toRemove.has(b.id)),
          activeBranchId: toRemove.has(state.schedule.activeBranchId ?? '') ? undefined : state.schedule.activeBranchId,
        },
      };
    }),
  renameBranch: (id, name) =>
    set((state) => ({
      schedule: {
        ...state.schedule,
        branches: (state.schedule.branches ?? []).map(b => b.id === id ? { ...b, name } : b),
      },
    })),
  setActiveBranch: (id) =>
    set((state) => ({
      schedule: { ...state.schedule, activeBranchId: id },
    })),
  updateTarieven: (tarieven) => {
    const state = get() as any;
    const newSchedule = { ...state.schedule, tarieven };
    const newItems = recalculateItems(state.items, tarieven);
    set({ schedule: newSchedule, items: newItems } as any);
    // Markeer het actieve document als gewijzigd (documents is een array
    // met isModified; de oude Map/activeDocId-variant was dode code).
    if (state.activeDocumentId && state.updateDocument) {
      state.updateDocument(state.activeDocumentId, { isModified: true });
    }
  },
  };
};
