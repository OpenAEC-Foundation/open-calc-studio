import { describe, it, expect } from 'vitest';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { parseIfcCostFile } from '@/services/ifc/ifcCostParser';
import { createDefaultItems, createDefaultSchedule } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { makeStaartItem } from '@/services/calculation/staartDefaults';
import { generateIfcGuid, toIfcGlobalId } from '@/services/ifc/ifcHelpers';
import { genIfcGuid } from '@/services/importers/core';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import type { CostItem, CostSchedule } from '@/types/costModel';

/** STEP-attributen op het hoogste niveau splitsen (tekst tussen quotes en geneste haakjes heel laten). */
function stepArgs(line: string): string[] {
  const body = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'));
  const out: string[] = []; let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") { if (inStr && body[i + 1] === "'") { cur += "''"; i++; continue; } inStr = !inStr; }
    if (!inStr && ch === '(') depth++;
    if (!inStr && ch === ')') depth--;
    if (!inStr && ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
const entities = (ifc: string, type: string) => ifc.split('\n').filter((l) => new RegExp(`^#\\d+=${type}\\(`).test(l));
const byId = (ifc: string, ref: string) => ifc.split('\n').find((l) => l.startsWith(`${ref}=`))!;

function budget(): { schedule: CostSchedule; items: CostItem[] } {
  const schedule: CostSchedule = { ...createDefaultSchedule(), name: 'Stap', projectName: 'Project' };
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Ruwbouw' });
  const post = makeCostItem({ parentId: chapter.id, sortOrder: 1, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Metselwerk', unit: 'm²', quantity: 40, tariefGroep: 'B' });
  const regel = makeCostItem({ parentId: post.id, sortOrder: 2, depth: 2, rowType: 'regel', code: '01.01.01', description: 'Stenen', unit: 'm²', quantity: 40, materialPrice: 25, laborPrice: 10, resourceType: 'materiaal' });
  const losse = makeCostItem({ parentId: chapter.id, sortOrder: 3, depth: 1, rowType: 'begrotingspost', code: '01.02', description: 'Wapening', unit: 'kg', quantity: 500, materialPrice: 1.5, laborPrice: null });
  return { schedule, items: recalculateItems([chapter, post, regel, losse, ...createDefaultItems().map((s, i) => ({ ...s, sortOrder: 10 + i }))]) };
}

describe('knownbug 150: eenheden op de juiste plek en kloppend', () => {
  it('IfcProject.UnitsInContext is attribuut 9, kg is KILO GRAM en uren zijn een uur-eenheid', () => {
    const { schedule, items } = budget();
    const ifc = generateIfcCostFile(schedule, items);
    const project = stepArgs(entities(ifc, 'IFCPROJECT')[0]);
    expect(project).toHaveLength(9);
    expect(project[7]).toBe('$');
    expect(byId(ifc, project[8])).toMatch(/=IFCUNITASSIGNMENT\(/);
    expect(ifc).toContain('IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)');
    const assignment = stepArgs(byId(ifc, project[8]))[0];
    const timeUnits = assignment.replace(/[()]/g, '').split(',').map((ref) => byId(ifc, ref)).filter((l) => l.includes('.TIMEUNIT.'));
    expect(timeUnits).toHaveLength(1);
    expect(timeUnits[0]).toMatch(/IFCCONVERSIONBASEDUNIT\(#\d+,\.TIMEUNIT\.,'hour',#\d+\)/);
    const factor = byId(ifc, stepArgs(timeUnits[0])[3]);
    expect(factor).toMatch(/IFCMEASUREWITHUNIT\(IFCTIMEMEASURE\(3600\.\),#\d+\)/);
  });
});

describe('knownbug 151: entiteiten volgens IFC4X3, prijzen en hoeveelheden aan de posten', () => {
  it('IfcCostSchedule 10, IfcCostItem 9 en IfcCostValue 10 attributen', () => {
    const { schedule, items } = budget();
    const ifc = generateIfcCostFile(schedule, items);
    const sched = stepArgs(entities(ifc, 'IFCCOSTSCHEDULE')[0]);
    expect(sched).toHaveLength(10);
    expect(sched[7]).toBe("'DRAFT'");
    for (const line of entities(ifc, 'IFCCOSTITEM')) expect(stepArgs(line)).toHaveLength(9);
    for (const line of entities(ifc, 'IFCCOSTVALUE')) expect(stepArgs(line)).toHaveLength(10);
    const regel = entities(ifc, 'IFCCOSTITEM').find((l) => l.includes("'01.01.01'"))!;
    const [, , , , , , , values, quantities] = stepArgs(regel);
    const cost = byId(ifc, values.replace(/[()]/g, ''));
    expect(stepArgs(cost)[2]).toBe('IFCMONETARYMEASURE(35.)');
    expect(stepArgs(cost)[8]).toBe('.ADD.');
    const categories = stepArgs(cost)[9].replace(/[()]/g, '').split(',').map((ref) => stepArgs(byId(ifc, ref))[6]);
    expect(categories.sort()).toEqual(["'LABOR'", "'MATERIAL'"]);
    expect(byId(ifc, quantities.replace(/[()]/g, ''))).toMatch(/IFCQUANTITYAREA\('Stenen',\$,\$,40\.,\$\)/);
  });

  it('prijzen, hoeveelheden en schedule.ifcGuid overleven de round trip', () => {
    const { schedule, items } = budget();
    const parsed = parseIfcCostFile(generateIfcCostFile(schedule, items));
    const regel = parsed.items.find((i) => i.code === '01.01.01')!;
    expect(regel.materialPrice).toBe(25);
    expect(regel.laborPrice).toBe(10);
    expect(regel.quantity).toBe(40);
    expect(regel.unit).toBe('m²');
    const losse = parsed.items.find((i) => i.code === '01.02')!;
    expect(losse.materialPrice).toBe(1.5);
    expect(losse.quantity).toBe(500);
    expect(losse.unit).toBe('kg');
    expect(parsed.schedule.ifcGuid).toBe(schedule.ifcGuid);
    const again = parseIfcCostFile(generateIfcCostFile({ ...schedule, ...parsed.schedule }, parsed.items));
    expect(again.schedule.ifcGuid).toBe(schedule.ifcGuid);
  });
});

describe('knownbug 106: regeltype, tariefgroep en staartpercentages worden gelezen', () => {
  it('post blijft post, regel blijft regel, staart houdt type en percentage', () => {
    const { schedule, items } = budget();
    const parsed = parseIfcCostFile(generateIfcCostFile(schedule, items));
    const find = (code: string) => parsed.items.find((i) => i.code === code)!;
    expect(find('01').rowType).toBe('chapter');
    expect(find('01.01').rowType).toBe('begrotingspost');
    expect(find('01.01').tariefGroep).toBe('B');
    expect(find('01.01.01').rowType).toBe('regel');
    expect(find('01.01.01').resourceType).toBe('materiaal');
    expect(find('01.01.01').parentId).toBe(find('01.01').id);
    const staart = (list: CostItem[]) => list.filter((i) => i.rowType.startsWith('staart_')).map((i) => [i.rowType, i.staartPercentage, i.unit]).sort();
    expect(staart(parsed.items)).toEqual(staart(items));
    expect(staart(parsed.items).length).toBeGreaterThan(0);
  });
});

describe('knownbug 153: geldige en unieke GlobalIds', () => {
  it('lege, 36-tekens en dubbele ifcGuids worden in de export vervangen', () => {
    const { schedule, items } = budget();
    items[0].ifcGuid = '';
    items[1].ifcGuid = crypto.randomUUID();
    items[3].ifcGuid = items[2].ifcGuid;
    const ifc = generateIfcCostFile({ ...schedule, ifcGuid: '' }, items);
    const guids = ifc.split('\n').filter((l) => /^#\d+=IFC(PROJECT|COSTSCHEDULE|COSTITEM|PROPERTYSET|RELDEFINESBYPROPERTIES|RELNESTS|OWNERHISTORY)\(/.test(l) && !l.includes('OWNERHISTORY')).map((l) => stepArgs(l)[0].replace(/'/g, ''));
    for (const g of guids) expect(g).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(new Set(guids).size).toBe(guids.length);
  });

  it('bronnen maken geldige GlobalIds: staartregels en nieuwe GUIDs (eerste teken 0-3)', () => {
    expect(makeStaartItem('staart_btw_laag', 'Btw laag', 9, 0).ifcGuid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    for (let i = 0; i < 200; i++) expect(generateIfcGuid()).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    // Ook de importers (makeCostItem, inschrijfstaat) maken geldige GlobalIds.
    for (let i = 0; i < 200; i++) expect(genIfcGuid()).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(makeCostItem({ rowType: 'regel', description: 'x' }).ifcGuid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    // Nieuwe begroting en standaard staartregels.
    for (let i = 0; i < 50; i++) expect(createDefaultSchedule().ifcGuid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    for (const item of createDefaultItems()) expect(item.ifcGuid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
  });

  it('een UUID of een GlobalId met eerste teken boven 3 wordt vast omgezet, niet willekeurig', () => {
    expect(toIfcGlobalId('00000000-0000-0000-0000-000000000000')).toBe('0'.repeat(22));
    expect(toIfcGlobalId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe('3' + '$'.repeat(21));
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const converted = toIfcGlobalId(uuid)!;
    // Terugrekenen geeft dezelfde 128 bits.
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    let n = BigInt(0);
    for (const c of converted) n = n * BigInt(64) + BigInt(chars.indexOf(c));
    expect(n.toString(16).padStart(32, '0')).toBe(uuid.replace(/-/g, ''));
    expect(toIfcGlobalId('zAbcdefghijklmnopqrstu')).toBe('1Abcdefghijklmnopqrstu');
    expect(toIfcGlobalId('$Abcdefghijklmnopqrstu')).toBe('3Abcdefghijklmnopqrstu');
    expect(toIfcGlobalId('1Abcdefghijklmnopqrstu')).toBe('1Abcdefghijklmnopqrstu');
    expect(toIfcGlobalId('')).toBeNull();
    expect(toIfcGlobalId('test')).toBeNull();
  });

  it('een oude UUID als schedule.ifcGuid geeft bij elke export dezelfde project-GlobalId', () => {
    const { schedule, items } = budget();
    const old = { ...schedule, ifcGuid: crypto.randomUUID() };
    const projectGuid = (ifc: string) => stepArgs(entities(ifc, 'IFCPROJECT')[0])[0].replace(/'/g, '');
    const first = projectGuid(generateIfcCostFile(old, items));
    expect(first).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(projectGuid(generateIfcCostFile(old, items))).toBe(first);
  });

  it('een leeg of ongeldig schedule.ifcGuid wordt bij openen eenmalig hersteld en blijft daarna gelijk', () => {
    for (const bad of ['', 'zAbcdefghijklmnopqrstu', '3f2504e0-4f89-11d3-9a0c-0305e82c3301']) {
      const opened = deserializeProject(serializeProject({ ...createDefaultSchedule(), ifcGuid: bad }, []));
      expect(opened.schedule.ifcGuid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
      const reopened = deserializeProject(serializeProject(opened.schedule, opened.items));
      expect(reopened.schedule.ifcGuid).toBe(opened.schedule.ifcGuid);
    }
    const valid = generateIfcGuid();
    expect(deserializeProject(serializeProject({ ...createDefaultSchedule(), ifcGuid: valid }, [])).schedule.ifcGuid).toBe(valid);
  });
});

describe('parser: diepte ook onder een begrotingspost', () => {
  it('een regel onder een post krijgt diepte 2 zonder recalculateItems', () => {
    const { schedule, items } = budget();
    const parsed = parseIfcCostFile(generateIfcCostFile(schedule, items));
    const find = (code: string) => parsed.items.find((i) => i.code === code)!;
    expect(find('01').depth).toBe(0);
    expect(find('01.01').depth).toBe(1);
    expect(find('01.01.01').depth).toBe(2);
  });
});
