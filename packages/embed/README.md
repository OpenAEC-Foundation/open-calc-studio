# @openaec/open-calc-studio

[Open Calc Studio](https://open-aec.com/open-calc-studio/) — open-source
construction cost estimating — as an embeddable React component and as a
library. The same code that runs in the desktop app and the
[online demo](https://open-calc-studio.open-aec.com/), packaged so you can
put an estimate inside your own site or application.

- Interface in 39 languages, reports in your report language
- Reads and writes `.ifcCalc` (open JSON, IFC-linked), FIEBDC-3 `.bc3`
  (Spain), ÖNORM A 2063 `.onlv`/`.onlb` (Austria), CUF-XML, IBIS-TRAD, RSX,
  Excel/CSV and more
- Calculator, markups (staart), VAT high/low, subsheets, reports (HTML print)

Not included in the browser package: PDF via the Rust/Typst engine, native
file dialogs and the REST/MCP API — those need the desktop app.

## Install

```sh
npm install @openaec/open-calc-studio react react-dom
```

For a local build (no npm publication required):

```sh
# In the Open Calc Studio repository
npm ci
npm run pack:lib
# In your own project (adjust the path)
npm install /path/to/open-calc-studio/release-embed/openaec-open-calc-studio-2026.44.0.tgz
```

Use the root entry for the UI; use `@openaec/open-calc-studio/core` for
calculation and native JSON files in Node.js, a worker, or a browser without
loading the UI. The core entry does not import React, Tauri or browser globals.

## React component

```tsx
import { OpenCalcStudio } from '@openaec/open-calc-studio';
import '@openaec/open-calc-studio/style.css';

export function EstimatePage() {
  return (
    <div style={{ height: 720 }}>
      <OpenCalcStudio
        lang="en"
        theme="light"
        sample
        onChange={(project, json) => save(json)}
      />
    </div>
  );
}
```

The component fills its parent; give the parent a height. Props:

| Prop | Type | Description |
| --- | --- | --- |
| `theme` | `light` \| `dark` \| `blue` \| `amber-navy` \| `warm-ember` \| `highContrast` \| `system` | Colour theme (default `light`). |
| `lang` | language code or `auto` | Interface language: `en`, `nl`, `de`, `es`, `fr`, … (39). |
| `project` | `string` \| `Blob` \| `ProjectFile` | An `.ifcCalc`/`.ocs` document to open; each new value opens a tab. |
| `fileName` | `string` | Tab name (defaults to the file name). |
| `sample` | `boolean` | Open the bundled sample estimate when nothing is loaded. |
| `onChange` | `(project, json) => void` | Called (debounced) after every change with the full project. |
| `onError` | `(error: Error) => void` | Handle invalid project input or sample loading errors in the host app. |
| `onChangeDelay` | `number` | Debounce in ms (default 300). |
| `className`, `style` | | Applied to the wrapper. |

### Without React

```html
<div id="estimate" style="height: 720px"></div>
<script type="module">
  import { mount } from '@openaec/open-calc-studio';
  import '@openaec/open-calc-studio/style.css';
  const ocs = mount(document.getElementById('estimate'), { lang: 'de', sample: true });
  // Export the current active document: const json = ocs.getProjectJson();
  // later: ocs.update({ theme: 'dark' }); ocs.unmount();
</script>
```

`mount` still uses React under the hood (it is a peer dependency); your
bundler resolves it.

## Library without UI

For a small, browser-independent API:

```ts
import {
  deserializeProject, calculateProject, getStaartBreakdown,
} from '@openaec/open-calc-studio/core';

const project = deserializeProject(jsonText);
const calculated = calculateProject(project); // does not mutate the input
console.log(getStaartBreakdown(calculated.items).aanneemsomExcl);
const updatedJson = JSON.stringify(calculated); // keeps all project metadata
```

`calculateProject` uses the same calculator as the application and MCP server,
including hourly rates, markups, rounding and VAT. File parsing migrates older
native projects using the same reader as the app.

The root entry also exports the UI-oriented importers/exporters:

```ts
import {
  importBc3File, importOnlvFile, importCuf,
  buildBc3Bytes, buildOnlv,
  recalculateItems, getKostprijs, getStaartBreakdown,
  serializeProject, deserializeProject,
  type ProjectFile, type CostItem,
} from '@openaec/open-calc-studio';

const result = importBc3File(await file.arrayBuffer());   // FIEBDC-3
const items = recalculateItems(result.items);
console.log(getKostprijs(items), result.warnings);
```

To open an import result in a mounted component: `openImportResult(result, 'name')`;
to read the current document: `getProjectJson()`; the Zustand store itself is
available as `useOpenCalcStore` for advanced use.

## How it fits in a page

- All CSS is scoped under `.ocs-embed`; nothing is applied to `html`,
  `body` or your own classes. Dialogs are rendered under `<body>` inside
  their own `.ocs-embed` wrapper.
- Keyboard shortcuts (Ctrl+Z, Ctrl+F, Delete, …) only react when the focus
  is inside the component.
- Theme, language and text direction are set on the wrapper, not on `<html>`.
- Fonts are not bundled. Load Inter yourself (e.g. Google Fonts) for the
  same look as the app; otherwise the system UI font is used.
- Settings (theme, language, zoom) persist in `localStorage` of your origin.
- Direct React/mount entry: one instance per page (shared store). For multiple instances use the isolated entry below.
- Full-screen overlays (file menu, dialogs) are `position: fixed` and cover
  the viewport, like a modal.

## Versions

The package version follows the app: `0.13.x` of the package is built from
the same source as Open Calc Studio v0.13.x. Every GitHub release ships the
package as `open-calc-studio-<version>.tgz` as well.

## Licence

LGPL-3.0-only — see the repository LICENSE. Blueprint CSS and fonts have separate CC-BY-SA-4.0/OFL-1.1 notices in the distribution.

## Multiple independent instances (recommended for embedding)

The isolated entry is a small loader with **no React dependency at runtime in
the host page**. Each iframe owns its store, language, theme and shortcuts.
The same static assets are cached and reused by all frames.

```sh
# Copy the self-contained frame assets to your site's public directory.
npx ocs-copy-assets public/calc-studio
```

```js
import { mountIsolated } from '@openaec/open-calc-studio/isolated';

const a = mountIsolated(document.querySelector('#estimate-a'), {
  src: '/calc-studio/index.html', lang: 'nl', sample: true,
  onChange(project, json) { saveA(json); },
  onError(error) { console.error(error); },
});
const b = mountIsolated(document.querySelector('#estimate-b'), {
  src: '/calc-studio/index.html', lang: 'en', sample: true,
});
await Promise.all([a.ready, b.ready]);
const json = await a.getProjectJson();
await a.update({ theme: 'dark' });
await a.importBudget(await file.arrayBuffer(), file.name);
// a.unmount() removes only A; B keeps its data.
```

Give each container a height. `src` must be an HTTP(S) URL serving the packaged
`frame/index.html` and its sibling `assets` folder; do not route it to your SPA's
fallback page. Cross-origin hosting is supported: messages are checked against
both the expected origin and the individual iframe window/channel. `ready`
resolves after the initial document is available (or the empty UI is initialized).
`update` acknowledges the property update; use `onChange` to observe an asynchronously
loaded Blob project. Failed loads go to `onError`. Requests have a 30-second
timeout by default (`timeout` option). Removing the iframe rejects pending calls.

View the example with `npm run dev:embed` at `/isolated.html`.
Run `npm run test:lib:browser` after installing Playwright Chromium to verify
multi-instance isolation and the real browser importers.

## Importers loaded on demand

```js
import { importBudget } from '@openaec/open-calc-studio/importers';
const result = await importBudget(await file.arrayBuffer(), file.name);
```

This browser API lazily loads the parser for native OCS/ifcCalc/JSON, BC3,
ONLV/ONLB, DNC, XTB, BasCalc XLS, WPCalc CALC/MDB, CSV/XLSX, RSX or CUF.
CSV/XLSX columns are detected from the headers; use the root entry's mapping
helpers or the UI for custom column mapping. Unsupported extensions reject with
an explicit error. The returned `warnings` must be shown to the user.
Native project import through this convenience API returns budget items and
metadata only; to preserve all spreadsheets/snapshots pass the native project
straight to `project` or use `/core`'s `deserializeProject`.

PDF and 3D viewers now load only when opened. Native Rust/Typst PDF generation
still requires the desktop app; browser users can print reports to PDF.

### Begrotingconversie

`@openaec/open-calc-studio/converters` biedt `convertToIfcCalc` en `convertFromIfcCalc` voor XPWE/XC4-terugexport met ingebed bronbestand en neutrale CSV/XLSX-tabellen. Zie [conversiedocumentatie](../../docs/begroting-converters.md) voor ondersteunde velden, spreadsheetprofielen en beperkingen.
