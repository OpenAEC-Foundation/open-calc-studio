import { describe, it, expect } from 'vitest';
import { buildCoverLetter } from '@/services/offerte/coverLetterBuilder';
import type { ProjectInfo } from '@/types/costModel';
import { createDefaultProjectInfo } from '@/types/costModel';

describe('coverLetterBuilder', () => {
  const projectInfo: ProjectInfo = {
    ...createDefaultProjectInfo(),
    projectType: 'waterwoning',
    architect: 'Waterstudio',
    locatie: 'IJsbaanpad 86A, Amsterdam',
    bouwmethode: 'CLT prefab',
    tekeningSoort: 'door u verstrekte tekeningen',
    aanhefType: 'fam',
    aanhefNaam: 'Daphne',
  };

  it('generates greeting with aanhef', () => {
    const result = buildCoverLetter(projectInfo, 'AC247', '');
    expect(result).toContain('Beste fam. Daphne');
  });

  it('includes project type in intro', () => {
    const result = buildCoverLetter(projectInfo, 'AC247', '');
    expect(result).toContain('waterwoning');
  });

  it('includes bouwmethode', () => {
    const result = buildCoverLetter(projectInfo, 'AC247', '');
    expect(result).toContain('CLT prefab');
  });

  it('appends manual text when provided', () => {
    const result = buildCoverLetter(projectInfo, 'AC247', 'Extra notitie hier.');
    expect(result).toContain('Extra notitie hier.');
  });

  it('ends with closing greeting', () => {
    const result = buildCoverLetter(projectInfo, 'AC247', '');
    expect(result).toContain('Met vriendelijke groet,');
  });
});
