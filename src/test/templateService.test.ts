import { describe, it, expect } from 'vitest';
import { getBuiltInTemplates, applyTemplate } from '@/services/offerte/templateService';
import type { CostItem } from '@/types/costModel';

describe('templateService', () => {
  it('provides 3 built-in templates', () => {
    const templates = getBuiltInTemplates();
    expect(templates).toHaveLength(3);
    expect(templates.map(t => t.projectType)).toContain('waterwoning');
    expect(templates.map(t => t.projectType)).toContain('woning');
    expect(templates.map(t => t.projectType)).toContain('renovatie');
  });

  it('waterwoning template has correct sections', () => {
    const templates = getBuiltInTemplates();
    const ww = templates.find(t => t.projectType === 'waterwoning')!;
    const titles = ww.sections.map(s => s.titel);
    expect(titles).toContain('Ruwbouw');
    expect(titles).toContain('Afbouw');
    expect(titles).toContain('Installaties');
    expect(titles).toContain('Meerwerk');
  });

  it('applyTemplate creates offerte sections with defaults', () => {
    const templates = getBuiltInTemplates();
    const ww = templates.find(t => t.projectType === 'waterwoning')!;
    const items: CostItem[] = [
      { id: '1', code: '10', description: 'Funderingen', rowType: 'chapter', parentId: null, depth: 0, quantity: null, unit: 'm²', unitPrice: 0, total: 50000, normUnitPrice: null, normQuantity: null, normFactor: null, normDivisor: null, laborPrice: null, resourceType: null, tariefGroep: null, materialPrice: null, isCollapsed: false, sortOrder: 0, notes: '', ifcGuid: '', staartPercentage: null, nr: '01', resourceLibraryId: null, verrekenbaar: null },
    ];
    const result = applyTemplate(ww, items);
    expect(result.secties!.length).toBeGreaterThan(0);
    expect(result.betalingstermijnen!.length).toBe(7);
    expect(result.garanties!.length).toBe(5);
  });

  it('applyTemplate links sections to matching chapters', () => {
    const templates = getBuiltInTemplates();
    const ww = templates.find(t => t.projectType === 'waterwoning')!;
    const items: CostItem[] = [
      { id: 'ch10', code: '10', description: 'Funderingen', rowType: 'chapter', parentId: null, depth: 0, quantity: null, unit: 'm²', unitPrice: 0, total: 50000, normUnitPrice: null, normQuantity: null, normFactor: null, normDivisor: null, laborPrice: null, resourceType: null, tariefGroep: null, materialPrice: null, isCollapsed: false, sortOrder: 0, notes: '', ifcGuid: '', staartPercentage: null, nr: '01', resourceLibraryId: null, verrekenbaar: null },
    ];
    const result = applyTemplate(ww, items);
    // Ruwbouw section has linkedChapterCodes ['10', '21', '24', '30', '31', '33'] — should match ch10
    const ruwbouw = result.secties!.find(s => s.titel === 'Ruwbouw')!;
    expect(ruwbouw.linkedChapterId).toBe('ch10');
  });
});
