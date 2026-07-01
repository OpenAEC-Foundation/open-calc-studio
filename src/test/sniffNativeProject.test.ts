import { describe, it, expect } from 'vitest';
import { sniffNativeProject } from '@/hooks/useFileOperations';
import { serializeProject } from '@/services/file/fileService';
import type { CostItem, CostSchedule } from '@/types/costModel';

const enc = (s: string) => new TextEncoder().encode(s).buffer;
const minimalSchedule = () => ({ name: 'Test', projectName: 'Test' } as unknown as CostSchedule);

function mkChapter(): CostItem {
  return {
    id: 'ch', parentId: null, sortOrder: 0, code: '21', description: 'Betonwerk',
    unit: 'st', quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0,
    total: 0, isCollapsed: false, depth: 0, notes: '', ifcGuid: 'ch', rowType: 'chapter',
    staartPercentage: null, nr: '', normQuantity: null, normFactor: null, normDivisor: null,
    normUnitPrice: null, resourceType: null, resourceLibraryId: null, verrekenbaar: 'V', tariefGroep: null,
  } as CostItem;
}

describe('sniffNativeProject (.calc met JSON-inhoud)', () => {
  it('herkent een native OCS-project dat als .calc is opgeslagen', () => {
    const json = serializeProject(minimalSchedule(), [mkChapter()]);
    const parsed = sniffNativeProject(enc(json));
    expect(parsed).not.toBeNull();
    expect(parsed!.items.some(i => i.id === 'ch')).toBe(true);
  });

  it('negeert een echt Access/MDB-bestand (begint niet met "{")', () => {
    // MDB-header: page type 0x00 + "Standard Jet DB"
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x00, ...new TextEncoder().encode('Standard Jet DB')]);
    expect(sniffNativeProject(bytes.buffer)).toBeNull();
  });

  it('herkent JSON ook met BOM en voorafgaande witruimte', () => {
    const json = serializeProject(minimalSchedule(), [mkChapter()]);
    const withBom = '﻿  \n' + json;
    expect(sniffNativeProject(enc(withBom))).not.toBeNull();
  });

  it('geeft null bij ongeldige/halve JSON', () => {
    expect(sniffNativeProject(enc('{ dit is geen geldig project'))).toBeNull();
  });
});
