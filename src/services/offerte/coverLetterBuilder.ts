import type { ProjectInfo } from '@/types/costModel';

/**
 * Build a professional cover letter from project data.
 * Returns a multi-line string suitable for PDF rendering.
 */
export function buildCoverLetter(
  projectInfo: ProjectInfo,
  _projectNumber: string,
  manualText: string,
): string {
  const lines: string[] = [];

  const aanhef = projectInfo.aanhefType
    ? `${projectInfo.aanhefType}. ${projectInfo.aanhefNaam}`
    : projectInfo.aanhefNaam;
  lines.push(`Beste ${aanhef},`);
  lines.push('');

  const projectType = projectInfo.projectType || 'woning';
  lines.push(`Bij deze de offerte voor het realiseren van uw nieuwe ${projectType}!`);
  lines.push('');

  if (projectInfo.bouwmethode) {
    lines.push(`De woning wordt gebouwd volgens de ${projectInfo.bouwmethode} methode.`);
  }
  if (projectInfo.tekeningSoort) {
    lines.push(`De offerte is gebaseerd op de ${projectInfo.tekeningSoort}.`);
  }
  if (projectInfo.architect) {
    lines.push(`Ontwerp: ${projectInfo.architect}.`);
  }
  if (projectInfo.locatie) {
    lines.push(`Locatie: ${projectInfo.locatie}.`);
  }

  lines.push('');

  if (manualText.trim()) {
    lines.push(manualText.trim());
    lines.push('');
  }

  lines.push('Wij vertrouwen erop u hiermee een passende aanbieding te hebben gedaan.');
  lines.push('');
  lines.push('Met vriendelijke groet,');

  return lines.join('\n');
}
