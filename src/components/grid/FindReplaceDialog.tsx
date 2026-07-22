import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/state/appStore';
import './FindReplaceDialog.css';

/**
 * Zoeken & vervangen in het begrotingsgrid (Ctrl+F).
 *
 * Zoekt in omschrijving, code en nr van alle regels (ook ingeklapte); bij
 * springen worden ingeklapte ouders opengeklapt zodat de treffer zichtbaar
 * en actief wordt. Vervangen werkt op omschrijving en code.
 */
interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FindReplaceDialog({ open, onClose }: Props) {
  const items = useAppStore((s) => s.items);
  const updateItem = useAppStore((s) => s.updateItem);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const setActiveCell = useAppStore((s) => s.setActiveCell);
  const getGridRows = useAppStore((s) => s.getGridRows);

  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open]);

  // Alle treffers: item + veld waarin de zoekterm voorkomt.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { id: string; field: 'description' | 'code' | 'nr'; text: string }[];
    const out: { id: string; field: 'description' | 'code' | 'nr'; text: string }[] = [];
    for (const item of items) {
      if (item.rowType === 'witregel') continue;
      if (item.description?.toLowerCase().includes(q)) out.push({ id: item.id, field: 'description', text: item.description });
      else if (item.code?.toLowerCase().includes(q)) out.push({ id: item.id, field: 'code', text: item.code });
      else if (item.nr?.toLowerCase().includes(q)) out.push({ id: item.id, field: 'nr', text: item.nr });
    }
    return out;
  }, [items, query]);

  const current = matches.length > 0 ? matches[Math.min(cursor, matches.length - 1)] : null;

  /** Spring naar de treffer: ouders openklappen en de rij activeren. */
  const jumpTo = useCallback((match: { id: string } | null) => {
    if (!match) return;
    const item = items.find((i) => i.id === match.id);
    if (!item) return;
    // Ingeklapte ouders openen zodat de rij zichtbaar is
    let parent = items.find((i) => i.id === item.parentId);
    while (parent) {
      if (parent.isCollapsed) updateItem(parent.id, 'isCollapsed', false);
      parent = items.find((i) => i.id === parent!.parentId);
    }
    requestAnimationFrame(() => {
      // Rij-index in de gerenderde rijenlijst — met getVisibleItems() zou de
      // sprong in de WPCalc-weergave (footerrijen) op de verkeerde rij landen.
      const visible = getGridRows();
      const row = visible.findIndex((i) => i.id === match.id);
      if (row >= 0) setActiveCell(row, 2, match.id);
    });
  }, [items, updateItem, getGridRows, setActiveCell]);

  const findNext = useCallback((dir: 1 | -1 = 1) => {
    if (matches.length === 0) return;
    const next = (cursor + dir + matches.length) % matches.length;
    setCursor(next);
    jumpTo(matches[next]);
  }, [matches, cursor, jumpTo]);

  const replaceOne = useCallback(() => {
    if (!current || !query.trim()) return;
    if (current.field === 'nr') { findNext(1); return; } // nr is berekend — overslaan
    pushHistory(items, 'Vervangen');
    const re = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    updateItem(current.id, current.field, current.text.replace(re, replaceWith));
    // cursor blijft — de lijst herrekent en schuift vanzelf op
  }, [current, query, replaceWith, items, pushHistory, updateItem, findNext]);

  const replaceAll = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const targets = matches.filter((m) => m.field !== 'nr');
    if (targets.length === 0) return;
    pushHistory(items, `Alles vervangen (${targets.length}×)`);
    for (const m of targets) {
      updateItem(m.id, m.field, m.text.replace(re, replaceWith));
    }
  }, [matches, query, replaceWith, items, pushHistory, updateItem]);

  if (!open) return null;

  return (
    <div className="find-replace" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="find-replace-row">
        <input
          ref={inputRef}
          className="find-replace-input"
          placeholder="Zoeken…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
          }}
        />
        <span className="find-replace-count">
          {query.trim() ? (matches.length === 0 ? 'geen' : `${Math.min(cursor + 1, matches.length)}/${matches.length}`) : ''}
        </span>
        <button className="find-replace-btn" title="Vorige (Shift+Enter)" onClick={() => findNext(-1)} disabled={matches.length === 0}>↑</button>
        <button className="find-replace-btn" title="Volgende (Enter)" onClick={() => findNext(1)} disabled={matches.length === 0}>↓</button>
        <button className="find-replace-btn find-replace-close" title="Sluiten (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="find-replace-row">
        <input
          className="find-replace-input"
          placeholder="Vervangen door…"
          value={replaceWith}
          onChange={(e) => setReplaceWith(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } }}
        />
        <button className="find-replace-btn find-replace-wide" onClick={replaceOne} disabled={!current || current.field === 'nr'}>Vervangen</button>
        <button className="find-replace-btn find-replace-wide" onClick={replaceAll} disabled={matches.filter(m => m.field !== 'nr').length === 0}>Alles</button>
      </div>
    </div>
  );
}
