import { useTranslation } from 'react-i18next';
import { uiText } from '@/i18n/uiText';
/** Persistent PDF workspace and Open PDF Studio quantity exchange. */
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useAppStore } from '@/state/appStore';
import type { PdfPoint, PdfSource, PdfWorkspace } from '@/types/pdfWorkspace';
import { createPdfSource, emptyPdfWorkspace, importOpenPdfMeasurements, measurePoints, replaceOpenPdfMeasurements } from '@/services/pdf/pdfWorkspace';

const EMPTY = emptyPdfWorkspace();
export function PdfViewer() {
  const { i18n } = useTranslation();
  const documentId = useAppStore(s => s.activeDocumentId);
  const workspace = useAppStore(s => s.schedule.pdfWorkspace) ?? EMPTY;
  const source = workspace.sources.find(s => s.id === workspace.activeSourceId);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const page = useAppStore(s => s.pdfPage);
  const setPage = useAppStore(s => s.setPdfPage);
  const zoom = useAppStore(s => s.pdfZoom);
  const setZoom = useAppStore(s => s.setPdfZoom);
  const tool = useAppStore(s => s.pdfTool);
  const setTool = useAppStore(s => s.setPdfTool);
  const [points, setPoints] = useState<PdfPoint[]>([]);
  const [error, setError] = useState('');
  const [rendered, setRendered] = useState(0);
  const [rendering, setRendering] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const scale = source?.pageScales[String(page)];

  function changeWorkspace(change: (w: PdfWorkspace) => PdfWorkspace) {
    const state = useAppStore.getState();
    if (state.activeDocumentId !== documentId) return;
    state.setSchedule({ pdfWorkspace: change(state.schedule.pdfWorkspace ?? emptyPdfWorkspace()) });
    state.updateDocument(documentId, { isModified: true });
  }
  function changeSource(change: (s: PdfSource) => PdfSource) {
    if (!source) return;
    changeWorkspace(w => ({ ...w, sources: w.sources.map(s => s.id === source.id ? change(s) : s) }));
  }

  useEffect(() => {
    setPdf(null); setPage(1); setPoints([]); setError(''); setTool('pan');
    if (!source) return;
    let cancelled = false;
    let task: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const data = Uint8Array.from(atob(source.dataBase64), c => c.charCodeAt(0));
      task = pdfjs.getDocument({ data });
      const loaded = await task.promise;
      if (!cancelled) setPdf(loaded);
    })().catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [source?.id, source?.dataBase64, documentId]);

  useEffect(() => {
    if (!pdf || !canvas.current || !overlay.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    (async () => {
      const p = await pdf.getPage(page);
      if (cancelled || !canvas.current || !overlay.current) return;
      const viewport = p.getViewport({ scale: zoom });
      const c = canvas.current;
      c.width = viewport.width; c.height = viewport.height;
      overlay.current.width = c.width; overlay.current.height = c.height;
      task = p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport });
      await task.promise;
      if (!cancelled) { setRendering(false); setRendered(n => n + 1); }
    })().catch(e => { if (!cancelled) { setError(String(e)); setRendering(false); } });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, page, zoom]);

  useEffect(() => {
    const c = overlay.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const draw = (ps: PdfPoint[], area: boolean, color: string) => {
      if (!ps.length) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(ps[0].x * zoom, ps[0].y * zoom);
      ps.slice(1).forEach(p => ctx.lineTo(p.x * zoom, p.y * zoom));
      if (area) { ctx.closePath(); ctx.fillStyle = '#3498db33'; ctx.fill(); }
      ctx.stroke();
      ps.forEach(p => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x * zoom, p.y * zoom, 3, 0, Math.PI * 2); ctx.fill(); });
    };
    source?.measurements.filter(m => m.page === page).forEach(m => draw(m.points, m.type === 'area', m.type === 'area' ? '#1680a5' : '#c33'));
    draw(points, false, '#e90');
  }, [source?.measurements, points, page, zoom, rendered]);

  async function openPdf(file: File) {
    try {
      setError('');
      const added = await createPdfSource(file);
      changeWorkspace(w => ({ ...w, activeSourceId: added.id, sources: w.sources.some(s => s.id === added.id) ? w.sources : [...w.sources, added] }));
    } catch (e) { setError(String(e)); }
  }
  function complete() {
    if (!source || tool === 'pan') return;
    try {
      if (tool === 'calibrate') {
        if (points.length !== 2) throw new Error(uiText("pdf.twoPoints", "Choose exactly two points at a known distance."));
        const answer = window.prompt(uiText("pdf.distancePrompt", "Actual distance between these points, in metres:"));
        if (answer === null) return;
        const metres = Number(answer.replace(',', '.'));
        const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        if (!Number.isFinite(metres) || metres <= 0 || distance <= 0) throw new Error(uiText("pdf.positiveDistance", "Enter a positive distance."));
        const newScale = metres * 1000 / distance;
        changeSource(s => ({ ...s, pageScales: { ...s.pageScales, [page]: newScale }, measurements: s.measurements.map(m => m.page === page && m.origin === 'open-calc-studio' ? { ...m, mmPerPoint: newScale, value: measurePoints(m.points, m.type, newScale) } : m) }));
      } else {
        const value = measurePoints(points, tool, scale ?? 0);
        changeSource(s => ({ ...s, measurements: [...s.measurements, { id: `${s.id}:calc:${crypto.randomUUID()}`, label: `${tool === 'length' ? uiText("pdf.length", "Length") : uiText("pdf.area", "Area")} ${s.measurements.length + 1}`, type: tool, page, points, mmPerPoint: scale!, value, origin: 'open-calc-studio' }] }));
      }
      setPoints([]); setError('');
    } catch (e) { setError(String(e)); }
  }
  async function importMeasurements(file: File) {
    if (!source || !pdf) return;
    try {
      const imported = importOpenPdfMeasurements(JSON.parse(await file.text()), source, pdf.numPages);
      if (!window.confirm(uiText('pdf.importConfirm', 'Import {{count}} measurements for {{file}}? Check that the drawing and revision match. Previous Open PDF measurements for this source will be replaced; existing measurement IDs stay linked.', { count: imported.length, file: source.fileName }))) return;
      changeSource(s => replaceOpenPdfMeasurements(s, imported));
      setError('');
    } catch (e) { setError(String(e)); }
  }
  const button = (name: string, action: () => void, disabled = false) => <button type="button" onClick={action} disabled={disabled}>{name}</button>;
  const stepHint = !source
    ? uiText("pdf.start", "Start by adding a PDF drawing.")
    : !pdf
      ? uiText("pdf.opening", "Opening the drawing.")
      : points.length
        ? uiText('pdf.pointsChosen', 'Selected points: {{count}}. Click “Finish measurement” when the shape is complete.', { count: points.length })
        : !scale
          ? uiText("pdf.calibrationHint", "First calibrate this page using two points and a known distance. You can also import Open PDF measurements directly.")
          : uiText("pdf.measureHint", "Choose Length or Area and click the measurement points on the drawing.");
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
    <div role="status" style={{ padding: '10px 12px', background: 'var(--theme-surface)', borderBottom: '1px solid var(--theme-border)' }}><strong>{uiText("pdf.title", "PDF measurements")}</strong> — {stepHint}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 10, borderBottom: '1px solid var(--theme-border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}><strong>{uiText("pdf.drawing", "1. Drawing")}</strong>
      {button(uiText("pdf.add", "Add PDF"), () => pdfInput.current?.click(), !documentId)}
      <input ref={pdfInput} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void openPdf(f); e.target.value = ''; }} />
      <select aria-label={uiText("pdf.source", "PDF source")} value={source?.id ?? ''} onChange={e => changeWorkspace(w => ({ ...w, activeSourceId: e.target.value }))}>
        <option value="" disabled>{uiText("pdf.choose", "Choose a PDF")}</option>
        {workspace.sources.map(s => <option key={s.id} value={s.id}>{s.fileName}</option>)}
      </select>
      {button(uiText("pdf.import", "Import Open PDF measurements"), () => importInput.current?.click(), !pdf)}
      <input ref={importInput} type="file" accept=".json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importMeasurements(f); e.target.value = ''; }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}><strong>{uiText("pdf.scale", "2. Scale")}</strong>
        <button type="button" aria-pressed={tool === 'calibrate'} disabled={!pdf} onClick={() => { setTool('calibrate'); setPoints([]); }}>{uiText("pdf.choosePoints", "Choose two points")}</button>
        <span style={{ fontSize: 12 }}>{scale ? uiText('pdf.scaleValue', '{{value}} mm per PDF point', { value: scale.toLocaleString(i18n.language, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) }) : uiText("pdf.uncalibrated", "Not calibrated yet")}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}><strong>{uiText("pdf.measure", "3. Measure")}</strong>
        {(['pan', 'length', 'area'] as const).map((v, i) => <button key={v} type="button" aria-pressed={tool === v} disabled={!pdf || (v !== 'pan' && !scale)} onClick={() => { setTool(v); setPoints([]); }}>{[uiText("pdf.pan", "Pan"), uiText("pdf.length", "Length"), uiText("pdf.area", "Area")][i]}</button>)}
      {button(uiText("pdf.finish", "Finish measurement"), complete, !points.length)}
      {button(uiText("cancel", "Cancel"), () => setPoints([]), !points.length)}
      </div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--theme-border)' }}>
      {button('−', () => setZoom(Math.max(.5, zoom - .25)))}<span>{Math.round(zoom * 100)}%</span>{button('+', () => setZoom(Math.min(4, zoom + .25)))}
      {button(uiText("pdf.previous", "Previous page"), () => { setPage(page - 1); setPoints([]); }, page <= 1)}
      <span>{page} / {pdf?.numPages ?? 0}</span>
      {button(uiText("pdf.next", "Next page"), () => { setPage(page + 1); setPoints([]); }, !pdf || page >= pdf.numPages)}
    </div>
    <div style={{ padding: '6px 10px', fontSize: 12 }}>
      {uiText("pdf.saved", "The PDF and measurements are saved with the estimate (Ctrl+S).")}{source && <span> {uiText("pdf.externalScale", "Open PDF measurements retain their own scale and are transferred as quantities.")}</span>}
    </div>
    {error && <div role="alert" style={{ padding: 10, color: '#b42318' }}>{error}</div>}
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#e5e7eb' }}>
      {!source && <p>{uiText("pdf.empty", "Add a PDF to measure or link saved measurements from Open PDF Studio.")}</p>}
      <div style={{ position: 'relative', width: 'fit-content', display: source ? 'block' : 'none' }}>
        <canvas ref={canvas} style={{ display: 'block' }} />
        <canvas ref={overlay} style={{ position: 'absolute', left: 0, top: 0, cursor: tool === 'pan' ? 'default' : 'crosshair' }} onClick={e => {
          if (tool === 'pan' || rendering || !pdf || !overlay.current) return;
          if (tool === 'calibrate' && points.length >= 2) return;
          if (tool !== 'calibrate' && !scale) { setError(uiText("pdf.calibratePage", "Calibrate this page first.")); return; }
          const c = overlay.current, r = c.getBoundingClientRect();
          setPoints(p => [...p, { x: (e.clientX - r.left) * c.width / r.width / zoom, y: (e.clientY - r.top) * c.height / r.height / zoom }]);
        }} />
      </div>
    </div>
    {!!source?.measurements.length && <div style={{ maxHeight: 170, overflow: 'auto', padding: 10 }}>
      {source.measurements.map(m => <div key={m.id} style={{ display: 'flex', gap: 10, padding: 3 }}>
        <span>{m.label} — p. {m.page} — {m.origin === 'open-pdf-studio' ? 'Open PDF Studio' : 'Open Calc Studio'}</span>
        <strong style={{ marginLeft: 'auto' }}>{m.value.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {m.type === 'area' ? 'm²' : 'm'}</strong>
        {button(uiText("remove", "Remove"), () => { if (window.confirm(uiText("pdf.removeConfirm", "Remove measurement? A linked individual quantity keeps its last known value; a linked total changes."))) changeSource(s => ({ ...s, measurements: s.measurements.filter(x => x.id !== m.id) })); })}
      </div>)}
    </div>}
  </div>;
}
