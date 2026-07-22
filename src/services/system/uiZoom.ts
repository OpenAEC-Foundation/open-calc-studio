/**
 * App-brede UI-zoom.
 *
 * De grid-zoom in de statusbalk schaalt alleen de begrotingsregels; op brede
 * schermen met hoge resolutie blijft de rest van de interface (lint, panelen,
 * menu's) klein. Deze zoom schaalt de héle interface, inclusief tekst.
 *
 * Bij voorkeur via de webview zelf — dat is dezelfde schaling als Ctrl+= in
 * een browser en laat de CSS-layout ongemoeid, dus de virtualisatie en de
 * muispositie-berekening van het grid blijven kloppen. Buiten Tauri (of als
 * de aanroep faalt) valt hij terug op CSS-zoom.
 */

const KEY = 'ocs-ui-zoom';
export const UI_ZOOM_MIN = 50;
export const UI_ZOOM_MAX = 200;
export const UI_ZOOM_DEFAULT = 100;
/** Vaste stappen, zodat in-/uitzoomen voorspelbaar aanvoelt. */
export const UI_ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

export function clampUiZoom(percent: number): number {
  if (!isFinite(percent)) return UI_ZOOM_DEFAULT;
  return Math.max(UI_ZOOM_MIN, Math.min(UI_ZOOM_MAX, Math.round(percent)));
}

/** De opgeslagen voorkeur (blijft behouden tussen sessies). */
export function loadUiZoom(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return UI_ZOOM_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampUiZoom(n) : UI_ZOOM_DEFAULT;
  } catch {
    return UI_ZOOM_DEFAULT;
  }
}

export function saveUiZoom(percent: number): void {
  try { localStorage.setItem(KEY, String(clampUiZoom(percent))); } catch { /* private mode */ }
}

/** Eerstvolgende stap omhoog/omlaag vanaf de huidige waarde. */
export function nextUiZoom(current: number, richting: 1 | -1): number {
  const c = clampUiZoom(current);
  if (richting > 0) return UI_ZOOM_STEPS.find(s => s > c) ?? UI_ZOOM_MAX;
  return [...UI_ZOOM_STEPS].reverse().find(s => s < c) ?? UI_ZOOM_MIN;
}

let cssFallbackActief = false;

/** Pas de zoom daadwerkelijk toe op de applicatie. */
export async function applyUiZoom(percent: number): Promise<void> {
  const z = clampUiZoom(percent);
  const factor = z / 100;

  if ('__TAURI_INTERNALS__' in window) {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(factor);
      // Een eerder gezette CSS-zoom moet weg, anders stapelt hij op de
      // webview-zoom en zoomt de app dubbel.
      if (cssFallbackActief) {
        document.documentElement.style.removeProperty('zoom');
        cssFallbackActief = false;
      }
      return;
    } catch (e) {
      console.warn('[ui-zoom] webview-zoom mislukt, CSS-terugval gebruikt', e);
    }
  }

  document.documentElement.style.zoom = String(factor);
  cssFallbackActief = true;
}
