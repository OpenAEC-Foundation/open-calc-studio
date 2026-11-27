import { describe, expect, it } from 'vitest';
import { generateReport } from '@/services/report/reportGenerator';
import { makeReportContext } from '@/i18n/reportI18n';
import { createDefaultSchedule } from '@/data/defaultBudget';

describe('IFC-rapport afdrukken (knownbug 138)', () => {
  it('de totaalregel (witte tekst op groen) houdt bij afdrukken zijn achtergrond', () => {
    const html = generateReport({ ...createDefaultSchedule(), name: 'T' }, [], makeReportContext('nl'));
    const rule = /\.total-row \{([^}]*)\}/.exec(html)?.[1] ?? '';
    expect(rule).toContain('color: white');
    expect(rule).toMatch(/(^|[^-])print-color-adjust: exact/);
    expect(rule).toContain('-webkit-print-color-adjust: exact');
  });
});
