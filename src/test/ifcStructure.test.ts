import { describe, it, expect } from 'vitest';
import { extractStructure, collectGuids } from '@/services/ifc/ifcStructure';

const kosten = JSON.stringify({
  data: {
    inherits: ['IfcProject'],
    attributes: { 'bsi::ifc::prop::Name': 'Demomodel Waterlijn' },
    children: {
      sched: {
        inherits: ['IfcCostSchedule'],
        attributes: { 'bsi::ifc::prop::Name': 'Begroting' },
        children: {
          a: { inherits: ['IfcCostItem'], attributes: { 'bsi::ifc::prop::Name': 'Betonbak', 'ifcx::ocs::ifcGuid': 'G-bak' } },
        },
      },
    },
  },
});

const geo = JSON.stringify({
  data: { inherits: ['IfcBeam'], attributes: { 'bsi::ifc::prop::Name': 'Azobé ligger', 'ifcx::ocs::ifcGuid': 'G-bak' } },
});

describe('extractStructure', () => {
  it('bouwt een objectboom met type + naam i.p.v. ruwe code', () => {
    const s = extractStructure('begroting.ifcx', kosten);
    expect(s.error).toBeUndefined();
    expect(s.roots).toHaveLength(1);
    expect(s.roots[0].type).toBe('IfcProject');
    expect(s.roots[0].name).toBe('Demomodel Waterlijn');
    const sched = s.roots[0].children[0];
    expect(sched.type).toBe('IfcCostSchedule');
    const item = sched.children[0];
    expect(item.type).toBe('IfcCostItem');
    expect(item.name).toBe('Betonbak');
    expect(item.ifcGuid).toBe('G-bak');
    expect(s.objectCount).toBe(3);
  });

  it('leest een ligger uit een geometriebestand', () => {
    const s = extractStructure('model.ifcgeo', geo);
    expect(s.roots[0].type).toBe('IfcBeam');
    expect(s.roots[0].name).toBe('Azobé ligger');
  });

  it('detecteert gedeelde ifcGuid voor linking', () => {
    const a = collectGuids(extractStructure('a', kosten));
    const b = collectGuids(extractStructure('b', geo));
    const shared = [...a].filter(g => b.has(g));
    expect(shared).toEqual(['G-bak']); // de betonbak ↔ de ligger
  });

  it('overleeft onleesbare inhoud', () => {
    expect(extractStructure('x.ifcx', '{ kapot').error).toMatch(/onleesbaar/);
    expect(extractStructure('y.ifcx', undefined).error).toBe('niet geladen');
  });
});
