import type { CostItem } from '../../types/costModel';

export type ExchangeFormat = 'xpwe' | 'xc4';
/** Embedded provenance survives saving/reopening .ifcCalc; no external sidecar needed. */
export interface BudgetExchangeSource {
  version: 1;
  format: ExchangeFormat;
  source: string;
  fileName: string;
  /** These imports contain direct costs, not inferred national taxes/overheads. */
  directCostsOnly: true;
  snapshot: CostItem[];
  references?: Record<string, string>;
  scheduleSnapshot: { name: string; currency: string };
}
