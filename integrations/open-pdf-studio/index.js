// Open PDF Studio plugin API v2026.39. No network or private host imports.
let panel;
export function measurementExport(annotations, fileName) {
  if (!fileName?.trim().toLowerCase().endsWith('.pdf')) throw new Error('Vul de exacte PDF-bestandsnaam in, inclusief .pdf.');
  const measurements = annotations.filter(a => ['measureDistance', 'measureArea', 'measurePerimeter'].includes(a.type));
  const seen = new Set();
  for (const a of measurements) {
    if (!a.id || seen.has(a.id) || !Number.isFinite(a.measureValue) || a.measureValue < 0 || !/^(mm|cm|m|in|ft)(²|2)?$/.test(a.measureUnit)) {
      throw new Error('Een meting mist een unieke ID, waarde of gekalibreerde eenheid. Controleer de metingen en schaal in Open PDF Studio.');
    }
    seen.add(a.id);
  }
  return { format: 'open-pdf-studio-measurements', version: 1, fileName: fileName.trim(), exportedAt: new Date().toISOString(), annotations: structuredClone(measurements) };
}
export function activate(api) {
  if (panel) return;
  if (typeof api.getAnnotations !== 'function') throw new Error('Deze Open PDF Studio-versie ondersteunt getAnnotations niet.');
  panel = document.createElement('details');
  Object.assign(panel.style, { position: 'fixed', bottom: '36px', left: '18px', zIndex: '800', width: '300px', padding: '10px', background: 'var(--theme-surface, white)', color: 'var(--theme-text, #222)', border: '1px solid #bbb', borderRadius: '6px', boxShadow: '0 2px 12px #0003', font: '12px sans-serif' });
  const title = document.createElement('summary'); title.textContent = 'Open Calc — metingen exporteren'; panel.append(title);
  const help = document.createElement('p'); help.textContent = 'Sla de PDF op. Vul de exacte bestandsnaam in en controleer de schaal vóór export. Importeer het JSON-bestand bij dezelfde PDF in Open Calc Studio.'; panel.append(help);
  const label = document.createElement('label'); label.textContent = 'PDF-bestandsnaam';
  const input = document.createElement('input'); input.placeholder = 'plattegrond.pdf'; input.style.width = '100%'; label.append(input); panel.append(label);
  const confirmed = document.createElement('input'); confirmed.type = 'checkbox';
  const calibration = document.createElement('label'); calibration.style.display = 'block'; calibration.append(confirmed, ' Ik heb de schaal en de tekening gecontroleerd.'); panel.append(calibration);
  const button = document.createElement('button'); button.textContent = 'Metingen naar Open Calc'; panel.append(button);
  const message = document.createElement('p'); message.setAttribute('role', 'status'); panel.append(message);
  button.onclick = async () => {
    try {
      if (!api.getPageCount()) throw new Error('Open eerst een PDF.');
      if (!confirmed.checked) throw new Error('Controleer en bevestig eerst de schaal.');
      const data = measurementExport(api.getAnnotations(), input.value);
      const json = JSON.stringify(data, null, 2);
      const invoke = window.__TAURI__?.core?.invoke;
      if (invoke) {
        const path = await invoke('plugin:dialog|save', { options: { defaultPath: `${data.fileName}.metingen.json`, filters: [{ name: 'Open Calc metingen', extensions: ['json'] }] } });
        if (!path) return;
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        await invoke('write_file', { path, data: btoa(binary) });
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `${data.fileName}.metingen.json`; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      message.textContent = `${data.annotations.length} metingen geëxporteerd. De PDF blijft ongewijzigd.`;
      confirmed.checked = false;
    } catch (e) { message.textContent = String(e.message || e); }
  };
  document.body.append(panel);
}
export function deactivate() { panel?.remove(); panel = null; }
