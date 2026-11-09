import { describe, it, expect } from 'vitest';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';
import { importIfcx } from '@/services/importers/ifcxImporter';
import { recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { createDefaultSchedule } from '@/data/defaultBudget';

function sampleItems() {
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const post = makeCostItem({ parentId: chapter.id, sortOrder: 1, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 10 });
  return recalculateItems([chapter, post]);
}

/** Minimale ifcx-boom met een vrij te kiezen currency-attribuut op de CostSchedule-knoop. */
function ifcxWithCurrency(currencyAttr?: unknown): string {
  const attributes: Record<string, unknown> = { 'bsi::ifc::prop::Name': 'cur-test' };
  if (currencyAttr !== undefined) attributes['ifcx::cost::currency'] = currencyAttr;
  return JSON.stringify({
    data: [{
      path: 'p', inherits: ['IfcProject'], attributes: { 'bsi::ifc::prop::Name': 'proj' },
      children: { CostSchedules: { path: 's', inherits: ['IfcCostSchedule'], attributes, children: {} } },
    }],
  });
}

describe('ifcx importer: budget currency', () => {
  it('round-trips USD (generate → import)', () => {
    const schedule = { ...createDefaultSchedule(), name: 'usd', currency: 'USD' };
    const result = importIfcx(generateIfcxJson(schedule, sampleItems()));
    expect(result.schedule.currency).toBe('USD');
  });

  it('round-trips EUR (generate → import)', () => {
    const schedule = { ...createDefaultSchedule(), name: 'eur', currency: 'EUR' };
    const result = importIfcx(generateIfcxJson(schedule, sampleItems()));
    expect(result.schedule.currency).toBe('EUR');
  });

  it('normalises a lower-case / padded code', () => {
    const result = importIfcx(ifcxWithCurrency({ currency: ' gbp ' }));
    expect(result.schedule.currency).toBe('GBP');
  });

  it('leaves currency undefined when the attribute is missing', () => {
    const result = importIfcx(ifcxWithCurrency());
    expect(result.schedule.currency).toBeUndefined();
  });

  it.each([
    ['a number', { currency: 840 }],
    ['a word', { currency: 'dollars' }],
    ['an empty string', { currency: '' }],
    ['a plain string attribute', 'USD'],
    ['null', null],
    ['an object without currency', { vatRate: 21 }],
  ])('leaves currency undefined for garbage: %s', (_label, attr) => {
    const result = importIfcx(ifcxWithCurrency(attr));
    expect(result.schedule.currency).toBeUndefined();
  });
});
