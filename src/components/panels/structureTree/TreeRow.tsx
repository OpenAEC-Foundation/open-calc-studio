import React from 'react';
import type { CostItem } from '@/types/costModel';
import { formatTreeAmount, formatTreePercent, prefixOf, treeRowDomId, type TreeNumber } from './treeModel';
import { RowIcon } from './RowIcon';

/**
 * Structuurboom, één rij. Los onderdeel met React.memo: bij 8.000 rijen
 * tekent een klik, een pijltje of een muisbeweging tijdens het slepen anders
 * élke rij opnieuw. Daarom alleen eenvoudige props, en handlers die nooit
 * veranderen (TreeRowEvents, met het id als argument): zo tekent React alleen
 * de paar rijen waarvan echt iets veranderde.
 */

/** Vaste handlers voor alle rijen (zie SchedulePanel: altijd dezelfde functies). */
export interface TreeRowEvents {
  pointerDown: (e: React.PointerEvent<HTMLDivElement>, id: string) => void;
  click: (id: string) => void;
  doubleClick: (id: string) => void;
  contextMenu: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  toggle: (id: string) => void;
}

export interface TreeRowProps {
  item: CostItem;
  level: number;
  foldable: boolean;
  /** aria-selected: de geselecteerde rij (ook tijdens slepen). */
  selected: boolean;
  /** Markering `active`: geselecteerd en er wordt niet gesleept. */
  active: boolean;
  dragging: boolean;
  dropInside: boolean;
  expandPending: boolean;
  number: TreeNumber;
  amounts: boolean;
  percent: boolean;
  /** Basis voor "% van totaal" (alleen van belang als `percent` aan staat). */
  kostprijs: number;
  /** Naam van een hoofdstuk zonder omschrijving (vertaald). */
  chapterFallback: string;
  /** App-taal: alleen voor React.memo, zodat bedragen en % na een taalwissel
   *  opnieuw in de nieuwe notatie getekend worden (issue #65). */
  language: string;
  events: TreeRowEvents;
}

export const TreeRow = React.memo(function TreeRow({
  item, level, foldable, selected, active, dragging, dropInside, expandPending,
  number, amounts, percent, kostprijs, chapterFallback, events,
}: TreeRowProps) {
  const prefix = prefixOf(item, number);
  const description = item.description?.trim() ?? '';
  const fallback = item.rowType === 'chapter' ? chapterFallback : '—';
  const text = prefix && description ? `${prefix} ${description}` : description || prefix || fallback;
  const amount = amounts ? formatTreeAmount(item.total) : '';
  // % alleen voor hoofdstukken en posten (een regel geeft vooral "0,0 %"),
  // en niet bij een kostprijs van 0 of minder (dan klopt het teken niet).
  const pct = percent && kostprijs > 0 && item.total && item.rowType !== 'regel'
    ? `${formatTreePercent((item.total / kostprijs) * 100)}%` : '';
  // De gesleepte rij staat dicht in beeld: pijltje en aria ook.
  const shownCollapsed = !!item.isCollapsed || dragging;
  return (
    <div
      id={treeRowDomId(item.id)}
      data-tree-id={item.id}
      data-row-type={item.rowType}
      role="treeitem"
      aria-level={level}
      aria-selected={selected}
      // Ook als alleen het raster in-/uitklapt (inhoud dieper dan de boom toont).
      aria-expanded={foldable ? !shownCollapsed : undefined}
      // Tijdens slepen alleen de gesleepte rij markeren, niet ook nog de selectie.
      className={`schedule-item${active ? ' active' : ''}${dragging ? ' dragging' : ''}${dropInside ? ' drop-inside' : ''}${expandPending ? ' expand-pending' : ''}`}
      style={{ paddingInlineStart: (level - 1) * 12 + 4 }}
      title={text}
      onPointerDown={(e) => events.pointerDown(e, item.id)}
      onClick={() => events.click(item.id)}
      onDoubleClick={() => events.doubleClick(item.id)}
      onContextMenu={(e) => events.contextMenu(e, item.id)}
    >
      {foldable ? (
        <button
          className="grid-collapse-btn"
          tabIndex={-1}
          aria-hidden="true"
          onClick={(e) => { e.stopPropagation(); events.toggle(item.id); }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {shownCollapsed
              ? <polyline points="3,2 7,5 3,8" />
              : <polyline points="2,3 5,7 8,3" />}
          </svg>
        </button>
      ) : (
        <span className="schedule-item-spacer" />
      )}
      <RowIcon rowType={item.rowType} />
      <span className="schedule-item-label">
        {prefix && description
          ? <><span className="schedule-item-code">{prefix}</span>{description}</>
          : text}
      </span>
      {amount && <span className="schedule-item-amount">{amount}</span>}
      {/* Altijd een %-vakje (desnoods leeg), anders schuiven de bedragen
          van rijen zonder % naar rechts en staan ze niet onder elkaar. */}
      {percent && <span className="schedule-item-pct" aria-hidden={pct ? undefined : true}>{pct}</span>}
    </div>
  );
});
