import { useEffect, useState } from 'react';
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

// Bundled fallback for offline / API-blocked situations.
// Updated at release time.
const FALLBACK_RELEASES: Release[] = [
  {
    tag_name: 'v0.7.0',
    name: 'Persistent Start Sidebar + critical staart fix',
    body: 'Persistent left start sidebar (release notes + Open AEC link). Voorbeeldbegroting uitgebreid. Spreadsheet auto-open. Logo preset (standaard/custom). Critical: staart in PDF werkt nu.',
    published_at: '2026-05-01T00:00:00Z',
    html_url: 'https://github.com/OpenAEC-Foundation/open-calc-studio/releases/tag/v0.7.0',
  },
  {
    tag_name: 'v0.6.2',
    name: 'Staart-migratie hotfix',
    body: 'Bij file-load worden staart_* items automatisch geïnjecteerd. WpCalc importer maakt nu direct staart_* items.',
    published_at: '2026-05-01T00:00:00Z',
    html_url: 'https://github.com/OpenAEC-Foundation/open-calc-studio/releases/tag/v0.6.2',
  },
  {
    tag_name: 'v0.6.1',
    name: 'Live staart-berekening',
    body: 'Bouw 1 rapport totalen zijn nu altijd identiek aan grid-totaal. Staart wordt live herrekend uit items op iedere wijziging. Maximum update depth loop opgelost.',
    published_at: '2026-05-01T00:00:00Z',
    html_url: 'https://github.com/OpenAEC-Foundation/open-calc-studio/releases/tag/v0.6.1',
  },
  {
    tag_name: 'v0.6.0',
    name: 'Interop exporters + importer coverage',
    body: 'CUF-XML / TRADXML / RAW RSX exporters. Round-trip tests. ZSX/NSX importers. Bouw 1 rapportdatum. Cel-randen in spreadsheet.',
    published_at: '2026-04-22T00:00:00Z',
    html_url: 'https://github.com/OpenAEC-Foundation/open-calc-studio/releases/tag/v0.6.0',
  },
];

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
            setReleases(data);
          }
        }
      } catch {}

      // Fetch fresh
      try {
        const resp = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`);
        if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
        const data: Release[] = await resp.json();
        if (aborted) return;
        setReleases(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      } catch (e: any) {
        // Network/CORS failure — fall back to bundled list. Never leave UI empty.
        console.warn('[ReleaseNotes] GitHub fetch failed, using bundled fallback:', e);
        if (!aborted && (releases === null || releases.length === 0)) {
          setReleases(FALLBACK_RELEASES);
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
        {releases?.map((r) => (
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
            <div className="welcome-release-body">{truncate(r.body, 320)}</div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  // Strip markdown headers and excessive whitespace
  const cleaned = s.replace(/^#+\s+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned.length > n ? cleaned.slice(0, n).trim() + '…' : cleaned;
}
