/** Preserve saved preferences from earlier Calc versions while using Blueprint's five themes. */
export function blueprintTheme(theme: string): string {
  const aliases: Record<string, string> = { default: 'dark', blue: 'blueprint', highContrast: 'high-contrast-dark', 'amber-navy': 'dark', 'warm-ember': 'dark' };
  return aliases[theme] ?? (['light', 'dark', 'blueprint', 'high-contrast-dark', 'high-contrast-light'].includes(theme) ? theme : 'light');
}
