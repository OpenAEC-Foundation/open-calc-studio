/**
 * Selectors van de app-CSS onder één klasse scopen, voor de inbouwbibliotheek.
 *
 * De app schrijft CSS alsof zij de hele pagina is: `:root`, `html, body,
 * #root`, een `*`-reset en algemene klassen als `.content`. In een andere
 * site zou dat de gastpagina raken. Deze functie herschrijft elke selector:
 *
 *   :root / html / body / #root      → .ocs-embed
 *   [data-theme="dark"] …            → .ocs-embed[data-theme="dark"] …
 *   *                                → .ocs-embed *
 *   .ribbon .btn                     → .ocs-embed .ribbon .btn
 *   .ocs-embed …                     → ongewijzigd
 *
 * Gebruikt als PostCSS-stap in vite.lib.config.ts; puur, dus testbaar.
 */

const ROOT_LIKE = /^(:root|html|body|#root)(?=$|[\s.:[>+~,])/;

/** Splits een selectorlijst op komma's die niet tussen haakjes staan. */
export function splitSelectorList(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function scopeSelector(selector: string, scope = '.ocs-embed'): string {
  const s = selector.trim();
  if (!s) return s;
  if (s.startsWith(scope)) return s;
  if (ROOT_LIKE.test(s)) return s.replace(ROOT_LIKE, scope);
  if (s === '*') return `${scope} *`;
  if (s.startsWith('[data-theme')) return `${scope}${s}`;
  return `${scope} ${s}`;
}

export function scopeSelectorList(selector: string, scope = '.ocs-embed'): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of splitSelectorList(selector)) {
    const scoped = scopeSelector(part, scope);
    if (!seen.has(scoped)) {
      seen.add(scoped);
      out.push(scoped);
    }
  }
  return out.join(', ');
}

/** PostCSS-plugin (zonder afhankelijkheid van postcss-typen). */
export function cssScopePlugin(scope = '.ocs-embed') {
  return {
    postcssPlugin: 'ocs-css-scope',
    Rule(rule: { selector: string; parent?: { type?: string; name?: string } | null }) {
      const parent = rule.parent;
      if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name ?? '')) return;
      rule.selector = scopeSelectorList(rule.selector, scope);
    },
  };
}
