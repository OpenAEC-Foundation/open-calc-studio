import { useEffect, useState } from 'react';
import { renderMarkdown, truncateMarkdown, stripReleaseBoilerplate } from './renderMarkdown';
import './ReleaseNotesPanel.css';

interface Release {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

const REPO = 'OpenAEC-Foundation/open-calc-studio';
const CACHE_KEY = 'ocs-releases-cache-v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Gebundelde release notes: worden in "Wat is er nieuw" getoond ongeacht GitHub
// (offline én vóór een GitHub-publicatie), samengevoegd met de opgehaalde
// releases. Bijwerken bij elke release; de bullets staan in HIGHLIGHTS hieronder.
const BUNDLED_RELEASES: Release[] = [
  { tag_name: 'v0.8.7', name: 'Vier nieuwe importformaten', body: '', published_at: '2026-07-03T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.7` },
  { tag_name: 'v0.8.6', name: 'Staartkosten in rapport-samenvatting gecorrigeerd', body: '', published_at: '2026-07-02T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.6` },
  { tag_name: 'v0.8.5', name: 'Import fors uitgebreid + wit-scherm-fix', body: '', published_at: '2026-07-01T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.5` },
  { tag_name: 'v0.8.4', name: 'Coderingenkiezer + compacte directiebegroting', body: '', published_at: '2026-06-24T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.4` },
  { tag_name: 'v0.8.3', name: 'Wijzigingen bijhouden + calculatie-import', body: '', published_at: '2026-06-18T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.3` },
  { tag_name: 'v0.8.2', name: 'OpenAEC achter een feature-flag', body: '', published_at: '2026-06-12T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.2` },
  { tag_name: 'v0.8.1', name: 'OpenAEC-login + assistent-verbeteringen', body: '', published_at: '2026-06-11T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.1` },
  { tag_name: 'v0.8.0', name: 'Assistent past wijzigingen direct toe', body: '', published_at: '2026-06-10T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.8.0` },
  { tag_name: 'v0.7.10', name: 'OpenAEC-account + onderbalk-navigatie', body: '', published_at: '2026-05-28T00:00:00Z', html_url: `https://github.com/${REPO}/releases/tag/v0.7.10` },
];

// Gecureerde, concrete verbeterpunten per versie. De GitHub-releases bevatten
// vaak alleen downloads; deze lijst toont wat er écht is verbeterd.
const HIGHLIGHTS: Record<string, string[]> = {
  'v0.8.7': [
    'Excel/CSV-import met kolom-mapping — lees vrije Excel-/CSV-indelingen in en koppel zelf de kolommen',
    'Nieuwe formaten: STABU SUFX (XML-bestek) en legacy RAW (.rsu)',
    'Prijscatalogus (BMEcat/DICO) → rechtstreeks in de middelenbibliotheek',
  ],
  'v0.8.6': [
    'Rapport-samenvatting toont de juiste staartkosten-percentages en respecteert aangepaste opslagen (voorheen kon "Algemene bedrijfskosten" op 0% staan)',
    'Staartkosten-model intern opgeschoond; alle rapporten rekenen met dezelfde bron',
  ],
  'v0.8.5': [
    'Veel meer importformaten: .cuf, .dnc, .xtb (met detailregels), .rsx, .s01 en .ifcx',
    'Wit scherm op Windows opgelost (WebView valt terug op software-rendering)',
    'Importmotor schoon herbouwd; totalen komen exact overeen met de bronbestanden',
  ],
  'v0.8.4': [
    'Nr-veld: kies STABU/NL-SfB-coderingen via dubbelklik (en voeg eigen codes toe)',
    'Calculatie-import (.dnc): opent nu meteen als compact directiebegroting-rapport',
    'Project, logo’s en varianten verplaatst naar het lint; eigenschappen opgeschoond',
  ],
  'v0.8.3': [
    'Wijzigingen-bijhouden: kies of de hele regel of alleen de gewijzigde cel kleurt',
    'Wijzigingen ook zichtbaar in de rapportage-PDF',
    'Calculatie-import: directiebegrotingen (.dnc) rechtstreeks importeren én openen via Bestand → Openen',
    'Directiebegroting-rapportoptie; wijzigingshistorie per regel (wie/wanneer/wat)',
  ],
  'v0.8.2': [
    'Calculatieassistent: chatgeschiedenis per begroting, meerdere vragen tegelijk',
    'OpenAEC-functies (login, cloud-opslag) achter een instelling',
  ],
  'v0.8.1': [
    'OpenAEC-login en assistent-verbeteringen',
    'Duidelijke AI-foutmeldingen; assistent-tekst is selecteer- en kopieerbaar',
  ],
  'v0.8.0': [
    'Calculatieassistent past wijzigingen direct in het open document toe',
    '.calc/.mdb met JSON-inhoud openen als native OCS-project',
  ],
  'v0.7.10': [
    'OpenAEC-account en onderbalk-navigatie',
    'Kolommen verbergen/tonen via rechtsklik op de kolomkop',
    'Uren- en Staart-tab gecombineerd; IBIS-stijl rapport (Bouw 2)',
  ],
};

/**
 * Ontdubbel releases op tag: GitHub kan dezelfde versie (bv. v0.7.4) twee keer
 * teruggeven (her-tag / draft + published). Houd de eerste — dat is de nieuwste —
 * en filter latere dubbele tags eruit.
 */
function dedupeByTag(list: Release[]): Release[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const tag = (r.tag_name ?? '').trim().toLowerCase();
    if (seen.has(tag)) return false;
    seen.add(tag);
    return true;
  });
}

/** Semver-desc: v0.8.5 vóór v0.8.4 vóór v0.7.10. */
function compareVersionDesc(a: Release, b: Release): number {
  const parse = (t: string) => (t || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a.tag_name);
  const pb = parse(b.tag_name);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Opgehaalde releases samenvoegen met de gebundelde (opgehaalde wint per tag),
 *  zodat ook versies die nog niet op GitHub staan (bv. de nieuwste) verschijnen. */
function mergeReleases(fetched: Release[]): Release[] {
  const byTag = new Map<string, Release>();
  for (const r of BUNDLED_RELEASES) byTag.set(r.tag_name, r);
  for (const r of fetched) {
    const tag = (r.tag_name ?? '').trim();
    if (tag) byTag.set(tag, r);
  }
  return [...byTag.values()].sort(compareVersionDesc);
}

export function ReleaseNotesPanel() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      // Try cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL_MS && Array.isArray(data)) {
            setReleases(mergeReleases(data));
          }
        }
      } catch {}

      // Fetch fresh
      try {
        const resp = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`);
        if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
        const data: Release[] = await resp.json();
        if (aborted) return;
        setReleases(mergeReleases(data));
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      } catch (e: any) {
        // Network/CORS failure — fall back to bundled list. Never leave UI empty.
        console.warn('[ReleaseNotes] GitHub fetch failed, using bundled fallback:', e);
        if (!aborted && (releases === null || releases.length === 0)) {
          setReleases(mergeReleases([]));
          setError(null);
        }
      }
    })();
    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className="welcome-side-panel">
      <div className="welcome-brand">
        <h3>OpenAEC</h3>
        <a href="https://www.open-aec.com/open-calc-studio/" target="_blank" rel="noopener noreferrer" className="welcome-link">
          www.open-aec.com/open-calc-studio →
        </a>
      </div>

      <div className="welcome-releases">
        <h3>Wat is er nieuw</h3>
        {error && !releases && (
          <p className="welcome-error">Kan release notes niet laden ({error})</p>
        )}
        {!releases && !error && <p className="welcome-loading">Laden…</p>}
        {releases?.length === 0 && <p>Geen releases gevonden</p>}
        {dedupeByTag(releases ?? []).map((r) => {
          const bullets = HIGHLIGHTS[r.tag_name];
          const notes = bullets ? '' : stripReleaseBoilerplate(r.body);
          return (
            <article key={r.tag_name} className="welcome-release">
              <header>
                <a href={r.html_url} target="_blank" rel="noopener noreferrer" className="welcome-release-tag">
                  {r.tag_name}
                </a>
                <time className="welcome-release-date">
                  {new Date(r.published_at).toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric' })}
                </time>
              </header>
              <h4 className="welcome-release-title">{r.name || r.tag_name}</h4>
              {bullets ? (
                <div className="welcome-release-body markdown-body">
                  <ul className="rn-ul">{bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                </div>
              ) : notes ? (
                <div className="welcome-release-body markdown-body">
                  {renderMarkdown(truncateMarkdown(notes, 420))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
