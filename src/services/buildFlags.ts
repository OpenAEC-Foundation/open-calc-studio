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
export const OPENAEC_ENABLED = import.meta.env.VITE_OPENAEC_ENABLED === 'true';
