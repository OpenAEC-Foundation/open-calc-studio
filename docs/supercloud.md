# Gehoste Open Calc Studio en SuperCloud

## Release 2026.46.0 — overdracht voor issue #73

Gebruik het platformarchief van deze versie, inclusief `build-info.json` en
`mcp-tools.json`; vervang een oudere tijdelijke `werkplekCalc`-ingang door het
onderstaande `openaecHost`-contract. Bewaar de geteste commit, hostversie en
gebruikte headers bij het testrapport. Een test tegen een nagebootste host is
geen bewijs voor de echte klantsite.

De laatste acceptatie blijft op de echte werkplek nodig:

| Controle | Verwacht resultaat |
| --- | --- |
| Openen, wijzigen, Bestand → Opslaan, herladen | Nieuwe opslagversie; wijziging en Recent blijven behouden |
| Historische versie en gelijktijdig opslaan | Alleen-lezen bescherming; weigering of benoemde conflictkopie, geen stil verlies |
| Echt basispad en sandbox/CSP | Voorbeeld, bibliotheek, icoon, fonts en WASM laden zonder console/CSP-fout |
| IFC openen en afdrukken | Geen netwerk buiten de eigen app/brug; afdrukken zonder popup |
| `initialFileId`, locale/thema en assistent | Juiste bestand en stijl; geen eigen zwevende assistent; negen `calc_*`-tools |
| IFCX-uitwisseling openen en opslaan | Nieuwe `.ifcCalc` naast het bronbestand, nooit native JSON over de IFCX-bron |

#73 blijft open tot deze omgevingstests én de openbare containerpublicatie
(#35) bewezen zijn. De releasenotities onderscheiden die controles van de
regressietests van de app.

Bouw de afgeslankte webvariant met:

```sh
npm ci
npm run build:platform -- --base /assets/open_aec/open-calc-studio/ --outDir dist-platform
node scripts/check-platform-build.mjs dist-platform /assets/open_aec/open-calc-studio/
```

Publiceer de hele map, inclusief `.vite/manifest.json`, fonts, WASM, notices,
`build-info.json` en `mcp-tools.json` (de tooldefinities van de assistent, zie
[hieronder](#de-assistent-van-de-site)). De platformbuild schakelt eigen accounts, cloudlogin,
gebruikersextensies, externe feedback en eigen AI-sleutels uit. De
calculatiemotor en ingebouwde import/exportmodules blijven beschikbaar.
Release notes en voorbeelden zijn gebundeld. Er is geen CDN nodig.

## Optioneel opslagcontract

De host plaatst dit object **in het venster van de app**:

```ts
type Version = string | number;
interface SiteHost {
  initialFileId?: string;
  open(id: string, version?: Version): Promise<{
    id: string; name: string; version: Version;
    readOnly: boolean; bytes: Uint8Array | ArrayBuffer;
  }>;
  save(bytes: Uint8Array, options: {
    id?: string; name?: string; expectedVersion?: Version;
  }): Promise<{ id: string; name: string; version: Version }>;
  list(): Promise<{ id: string; name: string; modified: string }[]>;
  versions(id: string): Promise<{
    version: Version; modified: string; author?: string;
  }[]>;
}
window.openaecHost = hostAdapter;
window.dispatchEvent(new Event('openaec-host-ready'));
```

De implementatie gebruikt geen Frappe-URL of token. De host regelt de
identiteit, rechten, byteoverdracht en versieopslag. Het object mag vóór of
na appstart verschijnen; een event versnelt detectie, daarnaast controleert
de app elke 250 ms op vervanging. Na het laden van instellingen verschijnen
de hostbestanden onder Recent. `initialFileId` opent het startbestand.

Een ander formaat dan `.ifcCalc` opent via de importers als nieuwe begroting;
het eerste Opslaan maakt een `.ifcCalc`-bestand ernaast en schrijft nooit over
de bron.

Optioneel biedt de host `settings` aan (`get`, `set`, `delete`, per sleutel een
JSON-waarde). De instellingen van de app (`src/utils/store.ts`) lopen dan via de
host, want een opaque frame heeft geen blijvende opslag. Zonder `settings` blijft
alles zoals het was.

Nieuw maakt een lokale begroting; Opslaan stuurt het native JSON als bytes
naar `save`. Bij het eerste opslaan of Opslaan als ontbreekt `id`, zodat de
host een nieuw bestand kan maken. Bij overschrijven gaat de geopende versie
mee als `expectedVersion`. De host moet een verouderde versie afwijzen,
bijvoorbeeld met een fout `code: 'VERSION_CONFLICT'`. De app toont de fout,
behoudt de oude versie en laat het document gewijzigd. Wijzigingen tijdens
een lopende save blijven eveneens als onopgeslagen gemarkeerd.

Openen toont een bestandskiezer met de laatste en historische versies. Een
`readOnly` versie kan worden bekeken en lokaal bewerkt, maar uitsluitend via
Opslaan als als nieuwe kopie worden bewaard. Bestandsnamen en recente ids
bevatten geen authenticatiegegevens. Zonder host blijven de gewone
browserdownloads en Tauri-bestandsdialogen werken.

## Iframe met opaque origin

### Presentatie van de host

Naast bestandsopslag mag `window.openaecHost` optioneel `locale` en `theme`
aanbieden. De bestaande SuperCloud-namen `taal` en `thema` werken ook.
Een later geïnjecteerde host wordt herkend via `openaec-host-ready` of de
bestaande controlelus. Wijzigingen op hetzelfde hostobject meldt de brug met
`window.dispatchEvent(new Event('openaec-host-preferences'))`.

De app neemt deze voorkeuren na het laden van instellingen over. Zonder thema
start een gehoste sessie licht. De hashparameters `taal` en `thema` dienen als
terugval in de werkplek; gewone zelfstandige sessies negeren die parameters.
De React-inbouwvariant behoudt haar eigen `lang`- en `theme`-props.
In gehoste/inbouwmodus verschijnt geen tweede eigen titelbalk en geen eigen
zwevende assistent. Bestandsacties en instellingen blijven via het lint en
het Bestand-menu bereikbaar.

De Frappe-brug biedt dit contract aan en is met de exacte sandbox/CSP getest
(`scripts/werkplek-e2e/calc-proef.mjs` in openaec-bench): openen, opslaan,
importeren, afdrukken, instellingen en de assistent.

### De assistent van de site

De platformbuild zet `window.__OPDS_APP__` neer (`src/services/mcp/siteAppTools.ts`):

```ts
window.__OPDS_APP__ = {
  tools(): Promise<string[]>;
  definitions(): Promise<{ name; description; inputSchema }[]>;  // siteAppTools.json
  run(name, args?): Promise<unknown>;                            // een weigering wordt een fout
};
```

Achter `run` zit dezelfde code als achter de desktop-MCP (`executeDesktopCommand`,
de voorstellen van `assistant.preview` en de actiecatalogus), op het open document.
De MCP-laag laadt als aparte chunk bij de eerste aanroep. Wat een bestandssysteem
of een popup nodig heeft (`file.export`, `export.*`, `recovery.*`, het tweede
scherm) geeft `niet_in_browser`; openen en opslaan lopen via het hostcontract,
door de gebruiker. `src/services/mcp/siteAppTools.json` is de bron waar een host
zijn tooldefinities van afleidt. `npm run build:platform` schrijft hetzelfde
bestand als `mcp-tools.json` naast de bundel (`build/siteToolsManifest.ts`), zodat
de host de negen `calc_*`-tools kan controleren zonder de app te starten; de
inhoud is gelijk aan `definitions()`.

Dezelfde negen tools biedt de desktop-MCP-server onder dezelfde namen aan
(`mcp-server/src/calcTools.ts`). Ze lopen daar via het app-commando `calc.tool`
`{ name, args }` door dezelfde code, in de draaiende desktopapp; export,
herstel en het tweede scherm worden op de desktop niet geweigerd. Een prompt
of skill die voor de site is geschreven werkt daardoor ook op de desktop. Zie
[Desktopfuncties via één MCP-server](mcp-desktop.md#de-calc_-tools-van-de-supercloud-assistent).

De knop **Tweede scherm** is verborgen wanneer de app ingebouwd is of in een
sandboxed frame met origin `null` draait, zoals de SuperCloud-werkplek: de
sandbox blokkeert de popup, en een venster met een andere opaque origin hoort
het `BroadcastChannel` van de app niet. Een `openaecHost` alleen is geen reden:
op een gewone origin (bijvoorbeeld een Frappe-pagina) blijft de knop werken.
`workspace.openSecondScreen` geeft in die gevallen een fout.

Het ondersteunde sandboxattribuut is:

```html
<iframe sandbox="allow-scripts allow-downloads allow-modals"
        src="/assets/open_aec/open-calc-studio/index.html"></iframe>
```

`allow-same-origin` en popups zijn niet vereist. Wanneer de browser
`localStorage`, `sessionStorage` of `BroadcastChannel` weigert, gebruikt de
app tijdelijke opslag of schakelt de vensterbrug uit. Zo'n concept verdwijnt
bij herladen: blijvende opslag loopt via de host. Opslagsleutels hebben `ocs-`
of `ocs:` als eigen voorvoegsel.

Een opaque frame vraagt ES-modules en fonts met origin `null` op. De server
moet **de publieke statische appassets** daarom met
`Access-Control-Allow-Origin: *` serveren, zonder cookies/credentials. Dit
geldt niet voor privébestanden of de opslag-API. De host injecteert een
bootstrap/berichtbrug binnen het frame; een ouder kan niet rechtstreeks
`iframe.contentWindow.openaecHost` instellen over deze origin-grens.
Controleer bij een eigen postMessage-brug altijd afzender, kanaal, toegestane
berichttypen en rechten. Een postMessage uit willekeurige frames is geen
opslagautorisatie.

Het npm-pakket biedt `mountIsolated(element, {src, opaque: true, mode:
'wizard'})`. De export/import-berichten gebruiken een uniek kanaal, vast
framevenster en gecontroleerde origin. Deze brug verzorgt projectoverdracht;
ze implementeert zelf geen Frappe-opslagadapter. De React-component accepteert
ook `mode="wizard"`. Zie [inbouwen](library-integration.md).

HTML-rapporten printen in hetzelfde document, waarvoor `allow-modals` nodig
is. De Typst-PDF-preview en native bestandsexporten blijven desktopfuncties.
In een opaque frame kan crashherstel niet (geen IndexedDB): de balk daarvoor
blijft dan weg. Versieconflict en historische versie zijn nog niet in de
Frappe-werkplek getest.
