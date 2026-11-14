import { describe, it, expect } from 'vitest';
import { buildExportRequest } from '@/services/export/wpcalcExporter';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { DEFAULT_TARIEVEN } from '@/services/calculation/calculator';
import type { CostSchedule } from '@/types/costModel';

// Knownbug 287: de WpCalc-export las de ruwe tarieventabel. Zonder (of met een
// lege) tabel stuurde hij `null`/`{}` naar Rust, dat per groep op tarief 0
// terugvalt: loon 0 en geen rijen in de tabel `tarieven`. De app rekent dan
// met de standaardtarieven (effectiveTarieven), het bestand dus lager.
function schedule(tarieven: Record<string, number> | undefined): CostSchedule {
  return { ...createDefaultSchedule(), name: 'Test', tarieven } as CostSchedule;
}

describe('WpCalc-export: tarieven (knownbug 287)', () => {
  it('stuurt de standaardtarieven mee bij een lege tabel', () => {
    const req = buildExportRequest(schedule({}), []);
    expect(req.schedule.tarieven).toEqual({ A: 64, B: 43, C: 82 });
  });

  it('stuurt de standaardtarieven mee als de tabel ontbreekt', () => {
    const req = buildExportRequest(schedule(undefined), []);
    expect(req.schedule.tarieven).toEqual({ ...DEFAULT_TARIEVEN });
  });

  it('laat een eigen tabel ongemoeid', () => {
    const req = buildExportRequest(schedule({ A: 55, D: 70 }), []);
    expect(req.schedule.tarieven).toEqual({ A: 55, D: 70 });
  });
});
