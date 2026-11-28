import { useTranslation } from 'react-i18next';
import { uiText } from '@/i18n/uiText';
/** Persistent PDF workspace and Open PDF Studio quantity exchange. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useAppStore } from '@/state/appStore';
import type { PdfPoint, PdfSource, PdfWorkspace } from '@/types/pdfWorkspace';
import { createPdfSource, emptyPdfWorkspace, importOpenPdfMeasurements, measurePoints, nextMeasurementNumber, remeasure, replaceOpenPdfMeasurements } from '@/services/pdf/pdfWorkspace';
import { getNumberLocale } from '@/utils/formatting';
import { PdfLinkPicker, PdfMeasurementLinks } from './PdfLinkPicker';
import { nextZoomLevel } from './pdfZoomLevels';
import './PdfViewer.css';

const EMPTY = emptyPdfWorkspace();
/** The drawing (document + source) and target the viewer last showed. Leaving the PDF tab
 *  unmounts the viewer; coming back to the same drawing keeps the page instead of jumping back
 *  to page 1 or to an old target (knownbug 157). */
let lastShown: { view: string; target: string | null } | null = null;
const MIN_ZOOM = .25, MAX_ZOOM = 5; // same bounds as setPdfZoom in the store
const MAX_CANVAS_PIXELS = 2 ** 25; // ~33 MP, the pdf.js default limit per canvas
const MM_PER_PDF_POINT = 25.4 / 72; // a PDF point is 1/72 inch on paper

/** Small 16 px line icon; decorative, the button carries the accessible name. */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return <svg className={`pdf-ws-icon${className ? ` ${className}` : ''}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false">{children}</svg>;
}
const ICONS = {
  file: <><path d="M4 1.5h5l3 3v10H4z" /><path d="M9 1.5v3h3" /></>,
  add: <path d="M8 3v10M3 8h10" />,
  import: <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" />,
  calibrate: <><path d="M1.5 11 11 1.5l3.5 3.5L5 14.5z" /><path d="M4.5 8l1.5 1.5M7 5.5l1.5 1.5M9.5 3l1.5 1.5" /></>,
  pan: <path d="M5 8V3.5a1 1 0 0 1 2 0V7m0-.5V2.5a1 1 0 0 1 2 0V7m0-1a1 1 0 0 1 2 0v1.5m0-.5a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-8.3 2.4L3 9.5a1 1 0 0 1 1.7-1L5 9" />,
  length: <path d="M1.5 8h13M4 5.5 1.5 8 4 10.5M12 5.5l2.5 2.5-2.5 2.5" />,
  area: <path d="M3 3h10v10H3z" strokeDasharray="2 1.5" />,
  previous: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  next: <path d="M6 3.5 10.5 8 6 12.5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  remove: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />,
  link: <><path d="M6.5 9.5l3-3" /><path d="M7.2 4.8l1.3-1.3a2.5 2.5 0 0 1 3.5 3.5l-1.3 1.3" /><path d="M8.8 11.2l-1.3 1.3a2.5 2.5 0 0 1-3.5-3.5l1.3-1.3" /></>,
  fitWidth: <path d="M1.5 3v10M14.5 3v10M4 8h8M6 6 4 8l2 2M10 6l2 2-2 2" />,
};

/** The message without the English "Error: " prefix that String(error) adds. */
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Text fields and selects keep their own Enter/Escape. */
function isTextEntry(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

export function PdfViewer({ readOnly = false }: { readOnly?: boolean }) {
  useTranslation(); // opnieuw tekenen bij een taal- of notatiewissel (#65)
  const documentId = useAppStore(s => s.activeDocumentId);
  const workspace = useAppStore(s => s.schedule.pdfWorkspace) ?? EMPTY;
  const source = workspace.sources.find(s => s.id === workspace.activeSourceId);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const page = useAppStore(s => s.pdfPage);
  const setPage = useAppStore(s => s.setPdfPage);
  const zoom = useAppStore(s => s.pdfZoom);
  const setZoom = useAppStore(s => s.setPdfZoom);
  const tool = useAppStore(s => s.pdfTool);
  const targetMeasurementId = useAppStore(s => s.pdfTargetMeasurementId);
  const setTool = useAppStore(s => s.setPdfTool);
  const [points, setPoints] = useState<PdfPoint[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [rendered, setRendered] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [fitWidth, setFitWidth] = useState(true); // zoom follows the width of the drawing area
  const pageSize = useRef<{ width: number; height: number } | null>(null); // rendered page in PDF units
  const pixelRatio = useRef(1); // canvas pixels per CSS pixel of the rendered page
  const rootRef = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const scale = source?.pageScales[String(page)];

  function changeWorkspace(change: (w: PdfWorkspace) => PdfWorkspace) {
    const state = useAppStore.getState();
    if (readOnly || state.activeDocumentId !== documentId) return;
    state.setSchedule({ pdfWorkspace: change(state.schedule.pdfWorkspace ?? emptyPdfWorkspace()) });
    state.updateDocument(documentId, { isModified: true });
  }
  function changeSource(change: (s: PdfSource) => PdfSource) {
    if (!source) return;
    changeWorkspace(w => ({ ...w, sources: w.sources.map(s => s.id === source.id ? change(s) : s) }));
  }

  const viewKey = `${documentId}:${source?.id ?? ''}`;
  useEffect(() => {
    const target = source?.measurements.find(measurement => measurement.id === useAppStore.getState().pdfTargetMeasurementId);
    setPdf(null); setPoints([]); setError(''); setTool('pan'); setFitWidth(true);
    if (lastShown?.view !== viewKey) setPage(target?.page ?? 1);
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
    })().catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [source?.id, source?.dataBase64, documentId]);

  useEffect(() => {
    const target = source?.measurements.find(measurement => measurement.id === targetMeasurementId);
    const unchanged = lastShown?.view === viewKey && lastShown.target === targetMeasurementId;
    lastShown = { view: viewKey, target: targetMeasurementId };
    if (target && !unchanged) setPage(target.page);
  }, [targetMeasurementId, source?.id, documentId]);

  // Another page (also via "Open source", which sets the page in the store): points placed on the
  // previous page must not end up as a measurement on this page with this page's scale (knownbug 158).
  useEffect(() => { setPoints([]); }, [page]);

  useEffect(() => {
    if (!pdf || !canvas.current || !overlay.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    (async () => {
      const p = await pdf.getPage(page);
      if (cancelled || !canvas.current || !overlay.current) return;
      const viewport = p.getViewport({ scale: zoom });
      // Sharp on high-DPI screens: canvas pixels at the device pixel ratio, CSS size stays the
      // viewport size. The extra density is capped so huge sheets at high zoom stay within canvas
      // limits; it never drops below the old 1:1 rendering.
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height))));
      const c = canvas.current;
      for (const el of [c, overlay.current]) {
        el.width = Math.floor(viewport.width * ratio); el.height = Math.floor(viewport.height * ratio);
        el.style.width = `${viewport.width}px`; el.style.height = `${viewport.height}px`;
      }
      const base = p.getViewport({ scale: 1 });
      pageSize.current = { width: base.width, height: base.height };
      pixelRatio.current = ratio;
      task = p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: ratio === 1 ? viewport : p.getViewport({ scale: zoom * ratio }) });
      await task.promise;
      if (!cancelled) { setRendering(false); setRendered(n => n + 1); }
    })().catch(e => { if (!cancelled) { setError(errorText(e)); setRendering(false); } });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, page, zoom]);

  // Fit to width: while on, the zoom follows the width of the drawing area (on load, page change
  // and resize). The scroll area reserves its scrollbar gutter (CSS), so a scrollbar appearing does
  // not change the width and cannot start a fit/scrollbar loop.
  useEffect(() => {
    const el = stage.current;
    if (!fitWidth || !pdf || !el) return;
    let cancelled = false, baseWidth = 0;
    const fit = () => {
      if (cancelled || !baseWidth) return;
      const style = getComputedStyle(el);
      const available = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (available <= 0) return; // hidden or not laid out yet
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(available / baseWidth * 1000) / 1000));
      if (Math.abs(next - useAppStore.getState().pdfZoom) >= .001) setZoom(next);
    };
    pdf.getPage(page).then(p => { baseWidth = p.getViewport({ scale: 1 }).width; fit(); }).catch(() => {});
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fit());
    observer?.observe(el);
    return () => { cancelled = true; observer?.disconnect(); };
  }, [pdf, page, fitWidth]);

  useEffect(() => {
    const c = overlay.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!pdf || !rendered) return; // no shapes floating over a page that is not drawn yet
    ctx.setTransform(pixelRatio.current, 0, 0, pixelRatio.current, 0, 0); // draw in CSS pixels
    const draw = (ps: PdfPoint[], area: boolean, color: string) => {
      if (!ps.length) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(ps[0].x * zoom, ps[0].y * zoom);
      ps.slice(1).forEach(p => ctx.lineTo(p.x * zoom, p.y * zoom));
      if (area) { ctx.closePath(); ctx.fillStyle = '#3498db33'; ctx.fill(); }
      ctx.stroke();
      ps.forEach(p => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x * zoom, p.y * zoom, 3, 0, Math.PI * 2); ctx.fill(); });
    };
    source?.measurements.filter(m => m.page === page).forEach(m => draw(m.points, m.type === 'area', m.id === targetMeasurementId ? '#d97706' : m.type === 'area' ? '#1680a5' : '#c33'));
    draw(points, false, '#e90');
  }, [source?.measurements, points, page, zoom, rendered, targetMeasurementId]);

  async function openPdf(file: File) {
    try {
      setError('');
      const added = await createPdfSource(file);
      changeWorkspace(w => ({ ...w, activeSourceId: added.id, sources: w.sources.some(s => s.id === added.id) ? w.sources : [...w.sources, added] }));
    } catch (e) { setError(errorText(e)); }
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
        changeSource(s => ({ ...s, pageScales: { ...s.pageScales, [page]: newScale }, measurements: s.measurements.map(m => m.page === page && m.origin === 'open-calc-studio' ? { ...m, mmPerPoint: newScale, value: remeasure(m, newScale) } : m) }));
        setTool('pan'); // calibration done: the chip shows the scale and Length/Area become available
      } else {
        const value = measurePoints(points, tool, scale ?? 0);
        // Numbered per type: Area 1, Area 2, Length 1 (not Area 1, Length 2); after a removal the
        // highest number + 1, so no two measurements share a label (knownbug 156).
        changeSource(s => ({ ...s, measurements: [...s.measurements, { id: `${s.id}:calc:${crypto.randomUUID()}`, label: `${tool === 'length' ? uiText("pdf.length", "Length") : uiText("pdf.area", "Area")} ${nextMeasurementNumber(s.measurements, tool)}`, type: tool, page, points, mmPerPoint: scale!, value, origin: 'open-calc-studio' }] }));
      }
      setPoints([]); setError('');
    } catch (e) { setError(errorText(e)); }
  }
  async function importMeasurements(file: File) {
    if (!source || !pdf) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('Measurement export exceeds 10 MiB.');
      const exported = JSON.parse(await file.text());
      const unverified = exported.sourceHash == null && exported.pdfSha256 == null;
      if (unverified && !window.confirm(uiText('pdf.unverifiedConfirm', 'This export has no PDF hash. Are you certain that the drawing and revision match? Imported measurements will be marked unverified.'))) return;
      const imported = importOpenPdfMeasurements(exported, source, pdf.numPages, { allowUnverifiedSource: unverified });
      if (!window.confirm(uiText('pdf.importConfirm', 'Import {{count}} measurements for {{file}}? Check that the drawing and revision match. Previous Open PDF measurements for this source will be replaced; existing measurement IDs stay linked.', { count: imported.length, file: source.fileName }))) return;
      changeSource(s => replaceOpenPdfMeasurements(s, imported));
      setError('');
    } catch (e) { setError(errorText(e)); }
  }

  // Enter finishes and Escape cancels while points are being placed. Only when focus is on the
  // drawing or elsewhere in this workspace (not in a text field, not in a dialog or drawer), and
  // the key is consumed so it does not also close something else.
  const placing = !readOnly && tool !== 'pan' && points.length > 0;
  const completeRef = useRef(complete);
  completeRef.current = complete;
  useEffect(() => {
    if (!placing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      // Only inside this workspace: with focus elsewhere (or lost to <body> after clicking another
      // panel) Enter must not silently save the measurement and Escape must reach menus and drawers.
      const inWorkspace = target instanceof Node && !!rootRef.current?.contains(target);
      if (!inWorkspace || isTextEntry(target)) return;
      if (event.key === 'Enter' && target instanceof HTMLButtonElement) return; // a focused button handles its own Enter
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter') completeRef.current(); else setPoints([]);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [placing]);

  const formatNumber = (value: number, digits: number) => value.toLocaleString(`${getNumberLocale()}-u-nu-latn`, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const stepHint = !source
    ? uiText("pdf.start", "Start by adding a PDF drawing.")
    : !pdf
      ? uiText("pdf.opening", "Opening the drawing.")
      : points.length
        ? uiText('pdf.pointsChosen', 'Selected points: {{count}}. Click “Finish measurement” when the shape is complete.', { count: points.length })
        : !scale
          ? uiText("pdf.calibrationHint", "First calibrate this page using two points and a known distance. You can also import Open PDF measurements directly.")
          : uiText("pdf.measureHint", "Choose Length or Area and click the measurement points on the drawing.");
  // The step bar under the drawing guides every step: while the drawing opens, while the page is
  // not calibrated (that is why Length and Area are disabled) and while measuring. It is always
  // there while a PDF is open, so it never covers a point and the drawing never shifts.
  const hintText = !source || readOnly ? ''
    : !pdf ? uiText("pdf.opening", "Opening the drawing.")
      : tool === 'pan' ? (scale ? uiText("pdf.measureHint", "Choose Length or Area and click the measurement points on the drawing.") : uiText("pdf.calibrationHint", "First calibrate this page using two points and a known distance. You can also import Open PDF measurements directly."))
        : points.length ? (tool === 'calibrate'
          ? uiText('pdf.calibratePointsChosen', '{{count}} of 2 points chosen. Press Enter and enter the real distance.', { count: points.length })
          : uiText('pdf.pointsChosen', 'Selected points: {{count}}. Click “Finish measurement” when the shape is complete.', { count: points.length }))
          : tool === 'calibrate' ? uiText("pdf.twoPoints", "Choose exactly two points at a known distance.") : uiText("pdf.placePoints", "Click the measurement points on the drawing.");
  const startCalibration = () => { setTool('calibrate'); setPoints([]); };
  const zoomOutLevel = nextZoomLevel(zoom, -1), zoomInLevel = nextZoomLevel(zoom, 1); // − / + step through fixed levels
  const iconButton = (label: string, icon: ReactNode, action: () => void, disabled = false, className = '') =>
    <button type="button" className={`oa-icon-button pdf-ws-icon-button ${className}`} aria-label={label} title={label} onClick={action} disabled={disabled}>{icon}</button>;
  const tools = [
    { id: 'pan', label: uiText("pdf.pan", "Pan"), icon: ICONS.pan },
    { id: 'length', label: uiText("pdf.length", "Length"), icon: ICONS.length },
    { id: 'area', label: uiText("pdf.area", "Area"), icon: ICONS.area },
  ] as const;
  const measurements = source?.measurements ?? [];

  return <div ref={rootRef} className={`pdf-ws${readOnly ? ' pdf-ws--readonly' : ''}`}>
    <div className="pdf-ws-sr-only" role="status">{readOnly ? '' : stepHint}</div>
    <div className="pdf-ws-toolbar">
      <span className="pdf-ws-source" title={source?.fileName}>
        <Icon>{ICONS.file}</Icon>
        <select aria-label={uiText("pdf.source", "PDF source")} value={source?.id ?? ''} onChange={readOnly ? event => {
          const state = useAppStore.getState();
          state.setSchedule({ pdfWorkspace: { ...(state.schedule.pdfWorkspace ?? EMPTY), activeSourceId: event.target.value } });
        } : e => changeWorkspace(w => ({ ...w, activeSourceId: e.target.value }))}>
          <option value="" disabled>{uiText("pdf.choose", "Choose a PDF")}</option>
          {workspace.sources.map(s => <option key={s.id} value={s.id}>{s.fileName}</option>)}
        </select>
      </span>
      {!readOnly && <>
        {iconButton(uiText("pdf.add", "Add PDF"), <Icon>{ICONS.add}</Icon>, () => pdfInput.current?.click(), !documentId)}
        <input ref={pdfInput} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void openPdf(f); e.target.value = ''; }} />
        {source && iconButton(uiText("pdf.import", "Import Open PDF measurements"), <Icon>{ICONS.import}</Icon>, () => importInput.current?.click(), !pdf)}
        <input ref={importInput} type="file" accept=".json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importMeasurements(f); e.target.value = ''; }} />
      </>}
      {/* Scale and tools only once there is a drawing; before that the empty state leads. */}
      {!readOnly && source && <>
        <span className="pdf-ws-separator" aria-hidden="true" />
        {/* Drawing scale as an estimator reads it (1:50); the exact factor stays in the tooltip.
            A PDF point is 1/72 inch on paper, so the ratio holds for a drawing printed at true size. */}
        <span className={`pdf-ws-chip ${scale ? 'pdf-ws-chip--ok' : 'pdf-ws-chip--warning'}`} title={scale ? uiText('pdf.scaleValue', '{{value}} mm per PDF point', { value: formatNumber(scale, 4) }) : undefined}>
          <span className="pdf-ws-chip-dot" aria-hidden="true" />
          {scale ? uiText('pdf.scaleRatio', 'Scale ≈ 1:{{ratio}}', { ratio: formatNumber(scale / MM_PER_PDF_POINT, 0) }) : uiText("pdf.uncalibrated", "Not calibrated yet")}
        </span>
        {/* aria-label + title: below ~1100 px only the icon shows (the label is hidden by CSS). */}
        <button type="button" className="oa-button pdf-ws-button" aria-pressed={tool === 'calibrate'} disabled={!pdf} onClick={startCalibration} aria-label={uiText("pdf.calibrate", "Calibrate")} title={uiText("pdf.calibrate", "Calibrate")}>
          <Icon>{ICONS.calibrate}</Icon><span className="pdf-ws-label">{uiText("pdf.calibrate", "Calibrate")}</span>
        </button>
        <span className="pdf-ws-separator" aria-hidden="true" />
        <span className="pdf-ws-segmented">
          {tools.map(v => <button key={v.id} type="button" className="pdf-ws-segment" aria-pressed={tool === v.id} disabled={!pdf || (v.id !== 'pan' && !scale)} onClick={() => { setTool(v.id); setPoints([]); }} aria-label={v.label} title={v.label}>
            <Icon>{v.icon}</Icon><span className="pdf-ws-label">{v.label}</span>
          </button>)}
        </span>
      </>}
      <span className="pdf-ws-spacer" />
      {source && <><span className="pdf-ws-group">
        <button type="button" className="oa-icon-button pdf-ws-icon-button" aria-label={uiText("pdf.zoomOut", "Zoom out")} title={uiText("pdf.zoomOut", "Zoom out")} disabled={zoomOutLevel === null} onClick={() => { if (zoomOutLevel === null) return; setFitWidth(false); setZoom(zoomOutLevel); }}>−</button>
        <span className="pdf-ws-readout pdf-ws-readout--zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="oa-icon-button pdf-ws-icon-button" aria-label={uiText("pdf.zoomIn", "Zoom in")} title={uiText("pdf.zoomIn", "Zoom in")} disabled={zoomInLevel === null} onClick={() => { if (zoomInLevel === null) return; setFitWidth(false); setZoom(zoomInLevel); }}>+</button>
        <button type="button" className="oa-icon-button pdf-ws-icon-button" aria-label={uiText("pdf.fitWidth", "Fit to width")} title={uiText("pdf.fitWidth", "Fit to width")} aria-pressed={fitWidth} onClick={() => setFitWidth(true)}><Icon>{ICONS.fitWidth}</Icon></button>
      </span>
      <span className="pdf-ws-separator" aria-hidden="true" />
      <span className="pdf-ws-group">
        {iconButton(uiText("pdf.previous", "Previous page"), <Icon className="pdf-ws-flip">{ICONS.previous}</Icon>, () => { setPage(page - 1); setPoints([]); }, page <= 1)}
        <span className="pdf-ws-readout" dir="ltr">{pdf ? `${page} / ${pdf.numPages}` : '…'}</span>
        {iconButton(uiText("pdf.next", "Next page"), <Icon className="pdf-ws-flip">{ICONS.next}</Icon>, () => { setPage(page + 1); setPoints([]); }, !pdf || page >= pdf.numPages)}
      </span></>}
    </div>
    <div className="pdf-ws-body">
      <div className="pdf-ws-stage">
        {/* Floats at the bottom of the drawing (above the step bar), so the drawing does not jump down. */}
        {error && <div role="alert" className={`pdf-ws-alert${hintText ? ' pdf-ws-alert--above-bar' : ''}`}>
          <span className="pdf-ws-alert-text">{error}</span>
          {iconButton(uiText("pdf.dismiss", "Dismiss"), <Icon>{ICONS.close}</Icon>, () => setError(''), false, 'oa-icon-button--small')}
        </div>}
        <div ref={stage} className="pdf-ws-scroll" tabIndex={-1}>
          {!source && <div className="pdf-ws-empty">
            <Icon className="pdf-ws-empty-icon">{ICONS.file}</Icon>
            <p>{uiText("pdf.empty", "Add a PDF to measure or link saved measurements from Open PDF Studio.")}</p>
            {!readOnly && <button type="button" className="oa-button oa-button--primary" onClick={() => pdfInput.current?.click()} disabled={!documentId}>
              <Icon>{ICONS.add}</Icon>{uiText("pdf.add", "Add PDF")}
            </button>}
          </div>}
          <div className={`pdf-ws-paper${pdf && rendered ? '' : ' pdf-ws-paper--loading'}`} hidden={!source}>
            <canvas ref={canvas} className="pdf-ws-canvas" />
            <canvas ref={overlay} className={`pdf-ws-overlay${tool === 'pan' || readOnly ? '' : ' pdf-ws-overlay--measuring'}`} onClick={e => {
              if (readOnly || tool === 'pan' || rendering || !pdf || !overlay.current) return;
              if (tool === 'calibrate' && points.length >= 2) return;
              if (tool !== 'calibrate' && !scale) { setError(uiText("pdf.calibratePage", "Calibrate this page first.")); return; }
              stage.current?.focus({ preventScroll: true });
              // Points stay in PDF units: the on-screen box of the page covers the whole page, whatever the zoom or pixel ratio.
              const r = overlay.current.getBoundingClientRect(), size = pageSize.current;
              if (!size || !r.width || !r.height) return;
              setPoints(p => [...p, { x: (e.clientX - r.left) * size.width / r.width, y: (e.clientY - r.top) * size.height / r.height }]);
            }} />
          </div>
        </div>
        {hintText && <div className="pdf-ws-hint" role="status">
          <span className="pdf-ws-hint-text" title={hintText}>{hintText}</span>
          {tool === 'pan' && pdf && !scale && <button type="button" className="oa-button oa-button--primary oa-button--compact" onClick={startCalibration}>
            <Icon>{ICONS.calibrate}</Icon>{uiText("pdf.calibrate", "Calibrate")}
          </button>}
          {tool !== 'pan' && points.length > 0 && <span className="pdf-ws-hint-actions">
            <span className="pdf-ws-hint-keys" aria-hidden="true">{uiText("pdf.keysHint", "Enter: finish · Esc: cancel")}</span>
            <button type="button" className="oa-button oa-button--primary oa-button--compact" onClick={complete}>{tool === 'calibrate' ? uiText("pdf.calibrate", "Calibrate") : uiText("pdf.finish", "Finish measurement")}</button>
            <button type="button" className="oa-button oa-button--quiet oa-button--compact pdf-ws-hint-cancel" onClick={() => setPoints([])}>{uiText("cancel", "Cancel")}</button>
          </span>}
        </div>}
      </div>
      {/* Present as soon as there is a drawing, so the first measurement does not narrow the
          drawing area (fit-to-width would rescale the drawing under the cursor). */}
      {source && <aside className="pdf-ws-list" aria-label={uiText("pdf.title", "PDF measurements")}>
        <h2 className="pdf-ws-list-heading">{uiText("pdf.title", "PDF measurements")}<span className="pdf-ws-count">{measurements.length}</span></h2>
        {!measurements.length && <p className="pdf-ws-list-empty">{uiText("pdf.noMeasurements", "No measurements on this drawing yet.")}</p>}
        <ul className="pdf-ws-rows">
          {measurements.map(m => <li key={m.id} className={`pdf-ws-row${m.id === targetMeasurementId ? ' pdf-ws-row--target' : ''}`}>
            <span className="pdf-ws-row-main">
              <span className="pdf-ws-row-label" title={m.label}>{m.label}</span>
              <span className="pdf-ws-row-meta">{uiText('pdf.pageShort', 'p. {{page}}', { page: m.page })}{m.origin === 'open-pdf-studio' && ' · Open PDF Studio'}
                {m.origin === 'open-pdf-studio' && !m.sourceVerified && <span className="pdf-ws-row-unverified"> · {uiText('revisions.unverified', 'Review source identity')}</span>}</span>
              <PdfMeasurementLinks measurementId={m.id} />
            </span>
            <strong className="pdf-ws-row-value" dir="ltr">{formatNumber(m.value, 3)} {m.type === 'area' ? 'm²' : 'm'}</strong>
            {!readOnly && iconButton(uiText("pdf.linkToRow", "Link to estimate row…"), <Icon>{ICONS.link}</Icon>, () => setLinkingId(m.id), false, 'oa-icon-button--small pdf-ws-row-link')}
            {!readOnly && iconButton(uiText("remove", "Remove"), <Icon>{ICONS.remove}</Icon>, () => { if (window.confirm(uiText("pdf.removeConfirm", "Remove measurement? A linked individual quantity keeps its last known value; a linked total changes."))) changeSource(s => ({ ...s, measurements: s.measurements.filter(x => x.id !== m.id) })); }, false, 'oa-icon-button--small pdf-ws-row-remove')}
          </li>)}
        </ul>
      </aside>}
      {!readOnly && linkingId && measurements.some(m => m.id === linkingId) && <PdfLinkPicker measurement={measurements.find(m => m.id === linkingId)!} onClose={() => setLinkingId(null)} />}
    </div>
  </div>;
}
