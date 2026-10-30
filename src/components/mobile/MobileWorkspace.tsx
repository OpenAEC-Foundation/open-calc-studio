import appIcon from '@/assets/app-icon.svg';
import { CalculationWizard } from '@/components/wizard/CalculationWizard';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostItem, CostUnit } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';
import { useFileOperations } from '@/hooks/useFileOperations';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { formatInputNumber, parseLocaleNumber, usesDecimalComma } from '@/utils/numberInput';
import { variantItems } from '@/services/grid/variantScope';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { PromptBudgetWorkspace } from '@/components/chat/PromptBudgetWorkspace';
import './MobileWorkspace.css';
import { QuantityOriginCard } from '@/components/common/QuantityOriginCard';
import { ReviewCenter, ReviewReturnBar } from '@/components/review/ReviewCenter';
import { useBudgetReview } from '@/components/review/useBudgetReview';

type MobileTab = 'wizard' | 'budget' | 'sheets' | 'prompt' | 'review';
const units: CostUnit[] = ['st', 'm', 'm²', 'm³', 'kg', 'ton', 'uur', 'dgn', 'km', 'keer', 'ls', 'week', 'mnd', 'post', '%', 'pm'];
function MobileItemEditor({ item, onClose }: { item: CostItem; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const comma = usesDecimalComma(i18n.language);
  const parseDecimal = (value: string) => parseLocaleNumber(value, comma);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, true, onClose);
  const [unlinked, setUnlinked] = useState(false);
  const linked = !!item.quantityLink && !unlinked;
  const updateItem = useAppStore((s) => s.updateItem);
  const deleteItem = useAppStore((s) => s.deleteItem);
  const items = useAppStore((s) => s.items);
  const [description, setDescription] = useState(item.description);
  const [code, setCode] = useState(item.code);
  const [notes, setNotes] = useState(item.notes);
  const [quantity, setQuantity] = useState(formatInputNumber(item.quantity, comma));
  const [price, setPrice] = useState(formatInputNumber(item.normUnitPrice, comma));
  const [norm, setNorm] = useState(formatInputNumber(item.normQuantity, comma));
  const [unit, setUnit] = useState<CostUnit>(item.unit);
  const [error, setError] = useState('');
  const hasPricedChildren = items.some((child) => child.parentId === item.id && child.total !== 0);
  const canPrice = (item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost') && !hasPricedChildren || item.rowType === 'regel';

  function commit() {
    const nextQuantity = parseDecimal(quantity);
    const nextPrice = parseDecimal(price);
    const nextNorm = parseDecimal(norm);
    if (nextQuantity === undefined || (canPrice && nextPrice === undefined) || (item.rowType === 'regel' && nextNorm === undefined)) {
      setError(t('mobile.invalidNumber'));
      return;
    }
    const changes: [string, unknown][] = [];
    const change = (field: keyof CostItem, value: unknown) => { if (value !== item[field]) changes.push([field, value]); };
    change('description', description.trim()); change('code', code.trim()); change('notes', notes);
    if (item.rowType !== 'chapter') {
      change('unit', unit);
      if (!linked) change('quantity', nextQuantity);
      if (unlinked) { change('quantityLink', null); }
      if (canPrice) change('normUnitPrice', nextPrice);
      if (item.rowType === 'regel') change('normQuantity', nextNorm);
    }
    if (changes.length) {
      const current = useAppStore.getState();
      current.pushHistory(current.items, t('mobile.editItem'));
      for (const [field, value] of changes) updateItem(item.id, field, value as Parameters<typeof updateItem>[2]);
    }
    onClose();
  }

  function remove() {
    if (window.confirm(t('mobile.deleteConfirm'))) {
      const current = useAppStore.getState();
      current.pushHistory(current.items, t('history.delete'));
      deleteItem(item.id);
      onClose();
    }
  }

  return (
    <div className="mobile-edit-backdrop" role="presentation" onClick={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="mobile-edit-sheet" role="dialog" aria-modal="true" aria-label={t('mobile.editItem')} onClick={(e) => e.stopPropagation()}>
        <div className="mobile-edit-head">
          <h2>{t('mobile.editItem')}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')}>×</button>
        </div>
        <div className="mobile-edit-fields">
          <label>{t('description')}<input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label>{t('code')}<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
          {item.rowType !== 'chapter' && <div className="mobile-edit-pair">
            <label>{t('quantity')}<input inputMode="decimal" readOnly={linked} aria-describedby={linked ? "mobile-linked-quantity" : undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
            <label>{t('unit')}<select disabled={linked} value={unit} onChange={(e) => setUnit(e.target.value as CostUnit)}>{units.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>}
          {canPrice && <label>{t('mobile.pricePerUnit')}<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>}
          {item.rowType === 'regel' && <label>{t('mobile.productionNorm')}<input inputMode="decimal" value={norm} onChange={(e) => setNorm(e.target.value)} /></label>}
          <label>{t('notes')}<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          {linked && <><p id="mobile-linked-quantity">{t('mobile.linkedQuantity')}</p><QuantityOriginCard item={item} allowNavigate={false} /><button type="button" onClick={() => { setQuantity(formatInputNumber(item.quantity, comma)); setUnlinked(true); }}>{t('mobile.unlinkQuantity')}</button></>}
          {unlinked && <p role="status">{t('mobile.unlinkPending')}</p>}
          {error && <p className="mobile-edit-error" role="alert">{error}</p>}
        </div>
        <div className="mobile-edit-actions">
          <button type="button" className="mobile-danger" onClick={remove}>{t('delete')}</button>
          <button type="button" className="mobile-primary" onClick={commit}>{t('mobile.done')}</button>
        </div>
      </section>
    </div>
  );
}

function MobileSheets() {
  const { t } = useTranslation();
  const sheets = useAppStore((s) => s.subSheets);
  const activeSheetId = useAppStore((s) => s.activeSubSheetId);
  const addSheet = useAppStore((s) => s.addSubSheet);
  const setActiveSheet = useAppStore((s) => s.setActiveSubSheet);
  const setCell = useAppStore((s) => s.setSubSheetCell);
  const updateDocument = useAppStore((s) => s.updateDocument);
  const activeDocumentId = useAppStore((s) => s.activeDocumentId);
  const [cellRef, setCellRef] = useState('A1');
  const [cellValue, setCellValue] = useState('');
  const [cellError, setCellError] = useState('');
  const sheet = sheets.find((candidate) => candidate.id === activeSheetId) ?? sheets[0];
  const filled = Object.entries(sheet?.cells ?? {}).filter(([, cell]) => cell.value !== '').sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  // Reload the editor when its target changes; never carry a previous sheet's
  // draft value into another sheet or document.
  useEffect(() => {
    setCellRef('A1');
    setCellValue(sheet?.cells.A1?.value ?? '');
    setCellError('');
  }, [sheet?.id, activeDocumentId]);

  function add() {
    addSheet();
    if (activeDocumentId) updateDocument(activeDocumentId, { isModified: true });
  }

  function chooseCell(ref: string, value: string) {
    setCellRef(ref);
    setCellValue(value);
    setCellError('');
  }

  function commitCell() {
    if (!sheet) return;
    const ref = cellRef.trim().toUpperCase();
    if (!/^[A-Z]{1,3}[1-9]\d*$/.test(ref)) {
      setCellError(t('mobile.invalidCell'));
      return;
    }
    setCell(sheet.id, ref, cellValue);
    if (activeDocumentId) updateDocument(activeDocumentId, { isModified: true });
    setCellError('');
  }

  return <div className="mobile-panel">
    <div className="mobile-section-head"><h2>{t('mobile.sheets')}</h2><button type="button" onClick={add}>+ {t('mobile.newSheet')}</button></div>
    {sheets.length > 0 && <div className="mobile-sheet-tabs" role="tablist" aria-label={t('mobile.sheets')}>
      {sheets.map((candidate) => <button type="button" role="tab" aria-selected={sheet?.id === candidate.id} key={candidate.id} onClick={() => setActiveSheet(candidate.id)}>{candidate.name}</button>)}
    </div>}
    {sheet ? <>
      <form className="mobile-cell-form" onSubmit={(e) => { e.preventDefault(); commitCell(); }}>
        <label>{t('mobile.cell')}<input aria-label={t('mobile.cell')} value={cellRef} onChange={(e) => setCellRef(e.target.value)} autoCapitalize="characters" /></label>
        <label>{t('mobile.value')}<input aria-label={t('mobile.value')} value={cellValue} onChange={(e) => setCellValue(e.target.value)} /></label>
        <button className="mobile-primary" type="submit">{t('save')}</button>
      </form>
      {cellError && <p className="mobile-edit-error" role="alert">{cellError}</p>}
      <div className="mobile-cell-list">{filled.map(([ref, cell]) => <button type="button" key={ref} onClick={() => chooseCell(ref, cell.value)}><strong>{ref}</strong><span>{cell.value}</span></button>)}</div>
    </> : <p className="mobile-empty-note">{t('mobile.noSheets')}</p>}
  </div>;
}

export function MobileWorkspace() {
  const { t, i18n } = useTranslation();
  const undoCount = useAppStore(s => s.undoStack.length);
  const redoCount = useAppStore(s => s.redoStack.length);
  const schedule = useAppStore(s => s.schedule);
  const money = useMemo(() => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: schedule.currency || 'EUR' }), [i18n.language, schedule.currency]);
  const { newFile, openFile, saveFile, saveFileAs } = useFileOperations();
  const documents = useAppStore((s) => s.documents);
  const activeDocumentId = useAppStore((s) => s.activeDocumentId);
  const setActiveDocument = useAppStore((s) => s.setActiveDocument);
  const items = useAppStore((s) => s.items);
  const addChapter = useAppStore((s) => s.addChapter);
  const addPost = useAppStore((s) => s.addItem);
  const insertRule = useAppStore((s) => s.insertRegelBelow);
  const activeDoc = documents.find((doc) => doc.id === activeDocumentId);
  const [tab, setTab] = useState<MobileTab>('budget');
  const contentTab = useAppStore(s => s.activeContentTab);
  const returnItemId = useAppStore(s => s.reviewReturnItemId);
  const review = useBudgetReview();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    if (contentTab === 'wizard') setTab('wizard');
    if (contentTab === 'review') setTab('review');
    if (contentTab === 'grid' && returnItemId) { setTab('budget'); setEditingId(returnItemId); }
  }, [contentTab, returnItemId]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [addMenu, setAddMenu] = useState(false);
  const [pageLimit, setPageLimit] = useState(120);
  const editing = items.find((item) => item.id === editingId);
  const scopedItems = useMemo(() => variantItems(items, schedule), [items, schedule.branchesEnabled, schedule.activeBranchId, schedule.branches]);
  const itemIndex = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) if (item.parentId && !item.rowType.startsWith('staart_')) counts.set(item.parentId, (counts.get(item.parentId) ?? 0) + 1);
    return counts;
  }, [items]);
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return scopedItems.filter((item) => {
      if (item.rowType.startsWith('staart_')) return false;
      if (text) return `${item.code} ${item.description}`.toLocaleLowerCase().includes(text);
      let parentId = item.parentId;
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = itemIndex.get(parentId);
        if (!parent) break;
        if ((parent.rowType === 'begrotingspost' || parent.rowType === 'bewakingspost') && !expanded.has(parent.id)) return false;
        parentId = parent.parentId;
      }
      return true;
    });
  }, [scopedItems, itemIndex, query, expanded]);
  const total = useMemo(() => {
    const breakdown = getStaartBreakdown(items);
    return breakdown.aanneemsom + breakdown.afronding;
  }, [items]);

  useEffect(() => { setEditingId(null); setExpanded(new Set()); setPageLimit(120); }, [activeDocumentId]);
  useEffect(() => { setPageLimit(120); }, [query]);

  function add(kind: 'chapter' | 'post' | 'rule') {
    const store = useAppStore.getState();
    store.pushHistory(store.items, t('mobile.add'));
    let id = '';
    if (kind === 'chapter') id = addChapter(null);
    else if (kind === 'post') {
      const selected = store.items.find((item) => item.id === editingId);
      const chapter = selected?.rowType === 'chapter' ? selected : store.items.find((item) => item.id === selected?.parentId && item.rowType === 'chapter') ?? [...store.items].reverse().find((item) => item.rowType === 'chapter');
      const chapterId = chapter?.id ?? addChapter(null);
      id = addPost(chapterId);
    } else {
      const target = editingId ?? [...store.items].reverse().find((item) => item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost')?.id ?? null;
      id = insertRule(target);
      const parentId = useAppStore.getState().items.find((item) => item.id === id)?.parentId;
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
    }
    setAddMenu(false);
    setQuery('');
    if (id) setEditingId(id);
  }

  return <div className="mobile-workspace">
    <header className="mobile-header">
      <div className="mobile-brand"><img src={appIcon} alt="" /><div><strong>Open Calc Studio <small>v{__APP_VERSION__}</small></strong><small>{t('mobile.subtitle')}</small></div></div>
      {documents.length > 1 ? <select className="mobile-document-select" aria-label={t('mobile.document')} value={activeDocumentId} onChange={(e) => setActiveDocument(e.target.value)}>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.fileName}{doc.isModified ? ' •' : ''}</option>)}</select> : <div className="mobile-document-name">{activeDoc?.fileName ?? t('noDocumentOpen')}{activeDoc?.isModified ? ' •' : ''}</div>}
      <div className="mobile-file-actions">
        <button type="button" disabled={!undoCount} onClick={() => { const s = useAppStore.getState(); const restored = s.undo(); if (restored) s.setItems(restored); }}>{t('undo')}</button>
        <button type="button" disabled={!redoCount} onClick={() => { const s = useAppStore.getState(); const restored = s.redo(); if (restored) s.setItems(restored); }}>{t('redo')}</button>
        <button type="button" onClick={newFile}>{t('mobile.new')}</button>
        <button type="button" onClick={() => void openFile()}>{t('open')}</button>
        <button type="button" className="mobile-primary" disabled={!activeDoc} onClick={() => void saveFile()}>{t('save')}</button>
        {activeDoc?.hostFile?.readOnly && <button type="button" onClick={() => void saveFileAs()}>{t('saveAs')}</button>}
      </div>
    </header>
    {activeDoc ? <>
      <main className="mobile-main">
        {tab === 'budget' && <div className="mobile-panel">
          <ReviewReturnBar />
          <div className="mobile-summary"><span>{t('mobile.estimateTotal')}</span><strong>{money.format(total)}</strong></div>
          <div className="mobile-budget-tools"><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('mobile.searchItems')} aria-label={t('mobile.searchItems')} /><button type="button" className="mobile-primary" aria-expanded={addMenu} onClick={() => setAddMenu((value) => !value)}>+ {t('mobile.add')}</button></div>
          {addMenu && <div className="mobile-add-menu"><button type="button" onClick={() => add('chapter')}>{t('mobile.addChapter')}</button><button type="button" onClick={() => add('post')}>{t('mobile.addPost')}</button><button type="button" onClick={() => add('rule')}>{t('mobile.addRule')}</button></div>}
          <div className="mobile-item-list">{visible.slice(0, pageLimit).map((item) => {
            const hasChildren = (childCounts.get(item.id) ?? 0) > 0;
            const isContainer = item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost';
            return <div className={`mobile-item mobile-item-${item.rowType}`} key={item.id} style={{ '--mobile-depth': Math.min(item.depth, 3) } as React.CSSProperties}>
              {isContainer && hasChildren && !query ? <button className="mobile-item-expand" type="button" aria-label={expanded.has(item.id) ? t('mobile.collapse') : t('mobile.expand')} aria-expanded={expanded.has(item.id)} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{expanded.has(item.id) ? '▾' : '▸'}</button> : <span className="mobile-item-expand-spacer" />}
              <button className="mobile-item-body" type="button" onClick={() => setEditingId(item.id)}><span className="mobile-item-line"><strong>{item.description || t('noDescription')}</strong><em>{money.format(item.total)}</em></span><span className="mobile-item-meta">{item.code || t(item.rowType === 'chapter' ? 'chapter' : item.rowType === 'regel' ? 'calculationRule' : 'budgetPost')}{item.quantity !== null ? ` · ${item.quantity} ${item.unit}` : ''}</span></button>
            </div>;
          })}</div>
          {visible.length > pageLimit && <button className="mobile-load-more" type="button" onClick={() => setPageLimit((limit) => limit + 120)}>{t('mobile.showMore', { count: visible.length - pageLimit })}</button>}
          {visible.length === 0 && <p className="mobile-empty-note">{query ? t('mobile.noResults') : t('mobile.noItems')}</p>}
        </div>}
        {tab === 'wizard' && <CalculationWizard onEditor={() => setTab('budget')} />}
        {tab === 'sheets' && <MobileSheets />}
        {tab === 'prompt' && <div className="mobile-prompt"><PromptBudgetWorkspace /></div>}
        {tab === 'review' && <ReviewCenter onOpenItem={id => { setTab('budget'); setEditingId(id); }} />}
      </main>
      <nav className="mobile-nav" aria-label={t('mobile.navigation')}>
        <button type="button" aria-current={tab === 'wizard' ? 'page' : undefined} onClick={() => setTab('wizard')}>{t('wizardUI.shortTitle')}</button>
        <button type="button" aria-current={tab === 'budget' ? 'page' : undefined} onClick={() => setTab('budget')}>{t('mobile.budget')}</button>
        <button type="button" aria-current={tab === 'review' ? 'page' : undefined} onClick={() => { setTab('review'); useAppStore.getState().setActiveContentTab('review'); }}>{t('review.mobile')} ({review.counts.all})</button>
        <button type="button" aria-current={tab === 'sheets' ? 'page' : undefined} onClick={() => setTab('sheets')}>{t('mobile.sheets')}</button>
        <button type="button" aria-current={tab === 'prompt' ? 'page' : undefined} onClick={() => setTab('prompt')}>{t('mobile.prompt')}</button>
      </nav>
    </> : <main className="mobile-welcome"><h1>{t('appName')}</h1><p>{t('noDocumentHint')}</p><button className="mobile-primary" type="button" onClick={newFile}>{t('newBudget')}</button><button type="button" onClick={() => void openFile()}>{t('open')}</button></main>}
    {editing && <MobileItemEditor key={editing.id} item={editing} onClose={() => setEditingId(null)} />}
  </div>;
}
