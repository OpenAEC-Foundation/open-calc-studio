import { describe, it, expect } from 'vitest';
import { deserializeProject } from '@/services/file/fileService';

describe('file format v2.1', () => {
  it('migrates v2.0 subSheets[] to v2.1 spreadsheets.sheets[]', () => {
    const v20 = JSON.stringify({
      version: '2.0.0',
      schedule: { name: 'Test', items: [] },
      items: [],
      subSheets: [{ id: 'a', name: 'Blad 1', columns: 10, rows: 50, cells: {} }],
    });
    const parsed = deserializeProject(v20);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.spreadsheets?.sheets).toHaveLength(1);
    expect(parsed.spreadsheets?.sheets[0].name).toBe('Blad 1');
    expect(parsed.spreadsheets?.activeSheetId).toBe('a');
  });

  it('round-trips v2.1 without loss', () => {
    const sheet = { id: 'x', name: 'S', columns: 10, rows: 50, cells: { A1: { value: '5' } } };
    const file = {
      version: '2.1.0',
      schedule: { name: 'T', items: [] },
      items: [],
      spreadsheets: { sheets: [sheet], activeSheetId: 'x' },
    };
    const json = JSON.stringify(file);
    const parsed = deserializeProject(json);
    expect(parsed.spreadsheets?.activeSheetId).toBe('x');
    expect(parsed.spreadsheets?.sheets[0].cells.A1.value).toBe('5');
  });
});
