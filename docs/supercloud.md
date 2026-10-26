# Gehoste Open Calc Studio en SuperCloud

Bouw de afgeslankte webvariant met:

```sh
npm ci
npm run build:platform -- --base /assets/open_aec/open-calc-studio/ --outDir dist-platform
node scripts/check-platform-build.mjs dist-platform /assets/open_aec/open-calc-studio/
```

Publiceer de hele map, inclusief `.vite/manifest.json`, fonts, WASM, notices en
`build-info.json`. De platformbuild schakelt eigen accounts, cloudlogin,
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
Test de uiteindelijke Frappe-werkplek met downloaden, printen, versieconflict,
historische versie en herladen; die externe integratietest is nog niet
uitgevoerd in deze wijziging.
