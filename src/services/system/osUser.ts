/**
 * Windows-gebruikersnaam van de machine waarop de app draait. Wordt gebruikt om
 * wijzigingen aan begrotingsregels toe te schrijven aan een persoon (zie
 * services/history/itemHistory).
 *
 * In de desktop-app komt de naam van de Tauri-command `get_os_username`
 * (Rust leest %USERNAME% / $USER). In de browser/dev is er geen OS-naam
 * beschikbaar → fallback. De waarde wordt één keer opgehaald en gecachet zodat
 * de synchrone store-actie `updateItem` hem direct kan uitlezen.
 */

const FALLBACK = 'onbekend';
let cached: string | null = null;
let inflight: Promise<string> | null = null;

/** Synchroon: de gecachte naam (of de fallback tot hij geladen is). */
export function getCachedOsUsername(): string {
  return cached ?? FALLBACK;
}

/** Haal de Windows-gebruikersnaam op (één keer) en cache hem. */
export function initOsUsername(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const name = await invoke<string>('get_os_username');
      if (typeof name === 'string' && name.trim()) cached = name.trim();
    } catch {
      // Geen Tauri (browser/dev) of command faalt → fallback hieronder.
    }
    if (!cached) cached = FALLBACK;
    return cached;
  })();
  return inflight;
}
