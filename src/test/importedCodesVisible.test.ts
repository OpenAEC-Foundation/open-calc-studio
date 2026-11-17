import { describe, it, expect } from 'vitest';
import { parseCsv, autoDetectMapping, buildFromMapping } from '@/services/importers';
import { recalculateItems } from '@/services/calculation/calculator';
import { getColumnsForView } from '@/components/grid/gridConstants';

// #95: de eigen hiërarchische codes van een begroting (Presto: 12.01,
// 17.01.01) blijven staan en zijn in het grid zichtbaar naast het berekende Nr.
describe('eigen codes uit een import (#95)', () => {
  it('houdt codes met gaten ongewijzigd, ook al nummert Nr door', () => {
    const data = parseCsv([
      'Código;Resumen;Ud.;Medición;Precio',
      '12;CARPINTERÍA;;;',
      '12.01;Puerta de paso;ud;4;180',
      '12.03;Ventana;ud;6;240',
    ].join('\n'), 'presupuesto');
    const items = recalculateItems(buildFromMapping(data, autoDetectMapping(data.headers)).items);

    const ventana = items.find((i) => i.description === 'Ventana')!;
    expect(ventana.code).toBe('12.03');
    // Nr is een berekend volgnummer — daarom moet de Code-kolom zichtbaar zijn.
    expect(ventana.nr).toBe('12.02');
  });

  it('gebruikt een Nº-kolom als code wanneer er geen Code-kolom is', () => {
    const data = parseCsv([
      'Nº;Resumen;Ud.;Medición;Precio',
      '17;INSTALACIONES;;;',
      '17.01;Fontanería;;;',
      '17.01.01;Tubería de cobre;m;30;12,50',
    ].join('\n'), 'presupuesto');
    expect(autoDetectMapping(data.headers)[0]).toBe('nr');

    const items = recalculateItems(buildFromMapping(data, autoDetectMapping(data.headers)).items);
    const post = items.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.code).toBe('17.01.01');

    // De codes bouwen ook de hoofdstukboom op.
    const sub = items.find((i) => i.code === '17.01')!;
    const top = items.find((i) => i.code === '17')!;
    expect(post.parentId).toBe(sub.id);
    expect(sub.parentId).toBe(top.id);
  });

  it('laat een Code-kolom voorgaan op een Nr-kolom', () => {
    const data = parseCsv([
      'Nr;Code;Omschrijving;Eenheid;Hoeveelheid;Prijs',
      '1;21.10;Metselwerk;m2;10;50',
    ].join('\n'), 'begroting');
    const items = buildFromMapping(data, autoDetectMapping(data.headers)).items;
    expect(items[0].code).toBe('21.10');
  });
});

describe('Code-kolom in het grid (#95)', () => {
  it('UI-1 toont de code breed genoeg voor 17.01.01', () => {
    const code = getColumnsForView('st').find((c) => c.key === 'code')!;
    expect(code.width).toBeGreaterThanOrEqual(70);
  });

  it('Simple toont de code direct naast Nr', () => {
    const keys = getColumnsForView('simple').map((c) => c.key);
    expect(keys.indexOf('code')).toBe(keys.indexOf('rowNumber') + 1);
  });
});
