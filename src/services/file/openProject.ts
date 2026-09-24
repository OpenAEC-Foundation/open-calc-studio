import { useAppStore } from '@/state/appStore';
import { deserializeProject } from './fileService';
import type { ProjectFile } from '@/types/costModel';
import type { ImportResult } from '@/services/importers/types';
import { createDefaultSchedule } from '@/data/defaultBudget';

/**
 * Een geparsed project als nieuw documenttabblad openen, met bedrijfsgegevens,
 * spreadsheets, offerte en projectinfo — dezelfde stappen als de open- en
 * importpaden in App.tsx. Geeft het document-id terug.
 */
export function openProjectInStore(parsed: ProjectFile, fileName: string, filePath: string | null = null): string {
  const store = useAppStore.getState();
  const id = crypto.randomUUID();
  store.addDocument({ id, filePath, fileName, isModified: false, items: parsed.items, schedule: parsed.schedule });
  if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
  if (parsed.spreadsheets?.sheets) store.setSubSheets(parsed.spreadsheets.sheets);
  if (parsed.offerte) store.setOfferte(parsed.offerte);
  if (parsed.schedule.projectInfo) store.setProjectInfo(parsed.schedule.projectInfo);
  return id;
}

/** Idem vanuit de JSON-tekst van een .ifcCalc/.ocs-bestand. */
export function openProjectJson(json: string, fileName: string, filePath: string | null = null): string {
  return openProjectInStore(deserializeProject(json), fileName, filePath);
}

/** Het resultaat van een importer (.bc3, .onlv, .cuf, …) als document openen. */
export function openImportResult(result: ImportResult, fileName: string): string {
  const store = useAppStore.getState();
  const id = crypto.randomUUID();
  // Importers leveren een gedeeltelijke schedule; de rest komt uit de standaard.
  const schedule = { ...createDefaultSchedule(), ...result.schedule };
  store.addDocument({ id, filePath: null, fileName, isModified: false, items: result.items, schedule });
  if (result.companyInfo) store.setCompanyInfo({ ...store.companyInfo, ...result.companyInfo });
  return id;
}
