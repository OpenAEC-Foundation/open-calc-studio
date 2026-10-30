# Open Calc Studio in een andere toepassing

Het pakket heeft twee ingangen:

- `@openaec/open-calc-studio`: de React-component, `mount()` voor andere
  JavaScript-frameworks en de import/exportfuncties van de interface.
- `@openaec/open-calc-studio/core`: berekenen en native projectbestanden lezen
  en schrijven. Werkt in Node.js zonder DOM, React of Tauri te laden.

## Bouwen en installeren

```sh
npm ci
npm run pack:lib
```

Installeer in je eigen project (pas het pad aan):

```sh
npm install /pad/naar/open-calc-studio/release-embed/openaec-open-calc-studio-2026.44.0.tgz react react-dom
```

Publiceren op npm is niet nodig.

## Interface inladen

Gebruik dit in een project met een bundler zoals Vite. Geef `#begroting` een
hoogte, bijvoorbeeld 720px.

```js
import { mount } from '@openaec/open-calc-studio';
import '@openaec/open-calc-studio/style.css';

const calc = mount(document.querySelector('#begroting'), {
  lang: 'nl',
  sample: true,
  onChange(project, json) { console.log('Gewijzigd', json); },
  onError(error) { console.error('Openen mislukt', error.message); },
});
// calc.update({ project: jsonText });
// const json = calc.getProjectJson();
// calc.unmount();
```

Voor React: `<OpenCalcStudio lang="nl" sample />`. Zie alle props en voorbeelden
in `packages/embed/README.md`.

## Alleen berekenen

```js
import {
  deserializeProject, calculateProject, getStaartBreakdown,
} from '@openaec/open-calc-studio/core';

const project = deserializeProject(jsonText);
const calculated = calculateProject(project);
console.log(getStaartBreakdown(calculated.items).aanneemsomExcl);
```

`calculateProject` verandert het invoerproject niet. Dezelfde rekenkern wordt
gebruikt door de app en MCP-server. De oude MCP-kopie berekende voor de
gewijzigde demo €43.180,00; de gedeelde kern komt op €41.711,06 inclusief btw.
De overeenkomst is getest met de echte stdio MCP-server.

## Grenzen

De directe React/mount-UI ondersteunt één instantie per pagina. Gebruik de nieuwe `/isolated`-ingang voor meerdere onafhankelijke instanties.
Voor SSR gebruik je `/core`; laad de UI alleen aan de browserkant.
De volledige UI heeft meer afhankelijkheden dan de rekenkern.
PDF via Rust/Typst en de live MCP-koppeling vereisen de desktopapp.
Het pakket is lokaal gebouwd en getest; niet op npm gepubliceerd.

## Meerdere instanties

```sh
npx ocs-copy-assets public/calc-studio
```

```js
import { mountIsolated } from '@openaec/open-calc-studio/isolated';
const a = mountIsolated(document.querySelector('#a'), {
  src: '/calc-studio/index.html', lang: 'nl', sample: true,
});
const b = mountIsolated(document.querySelector('#b'), {
  src: '/calc-studio/index.html', lang: 'en', sample: true,
});
await Promise.all([a.ready, b.ready]);
const json = await a.getProjectJson();
// a.unmount();
```

Elke iframe heeft eigen gegevens, taal, thema en sneltoetsen. De kleine loader
laadt geen React of appcode in de gastpagina. Viewers en importers worden
op verzoek geladen. Raadpleeg `packages/embed/README.md` voor alle opties.

## Wizard en hostopslag

`<OpenCalcStudio mode="wizard" />` of `mountIsolated(..., {mode: "wizard"})` opent dezelfde calculatie in vijf stappen. Thema’s volgen Blueprint: light, dark, blueprint, high-contrast-dark en high-contrast-light. `opaque: true` gebruikt een iframe zonder allow-same-origin; serveer publieke module- en fontassets met CORS. Een optionele `window.openaecHost` binnen het frame regelt bestanden, versies en versieconflicten. Zie [SuperCloud](supercloud.md) voor het volledige contract en de vereiste hostbootstrap. Het onafhankelijke REST/HTTP-MCP-rekenproces is apart verpakt; zie [cloud API](cloud-api.md).
