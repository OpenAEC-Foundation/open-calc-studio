/**
 * Build-time feature flags. Geconfigureerd per omgeving via `.env.*` files
 * (Vite). Eén regel waarheid — niet verspreid via losse imports.
 */

/**
 * Of de OpenAEC-integraties (login + cloud-opslag + AI-via-account) zichtbaar
 * en bereikbaar zijn. Standaard UIT (publieke builds tonen geen
 * platform-koppeling); zet `VITE_OPENAEC_ENABLED=true` in `.env.development`
 * of `.env.production` om hem aan te zetten in jouw eigen build.
 */
export const PLATFORM_BUILD = import.meta.env.VITE_PLATFORM_BUILD === 'true';
export const OPENAEC_ENABLED = !PLATFORM_BUILD && import.meta.env.VITE_OPENAEC_ENABLED === 'true';
export const USER_EXTENSIONS_ENABLED = !PLATFORM_BUILD;

/** A site host owns authentication and network access in the hosted release. */
export function allowsExternalServices(): boolean {
  return !PLATFORM_BUILD && !(typeof window !== 'undefined' && (window.openaecHost || window.origin === 'null'));
}
