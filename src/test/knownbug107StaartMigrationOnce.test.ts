import { describe, it, expect } from 'vitest';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { createDefaultItems, createDefaultSchedule } from '@/data/defaultBudget';
import { makeCostItem } from '@/services/importers/core';

// Knownbug 107: de staart-migraties draaiden bij elke keer openen, dus een staartregel die de
// gebruiker had verwijderd kwam in een bestand van de huidige versie steeds terug.
const post = () => makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'begrotingspost', code: '01', description: 'Post', unit: 'st', quantity: 1, materialPrice: 10 });

describe('knownbug 107: verwijderde staartregels blijven weg', () => {
  it('alle staartregels verwijderd, opgeslagen en opnieuw geopend: geen staart terug', () => {
    const json = serializeProject(createDefaultSchedule(), [post()]);
    const reopened = deserializeProject(json);
    expect(reopened.items.filter((i) => i.rowType.startsWith('staart_'))).toEqual([]);
  });

  it('alleen Btw laag verwijderd: komt bij opnieuw openen niet terug', () => {
    const staart = createDefaultItems().filter((i) => i.rowType !== 'staart_btw_laag');
    expect(staart.some((i) => i.rowType === 'staart_btw')).toBe(true);
    const json = serializeProject(createDefaultSchedule(), [post(), ...staart]);
    const reopened = deserializeProject(json);
    expect(reopened.items.some((i) => i.rowType === 'staart_btw_laag')).toBe(false);
  });

  it('oudere bestanden migreren nog wel', () => {
    const old = JSON.parse(serializeProject(createDefaultSchedule(), [post()]));
    old.version = '2.1.0';
    const migrated = deserializeProject(JSON.stringify(old));
    expect(migrated.items.some((i) => i.rowType === 'staart_btw')).toBe(true);
    expect(migrated.items.some((i) => i.rowType === 'staart_btw_laag')).toBe(true);

    const withoutLow = JSON.parse(serializeProject(createDefaultSchedule(), [post(), ...createDefaultItems().filter((i) => i.rowType !== 'staart_btw_laag')]));
    withoutLow.version = '2.2.0';
    expect(deserializeProject(JSON.stringify(withoutLow)).items.some((i) => i.rowType === 'staart_btw_laag')).toBe(true);
  });
});
