import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { useFileOperations } from '@/hooks/useFileOperations';
import type { CostItem, CostUnit } from '@/types/costModel';
import './CalculationWizard.css';
import { parseLocaleNumber, usesDecimalComma, formatInputNumber } from '@/utils/numberInput';
import { variantItems } from '@/services/grid/variantScope';
import { reviewBudget } from '@/services/review/budgetReview';

export const parseWizardNumber = parseLocaleNumber;

function NumberField({ label, value, change, invalidDraft, setDraft, fieldId, readOnly }: {
  label: string; value: number | null; change: (value: number | null) => void;
  invalidDraft?: string; setDraft: (id: string, value?: string) => void; fieldId: string; readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const comma = usesDecimalComma(i18n.language);
  const invalid = invalidDraft !== undefined;
  const focused = useRef(false);
  const [inputDraft, setInputDraft] = useState(() => invalidDraft ?? formatInputNumber(value, comma));
  useEffect(() => { if (!focused.current) setInputDraft(invalidDraft ?? formatInputNumber(value, comma)); }, [value, comma, invalidDraft]);
  return <label className="calc-wizard-field"><span>{label}</span>
    <input id={fieldId} className="oa-field" inputMode="decimal" readOnly={readOnly} aria-invalid={invalid || undefined} aria-describedby={invalid ? fieldId + '-error' : undefined} value={inputDraft} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; if (!invalid) setInputDraft(formatInputNumber(value, comma)); }} onChange={e => {
      const next = e.target.value, number = parseLocaleNumber(next, comma); setInputDraft(next);
      setDraft(fieldId, number === undefined ? next : undefined);
      if (number !== undefined) change(number);
    }} />
    {readOnly && <small>{t('mobile.linkedQuantity')}</small>}
    {invalid && <small id={fieldId + '-error'} className="oa-field-message oa-field-message--error">{t('wizardUI.invalidNumber', { example: comma ? '1.234,50' : '1,234.50' })}</small>}
  </label>;
}

const steps = ['project', 'quantities', 'costs', 'surcharges', 'review'] as const;
const units: CostUnit[] = ['st', 'm', 'm²', 'm³', 'kg', 'ton', 'uur', 'dgn', 'km', 'keer', 'ls', 'week', 'mnd', 'post', '%', 'pm'];

export function CalculationWizard({ onEditor }: { onEditor?: () => void }) {
  const { t, i18n } = useTranslation();
  const state = useAppStore();
  const { saveFile } = useFileOperations();
  const [step, setStep] = useState(0);
  const [limit, setLimit] = useState(60);
  const [chapter, setChapter] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const errors = Object.keys(drafts);
  const editStarted = useRef(false);
  const { items, schedule, activeDocumentId } = state;
  useEffect(() => { setStep(0); setDrafts({}); setChapter(''); setLimit(60); }, [activeDocumentId]);
  const setDraft = (id: string, value?: string) => setDrafts(current => { const next = { ...current }; value === undefined ? delete next[id] : next[id] = value; return next; });
  const total = useMemo(() => getStaartBreakdown(items), [items]);
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: schedule.currency || 'EUR' });
  const scoped = variantItems(items, schedule);
  const review = useMemo(() => reviewBudget(state), [items, schedule, state.subSheets, state.ifcQuantities]);
  const chapters = scoped.filter(item => item.rowType === 'chapter');
  const childIds = new Set(scoped.map(item => item.parentId));
  const posts = scoped.filter(item => item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost' || item.rowType === 'regel');
  const priced = posts.filter(item => !childIds.has(item.id));
  const byId = new Map(items.map(item => [item.id, item]));
  const visiblePosts = posts.filter(item => {
    if (!chapter) return true;
    const seen = new Set<string>(); let parent = item.parentId;
    while (parent && !seen.has(parent)) { if (parent === chapter) return true; seen.add(parent); parent = byId.get(parent)?.parentId ?? null; }
    return false;
  });
  const change = (item: CostItem, field: string, value: number | string | null) => {
    if (value === item[field as keyof CostItem]) return;
    if (!editStarted.current) { const current = useAppStore.getState(); current.pushHistory(current.items, t('wizardUI.title')); editStarted.current = true; }
    state.updateItem(item.id, field, value);
  };
  const number = (item: CostItem, field: 'quantity' | 'normUnitPrice' | 'materialPrice' | 'laborPrice' | 'normQuantity' | 'staartPercentage', label: string) =>
    <NumberField key={item.id + field} fieldId={item.id + field} label={label} value={item[field] ?? null} change={value => change(item, field, value)} invalidDraft={drafts[item.id + field]} setDraft={setDraft} readOnly={field === 'quantity' && !!item.quantityLink} />;
  const show = (next: number) => { if (!errors.length) { setStep(next); setLimit(60); } };
  const editor = () => { if (onEditor) onEditor(); else state.setActiveContentTab('grid'); };
  return <section onFocusCapture={() => { editStarted.current = false; }} className="calc-wizard oa-app" aria-label={t('wizardUI.title')}>
    <header className="calc-wizard-heading"><div><p className="oa-mono-label">Open Calc Studio · v{__APP_VERSION__}</p><h1>{t('wizardUI.title')}</h1><p>{t('wizardUI.intro')}</p></div>
      <button className="oa-button" onClick={editor}>{t('wizardUI.editor')}</button>
    </header>
    <ol className="oa-steps calc-wizard-steps">{steps.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={index < step ? 'oa-done' : undefined}>
      <button disabled={!!errors.length} onClick={() => show(index)}>{t('wizardUI.steps.' + name)}</button>
    </li>)}</ol>
    {!!errors.length && <div className="oa-banner calc-wizard-errors" role="alert"><p>{t('wizardUI.invalidSummary', { count: errors.length })}</p>
      <button className="oa-button" onClick={() => { const id = errors[0]; setChapter(''); setLimit(items.length); setStep(id.endsWith('quantity') ? 1 : id.endsWith('staartPercentage') ? 3 : 2); requestAnimationFrame(() => document.getElementById(id)?.focus()); }}>{t('wizardUI.findInvalid')}</button>
      <button className="oa-button" onClick={() => setDrafts({})}>{t('wizardUI.discardInvalid')}</button></div>}
    <div className="calc-wizard-body">
      {step === 0 && <div className="oa-form-card"><h2>{t('wizardUI.steps.project')}</h2>
        {(['projectName', 'projectNumber', 'client', 'description'] as const).map(field => <label className="calc-wizard-field" key={field}><span>{t('wizardUI.' + field)}</span><input className="oa-field" value={schedule[field] ?? ''} onChange={e => { state.setSchedule({ [field]: e.target.value }); state.updateDocument(activeDocumentId, { isModified: true }); }} /></label>)}
      </div>}
      {step === 1 && <div className="oa-form-card"><h2>{t('wizardUI.steps.quantities')}</h2><p>{t('wizardUI.quantitiesHelp')}</p>
        <div className="calc-wizard-tools"><select className="oa-field" aria-label={t('chapter')} value={chapter} onChange={e => setChapter(e.target.value)}><option value="">{t('wizardUI.allChapters')}</option>{chapters.map(item => <option key={item.id} value={item.id}>{item.description}</option>)}</select>
          <button className="oa-button" onClick={() => { state.pushHistory(state.items, t('mobile.addChapter')); const id = state.addChapter(null); setChapter(id); }}>{t('mobile.addChapter')}</button>
          <button className="oa-button oa-button--primary" onClick={() => { state.pushHistory(state.items, t('mobile.addPost')); state.addItem(chapter || chapters[0]?.id || state.addChapter(null)); }}>{t('mobile.addPost')}</button></div>
        {chapters.filter(item => !chapter || chapter === item.id).map(item => <label className="calc-wizard-field" key={item.id}><span>{t('chapter')}</span><input className="oa-field" value={item.description} onChange={e => change(item, 'description', e.target.value)} /></label>)}
        {visiblePosts.slice(0, limit).map(item => <div className="calc-wizard-row" key={item.id}><label className="calc-wizard-field"><span>{item.code || t('description')}</span><input className="oa-field" value={item.description} onChange={e => change(item, 'description', e.target.value)} /></label>
          {number(item, 'quantity', t('quantity'))}<label className="calc-wizard-field"><span>{t('unit')}</span><select className="oa-field" value={item.unit} disabled={!!item.quantityLink} onChange={e => change(item, 'unit', e.target.value)}>{units.map(unit => <option key={unit}>{unit}</option>)}</select></label></div>)}
      </div>}
      {step === 2 && <div className="oa-form-card"><h2>{t('wizardUI.steps.costs')}</h2><p>{t('wizardUI.costsHelp')}</p>{priced.slice(0, limit).map(item => <div className="calc-wizard-cost" key={item.id}><h3>{item.description || t('noDescription')}</h3><div className="calc-wizard-row">
        {number(item, 'normUnitPrice', t('wizardUI.unitPrice'))}{number(item, 'laborPrice', t('wizardUI.labor'))}
        {item.rowType === 'regel' ? number(item, 'normQuantity', t('wizardUI.norm')) : number(item, 'materialPrice', t('wizardUI.material'))}
      </div><strong>{money.format(item.total)}</strong></div>)}</div>}
      {(step === 1 && visiblePosts.length > limit || step === 2 && priced.length > limit) && <button className="oa-button" onClick={() => setLimit(n => n + 60)}>{t('wizardUI.more')}</button>}
      {step === 3 && <div className="oa-form-card"><h2>{t('wizardUI.steps.surcharges')}</h2><p>{t('wizardUI.surchargesHelp')}</p>{items.filter(item => item.rowType.startsWith('staart_') && item.staartPercentage != null).map(item => <div className="calc-wizard-row" key={item.id}>
        {number(item, 'staartPercentage', item.description + ' (%)')}<output>{money.format(item.total)}</output>
      </div>)}</div>}
      {step === 4 && <div className="oa-form-card"><h2>{t('wizardUI.steps.review')}</h2><p>{t('wizardUI.reviewHelp')}</p>
        {!priced.length && <p className="oa-banner" role="status">{t('wizardUI.noPosts')}</p>}
        {review.counts.price > 0 && <p className="oa-banner" role="status">{t('wizardUI.missingPrices')}</p>}
        <table className="oa-table"><thead><tr><th>{t('description')}</th><th>{t('quantity')}</th><th>{t('wizardUI.total')}</th></tr></thead><tbody>{priced.slice(0, limit).map(item => <tr key={item.id}><td>{item.description}</td><td>{item.quantity} {item.unit}</td><td>{money.format(item.total)}</td></tr>)}</tbody></table>
        {priced.length > limit && <button className="oa-button" onClick={() => setLimit(n => n + 60)}>{t('wizardUI.more')}</button>}
        <button className="oa-button oa-button--primary" onClick={() => void saveFile()}>{t('save')}</button>
      </div>}
    </div>
    <footer className="calc-wizard-footer"><button className="oa-button" disabled={step === 0 || !!errors.length} onClick={() => show(step - 1)}>{t('wizardUI.back')}</button>
      <output aria-live="polite">{t('wizardUI.exclTax')}: <strong>{money.format(total.aanneemsomExcl + total.afronding)}</strong></output>
      <button className="oa-button oa-button--primary" disabled={!!errors.length} onClick={() => step < 4 ? show(step + 1) : editor()}>{t(step < 4 ? 'wizardUI.next' : 'wizardUI.editor')}</button>
    </footer>
  </section>;
}
