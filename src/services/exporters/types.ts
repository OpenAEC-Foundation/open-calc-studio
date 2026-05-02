import type { CostItem, CostSchedule } from '@/types/costModel';

export interface ExportInput {
  schedule: CostSchedule;
  items: CostItem[];
}

export interface ExportResult {
  xml: string;
  format: 'cuf' | 'tradxml' | 'rsx';
  warnings: string[];
}
