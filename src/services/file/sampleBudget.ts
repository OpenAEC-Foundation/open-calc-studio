/** The sample is bundled so it also works below a subpath and in an opaque iframe. */
export async function loadSampleBudgetText(lang: string): Promise<string> {
  const baseLang = (lang || 'en').split('-')[0];
  const mod = baseLang === 'nl'
    ? await import('@/data/samples/voorbeeld.ifcCalc?raw')
    : baseLang === 'pt'
      ? await import('@/data/samples/sample-pt.ifcCalc?raw')
      : await import('@/data/samples/sample-en.ifcCalc?raw');
  return mod.default;
}
