import type { SubSheetCell } from '@/types/costModel';
import { cellDisplayText } from '@/services/spreadsheet/cellDisplay';

/**
 * Wat de mobiele deelbladlijst per cel toont: dezelfde tekst als het
 * desktopraster (cellDisplayText), en bij een formule de formule eronder.
 * Een formule zonder bruikbare uitkomst toont alleen de formule.
 */
export function mobileCellDisplay(cell: SubSheetCell, currency?: string): { main: string; formula?: string } {
  const isFormula = cell.value.startsWith('=');
  if (isFormula && (cell.computed === undefined || !Number.isFinite(cell.computed))) return { main: cell.value };
  let main: string;
  try {
    main = cellDisplayText(cell, currency);
  } catch {
    main = cell.computed !== undefined ? String(cell.computed) : cell.value;
  }
  return isFormula ? { main, formula: cell.value } : { main };
}
