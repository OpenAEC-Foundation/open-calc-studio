// Headless controle van de platformbouw in de nagebootste werkplek (server.mjs).
//
// Gecontroleerd (issue #61, laatste vinkje van de checklist):
//  1. het frame is opaque (origin "null"), de brug maakt contact, de app start
//     zonder consolefouten, paginafouten of CSP-overtredingen;
//  2. initialFileId: DOC-1 opent bij de start via open();
//  3. de knop "Tweede scherm" / "Second screen" staat NIET in het frame (en wél
//     in de tegenproef zonder sandbox en zonder host);
//  4. een cel wijzigen + Ctrl+S: opslaan { bestand: DOC-1, verwachte_versie: 1 }
//     bij de host, versie 2, de bytes bevatten de wijziging, het tabblad is schoon;
//  5. Openen (Ctrl+O): de lijst van de host, DOC-2 openen;
//  6. Opslaan als (Ctrl+Shift+S): een nieuw bestand bij de host;
//  6. (de host geeft een nieuw id zoals Frappe: tien hextekens);
//  7. een conflict (Piet sloeg op): de host maakt een kopie met de naam zoals
//     openaec-storage ("<stam> (conflict Anna <YYYY-MM-DD HHMM>).ifcCalc"),
//     de app schakelt naar de kopie en meldt die naam;
//  8. een oudere versie (alleen-lezen) openen en opslaan: geweigerd, niets naar de host;
//     8b. een slot van een ander: ook bij de juiste basisversie een conflictkopie;
//     8c. de host weigert met een foutcode van storage (quotum_ruimte_vol): de app
//         meldt het, het tabblad blijft gewijzigd, er komt geen versie of kopie bij;
//  9. de assistent over de brug: tools, definities (gelijk aan dist/mcp-tools.json),
//     calc_get_budget_summary, calc_new_budget, calc_action file.export (niet_in_browser);
// 10. geen verzoek van de app buiten de bundel en de brug, geen cookie mee.
//
// Draaien:  node verification/werkplek-sandbox/controle.mjs [--dist <map>] [--headed]
// Schermafdrukken en het verslag: verification/werkplek-sandbox/uitvoer/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startWerkplek, WORTEL, APP_PAD, BRUG_PAD } from './server.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const UIT = path.join(HIER, 'uitvoer');
fs.mkdirSync(UIT, { recursive: true });
const argv = process.argv.slice(2);
const DIST = argv.includes('--dist') ? path.resolve(argv[argv.indexOf('--dist') + 1]) : path.join(WORTEL, 'dist');
const HEADED = argv.includes('--headed');

const regels = [];
const noteer = (...a) => { const s = a.join(' '); regels.push(s); console.log(s); };
const resultaten = [];
function eis(naam, voorwaarde, bewijs = '') {
  resultaten.push({ naam, ok: !!voorwaarde, bewijs });
  noteer(`${voorwaarde ? 'GESLAAGD' : 'MISLUKT '}  ${naam}${bewijs ? `  — ${bewijs}` : ''}`);
  return !!voorwaarde;
}
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function totDat(f, ms, wat) {
  const eind = Date.now() + ms;
  for (;;) {
    const v = await f().catch(() => false);
    if (v) return v;
    if (Date.now() > eind) throw new Error(`Time-out: ${wat}`);
    await wacht(150);
  }
}

async function startBrowser() {
  const opties = { headless: !HEADED };
  const pogingen = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && { ...opties, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    { ...opties },
    { ...opties, channel: 'chrome' },
    { ...opties, channel: 'msedge' },
  ].filter(Boolean);
  let laatste;
  for (const p of pogingen) {
    try { const b = await chromium.launch(p); noteer(`Browser: ${b.version()} (${p.channel ?? p.executablePath ?? 'playwright-chromium'})`); return b; }
    catch (e) { laatste = e; }
  }
  throw laatste;
}

// In elk frame CSP-overtredingen vastleggen, los van de console.
const VANGER = `
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + e.lineNumber);
  });
`;

const werkplek = await startWerkplek({ bundel: DIST, poortApp: Number(process.env.WERKPLEK_POORT_APP || 3671), poortGast: Number(process.env.WERKPLEK_POORT_GAST || 3672) });
noteer(`Bundel ${werkplek.bundelUrl} (${DIST}), gastpagina ${werkplek.gastAdres()}`);
noteer(`CSP op elk bestand van de bundel:\n  ${werkplek.csp}`);
const browser = await startBrowser();
let code = 1;
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL' });
  await ctx.addInitScript(VANGER);
  const page = await ctx.newPage();
  const consoleAlles = [];
  const consolefouten = [];
  const paginafouten = [];
  const dialogen = [];
  const buitenVerzoeken = [];
  page.on('console', (m) => {
    const plek = m.location()?.url;
    const regel = `[${m.type()}] ${m.text()}${plek ? ` (${plek}${m.location().lineNumber ? ':' + m.location().lineNumber : ''})` : ''}`;
    consoleAlles.push(regel);
    if (m.type() === 'error') consolefouten.push(regel);
  });
  page.on('response', (r) => { if (r.status() >= 400) consolefouten.push(`[http ${r.status()}] ${r.request().method()} ${r.url()} (${r.request().resourceType()}, frame ${r.frame()?.name() || 'top'})`); });
  page.on('pageerror', (e) => paginafouten.push(String(e.stack || e.message)));
  page.on('dialog', (d) => { dialogen.push(`${d.type()}: ${d.message()}`); void d.accept(); });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.origin !== werkplek.APP && u.origin !== werkplek.GAST) buitenVerzoeken.push(r.url());
  });
  const gast = () => page.evaluate(() => ({ log: window.__gast.log, opgeslagen: window.__gast.opgeslagen, opgeslagenAls: window.__gast.opgeslagenAls,
    geopend: window.__gast.geopend, geweigerd: window.__gast.geweigerd, eersteAntwoord: window.__gast.eersteAntwoord, appSoorten: window.__gast.appSoorten, overzicht: window.__gast.overzicht(),
    instellingen: window.__gast.instellingen() }));

  await page.goto(werkplek.gastAdres({ bestand: 'DOC-1' }), { waitUntil: 'load' });
  const frame = await totDat(async () => page.frame({ name: 'ocs-app' }), 30_000, 'app-iframe');
  const tabMet = (naam) => frame.locator('.file-tab', { hasText: naam });
  const actiefTab = () => frame.evaluate(() => document.querySelector('.file-tab.active')?.textContent?.trim() ?? null);
  const gewijzigd = () => frame.evaluate(() => !!document.querySelector('.file-tab.active .file-tab-modified'));
  // Focus in het frame zonder een cel te bewerken (een klik op een actieve cel opent de editor).
  const focusFrame = async () => { await page.keyboard.press('Escape'); await frame.locator('.file-tab.active .file-tab-label').click(); };

  // 1 + 2. Start, brug, DOC-1.
  await totDat(async () => (await tabMet('Voorbeeldbegroting').count()) > 0, 120_000, 'DOC-1 open in de app');
  await totDat(async () => (await frame.locator('.grid-row.regel .col-description').count()) > 0, 60_000, 'regels in het raster');
  await wacht(2500); // late fouten (lui geladen chunks, fonts) ook meetellen
  let g = await gast();
  const binnen = await frame.evaluate(() => {
    let opslag = 'bruikbaar';
    try { window.localStorage.setItem('x', '1'); opslag = 'bruikbaar (' + window.localStorage.constructor.name + ')'; } catch (e) { opslag = e.name; }
    let idb = 'bruikbaar';
    try { indexedDB.open('x').onerror = () => {}; } catch (e) { idb = e.name; }
    return { origin: self.origin, ancestorOrigins: [...(location.ancestorOrigins || [])], opslag, idb, host: typeof window.openaecHost?.open,
      taal: window.openaecHost?.taal, initialFileId: window.openaecHost?.initialFileId, lang: document.documentElement.lang,
      app: typeof window.__OPDS_APP__?.run, brug: window.__WERKPLEK_BRUG__?.toestand() };
  });
  noteer(`In het frame: ${JSON.stringify(binnen)}`);
  eis('frame heeft een opaque origin en de brug is verbonden', binnen.origin === 'null' && binnen.brug === 'verbonden' && g.eersteAntwoord !== null,
    `origin=${binnen.origin}, ancestorOrigins=${JSON.stringify(binnen.ancestorOrigins)}, handdruk na ${g.eersteAntwoord} ms, app-soorten ${g.appSoorten.join(',')}`);
  eis('window.openaecHost en window.__OPDS_APP__ staan in het frame', binnen.host === 'function' && binnen.app === 'function');
  const openDoc1 = g.log.find((r) => r.soort === 'open' && r.bestand === 'DOC-1');
  eis('initialFileId: DOC-1 opent bij de start via open()', !!openDoc1 && g.geopend.includes('DOC-1'), `log: ${g.log.filter((r) => r.soort !== 'hallo').map((r) => r.soort + (r.bestand ? ':' + r.bestand : '')).join(', ')}`);
  await page.screenshot({ path: path.join(UIT, '1-start-DOC-1.png') });
  const cspStart = (await Promise.all(page.frames().map((f) => f.evaluate(() => window.__csp || []).catch(() => [])))).flat();
  eis('start zonder consolefouten, paginafouten en CSP-overtredingen', consolefouten.length === 0 && paginafouten.length === 0 && cspStart.length === 0,
    `${consolefouten.length} consolefouten, ${paginafouten.length} paginafouten, ${cspStart.length} CSP-overtredingen`);
  for (const r of [...consolefouten, ...paginafouten, ...cspStart]) noteer('  BIJ DE START: ' + r);

  // 3. Tweede scherm.
  const tweede = frame.locator('button', { hasText: /^(Tweede scherm|Second screen)$/ });
  const werkbalk = await frame.locator('.workspace-layout-bar').count();
  eis('knop "Tweede scherm" staat niet in het frame', werkbalk > 0 && (await tweede.count()) === 0, `werkruimtebalk aanwezig: ${werkbalk > 0}, knoppen "Tweede scherm": ${await tweede.count()}`);

  // 4. Wijzigen en opslaan.
  const cel = frame.locator('.grid-row.regel .col-description').first();
  const oud = (await cel.innerText()).trim();
  const nieuw = 'Gewijzigd in de werkplek ' + Date.now();
  await cel.dblclick();
  const editor = frame.locator('.grid-cell-editor').first();
  await editor.waitFor({ timeout: 10_000 });
  await editor.fill(nieuw);
  await editor.press('Enter');
  await totDat(async () => (await cel.innerText()).includes(nieuw), 10_000, 'nieuwe omschrijving in de cel');
  const gewijzigdVoor = await gewijzigd();
  await cel.click();
  await page.keyboard.press('Control+s');
  await totDat(async () => (await gast()).opgeslagen.length >= 1, 30_000, 'opslaan bij de host');
  await wacht(800);
  g = await gast();
  const bewaard = await page.evaluate(() => window.__gast.tekst('DOC-1'));
  const opslag1 = g.opgeslagen[0];
  eis('wijziging + Ctrl+S gaat naar de host als nieuwe versie', opslag1.doel === 'DOC-1' && String(opslag1.verwachteVersie) === '1' && g.overzicht['DOC-1'].versies === 2 && bewaard.includes(nieuw),
    `"${oud}" → "${nieuw}"; opslaan ${JSON.stringify(opslag1)}; DOC-1 heeft ${g.overzicht['DOC-1'].versies} versies; bytes bevatten de wijziging: ${bewaard.includes(nieuw)}`);
  eis('tabblad was gewijzigd en is na opslaan schoon', gewijzigdVoor && !(await gewijzigd()), `voor: ${gewijzigdVoor}, na: ${await gewijzigd()}`);
  await page.screenshot({ path: path.join(UIT, '2-opgeslagen.png') });

  // 5. Openen via de host.
  await focusFrame();
  await page.keyboard.press('Control+o');
  const dialoog = frame.locator('.host-file-picker');
  await dialoog.waitFor({ timeout: 15_000 });
  await totDat(async () => (await dialoog.locator('.host-file-list button').count()) >= 3, 15_000, 'lijst van de host');
  const namen = await dialoog.locator('.host-file-list button span').allInnerTexts();
  await page.screenshot({ path: path.join(UIT, '3-openen-lijst.png') });
  await dialoog.locator('.host-file-list button', { hasText: 'Sample estimate.ifcCalc' }).click();
  await dialoog.locator('button.oa-button--primary').click();
  await totDat(async () => (await tabMet('Sample estimate').count()) > 0, 30_000, 'DOC-2 open');
  g = await gast();
  eis('Openen (Ctrl+O) toont de lijst van de host en opent DOC-2', g.log.some((r) => r.soort === 'open' && r.bestand === 'DOC-2' && r.ok), `lijst: ${namen.join(' | ')}; actief: ${await actiefTab()}`);

  // 6. Opslaan als.
  await focusFrame();
  await page.keyboard.press('Control+Shift+s');
  await totDat(async () => (await gast()).opgeslagenAls.length >= 1, 30_000, 'opslaan_als bij de host');
  await wacht(500);
  g = await gast();
  const alsNieuw = g.opgeslagenAls[0];
  eis('Opslaan als (Ctrl+Shift+S) maakt een nieuw bestand bij de host', /^[0-9a-f]{10}$/.test(alsNieuw?.id ?? '') && g.overzicht[alsNieuw.id]?.versies === 1 && (await actiefTab())?.includes(alsNieuw.definitief.replace(/\.ifcCalc$/i, '')),
    `${JSON.stringify(alsNieuw)}; actief: ${await actiefTab()}`);

  // 7. Conflict op DOC-1.
  await tabMet('Voorbeeldbegroting').first().click();
  await totDat(async () => (await actiefTab())?.includes('Voorbeeldbegroting'), 10_000, 'DOC-1 actief');
  await page.evaluate(() => { window.__gast.conflictVolgende = true; });
  const cel2 = frame.locator('.grid-row.regel .col-description').nth(1);
  await cel2.dblclick();
  await frame.locator('.grid-cell-editor').first().fill('Conflictproef');
  await frame.locator('.grid-cell-editor').first().press('Enter');
  const aantalVoor = (await gast()).opgeslagen.length;
  const dialogenVoorConflict = dialogen.length;
  await page.keyboard.press('Control+s');
  await totDat(async () => (await gast()).opgeslagen.length > aantalVoor, 30_000, 'opslaan met conflict');
  await wacht(800);
  g = await gast();
  const conflict = g.opgeslagen.at(-1);
  await totDat(async () => dialogen.length > dialogenVoorConflict, 15_000, 'melding over de conflictkopie');
  const conflictMelding = dialogen.slice(dialogenVoorConflict).join(' | ');
  // De naam zoals _conflictnaam in openaec-storage (api.py): "<stam> (conflict <voornaam> <YYYY-MM-DD HHMM>)<ext>".
  const CONFLICTNAAM = (stam) => new RegExp(`^${stam.replace(/[()]/g, '\\$&')} \\(conflict Anna \\d{4}-\\d{2}-\\d{2} \\d{4}\\)\\.ifcCalc$`);
  eis('conflict: de host bewaart een kopie, het origineel blijft, de app gaat naar de kopie en meldt de naam',
    conflict.conflict && conflict.reden === 'verouderd' && CONFLICTNAAM('Voorbeeldbegroting').test(conflict.naam) && g.overzicht[conflict.doel]?.versies === 1
      && g.overzicht['DOC-1'].versies === 3 && (await actiefTab())?.includes(conflict.naam.replace(/\.ifcCalc$/i, '')) && conflictMelding.includes(conflict.naam),
    `${JSON.stringify(conflict)}; DOC-1: ${g.overzicht['DOC-1'].versies} versies (incl. die van Piet); actief tabblad: ${await actiefTab()}; melding: "${conflictMelding}"`);

  // 8. Oudere versie alleen-lezen.
  await focusFrame();
  await page.keyboard.press('Control+o');
  await dialoog.waitFor({ timeout: 15_000 });
  await totDat(async () => (await dialoog.locator('.host-file-list button').count()) >= 3, 15_000, 'lijst');
  await dialoog.locator('.host-file-list button', { hasText: /^Voorbeeldbegroting\.ifcCalc/ }).click();
  await totDat(async () => (await dialoog.locator('button.oa-button--quiet').count()) >= 3, 15_000, 'versies');
  // Storage geeft de versies nieuwste eerst (versies() in api.py: "volgnummer desc").
  const versieKnoppen = await dialoog.locator('button.oa-button--quiet span').allInnerTexts();
  await dialoog.locator('button.oa-button--quiet', { has: frame.locator('span', { hasText: /^(Versie|Version) 1$/ }) }).click();
  await totDat(async () => (await gast()).log.some((r) => r.soort === 'open' && r.versie === 1), 15_000, 'open { versie: 1 }');
  await wacht(1500);
  const opgeslagenVoorRo = (await gast()).opgeslagen.length;
  const dialogenVoor = dialogen.length;
  await focusFrame();
  await page.keyboard.press('Control+s');
  await totDat(async () => dialogen.length > dialogenVoor, 15_000, 'melding bij opslaan alleen-lezen');
  eis('oudere versie: alleen-lezen, opslaan geweigerd, niets naar de host', (await gast()).opgeslagen.length === opgeslagenVoorRo && /read-only/i.test(dialogen.at(-1)),
    `versies in de kiezer: ${versieKnoppen.join(', ')}; melding (window.alert): "${dialogen.at(-1)}"`);

  // 8b. Slot van een ander: storage maakt ook dan een conflictkopie, al klopt de basisversie (_registreer).
  const alsTab = alsNieuw.definitief.replace(/\.ifcCalc$/i, '');
  const bewerkEnSla = async (tekst) => {
    await tabMet(alsTab).first().click();
    await totDat(async () => (await actiefTab())?.includes(alsTab), 10_000, `${alsTab} actief`);
    const c = frame.locator('.grid-row.regel .col-description').nth(2);
    await c.dblclick();
    await frame.locator('.grid-cell-editor').first().fill(tekst);
    await frame.locator('.grid-cell-editor').first().press('Enter');
    await page.keyboard.press('Control+s');
  };
  await page.evaluate(() => { window.__gast.slotVolgende = true; });
  const voorSlot = { opgeslagen: (await gast()).opgeslagen.length, dialogen: dialogen.length };
  await bewerkEnSla('Slotproef');
  await totDat(async () => (await gast()).opgeslagen.length > voorSlot.opgeslagen, 30_000, 'opslaan met een slot van Piet');
  await totDat(async () => dialogen.length > voorSlot.dialogen, 15_000, 'melding over de conflictkopie (slot)');
  g = await gast();
  const slot = g.opgeslagen.at(-1);
  const slotMelding = dialogen.slice(voorSlot.dialogen).join(' | ');
  eis('slot van een ander: conflictkopie ook bij de juiste basisversie, de app gaat naar de kopie',
    slot.conflict && slot.reden === 'slot' && String(slot.verwachteVersie) === '1' && CONFLICTNAAM(alsTab).test(slot.naam) && g.overzicht[alsNieuw.id].versies === 1
      && g.overzicht[alsNieuw.id].slot === 'piet@klant.example' && (await actiefTab())?.includes(slot.naam.replace(/\.ifcCalc$/i, '')) && slotMelding.includes(slot.naam),
    `${JSON.stringify(slot)}; origineel: ${JSON.stringify(g.overzicht[alsNieuw.id])}; actief: ${await actiefTab()}; melding: "${slotMelding}"`);

  // 8c. Weigering met een foutcode van storage (hier quotum_ruimte_vol): geen kopie, niets verloren.
  const kopieId = slot.doel;
  await page.evaluate(() => { window.__gast.weigerVolgende = 'quotum_ruimte_vol'; });
  const voorWeigering = { opgeslagen: (await gast()).opgeslagen.length, dialogen: dialogen.length };
  const c3 = frame.locator('.grid-row.regel .col-description').nth(3);
  await c3.dblclick();
  await frame.locator('.grid-cell-editor').first().fill('Quotumproef');
  await frame.locator('.grid-cell-editor').first().press('Enter');
  await page.keyboard.press('Control+s');
  await totDat(async () => dialogen.length > voorWeigering.dialogen, 15_000, 'melding bij een weigering met foutcode');
  await wacht(500);
  g = await gast();
  const weigerMelding = dialogen.slice(voorWeigering.dialogen).join(' | ');
  eis('weigering met foutcode (quotum_ruimte_vol): de app meldt het, het tabblad blijft gewijzigd, geen versie of kopie erbij',
    g.geweigerd.at(-1)?.code === 'quotum_ruimte_vol' && g.geweigerd.at(-1)?.bestand === kopieId && g.opgeslagen.length === voorWeigering.opgeslagen
      && g.overzicht[kopieId].versies === 1 && (await gewijzigd()) && weigerMelding.includes('quotum van deze ruimte'),
    `geweigerd: ${JSON.stringify(g.geweigerd.at(-1))}; kopie: ${g.overzicht[kopieId].versies} versie(s); tabblad gewijzigd: ${await gewijzigd()}; melding: "${weigerMelding}"`);
  await page.screenshot({ path: path.join(UIT, '3b-weigering.png') });

  // 9. De assistent over de brug.
  const tools = await page.evaluate(() => window.werkplek.tools());
  const defs = await page.evaluate(() => window.werkplek.definities());
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'mcp-tools.json'), 'utf8'));
  eis('assistent: tools() en definitions() over de brug, gelijk aan dist/mcp-tools.json', tools.length > 0 && JSON.stringify(defs) === JSON.stringify(manifest.tools ?? manifest),
    `${tools.length} tools: ${tools.join(', ')}`);
  const samenvatting = await page.evaluate(() => window.werkplek.run('calc_get_budget_summary'));
  eis('assistent: calc_get_budget_summary', samenvatting && Array.isArray(samenvatting.documents) && samenvatting.activeDocumentId,
    `${samenvatting.documents.length} documenten (${samenvatting.documents.map((d) => d.fileName + (d.readOnly ? ' [alleen-lezen]' : '')).join(', ')}), ${samenvatting.itemCount} regels, ${samenvatting.chapters?.length} hoofdstukken`);
  const nieuwDoc = await page.evaluate(() => window.werkplek.run('calc_new_budget', { fileName: 'Assistent-proef' }));
  await totDat(async () => (await tabMet('Assistent-proef').count()) > 0, 15_000, 'nieuwe begroting als tabblad');
  const naNieuw = await page.evaluate(() => window.werkplek.run('calc_get_budget_summary'));
  eis('assistent: calc_new_budget maakt een tabblad en wordt actief', naNieuw.activeDocumentId === nieuwDoc.documentId && naNieuw.documents.length === samenvatting.documents.length + 1,
    `${JSON.stringify(nieuwDoc)}; daarna ${naNieuw.documents.length} documenten, ${naNieuw.itemCount} regels`);
  const weigering = await page.evaluate(() => window.werkplek.run('calc_action', { action: 'file.export', params: {} }).then(() => null, (e) => ({ message: e.message, code: e.code })));
  eis('assistent: calc_action file.export geeft niet_in_browser', weigering && /niet_in_browser/.test(weigering.message), JSON.stringify(weigering));
  await page.screenshot({ path: path.join(UIT, '4-assistent.png') });

  // 10. Netwerk en eindstand.
  const vreemd = werkplek.verzoeken.app.filter((r) => !r.pad.startsWith(APP_PAD) && !r.pad.startsWith(BRUG_PAD));
  const metCookie = werkplek.verzoeken.app.filter((r) => r.cookie);
  eis('geen verzoek buiten de bundel/brug, geen cookie mee', buitenVerzoeken.length === 0 && vreemd.length === 0 && metCookie.length === 0,
    `${werkplek.verzoeken.app.length} verzoeken naar oorsprong A; daarbuiten: ${JSON.stringify(buitenVerzoeken)}; vreemde paden: ${JSON.stringify(vreemd.map((r) => r.pad))}; met cookie: ${metCookie.length}`);
  g = await gast();
  noteer(`Instellingen via de host (settings): ${Object.keys(g.instellingen).length} sleutels (${Object.keys(g.instellingen).join(', ')})`);
  const cspAlles = (await Promise.all(page.frames().map((f) => f.evaluate(() => window.__csp || []).catch(() => [])))).flat();
  eis('hele sessie zonder consolefouten, paginafouten en CSP-overtredingen', consolefouten.length === 0 && paginafouten.length === 0 && cspAlles.length === 0,
    `${consolefouten.length} consolefouten, ${paginafouten.length} paginafouten, ${cspAlles.length} CSP-overtredingen`);
  for (const r of consolefouten) noteer('  CONSOLE ' + r);
  for (const r of paginafouten) noteer('  PAGINA  ' + r);
  for (const r of cspAlles) noteer('  CSP     ' + r);
  const waarschuwingen = consoleAlles.filter((r) => r.startsWith('[warning]'));
  noteer(`Waarschuwingen in de console (${waarschuwingen.length}):`);
  for (const r of [...new Set(waarschuwingen)].slice(0, 30)) noteer('  ' + r.slice(0, 400));
  noteer(`Bestanden bij de host aan het eind: ${JSON.stringify(g.overzicht)}`);

  // Tegenproef: dezelfde bundel zonder sandbox, CSP en host: daar staat de knop wel.
  const los = await ctx.newPage();
  await los.goto(werkplek.losUrl, { waitUntil: 'load' });
  // De platformbouw start zonder document; de werkruimtebalk hoort bij een open begroting.
  await totDat(() => los.evaluate(() => typeof window.__OPDS_APP__?.run === 'function'), 60_000, '__OPDS_APP__ in de tegenproef');
  await los.waitForTimeout(1500);
  await los.evaluate(() => window.__OPDS_APP__.run('calc_new_budget', { fileName: 'Tegenproef' }));
  await totDat(async () => (await los.locator('.workspace-layout-bar').count()) > 0, 60_000, 'werkruimtebalk in de tegenproef');
  const losKnop = await los.locator('button', { hasText: /^(Tweede scherm|Second screen)$/ }).count();
  eis('tegenproef: zonder werkplek staat de knop "Tweede scherm" er wel', losKnop === 1, `${losKnop} knop(pen) op ${werkplek.losUrl}`);
  await los.screenshot({ path: path.join(UIT, '5-tegenproef-zonder-werkplek.png') });
  await los.close();
  code = resultaten.every((r) => r.ok) ? 0 : 1;
} catch (e) {
  noteer('AFGEBROKEN: ' + (e.stack || e.message));
  code = 2;
} finally {
  await browser.close().catch(() => {});
  await werkplek.sluit();
  const geslaagd = resultaten.filter((r) => r.ok).length;
  noteer(`\n${geslaagd}/${resultaten.length} geslaagd${code === 2 ? ' (afgebroken)' : ''}. Schermafdrukken en verslag: ${UIT}`);
  fs.writeFileSync(path.join(UIT, 'verslag.txt'), regels.join('\n') + '\n');
}
process.exit(code);
