/** The sample is bundled so it also works below a subpath and in an opaque iframe. */
export async function loadSampleBudgetText(lang: string): Promise<string> {
  const mod = (lang || 'en').split('-')[0] === 'nl'
    ? await import('@/data/samples/voorbeeld.ifcCalc?raw')
    : await import('@/data/samples/sample-en.ifcCalc?raw');
  return mod.default;
}
