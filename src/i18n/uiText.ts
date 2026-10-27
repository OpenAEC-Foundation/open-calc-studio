import i18next from 'i18next';

/** Also works in headless consumers, where the UI translator is not initialized. */
export function uiText(key: string, english: string, values: Record<string, unknown> = {}): string {
  if (i18next.isInitialized) return String(i18next.t(`common:workspace.${key}`, { ...values, defaultValue: english }));
  return english.replace(/{{\s*(\w+)\s*}}/g, (match, name: string) => String(values[name] ?? match));
}
