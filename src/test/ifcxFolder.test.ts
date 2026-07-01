import { describe, it, expect } from 'vitest';
import { analyzeIfcxFolder } from '@/services/ifc/ifcxFolder';

// Kosten-ifcx (OCS-export): IfcProject > IfcCostSchedule > IfcCostItem's,
// met ifcGuid in genamespaced attributes.
const kostenIfcx = JSON.stringify({
  data: {
    path: '/Project/Demo', inherits: ['IfcProject'], attributes: {},
    children: {
      CostSchedules: {
        inherits: ['IfcCostSchedule'], attributes: {},
        children: {
          '21': { inherits: ['IfcCostItem'], attributes: { 'ifcx::ocs::ifcGuid': 'GUID-betonbak' } },
          '22': { inherits: ['IfcCostItem'], attributes: { 'ifcx::ocs::ifcGuid': 'GUID-metsel' } },
        },
      },
    },
  },
});

// Hoeveelheden-ifcx (uit een PDF-tekening): geometrie-objecten, deelt één
// ifcGuid met de kosten-ifcx (de betonbak) → dat is de link.
const hoeveelhedenIfcx = JSON.stringify({
  data: {
    inherits: ['IfcProject'], attributes: {},
    children: {
      bak: { inherits: ['IfcBeam'], attributes: { 'ifcx::ocs::ifcGuid': 'GUID-betonbak' } },
      wand: { inherits: ['IfcWall'], attributes: { 'bsi::ifc::prop::ifcGuid': 'GUID-wand-uniek' } },
    },
  },
});

describe('analyzeIfcxFolder', () => {
  it('vat IFC-objecten per bestand samen', () => {
    const a = analyzeIfcxFolder([{ name: 'begroting.ifcx', content: kostenIfcx }]);
    const f = a.files[0];
    expect(f.objectCount).toBe(4); // 1 project + 1 schedule + 2 costitems
    expect(f.objectTypes.find(t => t.type === 'IfcCostItem')?.count).toBe(2);
  });

  it('linkt objecten over bestanden via gedeelde ifcGuid', () => {
    const a = analyzeIfcxFolder([
      { name: 'begroting.ifcx', content: kostenIfcx },
      { name: 'tekening-hoeveelheden.ifcx', content: hoeveelhedenIfcx },
    ]);
    // GUID-betonbak zit in beide → één link tussen de twee bestanden
    expect(a.links).toHaveLength(1);
    expect(a.links[0].ifcGuid).toBe('GUID-betonbak');
    expect(a.links[0].files).toEqual(['begroting.ifcx', 'tekening-hoeveelheden.ifcx']);
  });

  it('toont niet-ifcx bestanden (pdf/tekening) als context', () => {
    const a = analyzeIfcxFolder([
      { name: 'begroting.ifcx', content: kostenIfcx },
      { name: 'plattegrond.pdf' },
      { name: 'detail.dwg' },
    ]);
    expect(a.otherFiles).toEqual(['plattegrond.pdf', 'detail.dwg']);
    expect(a.files).toHaveLength(1);
  });

  it('overleeft onleesbare/halve ifcx zonder te crashen', () => {
    const a = analyzeIfcxFolder([
      { name: 'goed.ifcx', content: kostenIfcx },
      { name: 'kapot.ifcx', content: '{ niet: geldig' },
      { name: 'leeg.ifcx' },
    ]);
    expect(a.files.find(f => f.name === 'kapot.ifcx')?.error).toMatch(/onleesbaar/);
    expect(a.files.find(f => f.name === 'leeg.ifcx')?.error).toBe('niet geladen');
    expect(a.files.find(f => f.name === 'goed.ifcx')?.objectCount).toBe(4);
  });

  it('geen valse links bij unieke guids', () => {
    const a = analyzeIfcxFolder([{ name: 'a.ifcx', content: hoeveelhedenIfcx }]);
    expect(a.links).toHaveLength(0); // één bestand → geen kruisverwijzing
  });
});
