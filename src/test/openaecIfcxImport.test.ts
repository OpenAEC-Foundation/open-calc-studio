import { describe, expect, it } from 'vitest';
import { importIfcx } from '@/services/importers/ifcxImporter';
import { recalculateItems, getGrandTotal } from '@/services/calculation/calculator';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { importBudget } from '@/lib/importers';
import { openProjectJson } from '@/services/file/openProject';
import { useAppStore } from '@/state/appStore';

// Independently authored example of Explorer's shared attribute contract (#69).
function fixture() {
  return { data: [
    { path: '/estimates/walls', attributes: {
      'openaec::label': 'Two walls',
      'openaec::cost::estimateItem': { quantity: '/quantities/walls', rate: 250, total: 833.33, currency: 'EUR', unit: 'EUR/m³', status: 'example' },
      'openaec::links': [{ relation: 'costs', target: '/elements/wall-a' }, { relation: 'costs', target: '/elements/wall-b' }],
    } },
    { path: '/quantities/walls', attributes: { 'openaec::quantity': { value: 3.333333, unit: 'm³', formula: 'Volume A + Volume B' } } },
  ] };
}
function read(doc = fixture()) { return importIfcx(JSON.stringify(doc)); }

describe('shared OpenAEC IFCX estimate import', () => {
  it('is available through the library import API and the full project opener, without retaining an overwrite path', async () => {
    const text = JSON.stringify(fixture());
    const result = await importBudget(new TextEncoder().encode(text).buffer, 'walls.ifcx');
    expect(result.items[0].id).toBe('/estimates/walls');
    const initial = useAppStore.getState();
    try {
      const id = openProjectJson(text, 'walls', '/original/walls.ifcx');
      expect(useAppStore.getState().documents.find(d => d.id === id)?.filePath).toBeNull();
      expect(useAppStore.getState().items[0].quantityOrigin?.sources).toHaveLength(3);
    } finally { useAppStore.setState(initial, true); }
  });
  it('preserves identity, quantity unit, all model links and the rounded amount after recalculation and native save/reopen', () => {
    const imported = read();
    const item = recalculateItems(imported.items)[0];
    expect(item).toMatchObject({ id: '/estimates/walls', unit: 'm³', quantity: 3.333333, total: 833.33 });
    expect(item.quantityOrigin?.sources.map(x => x.id)).toEqual(['/quantities/walls', '/elements/wall-a', '/elements/wall-b']);
    expect(item.quantityOrigin?.verified).toBe(false);
    expect(JSON.parse(item.notes!).sourceRate).toBe(250);
    const reopened = deserializeProject(serializeProject({ ...createDefaultSchedule(), ...imported.schedule }, [item]));
    expect(reopened.items[0].quantityOrigin).toEqual(item.quantityOrigin);
    expect(getGrandTotal(recalculateItems(reopened.items))).toBeCloseTo(833.33, 8);
    expect(imported.schedule).toMatchObject({ currency: 'EUR', directCostsOnly: true });
  });

  it('keeps a zero quantity and rate without division by zero', () => {
    const doc = fixture();
    doc.data[0].attributes['openaec::cost::estimateItem']!.total = 0;
    doc.data[1].attributes['openaec::quantity']!.value = 0;
    expect(recalculateItems(read(doc).items)[0]).toMatchObject({ total: 0, normUnitPrice: 250 });
  });

  it('rejects unresolved external quantities instead of importing an empty or zero estimate', () => {
    const doc = fixture(); doc.data.pop();
    expect(() => read(doc)).toThrow('unresolved quantity');
  });

  it('rejects duplicate paths rather than choosing a possibly different quantity', () => {
    const doc = fixture(); doc.data.push(doc.data[1]);
    expect(() => read(doc)).toThrow('duplicate path');
  });

  it('rejects mixed cost profiles rather than silently dropping legacy rows', () => {
    const doc = fixture();
    Object.assign(doc.data[1].attributes, { 'ifcx::cost::unitPrice': 123 });
    expect(() => read(doc)).toThrow('mixed cost profiles');
  });

  it('rejects inconsistent amounts, unsupported units and mismatched rate units', () => {
    const doc = fixture();
    doc.data[0].attributes['openaec::cost::estimateItem']!.total = 99;
    expect(() => read(doc)).toThrow('total does not match');
    const unknown = fixture(); unknown.data[1].attributes['openaec::quantity']!.unit = 'furlongs';
    expect(() => read(unknown)).toThrow('unsupported quantity unit');
    const mismatch = fixture(); mismatch.data[0].attributes['openaec::cost::estimateItem']!.unit = 'EUR/kg';
    expect(() => read(mismatch)).toThrow('rate unit does not match');
  });

  it('rejects mixed currencies rather than silently converting them', () => {
    const doc = fixture();
    const other = structuredClone(doc.data[0]); other.path = '/estimates/second';
    other.attributes['openaec::cost::estimateItem']!.currency = 'USD';
    doc.data.push(other);
    expect(() => read(doc)).toThrow('mixed currency');
  });
});
