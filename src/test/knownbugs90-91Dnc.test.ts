// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildDncImport, type DbfRecord } from '@/services/importers/dncImporter';
import { recalculateItems } from '@/services/calculation/calculator';

const VU: DbfRecord[] = [{ OMSCHRIJF: '0e uurtarief', WAARDE: '55.00' }];

describe('DNC-import (knownbugs 90, 91)', () => {
  it('neemt negatieve KU-bedragen mee (knownbug 90)', () => {
    const kk: DbfRecord = { CODE2: '21.11.11-a.01>a', TITEL: 'Beton', HOEV1: '10', EENH: 'm3', TOTAAL: '900.00', TOT1: '0', TOT2: '900.00', TOT4: '0' };
    const ku: DbfRecord[] = [
      { CODE2: '21.11.11-a.01>a', TITEL: 'Betonmortel', HOEV1: '10', EENH: 'm3', GETAL1: '0', GETAL2: '100', GETAL3: '0', GETAL4: '0' },
      { CODE2: '21.11.11-a.01>a', TITEL: 'Korting leverancier', HOEV1: '10', EENH: 'm3', GETAL1: '0', GETAL2: '-10', GETAL3: '0', GETAL4: '0' },
    ];
    const recalced = recalculateItems(buildDncImport({ KK: [kk], KU: ku, VU }).items);
    const korting = recalced.find((i) => i.description === 'Korting leverancier');
    expect(korting?.resourceType).toBe('materiaal');
    expect(korting?.total).toBeCloseTo(-100, 6);
    expect(recalced.find((i) => i.rowType === 'begrotingspost')!.total).toBeCloseTo(900, 6);
  });

  it('neemt TOT3 (materieel) mee in de terugvalsamenvatting (knownbug 91)', () => {
    // Geen KU-detail → samenvatting uit de KK-totalen; TOTAAL = TOT1+TOT2+TOT3+TOT4.
    const kk: DbfRecord = { CODE2: '21.11.11-a.01>a', TITEL: 'Beton', HOEV1: '10', EENH: 'm3', TOTAAL: '1000.00', TOT1: '300.00', TOT2: '500.00', TOT3: '150.00', TOT4: '50.00' };
    const recalced = recalculateItems(buildDncImport({ KK: [kk], KU: [], VU }).items);
    const post = recalced.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.total).toBeCloseTo(1000, 6);
    const materieel = recalced.find((i) => i.parentId === post.id && i.resourceType === 'materieel');
    expect(materieel?.total).toBeCloseTo(150, 6);
  });

  it('laat TOT3 weg als TOTAAL juist zonder TOT3 klopt (geen dubbeltelling)', () => {
    // TOTAAL = TOT1+TOT2+TOT4; TOT3 is hier dus iets anders dan een vierde kolom.
    const kk: DbfRecord = { CODE2: '21.11.11-a.01>a', TITEL: 'Beton', HOEV1: '10', EENH: 'm3', TOTAAL: '850.00', TOT1: '300.00', TOT2: '500.00', TOT3: '150.00', TOT4: '50.00' };
    const recalced = recalculateItems(buildDncImport({ KK: [kk], KU: [], VU }).items);
    const post = recalced.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.total).toBeCloseTo(850, 6);
    expect(recalced.some((i) => i.parentId === post.id && i.resourceType === 'materieel')).toBe(false);
  });
});
