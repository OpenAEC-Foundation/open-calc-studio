// Visueel bewijs voor de FIEBDC-3-rondreis (verification/bc3/RAPPORT.md).
//
// Per testbestand drie afbeeldingen in verification/bc3/images/:
//   <naam>-1-imported.png    de begroting in Open Calc Studio na import
//   <naam>-2-file.png        het originele .bc3-bestand en onze export naast elkaar
//   <naam>-3-reimported.png  de begroting na herimport van onze export
// plus <naam>.export.bc3 in een tijdelijke map (niet in de repo).
//
// Draait tegen de dev-server (npx vite --port 3400) met Playwright:
//   node scripts/bc3-evidence.mjs [bestand.bc3 ...]
// Zonder argumenten: de standaardselectie hieronder.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const URL = process.env.OCS_URL || 'http://localhost:3400';
const SRC = 'verification/bc3';
const OUT = join(SRC, 'images');
const TMP = join(tmpdir(), 'ocs-bc3-evidence');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const DEFAULT_FILES = [
  'fjht_018-12.bc3',
  'corsam_presupuesto.bc3',
  'pycost_test_file_05.bc3',
  'pycost_sispre_PUEBLA-EE.bc3',
  'pycost_measurement_outside_chapter.bc3',
  'pycost_guadix.bc3',
  'tocbim_FirstStreet_corridor_PRES.bc3',
  'BCCA2023_V02.bc3',
];
const files = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES)
  .map((f) => (existsSync(f) ? f : join(SRC, f)));

/** Windows-1252/CP850-bestanden als tekst tonen: alleen voor de afbeelding. */
function readForDisplay(path) {
  const buf = readFileSync(path);
  const latin = buf.toString('latin1');
  return latin.replace(/\r\n/g, '\n');
}

function recordCounts(text) {
  const counts = {};
  for (const m of text.matchAll(/^~([A-Z])\|/gm)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  return Object.entries(counts).sort().map(([k, v]) => `~${k} ${v}`).join('  ');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Kies uit beide bestanden dezelfde soort records (root, eerste hoofdstukken, eerste posten). */
function excerpt(text, maxLines = 34, maxCols = 150) {
  const lines = text.split('\n').filter((l) => l.startsWith('~'));
  const pick = [];
  const want = ['V', 'C', 'D', 'M', 'T'];
  for (const t of want) {
    const n = t === 'V' ? 1 : t === 'C' ? 12 : t === 'D' ? 8 : t === 'M' ? 6 : 4;
    pick.push(...lines.filter((l) => l.startsWith(`~${t}|`)).slice(0, n));
  }
  return pick.slice(0, maxLines).map((l) => (l.length > maxCols ? l.slice(0, maxCols - 1) + '…' : l));
}

function sideBySideHtml(name, before, after) {
  const col = (title, text) => `
    <section>
      <h2>${esc(title)}</h2>
      <div class="meta">${esc(recordCounts(text))} · ${text.length.toLocaleString('en')} chars</div>
      <pre>${excerpt(text).map(esc).join('\n')}</pre>
    </section>`;
  return `<!doctype html><meta charset="utf-8"><title>${esc(name)}</title>
  <style>
    body{margin:0;background:#fff;color:#1f2937;font-family:Segoe UI,Arial,sans-serif}
    header{padding:14px 20px 6px;font-size:15px;font-weight:600}
    header small{font-weight:400;color:#6b7280;margin-left:10px}
    main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 20px 20px}
    h2{font-size:13px;margin:8px 0 2px}
    .meta{font-size:11px;color:#6b7280;margin-bottom:6px}
    pre{margin:0;padding:10px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;font:11px/1.45 Consolas,monospace;white-space:pre;overflow:hidden}
  </style>
  <header>${esc(name)}<small>FIEBDC-3 round trip: the file before and after Open Calc Studio (excerpt: ~V, first ~C, ~D, ~M, ~T records)</small></header>
  <main>${col('Original file (as received)', before)}${col('Exported by Open Calc Studio', after)}</main>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 2000, height: 940 }, deviceScaleFactor: 1.25, locale: 'en-GB', acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.addInitScript(() => {
  localStorage.setItem('i18nextLng', 'en');
  localStorage.setItem('ocs:settings', JSON.stringify({
    theme: 'light', locale: 'en', reportLocale: 'auto', currency: 'EUR',
    autoSave: false, autoSaveInterval: 300000, recentFiles: [],
  }));
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// De zwevende assistentknop hoort niet op bewijsmateriaal
await page.addStyleTag({ content: '.chat-fab,.chat-floating{display:none!important}' });

async function importFile(path) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')]);
  await chooser.setFiles(path);
  await page.waitForTimeout(path.includes('BCCA') ? 9000 : 3000);
  // Meldingenpaneel sluiten als het er is
  await page.locator('.import-warnings button').last().click({ timeout: 1500 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
}

/** Hele app: documentnaam, raster én statusbalk met het totaal — dat is het bewijs. */
async function gridShot(path) {
  await page.locator('.cost-grid').first().waitFor({ timeout: 10000 });
  await page.screenshot({ path });
}

async function exportBc3(savePath) {
  await page.locator('.ribbon-tab', { hasText: /^File$|^Bestand$/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.backstage-items button', { hasText: /^Export/ }).first().click();
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('.bs-panel-option', { hasText: 'FIEBDC-3' }).first().click(),
  ]);
  await download.saveAs(savePath);
  await page.waitForTimeout(300);
}

/** Documenttab sluiten zodat het volgende bestand schoon begint. */
async function closeDocument() {
  await page.keyboard.press('Control+w').catch(() => {});
  await page.waitForTimeout(300);
  // Eventuele "opslaan?"-vraag negeren
  await page.locator('button', { hasText: /Don't save|Niet opslaan|Discard/ }).first().click({ timeout: 800 }).catch(() => {});
  await page.waitForTimeout(300);
}

const results = [];
for (const file of files) {
  const name = basename(file, '.bc3');
  console.log(`== ${name}`);
  await importFile(resolve(file));
  await gridShot(`${OUT}/${name}-1-imported.png`);
  const total1 = await page.locator('.status-bar, .statusbar, footer').first().innerText().catch(() => '');

  const exported = join(TMP, `${name}.export.bc3`);
  await exportBc3(exported);

  const html = sideBySideHtml(basename(file), readForDisplay(resolve(file)), readForDisplay(exported));
  const htmlPath = join(TMP, `${name}.html`);
  writeFileSync(htmlPath, html);
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 1600, height: 720 });
  await p2.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await p2.screenshot({ path: `${OUT}/${name}-2-file.png`, fullPage: true });
  await p2.close();

  await closeDocument();
  await importFile(exported);
  await gridShot(`${OUT}/${name}-3-reimported.png`);
  const total2 = await page.locator('.status-bar, .statusbar, footer').first().innerText().catch(() => '');
  await closeDocument();

  results.push({ name, total1: total1.replace(/\s+/g, ' ').trim(), total2: total2.replace(/\s+/g, ' ').trim() });
  console.log(`   ${name}-1-imported.png, -2-file.png, -3-reimported.png`);
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
