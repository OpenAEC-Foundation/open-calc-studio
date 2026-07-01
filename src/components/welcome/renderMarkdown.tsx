import React from 'react';

/**
 * Kleine, veilige Markdown-renderer voor de release-notes ("Wat is er nieuw").
 * Produceert React-elementen (geen dangerouslySetInnerHTML) zodat externe
 * GitHub-inhoud geen XSS-risico vormt. Ondersteunt de subset die in
 * release-notes voorkomt: koppen, opsommingen, **vet**, *cursief*, `code` en
 * links ([tekst](url) + kale URL's). Andere markdown valt terug op platte tekst.
 */

/** Sta alleen veilige link-schema's toe. */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

const Link: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
);

/** Inline-opmaak binnen één tekstregel → React-nodes. */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // code | [tekst](url) | **vet** | *cursief* | kale URL
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (m[1]) {
      nodes.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (m[2]) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      const href = safeHref(mm[2]);
      nodes.push(href ? <Link key={key++} href={href}>{mm[1]}</Link> : mm[1]);
    } else if (m[3]) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (m[4]) {
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else if (m[5]) {
      const href = safeHref(tok);
      nodes.push(href ? <Link key={key++} href={href}>{tok}</Link> : tok);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Volledige (blok-)markdown → React-nodes. */
export function renderMarkdown(md: string): React.ReactNode {
  const lines = (md ?? '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key++} className="rn-p">{renderInline(para.join(' '))}</p>);
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push(<div key={key++} className="rn-h">{renderInline(h[2])}</div>);
      i++;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="rn-ul">
          {items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ul>,
      );
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return <>{blocks}</>;
}

/**
 * Strip de standaard-boilerplate uit GitHub-release-notes: het "Downloads"-blok
 * (met .exe/.dmg/.AppImage-links) en de "Full Changelog"-regel. Wat overblijft
 * zijn de concrete verbeterpunten.
 */
export function stripReleaseBoilerplate(md: string): string {
  const lines = (md ?? '').replace(/\r/g, '').split('\n');
  const isDownloadsHeading = (l: string) => l.replace(/[*#:>\s]/g, '').toLowerCase() === 'downloads';
  const out: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (isDownloadsHeading(line)) { skip = true; continue; }
    if (skip) {
      // overslaan zolang het lege of lijst-regels zijn (de download-bullets)
      if (/^\s*$/.test(line) || /^\s*[-*+]\s/.test(line)) continue;
      skip = false;
    }
    if (/full\s*changelog/i.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Kort markdown in op een regelgrens rond `maxChars`, zodat blok-structuur
 * (lijsten/koppen) heel blijft. Voegt een "…" toe als er ingekort is.
 */
export function truncateMarkdown(md: string, maxChars = 420): string {
  const text = (md ?? '').replace(/\r/g, '').trim();
  if (text.length <= maxChars) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let len = 0;
  for (const ln of lines) {
    if (len + ln.length > maxChars && out.length > 0) break;
    out.push(ln);
    len += ln.length + 1;
  }
  return out.join('\n').trim() + ' …';
}
