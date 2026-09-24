/**
 * Waar de app "de pagina" is.
 *
 * In de desktop-app en de losse webversie is dat `<html>`: thema, taal en
 * schrijfrichting staan op `document.documentElement` en sneltoetsen gelden
 * overal. Ingebouwd in een andere site (pakket `@openaec/open-calc-studio`)
 * is het de wrapper van de component: alles wat anders op `<html>` zou
 * landen hoort dan op die wrapper, sneltoetsen gelden alleen binnen de
 * component, en dialogen die naar `<body>` porteren krijgen een eigen
 * wrapper zodat de gescopede CSS ze bereikt.
 */

export interface EmbedOptions {
  /** Voorbeeldbegroting openen als er niets geladen is (standaard uit). */
  autoSample?: boolean;
  /** Thema van de gastpagina; wint van de opgeslagen voorkeur. */
  theme?: string;
  /** Interfacetaal van de gastpagina; wint van de opgeslagen voorkeur. */
  locale?: string;
}

/** Klasse waaronder alle CSS van de bibliotheek is gescoped (zie vite.lib.config.ts). */
export const EMBED_CLASS = 'ocs-embed';

let embedded = false;
let host: HTMLElement | null = null;
let portal: HTMLElement | null = null;
let options: EmbedOptions = {};
/** Attributen die gezet werden vóór er een host was (bv. taal bij i18n-init). */
const pending = new Map<string, string>();

export function markEmbedded(opts: EmbedOptions = {}): void {
  embedded = true;
  options = { ...options, ...opts };
}

export function isEmbedded(): boolean {
  return embedded;
}

export function getEmbedOptions(): EmbedOptions {
  return options;
}

export function setHostRoot(el: HTMLElement | null): void {
  host = el;
  if (el) {
    for (const [name, value] of pending) {
      el.setAttribute(name, value);
      portal?.setAttribute(name, value);
    }
  }
}

/**
 * Het element dat de rol van `<html>` speelt. Ingebouwd zonder gemonteerde
 * component (tijdens module-initialisatie) een los element, zodat er niets
 * op de gastpagina belandt.
 */
export function getHostRoot(): HTMLElement {
  if (!embedded) return document.documentElement;
  return host ?? document.createElement('div');
}

/**
 * Attribuut op de host zetten (thema, taal, schrijfrichting). Ingebouwd gaat
 * het ook naar de portal-wrapper, zodat dialogen hetzelfde thema volgen.
 */
export function setHostAttribute(name: string, value: string): void {
  if (embedded) {
    pending.set(name, value);
    host?.setAttribute(name, value);
    portal?.setAttribute(name, value);
    return;
  }
  document.documentElement.setAttribute(name, value);
}

/**
 * Doel voor `createPortal` en losse dialoog-roots. Buiten de inbouw gewoon
 * `<body>`; ingebouwd een wrapper onder `<body>` met dezelfde klasse en
 * attributen als de host (`display: contents`, dus zonder eigen vak).
 */
export function getPortalTarget(): HTMLElement {
  if (!embedded) return document.body;
  if (!portal) {
    portal = document.createElement('div');
    portal.className = `${EMBED_CLASS} ocs-portal`;
    for (const [name, value] of pending) portal.setAttribute(name, value);
    document.body.appendChild(portal);
  }
  return portal;
}

/**
 * Viewport-coördinaten (clientX/Y) omzetten naar de coördinaten waarin
 * in-tree `position: fixed`-elementen (contextmenu's) staan. Ingebouwd is de
 * wrapper door zijn `transform` hun containing block (zie embed.css), dus
 * dan is het de positie binnen de wrapper; anders ongewijzigd.
 */
export function toHostCoords(clientX: number, clientY: number): { x: number; y: number } {
  if (!embedded || !host) return { x: clientX, y: clientY };
  const r = host.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

/**
 * Hoort een toetsaanslag bij deze instantie? Buiten de inbouw altijd;
 * ingebouwd alleen als het doel in de component of in een van haar
 * dialogen ligt — anders zou Ctrl+Z in een formulier van de gastpagina de
 * begroting terugdraaien.
 */
export function eventInsideHost(e: Event): boolean {
  if (!embedded) return true;
  const t = e.target;
  if (!(t instanceof Node)) return false;
  return !!(host?.contains(t) || portal?.contains(t));
}
