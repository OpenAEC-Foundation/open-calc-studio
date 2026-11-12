import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getPortalTarget } from '@/lib/hostRoot';
import { filterCurrencyOptions, mainCurrencyOptions, type CurrencyOption } from '@/utils/currencies';
import '../panels/panels.css';

const EDGE = 8;

/**
 * Plek van de lijst: onder het veld, of erboven als daar meer ruimte is; zo
 * hoog als het scherm toelaat, zodat de korte lijst zonder scrollen past.
 * De lijst staat in een portal, zodat de dialoog hem niet afknipt.
 */
function listPosition(input: HTMLElement): React.CSSProperties {
  const r = input.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - EDGE;
  const above = r.top - EDGE;
  const base = { position: 'fixed' as const, left: r.left, width: r.width };
  return below >= 320 || below >= above
    ? { ...base, top: r.bottom + 2, maxHeight: below }
    : { ...base, bottom: window.innerHeight - r.top + 2, maxHeight: above };
}

/**
 * Valutakeuze met zoeken (issue #81): typ een code of naam ("CRC", "colón",
 * "dollar") en kies uit de treffers. Zonder zoekterm staan alleen de
 * hoofdvaluta's er (plus de huidige); de laatste rij "Alle valuta's tonen"
 * klapt de volledige lijst uit. Zoeken gaat altijd over alles. Toetsen zoals in de ResourcePicker:
 * pijltjes, Enter kiest, Escape sluit de lijst (niet de dialoog).
 */
export const CurrencyPicker: React.FC<{
  id: string;
  value: string;
  options: CurrencyOption[];
  onChange: (code: string) => void;
  describedBy?: string;
}> = ({ id, value, options, onChange, describedBy }) => {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  // null = nog niets getypt: het veld toont de gekozen valuta.
  const [query, setQuery] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const searching = !!query?.trim();
  // Korte lijst met als extra laatste rij "Alle valuta's tonen" (index filtered.length).
  const collapsed = !searching && !showAll;
  const filtered = useMemo(
    () => searching ? filterCurrencyOptions(options, query ?? '') : showAll ? options : mainCurrencyOptions(options, value),
    [options, query, searching, showAll, value],
  );
  const rowCount = filtered.length + (collapsed ? 1 : 0);
  const selected = options.find(o => o.code === value);

  const openList = () => {
    if (open) return;
    scrollToActive.current = true;
    setActive(Math.max(0, filtered.findIndex(o => o.code === value)));
    setOpen(true);
  };
  const close = () => { setOpen(false); setQuery(null); setShowAll(false); };
  const pick = (option: CurrencyOption | undefined) => {
    if (!option) return;
    close();
    onChange(option.code);
  };

  // De dialoog sluit op Escape in de capture-fase van document; window komt
  // eerder, dus zo sluit Escape eerst alleen de open lijst.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target !== inputRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Alleen bij toetsen meescrollen; bij hoveren zou de lijst onder de muis verschuiven.
  const scrollToActive = useRef(false);
  useEffect(() => {
    if (!open || !scrollToActive.current) return;
    scrollToActive.current = false;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  // Volg het veld zolang de lijst open is: ook bij scrollen, venstergrootte en
  // het verslepen van de dialoog (dat geeft geen scroll- of resize-event).
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open || !inputRef.current) { setPosition(null); return; }
    let last = '';
    let frame = 0;
    const update = () => {
      if (inputRef.current) {
        const next = listPosition(inputRef.current);
        const key = JSON.stringify(next);
        if (key !== last) { last = key; setPosition(next); }
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'PageDown' ? 10 : e.key === 'PageUp' ? -10 : 0;
    // Enter of pijltjes tijdens IME-invoer (ja/zh/ko) horen bij de invoermethode.
    if (e.nativeEvent.isComposing) return;
    if (step) {
      e.preventDefault();
      if (!open) { openList(); return; }
      scrollToActive.current = true;
      setActive(i => Math.min(Math.max(i + step, 0), rowCount - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (collapsed && active === filtered.length) setShowAll(true);
      else pick(filtered[active]);
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div className="currency-picker">
      <input
        ref={inputRef}
        id={id}
        className="prop-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active < rowCount ? optionId(active) : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={t('projectInfo.currencySearch')}
        value={query ?? selected?.label ?? value}
        onFocus={(e) => e.target.select()}
        // Na een muisklik heft de browser de selectie van onFocus weer op.
        onClick={() => { if (query === null) inputRef.current?.select(); openList(); }}
        onBlur={close}
        onChange={(e) => { scrollToActive.current = true; setQuery(e.target.value); setShowAll(false); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="currency-picker-list"
          style={position ?? undefined}
          aria-label={t('projectInfo.currency')}
          // Klikken in de lijst (ook op de rand, de schuifbalk of "geen treffers")
          // mag het veld niet laten blurren, anders sluit de lijst.
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 && <li className="currency-picker-empty" role="presentation">{t('projectInfo.currencyNoMatch')}</li>}
          {filtered.map((o, index) => (
            <li
              key={o.code}
              id={optionId(index)}
              data-index={index}
              role="option"
              aria-selected={index === active}
              className={[
                'currency-picker-option',
                index === active ? 'selected' : '',
                o.code === value ? 'current' : '',
                // Streep tussen de hoofdvaluta's en de rest.
                !searching && index > 0 && filtered[index - 1].main && !o.main ? 'group-start' : '',
              ].filter(Boolean).join(' ')}
              title={o.label}
              // mousedown zou het veld laten blurren (en de lijst sluiten) vóór de klik.
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => { if (index !== active) setActive(index); }}
              onClick={() => pick(o)}
            >
              {o.label}
            </li>
          ))}
          {collapsed && (
            <li
              id={optionId(filtered.length)}
              data-index={filtered.length}
              role="option"
              aria-selected={active === filtered.length}
              className={`currency-picker-option currency-picker-show-all group-start${active === filtered.length ? ' selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => { if (active !== filtered.length) setActive(filtered.length); }}
              onClick={() => setShowAll(true)}
            >
              {t('projectInfo.currencyShowAll')}
            </li>
          )}
        </ul>,
        getPortalTarget(),
      )}
    </div>
  );
};
