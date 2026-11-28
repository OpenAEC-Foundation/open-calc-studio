import { describe, expect, it } from 'vitest';
import { shouldAutoSave } from '@/services/file/autoSave';
import { defaultSettings } from '@/utils/settings';
import type { DocumentTab } from '@/types/costModel';

const state = (filePath: string | null, autoSave = true) => ({
  settings: { ...defaultSettings, autoSave },
  activeDocumentId: 'd',
  documents: [{ id: 'd', filePath, fileName: 'x', isModified: true, items: [], schedule: {} } as unknown as DocumentTab],
});

describe('automatisch opslaan', () => {
  it('slaat een native document met pad op', () => {
    expect(shouldAutoSave(state('C:/p/Begroting.ifcCalc'), false)).toBe(true);
    expect(shouldAutoSave(state('C:/p/Begroting.ifcCalc', false), false)).toBe(false);
    expect(shouldAutoSave(state(null), false)).toBe(false);
  });
  it('knownbug 120: niet voor een geïmporteerd bestand (zou Opslaan als openen)', () => {
    expect(shouldAutoSave(state('C:/p/werk.xlsx'), false)).toBe(false);
    expect(shouldAutoSave(state('C:/p/oud.bc3'), false)).toBe(false);
  });
  it('knownbug 281: niet terwijl "Opslaan / Niet opslaan" openstaat', () => {
    expect(shouldAutoSave(state('C:/p/Begroting.ifcCalc'), true)).toBe(false);
  });
});
