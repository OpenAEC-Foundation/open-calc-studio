/**
 * `@openaec/open-calc-studio` — Open Calc Studio als inbouwbare React-
 * component en als bibliotheek (importers, exporters, calculator).
 *
 * De eerste import hieronder markeert de app als "ingebouwd" vóór de rest
 * laadt (ESM evalueert imports in volgorde): i18n zet dan taal en
 * schrijfrichting niet op `<html>` van de gastpagina maar op de wrapper.
 */
import './embedInit';
import React, { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import i18next, { changeLanguage } from '../i18n/config';
import App from '../App';
import './embed.css';
import { EMBED_CLASS, markEmbedded, setHostRoot } from './hostRoot';
import { applyTheme } from '../components/settings/SettingsDialog';
import { useAppStore } from '../state/appStore';
import { serializeProject, deserializeProject } from '../services/file/fileService';
import { openProjectInStore } from '../services/file/openProject';
import { loadSampleBudgetText } from '../services/file/sampleBudget';
import type { ProjectFile } from '../types/costModel';

export interface OpenCalcStudioProps {
  /** Thema: `light`, `dark`, `blue`, `amber-navy`, `warm-ember`, `highContrast` of `system`. */
  theme?: string;
  /** Interfacetaal (een van de 39 codes, bv. `en`, `nl`, `es`, `de`) of `auto`. */
  lang?: string;
  /**
   * Project om te openen: de JSON-tekst van een .ifcCalc/.ocs-bestand, een
   * `File`/`Blob` daarvan, of een al geparsed `ProjectFile`. Elke nieuwe
   * waarde opent een nieuw tabblad.
   */
  project?: string | Blob | ProjectFile | null;
  /** Naam van het tabblad; standaard de bestandsnaam of "Estimate". */
  fileName?: string;
  /** Voorbeeldbegroting openen als er nog niets geladen is. */
  sample?: boolean;
  /** Wordt (gedebounced) aangeroepen bij elke wijziging, met het volledige project. */
  onChange?: (project: ProjectFile, json: string) => void;
  /** Debounce voor `onChange` in ms (standaard 300). */
  onChangeDelay?: number;
  className?: string;
  style?: CSSProperties;
}

/** Het huidige project uit de store, zoals het in een .ifcCalc-bestand komt. */
export function getProjectJson(): string {
  const s = useAppStore.getState();
  return serializeProject(s.schedule, s.items, s.companyInfo, s.subSheets, s.offerte);
}

export function OpenCalcStudio({
  theme = 'light',
  lang,
  project,
  fileName,
  sample = false,
  onChange,
  onChangeDelay = 300,
  className,
  style,
}: OpenCalcStudioProps) {
  // Opties die App bij het opstarten leest (thema/taal winnen van de
  // opgeslagen voorkeur; voorbeeld alleen op verzoek). Idempotent.
  markEmbedded({ autoSample: sample, theme, locale: lang });

  const hostRef = useRef<HTMLDivElement | null>(null);
  const attachHost = useCallback((el: HTMLDivElement | null) => {
    hostRef.current = el;
    setHostRoot(el);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    useAppStore.getState().updateSettings({ theme: theme as never });
  }, [theme]);

  useEffect(() => {
    if (!lang) return;
    void changeLanguage(lang);
    useAppStore.getState().updateSettings({ locale: lang as never });
  }, [lang]);

  useEffect(() => {
    if (project == null) return;
    let cancelled = false;
    (async () => {
      let parsed: ProjectFile;
      let name = fileName;
      if (typeof project === 'string') {
        parsed = deserializeProject(project);
      } else if (project instanceof Blob) {
        parsed = deserializeProject(await project.text());
        if (!name && project instanceof File) name = project.name.replace(/\.[^.]+$/, '');
      } else {
        parsed = project;
      }
      if (cancelled) return;
      openProjectInStore(parsed, name ?? parsed.schedule?.name ?? 'Estimate');
    })().catch((e) => console.error('[OpenCalcStudio] project could not be opened:', e));
    return () => {
      cancelled = true;
    };
  }, [project, fileName]);

  useEffect(() => {
    if (!sample) return;
    let cancelled = false;
    (async () => {
      if (useAppStore.getState().documents.length > 0) return;
      const text = await loadSampleBudgetText(lang ?? i18next.language);
      if (cancelled || useAppStore.getState().documents.length > 0) return;
      openProjectInStore(deserializeProject(text), i18next.t('app.sampleBudget'));
    })().catch((e) => console.error('[OpenCalcStudio] sample could not be opened:', e));
    return () => {
      cancelled = true;
    };
  }, [sample, lang]);

  useEffect(() => {
    if (!onChange) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (
        s.items === prev.items &&
        s.schedule === prev.schedule &&
        s.companyInfo === prev.companyInfo &&
        s.subSheets === prev.subSheets &&
        s.offerte === prev.offerte
      ) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const json = getProjectJson();
        onChange(JSON.parse(json) as ProjectFile, json);
      }, onChangeDelay);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [onChange, onChangeDelay]);

  return (
    <div
      ref={attachHost}
      className={className ? `${EMBED_CLASS} ${className}` : EMBED_CLASS}
      data-theme={theme === 'system' ? undefined : theme}
      style={{ height: '100%', ...style }}
    >
      <App />
    </div>
  );
}

export interface MountedOpenCalcStudio {
  /** Eigenschappen bijwerken (alleen de meegegeven velden veranderen). */
  update(props: Partial<OpenCalcStudioProps>): void;
  unmount(): void;
}

/**
 * Voor sites zonder React: monteer de component in een element.
 *
 *     const ocs = mount(document.getElementById('estimate'), { lang: 'de', sample: true });
 *     ocs.update({ theme: 'dark' });
 */
export function mount(el: HTMLElement, props: OpenCalcStudioProps = {}): MountedOpenCalcStudio {
  const root = createRoot(el);
  let current = props;
  const render = () => root.render(React.createElement(OpenCalcStudio, current));
  render();
  return {
    update(next) {
      current = { ...current, ...next };
      render();
    },
    unmount() {
      root.unmount();
    },
  };
}

// ── Bibliotheek zonder UI ─────────────────────────────────────────────────

export { useAppStore as useOpenCalcStore } from '../state/appStore';
export { serializeProject, deserializeProject } from '../services/file/fileService';
export { openProjectInStore, openProjectJson, openImportResult } from '../services/file/openProject';
export {
  recalculateItems,
  getKostprijs,
  getGrandTotal,
  getStaartBreakdown,
  computeKostprijsBreakdown,
} from '../services/calculation/calculator';
export * from '../services/importers';
export { importBc3File, decodeBc3 } from '../services/importers/bc3Importer';
export { importOnlvFile, decodeA2063 } from '../services/importers/onlvImporter';
export { buildBc3, buildBc3Bytes } from '../services/export/bc3Exporter';
export { buildOnlv } from '../services/export/onlvExporter';
export { exportCuf, exportTradxml, exportRsx, exportOnlv } from '../services/exporters';
export type { ExportInput, ExportResult } from '../services/exporters/types';
export type {
  CostItem,
  CostSchedule,
  CompanyInfo,
  ProjectFile,
  RowType,
  CostUnit,
  ResourceType,
  SubSheet,
  OfferteDocument,
} from '../types/costModel';
export { LANGUAGES } from '../i18n/config';
export { EMBED_CLASS } from './hostRoot';
