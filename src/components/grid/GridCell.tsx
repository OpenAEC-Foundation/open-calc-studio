import React from 'react';
import type { CostItem } from '@/types/costModel';
import type { GridColumn } from '@/types/costModel';
import { isContainerRowType } from '@/types/costModel';
import { formatNumber, formatCurrency } from '@/utils/formatting';
import { isCellEditable } from './gridConstants';
import { useAppStore } from '@/state/appStore';

interface Props {
  item: CostItem;
  column: GridColumn;
  colWidth: number;
  rowIndex: number;
  isActive: boolean;
  isCellSelected?: boolean;
  hideTotal: boolean;
  isChapterFooter?: boolean;
  resourceTotals?: Record<string, number>;
  /** Cel-niveau wijzigingsmarkering: deze cel is gewijzigd sinds bijhouden aan staat. */
  isChangedCell?: boolean;
  onToggleCollapse?: () => void;
}

export const GridCell: React.FC<Props> = React.memo(({ item, column, colWidth, rowIndex, isActive, isCellSelected, hideTotal, isChapterFooter, resourceTotals, isChangedCell, onToggleCollapse }) => {
  const gridView = useAppStore((s) => s.gridView);
  const items = useAppStore((s) => s.items);

  const getRowTypeAbbr = (): string => {
    switch (item.rowType) {
      case 'chapter': return 'hfdst';
      case 'begrotingspost': return 'bgrps';
      case 'bewakingspost': return 'bwkps';
      case 'regel': return 'regel';
      case 'tekstregel': return 'tekst';
      case 'witregel': return 'witrl';
      case 'staart_ukk': return 'ukk  ';
      case 'staart_ak': return 'ak   ';
      case 'staart_wr': return 'wr   ';
      case 'staart_afronding': return 'afron';
      default: return '';
    }
  };

  const rt = item.rowType;
  const isRegel = rt === 'regel';
  const isBgr = rt === 'begrotingspost';
  const isBwk = rt === 'bewakingspost';

  // In UI-2 (wpcalc), chapter rows show NO values in any numeric column
  const isChapterInWpcalc = rt === 'chapter' && gridView === 'wpcalc';

  const getValue = (): string => {
    // Chapter footer rows: show aggregated totals
    if (isChapterFooter) {
      if (column.key === 'description') return '+';
      if (!resourceTotals) return '';
      // Show resource breakdown columns
      switch (column.key) {
        case 'hoeveelheid': {
          // Sum uren from the chapter's children
          const chapterId = item.id.replace('footer:', '');
          let uren = 0;
          for (const it of items) {
            if (it.rowType !== 'regel') continue;
            // Check if item belongs to this chapter
            let parentId = it.parentId;
            let belongs = false;
            while (parentId) {
              if (parentId === chapterId) { belongs = true; break; }
              const p = items.find(x => x.id === parentId);
              if (!p) break;
              parentId = p.parentId;
            }
            if (!belongs) continue;
            const qty = it.quantity ?? 0;
            const norm = it.normQuantity ?? 0;
            const cap = it.normFactor ?? 1;
            uren += qty * norm / (cap || 1);
          }
          return uren ? formatNumber(uren) : '';
        }
        case 'arbeidTotal':
        case 'materiaalTotal':
        case 'materieelTotal':
        case 'stelpostTotal':
        case 'onderaannemingTotal': {
          const val = resourceTotals[column.key];
          return val ? formatCurrency(val) : '';
        }
        case 'unitPrice': {
          // Subtotaal = sum of all resource columns
          const sum = (resourceTotals.arbeidTotal || 0) + (resourceTotals.materiaalTotal || 0) +
            (resourceTotals.materieelTotal || 0) + (resourceTotals.stelpostTotal || 0) +
            (resourceTotals.onderaannemingTotal || 0);
          return sum ? formatCurrency(sum) : '';
        }
        case 'total': {
          // Look up chapter's total
          const chapterId = item.id.replace('footer:', '');
          const chapter = items.find(it => it.id === chapterId);
          return chapter ? formatCurrency(chapter.total) : '';
        }
        default: return '';
      }
    }

    // Chapters in UI-2: only show description (and chapterCode/paragraphCode).
    // De uren-som staat NIET op de hoofdstukrij maar alleen op de footerrij
    // (de blauwe "+"-optelling onderaan) — daar is hij ook bewerkbaar.
    if (isChapterInWpcalc && column.key !== 'description' && column.key !== 'chapterCode'
      && column.key !== 'paragraphCode' && column.key !== 'rowNumber') {
      return '';
    }

    switch (column.key) {
      case 'sortIndex':
        return String(rowIndex + 1);
      case 'rowType':
        return getRowTypeAbbr();
      case 'branch': {
        const state = useAppStore.getState();
        const branches = state.schedule.branches ?? [];
        const branchId = item.branchId ?? 'main';
        const branch = branches.find(b => b.id === branchId);
        return branch?.name ?? 'main';
      }
      case 'rowNumber':
        return item.nr ?? '';
      case 'quantity':
        if (rt.startsWith('staart_')) return item.quantity != null ? `${item.quantity}%` : '';
        return (isRegel || isBgr || isBwk) ? formatNumber(item.quantity) : '';
      case 'productienorm':
        return isRegel ? formatNumber(item.normQuantity) : '';
      case 'productiecapaciteit':
        return isRegel ? formatNumber(item.normFactor) : '';
      case 'hoeveelheid': {
        if (isRegel) {
          // Berekend: Aantal × Productienorm / Productiecapaciteit
          const qty = item.quantity ?? 0;
          const norm = item.normQuantity ?? 0;
          const cap = item.normFactor ?? 1;
          if (qty === 0 || norm === 0) return '';
          return formatNumber(qty * norm / (cap || 1));
        }
        // Op begrotingspost/bewakingspost/tekstregel: toon quantity als hoeveelheid
        if (isBgr || isBwk || rt === 'tekstregel') return formatNumber(item.quantity);
        return '';
      }
      case 'unit':
        return (isBgr || isBwk || isRegel || rt === 'tekstregel') ? String(item.unit ?? '') : '';
      case 'verrekenbaar':
        return rt === 'chapter' ? (item.verrekenbaar ?? '') : '';
      case 'normUnitPrice':
        // Prijs per middel alleen op rekenregel
        return isRegel ? formatCurrency(item.normUnitPrice) : '';
      case 'unitPrice':
        // Eenheidsprijs: op regel, bewakingspost, begrotingspost
        return (isRegel || isBwk || isBgr) ? formatCurrency(item.unitPrice) : '';
      case 'total':
        // Totaal column: only for chapters and begrotingsposten, not for regels/bewakingsposten
        if (isRegel || rt === 'tekstregel' || rt === 'witregel') return '';
        return hideTotal ? '' : formatCurrency(item.total);
      case 'chapterCode': {
        // Walk up to find top-level chapter
        let current: CostItem | undefined = item;
        while (current) {
          if (current.rowType === 'chapter' && !current.parentId) return current.code || '';
          current = items.find((i) => i.id === current!.parentId);
        }
        return '';
      }
      case 'paragraphCode': {
        // Walk up to find depth-1 chapter (paragraaf)
        let current: CostItem | undefined = item;
        while (current) {
          if (current.rowType === 'chapter' && current.depth === 1) return current.code || '';
          current = items.find((i) => i.id === current!.parentId);
        }
        return '';
      }
      case 'tarief': {
        if (isRegel) return item.tariefGroep ?? '';
        return '';
      }
      case 'kostenEd': {
        // Kosten per eenheid: kosteneh = normUnitPrice + laborPrice
        if (isRegel) {
          const nup = item.normUnitPrice ?? 0;
          const lab = item.laborPrice ?? 0;
          const kostenEh = nup + lab;
          return kostenEh ? formatCurrency(kostenEh) : '';
        }
        if (isBgr || isBwk) {
          // For containers: unitPrice / quantity (per-unit derived)
          const qty = item.quantity ?? 0;
          if (qty > 0) return formatCurrency(item.total / qty);
          return item.unitPrice ? formatCurrency(item.unitPrice) : '';
        }
        return '';
      }
      case 'materiaalTotal':
      case 'arbeidTotal':
      case 'materieelTotal':
      case 'onderaannemingTotal':
      case 'stelpostTotal': {
        if (!resourceTotals) return '';
        const val = resourceTotals[column.key];
        return val ? formatCurrency(val) : '';
      }
      default:
        return String(item[column.key as keyof CostItem] ?? '');
    }
  };

  // Generate cell-specific formula tooltip
  const getCellTooltip = (): string => {
    const fmtN = (v: number | null) => v != null ? formatNumber(v) : '?';
    const fmtC = (v: number | null) => v != null ? formatCurrency(v) : '?';
    const isWpc = gridView === 'wpcalc';

    if (isChapterFooter) return '';

    switch (column.key) {
      case 'hoeveelheid':
        if (isRegel) {
          const q = item.quantity ?? 0;
          const n = item.normQuantity ?? 0;
          const c = item.normFactor ?? 1;
          const hv = q * n / (c || 1);
          if (isWpc) return `uren = aantal \u00D7 norm\nuren = ${fmtN(item.quantity)} \u00D7 ${fmtN(item.normQuantity)}\nuren = ${formatNumber(hv)}`;
          return `hoev = aant \u00D7 pnorm / pcap\nhoev = ${fmtN(item.quantity)} \u00D7 ${fmtN(item.normQuantity)} / ${fmtN(item.normFactor)}\nhoev = ${formatNumber(hv)}`;
        }
        if (isBgr || isBwk) return `hoev = Aantal\nhoev = ${fmtN(item.quantity)}`;
        return '';
      case 'normUnitPrice':
        if (isRegel && isWpc) return `prijs = materiaalprijs per eenheid\nprijs = ${fmtC(item.normUnitPrice)}`;
        return isRegel ? `pmddl = prijs per middel\npmddl = ${fmtC(item.normUnitPrice)}` : '';
      case 'arbeidTotal': {
        if (!isRegel || !resourceTotals) return '';
        const lab = item.laborPrice ?? 0;
        const qty = item.quantity ?? 0;
        return `loon = laborPrice \u00D7 aantal\nloon = ${fmtC(lab)} \u00D7 ${fmtN(qty)}\nloon = ${fmtC(resourceTotals.arbeidTotal || 0)}`;
      }
      case 'materiaalTotal': {
        if (!isRegel || !resourceTotals) return '';
        const nup = item.normUnitPrice ?? 0;
        const qty = item.quantity ?? 0;
        return `materiaal = prijs \u00D7 aantal\nmateriaal = ${fmtC(nup)} \u00D7 ${fmtN(qty)}\nmateriaal = ${fmtC(resourceTotals.materiaalTotal || 0)}`;
      }
      case 'materieelTotal':
      case 'stelpostTotal':
      case 'onderaannemingTotal': {
        if (!isRegel || !resourceTotals) return '';
        const val = resourceTotals[column.key] || 0;
        const label = column.key.replace('Total', '');
        return `${label} = prijs \u00D7 aantal\n${label} = ${fmtC(val)}`;
      }
      case 'kostenEd': {
        if (isRegel) {
          const nup = item.normUnitPrice ?? 0;
          const lab = item.laborPrice ?? 0;
          return `kosteneh = prijs + loon/eh\nkosteneh = ${fmtC(nup)} + ${fmtC(lab)}\nkosteneh = ${fmtC(nup + lab)}`;
        }
        return '';
      }
      case 'unitPrice':
        if (isRegel) {
          if (isWpc) {
            const qty = item.quantity ?? 0;
            const nup = item.normUnitPrice ?? 0;
            const lab = item.laborPrice ?? 0;
            return `subtotaal = aantal \u00D7 kosteneh\nsubtotaal = ${fmtN(qty)} \u00D7 ${fmtC(nup + lab)}\nsubtotaal = ${fmtC(item.unitPrice)}`;
          }
          const q = item.quantity ?? 0;
          const n = item.normQuantity ?? 0;
          const c = item.normFactor ?? 1;
          const hv = q * n / (c || 1);
          return `ehprs = hoev \u00D7 pmddl\nehprs = ${formatNumber(hv)} \u00D7 ${fmtC(item.normUnitPrice)}\nehprs = ${fmtC(item.unitPrice)}`;
        }
        if (isBwk) return `ehprs = \u03A3 regel ehprs\nehprs = ${fmtC(item.unitPrice)}`;
        if (isBgr) return `ehprs = bedrag / hoev\nehprs = ${fmtC(item.total)} / ${fmtN(item.quantity)}\nehprs = ${fmtC(item.unitPrice)}`;
        return '';
      case 'total':
        if (isRegel) {
          if (isWpc) return `totaal = aantal \u00D7 kosteneh\ntotaal = ${fmtC(item.total)}`;
          return `bedrag = ehprs\nbedrag = ${fmtC(item.unitPrice)}`;
        }
        if (isBwk) return `bedrag = \u03A3 regel bedrag\nbedrag = ${fmtC(item.total)}`;
        if (isBgr) return `bedrag = \u03A3 bwkps bedrag\nbedrag = ${fmtC(item.total)}`;
        if (rt === 'chapter') return `bedrag = \u03A3 onderliggende bedrag\nbedrag = ${fmtC(item.total)}`;
        return '';
      default:
        return column.tooltip ?? '';
    }
  };

  const editable = isCellEditable(column.key, rt, gridView);
  const alignClass = column.align === 'right' ? ' align-right' : column.align === 'center' ? ' align-center' : '';
  const isChapterBold = item.rowType === 'chapter';
  const canCollapse = isContainerRowType(item.rowType);

  const isWitregel = item.rowType === 'witregel';
  const isDescCol = column.key === 'description';
  const isHoeveelheidCol = column.key === 'hoeveelheid' || column.key === 'quantity';
  const showExcelIcon = isHoeveelheidCol && !!item.excelLink;
  const showQuantityLinkIcon = isHoeveelheidCol && !!item.quantityLink;
  const cellTooltip = getCellTooltip();

  // Sommen op posten zijn afgeleide waarden (optelling van onderliggende
  // regels) — cursief + eigen kleur, zodat ze niet als dubbele invoer lezen.
  const isDerivedSum = (isBgr || isBwk) && column.type === 'computed' && !isChapterFooter;

  return (
    <div
      className={`grid-cell${isActive ? ' active' : ''}${isCellSelected ? ' cell-selected' : ''}${alignClass}${isChapterBold ? ' bold' : ''}${column.key === 'rowType' ? ' type-cell' : ''}${isWitregel && isDescCol ? ' witregel-desc' : ''}${editable ? ' editable-value' : ''}${isDescCol ? ' col-description' : ''}${isDerivedSum ? ' derived-sum' : ''}${isChangedCell ? ' changed-cell' : ''}`}
      title={cellTooltip || undefined}
      style={{
        width: colWidth,
        minHeight: 24,
        paddingLeft: isDescCol ? (gridView === 'wpcalc'
          ? (item.rowType === 'chapter' && item.depth === 0 ? 4 : 4 + item.depth * 16) // UI-2: top chapters flush, rest indented by depth
          : item.depth * 16 + 4
        ) : undefined,
      }}
    >
      {isDescCol && canCollapse && (
        <button
          className="grid-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {item.isCollapsed
              ? <polyline points="3,2 7,5 3,8" />
              : <polyline points="2,3 5,7 8,3" />
            }
          </svg>
        </button>
      )}
      {showExcelIcon && (
        <svg className="grid-excel-link-icon" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/>
          <path d="M11.286 9.458 12.657 8.086a3 3 0 0 0-4.243-4.243L6.586 5.672A3 3 0 0 0 7.414 10.5l.586-.586a1.002 1.002 0 0 0 .154-.199 2 2 0 0 1-.861-3.337L9.12 4.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287z"/>
        </svg>
      )}
      {showQuantityLinkIcon && (
        <span title={`🔗 ${item.quantityLink!.source}`} style={{ fontSize: 9, marginRight: 2, color: '#3b82f6' }}>🔗</span>
      )}
      {isWitregel && isDescCol ? (
        <span style={{ whiteSpace: 'pre-wrap', overflow: 'hidden' }}>{getValue()}</span>
      ) : (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getValue()}</span>
      )}
    </div>
  );
});

GridCell.displayName = 'GridCell';
