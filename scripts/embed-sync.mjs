// Vóór de lib-build (`npm run build:lib`): houdt packages/embed/package.json
// gelijk aan de app: versie en de runtime-afhankelijkheden (extern in de lib-build, dus de gastsite moet ze
// installeren). React/ReactDOM zijn peer-afhankelijkheden; @types/* horen
// niet in een runtime-pakket.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Ná de build (`node scripts/embed-sync.mjs post`): typedeclaratie voor de
// side-effect-import van style.css, anders meldt TypeScript bij de gebruiker
// TS2882 ("Cannot find module or type declarations for side-effect import").
if (process.argv[2] === 'post') {
  const css = 'packages/embed/dist/style.css';
  if (!existsSync(css)) throw new Error(`${css} ontbreekt — eerst bouwen`);
  writeFileSync(`${css}.d.ts`, 'export {};' + '\n');
  process.exit(0);
}

const root = JSON.parse(readFileSync('package.json', 'utf8'));
const path = 'packages/embed/package.json';
const embed = JSON.parse(readFileSync(path, 'utf8'));

const peers = new Set(['react', 'react-dom']);
const dependencies = Object.fromEntries(
  Object.entries(root.dependencies)
    .filter(([name]) => !peers.has(name) && !name.startsWith('@types/'))
    .sort(([a], [b]) => a.localeCompare(b)),
);

const next = { ...embed, version: root.version, dependencies };
const json = JSON.stringify(next, null, 2) + '\n';
if (json !== readFileSync(path, 'utf8')) {
  writeFileSync(path, json);
  console.log(`${path}: versie ${root.version}, ${Object.keys(dependencies).length} afhankelijkheden`);
}
