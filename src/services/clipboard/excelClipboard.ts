/**
 * Excel clipboard service — copies cost items to the system clipboard
 * in TSV format so they can be pasted directly into Excel/Google Sheets.
 */
import type { CostItem } from '@/types/costModel';
import { formatNumber, formatCurrency } from '@/utils/formatting';

const COLUMNS = [
  { key: 'nr', header: 'Nr' },
  { key: 'code', header: 'Code' },
  { key: 'description', header: 'Omschrijving' },
  { key: 'unit', header: 'Eenheid' },
  { key: 'quantity', header: 'Hoeveelheid' },
  { key: 'unitPrice', header: 'Eenheidsprijs' },
  { key: 'total', header: 'Totaal' },
] as const;

function getCellValue(item: CostItem, key: string): string {
  switch (key) {
    case 'nr': return item.nr ?? '';
    case 'code': return item.code;
    case 'description': return item.description;
    case 'unit': return item.unit ?? '';
    case 'quantity': return item.quantity != null ? String(item.quantity) : '';
    case 'unitPrice': return item.unitPrice ? String(item.unitPrice) : '';
    case 'total': return item.total ? String(item.total) : '';
    default: return '';
  }
}

/**
 * Extract the display value of a grid cell given an item and column key.
 * Mirrors the logic in GridCell's getValue() but as a standalone utility.
 */
export function getGridCellDisplayValue(item: CostItem, colKey: string): string {
  const rt = item.rowType;
  const isRegel = rt === 'regel';
  const isBgr = rt === 'begrotingspost';
  const isBwk = rt === 'bewakingspost';

  switch (colKey) {
    case 'sortIndex':
      return '';
    case 'rowType': {
      switch (rt) {
        case 'chapter': return 'hfdst';
        case 'begrotingspost': return 'bgrps';
        case 'bewakingspost': return 'bwkps';
        case 'regel': return 'regel';
        case 'tekstregel': return 'tekst';
        case 'witregel': return 'witrl';
        default: return '';
      }
    }
    case 'rowNumber':
      return item.nr ?? '';
    case 'code':
      return item.code ?? '';
    case 'description':
      return item.description ?? '';
    case 'quantity':
      if (rt.startsWith('staart_')) return item.quantity != null ? `${item.quantity}%` : '';
      return (isRegel || isBgr || isBwk) ? formatNumber(item.quantity) : '';
    case 'productienorm':
      return isRegel ? formatNumber(item.normQuantity) : '';
    case 'productiecapaciteit':
      return isRegel ? formatNumber(item.normFactor) : '';
    case 'hoeveelheid': {
      if (isRegel) {
        const qty = item.quantity ?? 0;
        const norm = item.normQuantity ?? 0;
        const cap = item.normFactor ?? 1;
        if (qty === 0 || norm === 0) return '';
        return formatNumber(qty * norm / (cap || 1));
      }
      if (isBgr || isBwk || rt === 'tekstregel') return formatNumber(item.quantity);
      return '';
    }
    case 'unit':
      return (isBgr || isBwk || isRegel || rt === 'tekstregel') ? String(item.unit ?? '') : '';
    case 'verrekenbaar':
      return rt === 'chapter' ? (item.verrekenbaar ?? '') : '';
    case 'normUnitPrice':
      return isRegel ? formatCurrency(item.normUnitPrice) : '';
    case 'unitPrice':
      return (isRegel || isBwk || isBgr) ? formatCurrency(item.unitPrice) : '';
    case 'total':
      return formatCurrency(item.total);
    case 'tarief':
      return isRegel ? (item.tariefGroep ?? '') : '';
    default:
      return String((item as any)[colKey] ?? '');
  }
}

/** Build a TSV string from cost items */
function itemsToTsv(items: CostItem[]): string {
  const header = COLUMNS.map(c => c.header).join('\t');
  const rows = items.map(item =>
    COLUMNS.map(c => getCellValue(item, c.key)).join('\t')
  );
  return [header, ...rows].join('\n');
}

/** Copy items to the system clipboard as TSV (for Excel paste) */
export async function copyItemsToExcel(items: CostItem[]): Promise<void> {
  const tsv = itemsToTsv(items);
  try {
    await navigator.clipboard.writeText(tsv);
  } catch {
    // Fallback for older browsers / restricted contexts
    const textarea = document.createElement('textarea');
    textarea.value = tsv;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
