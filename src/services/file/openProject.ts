import { useAppStore } from '@/state/appStore';
import { deserializeProject } from './fileService';
import type { ProjectFile } from '@/types/costModel';
import type { ImportResult } from '@/services/importers/types';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { isIfcxExchangeJson } from '@/services/importers/ifcxDetection';
import { importIfcx } from '@/services/importers/ifcxImporter';

/**
 * Een geparsed project als nieuw documenttabblad openen, met bedrijfsgegevens,
 * spreadsheets, offerte en projectinfo — dezelfde stappen als de open- en
 * importpaden in App.tsx. Geeft het document-id terug.
 */
export function openProjectInStore(parsed: ProjectFile, fileName: string, filePath: string | null = null): string {
  const store = useAppStore.getState();
  const id = crypto.randomUUID();
  store.addDocument({ id, filePath, fileName, isModified: false, items: parsed.items, schedule: parsed.schedule,
    ...(parsed.createdAt ? { createdAt: parsed.createdAt } : {}) });
  if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
  const sheets = parsed.spreadsheets?.sheets ?? parsed.subSheets ?? [];
  store.setSubSheets(sheets);
  // Het spreadsheet dat bij opslaan actief was, weer actief maken (knownbug 111).
  const activeSheetId = parsed.spreadsheets?.activeSheetId;
  if (activeSheetId && sheets.some((sheet) => sheet.id === activeSheetId)) store.setActiveSubSheet(activeSheetId);
  store.setSnapshots(parsed.snapshots ?? []);
  if (parsed.offerte) store.setOfferte(parsed.offerte);
  if (parsed.schedule.projectInfo) store.setProjectInfo(parsed.schedule.projectInfo);
  return id;
}

/** Idem vanuit de JSON-tekst van een .ifcCalc/.ocs-bestand. */
export function openProjectJson(json: string, fileName: string, filePath: string | null = null): string {
  // A model exchange document is imported, never overwritten as a native project.
  if (isIfcxExchangeJson(json)) return openImportResult(importIfcx(json), fileName);
  return openProjectInStore(deserializeProject(json), fileName, filePath);
}

/**
 * Het resultaat van een importer (.bc3, .onlv, .cuf, …) als document openen.
 * `filePath` is het bronbestand: Opslaan stelt dan .ifcCalc in dezelfde map voor.
 */
export function openImportResult(result: ImportResult, fileName: string, filePath: string | null = null): string {
  const store = useAppStore.getState();
  const id = crypto.randomUUID();
  // Importers leveren een gedeeltelijke schedule; de rest komt uit de standaard.
  const schedule = { ...createDefaultSchedule(), ...result.schedule };
  store.addDocument({ id, filePath, fileName, isModified: false, items: result.items, schedule });
  if (result.companyInfo) store.setCompanyInfo({ ...store.companyInfo, ...result.companyInfo });
  return id;
}
