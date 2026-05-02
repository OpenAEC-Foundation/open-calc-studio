import type { CostItem, CostSchedule } from '@/types/costModel';

export interface ImportResult {
  schedule: Partial<CostSchedule>;
  items: CostItem[];
  warnings: string[];
  format: 'cuf' | 'tradxml' | 'rsx';
}
