import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { isCellEditable } from '@/components/grid/gridConstants';

describe('staart editability', () => {
  it('UKK quantity is editable', () => {
    expect(isCellEditable('quantity', 'staart_ukk')).toBe(true);
  });
  it('AK quantity is editable', () => {
    expect(isCellEditable('quantity', 'staart_ak')).toBe(true);
  });
  it('WR quantity is editable', () => {
    expect(isCellEditable('quantity', 'staart_wr')).toBe(true);
  });
  it('afronding quantity is NOT editable', () => {
    expect(isCellEditable('quantity', 'staart_afronding')).toBe(false);
  });
  it('any staart description is editable', () => {
    [
      'staart_ukk',
      'staart_ak',
      'staart_wr',
      'staart_afronding',
      'staart_ak_oa',
      'staart_abk',
      'staart_garanties',
      'staart_wvpm',
      'staart_risico',
      'staart_winst',
      'staart_verzekering',
      'staart_btw',
    ].forEach((rt) => {
      expect(isCellEditable('description', rt)).toBe(true);
    });
  });
  it('Bouw 1 staart variants have editable quantity (except afronding)', () => {
    [
      'staart_ak_oa',
      'staart_abk',
      'staart_garanties',
      'staart_wvpm',
      'staart_risico',
      'staart_winst',
      'staart_verzekering',
      'staart_btw',
    ].forEach((rt) => {
      expect(isCellEditable('quantity', rt)).toBe(true);
    });
  });
  it('staart code column is NOT editable', () => {
    expect(isCellEditable('code', 'staart_ukk')).toBe(false);
  });
  it('rowNumber is read-only for all row types', () => {
    ['regel', 'chapter', 'begrotingspost', 'bewakingspost', 'staart_ukk'].forEach((rt) => {
      expect(isCellEditable('rowNumber', rt)).toBe(false);
    });
  });
  it('quantity update on staart row syncs to staartPercentage', () => {
    const baseItem: any = {
      id: 'ukk',
      rowType: 'staart_ukk',
      code: '',
      description: 'UKK',
      parentId: null,
      depth: 0,
      quantity: 5,
      unit: '%',
      unitPrice: 0,
      total: 0,
      normUnitPrice: null,
      normQuantity: null,
      normFactor: null,
      normDivisor: null,
      laborPrice: null,
      resourceType: null,
      tariefGroep: null,
      materialPrice: null,
      isCollapsed: false,
      sortOrder: 0,
      notes: '',
      ifcGuid: '',
      staartPercentage: 5,
      nr: '',
      resourceLibraryId: null,
      verrekenbaar: null,
    };
    useAppStore.setState({ items: [baseItem] } as any);
    (useAppStore.getState() as any).updateItem('ukk', 'quantity', 7);
    const item: any = useAppStore.getState().items.find((it: any) => it.id === 'ukk');
    expect(item.quantity).toBe(7);
    expect(item.staartPercentage).toBe(7);
  });
});
