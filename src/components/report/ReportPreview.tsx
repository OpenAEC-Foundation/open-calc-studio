import './report.css';
import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { reportRequestItems, reportRequestSchedule } from '@/services/print/reportRequest';
import { getReportRequestLocale } from '@/i18n/reportI18n';
import ProgressModal from '@/components/common/ProgressModal';

/** Get Tauri invoke function */
async function getTauriInvoke(): Promise<((cmd: string, args?: any) => Promise<any>) | null> {
  try {
    if (!(window as any).__TAURI_INTERNALS__) return null;
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke;
  } catch {
    return null;
  }
}

export const ReportPreview: React.FC = () => {
  const { t, i18n } = useTranslation();
  // Rapporttaal (instelling) — bij "auto" volgt hij i18n.language; beide
  // horen in de afhankelijkheden zodat de preview meewisselt.
  const reportLocale = useAppStore((s) => s.settings.reportLocale);
  const {
    schedule, items, reportView, reportShowQuantities, toggleReportShowQuantities, companyInfo,
    pageOrientation, pageSize, includeCover, includeSummary, setSchedule,
  } = useAppStore();

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevUrlRef = useRef<string | null>(null);
  const generationIdRef = useRef(0);

  // Ctrl+scroll zoom (non-passive listener)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom(z => Math.max(30, Math.min(300, z + delta)));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleCancel = () => {
    generationIdRef.current += 1;
    setLoading(false);
  };

  // Generate PDF via Tauri backend (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const thisId = ++generationIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const invoke = await getTauriInvoke();
        if (!invoke) {
          setError(t('report.desktopRequired'));
          setLoading(false);
          return;
        }

        const request = {
          schedule: reportRequestSchedule(schedule),
          // Alle regels: Rust toont bij "alleen hoofdstuktotalen" alleen de
          // hoofdstukken, maar rekent de staart over alle regels (zoals de app).
          items: reportRequestItems(items),
          reportView,
          pageSize,
          pageOrientation,
          showHoeveelheid: reportShowQuantities,
          companyInfo: companyInfo || null,
          includeCover,
          includeSummary,
          // Teksten en notatie in de rapporttaal; Rust valt terug op Nederlands.
          ...(await getReportRequestLocale(undefined, schedule.currency)),
        };

        // IBIS-stijl en de directiebegroting delen de IBIS Typst-generator
        // (dezelfde tabel; de directiebegroting is een stijlvariant).
        const previewCommand = (reportView === 'ibis' || reportView === 'directie') ? 'generate_ibis_preview' : 'generate_pdf_preview';
        const bytes: number[] = await invoke(previewCommand, { request });

        // If cancelled or a newer generation started, discard this result
        if (thisId !== generationIdRef.current) return;

        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // Revoke previous URL
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (e: any) {
        if (thisId !== generationIdRef.current) return;
        console.error('[ReportPreview] PDF generation failed:', e);
        setError(String(e));
      } finally {
        if (thisId === generationIdRef.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [schedule, items, reportView, pageSize, pageOrientation, reportShowQuantities, companyInfo, includeCover, includeSummary, reportLocale, i18n.language]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const scale = zoom / 100;

  return (
    <div className="report-preview">
      <div className="report-toolbar">
        <span className="report-toolbar-info">
          {pageSize} {pageOrientation === 'landscape' ? t('landscape') : t('portrait')}
        </span>
        <label className="report-toolbar-check" title={t('report.quantitiesTooltip')}>
          <input type="checkbox" checked={reportShowQuantities} onChange={toggleReportShowQuantities} />
          {t('quantities')}
        </label>
        {reportView === 'hoofdaanneming' && (
          <label className="report-toolbar-check" title={t('report.subtotalsOnlyTooltip')}>
            <input
              type="checkbox"
              checked={!!schedule.reportAmountsSubtotalsOnly}
              onChange={() => setSchedule({ reportAmountsSubtotalsOnly: !schedule.reportAmountsSubtotalsOnly })}
            />
            {t('report.subtotalsOnly')}
          </label>
        )}
        <div className="report-toolbar-zoom">
          <button className="report-zoom-btn" onClick={() => setZoom(z => Math.max(30, z - 10))}>−</button>
          <span className="report-zoom-label">{zoom}%</span>
          <button className="report-zoom-btn" onClick={() => setZoom(z => Math.min(300, z + 10))}>+</button>
        </div>
        <button
          className="report-print-btn"
          onClick={() => { if (pdfUrl) window.open(pdfUrl, '_blank'); }}
          disabled={!pdfUrl}
        >
          {t('print')}
        </button>
      </div>
      <ProgressModal
        open={loading}
        message={t('report.generatingPdf')}
        onCancel={handleCancel}
      />
      <div className="report-pages-wrapper report-pdf-wrapper" ref={wrapperRef}>
        {error && (
          <div className="report-error">
            <p>{error}</p>
          </div>
        )}
        {pdfUrl && (
          <iframe
            key={`${pageSize}-${pageOrientation}`}
            src={`${pdfUrl}#zoom=${zoom}`}
            className="report-pdf-frame"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: `${100 / scale}%`, height: `${100 / scale}%` }}
            title="PDF Preview"
          />
        )}
      </div>
    </div>
  );
};
