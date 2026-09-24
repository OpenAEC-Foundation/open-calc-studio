// Voorbeeld-gastpagina voor het inbouwpakket. Gebruikt de gebouwde
// bibliotheek uit ../dist (alias in vite.config.ts), zodat wat hier draait
// precies is wat een npm-gebruiker krijgt.
//
//   npm run build:lib && npm run dev:embed   → http://localhost:4310
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {
  OpenCalcStudio,
  importBc3File,
  importOnlvFile,
  openImportResult,
  openProjectJson,
  type ProjectFile,
} from '@openaec/open-calc-studio';
import '@openaec/open-calc-studio/style.css';

const LANGS = ['en', 'nl', 'de', 'es', 'fr'];
const THEMES = ['light', 'dark', 'blue', 'amber-navy', 'warm-ember', 'highContrast'];

function Controls({ onLang, onTheme, lang, theme }: { lang: string; theme: string; onLang: (l: string) => void; onTheme: (t: string) => void }) {
  const openFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const name = file.name.replace(/\.[^.]+$/, '');
    if (ext === 'bc3') openImportResult(importBc3File(await file.arrayBuffer()), name);
    else if (ext === 'onlv' || ext === 'onlb') openImportResult(importOnlvFile(await file.arrayBuffer()), name);
    else openProjectJson(await file.text(), name);
    e.target.value = '';
  }, []);
  return (
    <>
      <label>Language <select value={lang} onChange={(e) => onLang(e.target.value)}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select></label>
      <label>Theme <select value={theme} onChange={(e) => onTheme(e.target.value)}>{THEMES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>Open file <input type="file" accept=".ifcCalc,.ocs,.json,.bc3,.onlv,.onlb" onChange={openFile} /></label>
    </>
  );
}

function HostApp() {
  const [lang, setLang] = useState('en');
  const [theme, setTheme] = useState('light');
  const onChange = useCallback((project: ProjectFile, json: string) => {
    const out = document.getElementById('out');
    if (out) out.textContent = `${new Date().toLocaleTimeString()} — ${project.items.length} items, ${json.length.toLocaleString()} bytes\n${json.slice(0, 600)}…`;
  }, []);
  return (
    <>
      <ControlsPortal lang={lang} theme={theme} onLang={setLang} onTheme={setTheme} />
      <OpenCalcStudio lang={lang} theme={theme} sample onChange={onChange} />
    </>
  );
}

// De knoppen staan in een eigen element van de gastpagina (boven de component).
function ControlsPortal(props: React.ComponentProps<typeof Controls>) {
  return createPortal(<Controls {...props} />, document.getElementById('controls')!);
}

createRoot(document.getElementById('estimate')!).render(<HostApp />);
