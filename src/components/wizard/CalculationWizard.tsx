import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { useFileOperations } from '@/hooks/useFileOperations';
import type { CostItem, CostUnit } from '@/types/costModel';
import './CalculationWizard.css';

/** Parse a complete number, without changing the shared calculator's input model. */
export function parseWizardNumber(text: string, comma: boolean): number | null | undefined {
  if (!text.trim()) return null;
  const value = text.trim();
  const pattern = comma ? /^-?(?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d+)?$/ : /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
  if (!pattern.test(value)) return undefined;
  const number = Number(comma ? value.replace(/[. ]/g, '').replace(',', '.') : value.replace(/,/g, ''));
  return Number.isFinite(number) ? number : undefined;
}

function NumberField({ label, value, change, validity, fieldId }: {
  label: string; value: number | null; change: (value: number | null) => void;
  validity: (id: string, valid: boolean) => void; fieldId: string;
}) {
  const { t, i18n } = useTranslation();
  const comma = new Intl.NumberFormat(i18n.language).format(1.5).includes(',');
  const format = (v: number | null) => v === null ? '' : String(v).replace('.', comma ? ',' : '.');
  const [draft, setDraft] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(format(value)); setInvalid(false); }, [value, comma]);
  return <label className="calc-wizard-field"><span>{label}</span>
    <input className="oa-field" inputMode="decimal" aria-invalid={invalid || undefined} aria-describedby={invalid ? fieldId + '-error' : undefined} value={draft} onChange={e => {
      const next = e.target.value; setDraft(next);
      const number = parseWizardNumber(next, comma);
      setInvalid(number === undefined); validity(fieldId, number !== undefined);
      if (number !== undefined) change(number);
    }} />
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
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const { items, schedule, activeDocumentId } = state;
  useEffect(() => { setStep(0); setErrors(new Set()); setChapter(''); setLimit(60); }, [activeDocumentId]);
  const validity = (id: string, valid: boolean) => setErrors(current => { const next = new Set(current); valid ? next.delete(id) : next.add(id); return next; });
  const total = useMemo(() => getStaartBreakdown(items), [items]);
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: schedule.currency || 'EUR' });
  const chapters = items.filter(item => item.rowType === 'chapter');
  const childIds = new Set(items.map(item => item.parentId));
  const posts = items.filter(item => item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost' || item.rowType === 'regel');
  const priced = posts.filter(item => !childIds.has(item.id));
  const byId = new Map(items.map(item => [item.id, item]));
  const visiblePosts = posts.filter(item => {
    if (!chapter) return true;
    const seen = new Set<string>(); let parent = item.parentId;
    while (parent && !seen.has(parent)) { if (parent === chapter) return true; seen.add(parent); parent = byId.get(parent)?.parentId ?? null; }
    return false;
  });
  const change = (item: CostItem, field: string, value: number | string | null) => state.updateItem(item.id, field, value);
  const number = (item: CostItem, field: 'quantity' | 'normUnitPrice' | 'materialPrice' | 'laborPrice' | 'normQuantity' | 'staartPercentage', label: string) =>
    <NumberField key={item.id + field} fieldId={item.id + field} label={label} value={item[field] ?? null} change={value => change(item, field, value)} validity={validity} />;
  const show = (next: number) => { if (!errors.size) { setStep(next); setLimit(60); } };
  const editor = () => { if (!errors.size) { if (onEditor) onEditor(); else state.setActiveContentTab('grid'); } };
  return <section className="calc-wizard oa-app" aria-label={t('wizardUI.title')}>
    <header className="calc-wizard-heading"><div><p className="oa-mono-label">Open Calc Studio · v{__APP_VERSION__}</p><h1>{t('wizardUI.title')}</h1><p>{t('wizardUI.intro')}</p></div>
      <button className="oa-button" disabled={!!errors.size} onClick={editor}>{t('wizardUI.editor')}</button>
    </header>
    <ol className="oa-steps calc-wizard-steps">{steps.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={index < step ? 'oa-done' : undefined}>
      <button disabled={!!errors.size} onClick={() => show(index)}>{t('wizardUI.steps.' + name)}</button>
    </li>)}</ol>
    <div className="calc-wizard-body">
      {step === 0 && <div className="oa-form-card"><h2>{t('wizardUI.steps.project')}</h2>
        {(['projectName', 'projectNumber', 'client', 'description'] as const).map(field => <label className="calc-wizard-field" key={field}><span>{t('wizardUI.' + field)}</span><input className="oa-field" value={schedule[field] ?? ''} onChange={e => { state.setSchedule({ [field]: e.target.value }); state.updateDocument(activeDocumentId, { isModified: true }); }} /></label>)}
      </div>}
      {step === 1 && <div className="oa-form-card"><h2>{t('wizardUI.steps.quantities')}</h2><p>{t('wizardUI.quantitiesHelp')}</p>
        <div className="calc-wizard-tools"><select className="oa-field" aria-label={t('chapter')} value={chapter} onChange={e => setChapter(e.target.value)}><option value="">{t('wizardUI.allChapters')}</option>{chapters.map(item => <option key={item.id} value={item.id}>{item.description}</option>)}</select>
          <button className="oa-button" onClick={() => { const id = state.addChapter(null); setChapter(id); }}>{t('mobile.addChapter')}</button>
          <button className="oa-button oa-button--primary" onClick={() => { state.addItem(chapter || chapters[0]?.id || state.addChapter(null)); }}>{t('mobile.addPost')}</button></div>
        {chapters.filter(item => !chapter || chapter === item.id).map(item => <label className="calc-wizard-field" key={item.id}><span>{t('chapter')}</span><input className="oa-field" value={item.description} onChange={e => change(item, 'description', e.target.value)} /></label>)}
        {visiblePosts.slice(0, limit).map(item => <div className="calc-wizard-row" key={item.id}><label className="calc-wizard-field"><span>{item.code || t('description')}</span><input className="oa-field" value={item.description} onChange={e => change(item, 'description', e.target.value)} /></label>
          {number(item, 'quantity', t('quantity'))}<label className="calc-wizard-field"><span>{t('unit')}</span><select className="oa-field" value={item.unit} onChange={e => change(item, 'unit', e.target.value)}>{units.map(unit => <option key={unit}>{unit}</option>)}</select></label></div>)}
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
        {priced.some(item => !item.description.trim() || !(item.normUnitPrice || item.laborPrice || item.materialPrice)) && <p className="oa-banner" role="status">{t('wizardUI.missingPrices')}</p>}
        <table className="oa-table"><thead><tr><th>{t('description')}</th><th>{t('quantity')}</th><th>{t('wizardUI.total')}</th></tr></thead><tbody>{priced.slice(0, limit).map(item => <tr key={item.id}><td>{item.description}</td><td>{item.quantity} {item.unit}</td><td>{money.format(item.total)}</td></tr>)}</tbody></table>
        {priced.length > limit && <button className="oa-button" onClick={() => setLimit(n => n + 60)}>{t('wizardUI.more')}</button>}
        <button className="oa-button oa-button--primary" onClick={() => void saveFile()}>{t('save')}</button>
      </div>}
    </div>
    <footer className="calc-wizard-footer"><button className="oa-button" disabled={step === 0 || !!errors.size} onClick={() => show(step - 1)}>{t('wizardUI.back')}</button>
      <output aria-live="polite">{t('wizardUI.exclTax')}: <strong>{money.format(total.aanneemsomExcl + total.afronding)}</strong></output>
      <button className="oa-button oa-button--primary" disabled={!!errors.size} onClick={() => step < 4 ? show(step + 1) : editor()}>{t(step < 4 ? 'wizardUI.next' : 'wizardUI.editor')}</button>
    </footer>
  </section>;
}
