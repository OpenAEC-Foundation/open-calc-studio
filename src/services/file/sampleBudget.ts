import { isEmbedded } from '@/lib/hostRoot';

/**
 * De meegeleverde voorbeeldbegroting (Nederlands voor nl, anders Engels).
 *
 * De app haalt hem uit `/data` (public); ingebouwd in een andere site bestaat
 * die map niet, dus daar zit hij in de bundel (src/data/samples — kopieën
 * van de public-bestanden, gelijk gehouden door een test).
 */
export async function loadSampleBudgetText(lang: string): Promise<string> {
  const nl = (lang || 'en').split('-')[0] === 'nl';
  if (isEmbedded()) {
    const mod = nl
      ? await import('@/data/samples/voorbeeld.ifcCalc?raw')
      : await import('@/data/samples/sample-en.ifcCalc?raw');
    return mod.default;
  }
  const resp = await fetch(nl ? '/data/voorbeeld.ifcCalc' : '/data/sample-en.ifcCalc');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}
