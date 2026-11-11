/** .ifcx historically also names native projects; distinguish by content, never extension alone. */
export function isIfcxExchangeJson(text: string): boolean {
  try {
    const value = JSON.parse(text);
    return !!value && Array.isArray(value.data) && !Array.isArray(value.items);
  } catch { return false; }
}
