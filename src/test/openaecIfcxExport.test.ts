import { beforeEach, describe, expect, it } from 'vitest';
import { importIfcx } from '@/services/importers/ifcxImporter';
import { generateOpenaecIfcx } from '@/services/ifc/openaecIfcxGenerator';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { useAppStore } from '@/state/appStore';

// Issue #69: Calc writes the shared OpenAEC cost profile and reads free items.
type Node = { path: string; attributes: Record<string, any> };
const parse = (text: string) => JSON.parse(text) as { data: Node[] };
const estimates = (text: string) => parse(text).data.filter(node => node.attributes['openaec::cost::estimateItem']);
const schedule = () => ({ ...createDefaultSchedule(), name: 'Test', currency: 'EUR' });

function explorerFixture() {
  return { data: [
    { path: '/estimates/walls', attributes: {
      'openaec::label': 'Two walls',
      'openaec::cost::estimateItem': { quantity: '/quantities/walls', rate: 250, total: 833.33, currency: 'EUR', unit: 'EUR/m³', status: 'example' },
      'openaec::links': [{ relation: 'costs', target: '/elements/wall-a' }, { relation: 'costs', target: '/elements/wall-b' }],
    } },
    { path: '/quantities/walls', attributes: { 'openaec::quantity': { value: 3.333333, unit: 'm³', formula: 'Volume A + Volume B' } } },
  ] };
}

describe('shared OpenAEC IFCX: free items with an inline quantity', () => {
  it('imports an inline { value, unit } quantity as an ordinary free item', () => {
    const doc = { data: [{ path: '/estimates/site', attributes: {
      'openaec::label': 'Site setup',
      'openaec::cost::estimateItem': { quantity: { value: 1, unit: 'post' }, rate: 1500, total: 1500, currency: 'EUR', unit: 'EUR/post' },
    } }] };
    const item = recalculateItems(importIfcx(JSON.stringify(doc)).items)[0];
    expect(item).toMatchObject({ id: '/estimates/site', quantity: 1, unit: 'post', total: 1500 });
    expect(item.quantityOrigin).toBeUndefined();
  });
  it('validates inline quantities like referenced ones', () => {
    const doc = { data: [{ path: '/estimates/x', attributes: {
      'openaec::cost::estimateItem': { quantity: { value: 2, unit: 'furlongs' }, rate: 1, total: 2, currency: 'EUR', unit: 'EUR/furlongs' },
    } }] };
    expect(() => importIfcx(JSON.stringify(doc))).toThrow('unsupported quantity unit');
  });
});

describe('shared OpenAEC IFCX export', () => {
  it('round-trips an Explorer document: identity, quantity reference, links, source rate and amount', () => {
    const imported = importIfcx(JSON.stringify(explorerFixture()));
    const text = generateOpenaecIfcx({ ...schedule(), ...imported.schedule }, recalculateItems(imported.items));
    const doc = parse(text);
    const quantity = doc.data.find(node => node.path === '/quantities/walls')!;
    expect(quantity.attributes['openaec::quantity']).toEqual({ value: 3.333333, unit: 'm³', formula: 'Volume A + Volume B' });
    const [walls] = estimates(text);
    expect(walls.path).toBe('/estimates/walls');
    expect(walls.attributes['openaec::cost::estimateItem']).toMatchObject({ quantity: '/quantities/walls', rate: 250, total: 833.33, currency: 'EUR', unit: 'EUR/m³', status: 'example' });
    expect(walls.attributes['openaec::links'].map((l: { target: string }) => l.target)).toEqual(['/elements/wall-a', '/elements/wall-b']);
    // ...and Calc reads its own export back to the same amount.
    const again = recalculateItems(importIfcx(text).items)[0];
    expect(again).toMatchObject({ id: '/estimates/walls', quantity: 3.333333, total: 833.33 });
  });

  describe('from a Calc budget', () => {
    const initial = useAppStore.getState();
    const s = () => useAppStore.getState();
    beforeEach(() => { useAppStore.setState(initial, true); s().addDocument({ id: 'shared-export', items: [] }); });

    it('writes one estimate per top post with its rolled-up amount, free quantities inline', () => {
      const chapter = s().addChapter(null);
      const post = s().addItem(chapter);
      s().updateItem(post, 'description', 'Masonry'); s().updateItem(post, 'quantity', 12); s().updateItem(post, 'unit', 'm²');
      const rule = s().addRegel(post);
      s().updateItem(rule, 'quantity', 12); s().updateItem(rule, 'normUnitPrice', 45.5);
      const lump = s().addItem(chapter);
      s().updateItem(lump, 'description', 'Site setup');
      const lumpRule = s().addRegel(lump);
      s().updateItem(lumpRule, 'quantity', 1); s().updateItem(lumpRule, 'normUnitPrice', 800);
      s().updateItem(lump, 'quantity', null);

      const text = generateOpenaecIfcx(s().schedule, s().items);
      const rows = estimates(text);
      expect(rows).toHaveLength(2);
      const byLabel = (part: string) => rows.find(row => String(row.attributes['openaec::label']).includes(part))!.attributes['openaec::cost::estimateItem'];
      expect(byLabel('Masonry')).toMatchObject({ quantity: { value: 12, unit: 'm²' }, rate: 45.5, total: 546, unit: 'EUR/m²' });
      expect(byLabel('Site setup')).toMatchObject({ quantity: { value: 1, unit: 'post' }, total: 800, unit: 'EUR/post' });

      const back = recalculateItems(importIfcx(text).items);
      expect(getKostprijs(back)).toBeCloseTo(getKostprijs(s().items), 6);
    });

    it('exports only the active variant and leaves out empty posts', () => {
      const chapter = s().addChapter(null);
      const base = s().addItem(chapter);
      s().updateItem(base, 'quantity', 2); s().updateItem(base, 'materialPrice', 10);
      const alt = s().addItem(chapter);
      s().updateItem(alt, 'quantity', 3); s().updateItem(alt, 'materialPrice', 99);
      s().updateItem(alt, 'branchId', 'alt');
      s().addItem(chapter); // empty
      s().setSchedule({ branchesEnabled: true, activeBranchId: 'main', branches: [{ id: 'main', parentId: null, name: 'Main' }, { id: 'alt', parentId: 'main', name: 'Alt' }] });
      const rows = estimates(generateOpenaecIfcx(s().schedule, s().items));
      expect(rows.map(row => row.attributes['openaec::cost::estimateItem'].total)).toEqual([20]);
    });

    it('never produces a document Calc refuses (amount = quantity × rate in cents)', () => {
      const chapter = s().addChapter(null);
      for (const [quantity, price] of [[3, 0.1], [7.3333, 13.37], [0.001, 99999.99]]) {
        const post = s().addItem(chapter);
        s().updateItem(post, 'quantity', quantity); s().updateItem(post, 'materialPrice', price);
      }
      const text = generateOpenaecIfcx(s().schedule, s().items);
      expect(() => importIfcx(text)).not.toThrow();
      expect(estimates(text)).toHaveLength(3);
    });
  });
});
