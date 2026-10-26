/** Browser-independent API. Safe to import in Node.js, workers and servers. */
import type { ProjectFile } from '../types/costModel';
import { recalculateItems } from '../services/calculation/calculator';

/** Recalculate a project without mutating the input or changing its metadata. */
export function calculateProject(project: ProjectFile): ProjectFile {
  return {
    ...project,
    items: recalculateItems(project.items, project.schedule.tarieven),
  };
}

export {
  recalculateItems, normalizeItemOrder, getKostprijs, getGrandTotal,
  getStaartBreakdown, computeKostprijsBreakdown, computeStaartItemBreakdowns,
} from '../services/calculation/calculator';
export type { KostprijsBreakdown, StaartBreakdown } from '../services/calculation/calculator';
export { serializeProject, deserializeProject } from '../services/file/fileService';
export type {
  ProjectFile, CostItem, CostSchedule, CompanyInfo, CostUnit, RowType,
  ResourceType, SubSheet, SpreadsheetsData,
} from '../types/costModel';
