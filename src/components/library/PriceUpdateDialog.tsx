import '@/components/common/SafeguardDialogs.css';
import '../panels/panels.css';
import { useRef, useState } from 'react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAppStore } from '@/state/appStore';
import { priceUpdateCommand } from '@/services/pricing/priceUpdateCommands';
import type { PriceUpdatePlan } from '@/services/pricing/priceUpdates';
import { uiText } from '@/i18n/uiText';
import { formatCurrency, getNumberLocale } from '@/utils/formatting';
import { Banner } from './Banner';
// Zonder valutateken (catalogusprijzen kunnen een eigen valuta hebben); 0 als
// "0,00"/"0.00" in de notatie van de app-taal (issue #65).
const zero = () => new Intl.NumberFormat(`${getNumberLocale()}-u-nu-latn`, { minimumFractionDigits: 2 }).format(0);
const money = (value: number) => value === 0 ? zero() : formatCurrency(value);

const STATUS_TONE: Record<string, 'good' | 'muted' | 'warn'> = {
  changed: 'good', unchanged: 'muted', override: 'muted', inactive: 'muted', tariff: 'muted',
};

export function PriceUpdateDialog() {
  const [plan, setPlan] = useState<(PriceUpdatePlan & { proposalId: string }) | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState('');
  const [limit, setLimit] = useState(100);
  const [fileName, setFileName] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useDialogFocus(dialog, true, close);
  function preview(catalogue?: unknown) {
    try {
      if (plan) { try { priceUpdateCommand('discard', { proposalId: plan.proposalId }); } catch { /* Expired previews require no cleanup. */ } }
      const result = priceUpdateCommand('preview', { catalogue }) as PriceUpdatePlan & { proposalId: string };
      setPlan(result); setSelected([]); setLimit(100); setError('');
    } catch (e) { setPlan(null); setError(String(e)); }
  }
  async function importCatalogue(file?: File) {
    if (!file) return;
    setFileName(file.name);
    try { if (file.size > 10 * 1024 * 1024) throw Error('Catalogue exceeds 10 MiB.'); preview(JSON.parse(await file.text())); }
    catch (e) { setError(String(e)); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  }
  function close() { if (plan) { try { priceUpdateCommand('discard', { proposalId: plan.proposalId }); } catch { /* Expired previews require no cleanup. */ } } useAppStore.getState().closeDialog(); }
  const changed = plan?.rows.filter(row => row.status === 'changed').map(row => row.itemId) ?? [];
  const delta = plan ? plan.afterTotal - plan.beforeTotal : 0;

  return <div className="resource-picker-overlay"><section ref={dialog} tabIndex={-1} className="resource-picker safeguard-dialog price-update-dialog" role="dialog" aria-modal="true" aria-labelledby="price-update-title">
    <div className="resource-picker-header">
      <h2 id="price-update-title">{uiText('pricing.updates', 'Review price updates')}</h2>
      <button type="button" className="resource-picker-close" aria-label={uiText('close', 'Close')} title={uiText('close', 'Close')} onClick={close}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" /></svg>
      </button>
    </div>

    <div className="pu-body">
      <p className="pu-intro">{uiText('pricing.explain', 'Import a newer JSON catalogue with the same catalogue and article IDs. Select compatible changes to apply. Project overrides are preserved.')}</p>
      <div className="pu-sources">
        <button type="button" className="rp-import-btn" onClick={() => fileInput.current?.click()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" /></svg>
          {uiText('pricing.catalogue', 'Catalogue JSON')}{fileName ? `: ${fileName}` : ''}
        </button>
        <input ref={fileInput} type="file" hidden accept=".json" aria-label={uiText('pricing.catalogue', 'Catalogue JSON')} onChange={e => void importCatalogue(e.target.files?.[0])} />
        <button type="button" className="rp-ghost-btn" onClick={() => { setFileName(''); preview(); }}>{uiText('pricing.current', 'Compare loaded catalogue')}</button>
      </div>
      {error && <Banner kind="error" role="alert" onClose={() => setError('')}>{error}</Banner>}

      {plan && <>
        <div className="pu-summary">
          <div className="pu-total">
            <span className="pu-label">{uiText('pricing.total', 'Estimate total including VAT, all compatible changes:')}</span>
            <span className="pu-amounts">
              <span>{money(plan.beforeTotal)}</span>
              <span className="pu-arrow" aria-hidden="true">→</span>
              <strong>{money(plan.afterTotal)}</strong>
              {delta !== 0 && <span className={`pu-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '+' : '−'}{money(Math.abs(delta))}</span>}
            </span>
          </div>
          <p className="pu-note">{uiText('pricing.selectionPreview', 'The total above assumes every compatible change; only checked rows will be applied.')}</p>
          {plan.chapters.some(c => c.before !== c.after) && (
            <ul className="pu-chapters">
              {plan.chapters.filter(c => c.before !== c.after).map(c => <li key={c.id}><span>{c.description}</span><span>{money(c.before)} <span className="pu-arrow" aria-hidden="true">→</span> {money(c.after)}</span></li>)}
            </ul>
          )}
        </div>

        <div className="pu-table-wrap">
          <table className="pu-table">
            <thead><tr><th>{uiText('pricing.select', 'Select')}</th><th>{uiText('pricing.article', 'Article')}</th><th className="num">{uiText('pricing.old', 'Old')}</th><th className="num">{uiText('pricing.new', 'New')}</th><th>{uiText('pricing.statusLabel', 'Status')}</th></tr></thead>
            <tbody>{plan.rows.slice(0, limit).map(row => (
              <tr key={row.itemId} className={row.status === 'changed' ? '' : 'inactive'}>
                <td><input aria-label={row.description} type="checkbox" disabled={row.status !== 'changed'} checked={selected.includes(row.itemId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.itemId] : ids.filter(id => id !== row.itemId))} /></td>
                <td title={row.description}>{row.description}</td>
                <td className="num">{row.before == null ? '—' : money(row.before)}</td>
                <td className="num">{row.after == null ? '—' : money(row.after)}</td>
                <td><span className={`pu-status ${STATUS_TONE[row.status] ?? 'warn'}`}>{uiText(`pricing.status.${row.status}`, row.status)}</span></td>
              </tr>
            ))}</tbody>
          </table>
          {plan.rows.length > limit && <button type="button" className="rp-link-btn pu-more" onClick={() => setLimit(value => value + 100)}>{uiText('revisions.more', 'Show more')}</button>}
        </div>
      </>}
    </div>

    {plan && (
      <div className="resource-picker-footer">
        <span className="resource-picker-hint">
          {changed.length > 0 && selected.length < changed.length && (
            <button type="button" className="rp-link-btn" onClick={() => setSelected(changed)}>{uiText('pricing.selectAll', 'Select all changes')} ({changed.length})</button>
          )}
        </span>
        <button type="button" className="resource-picker-add-btn" disabled={!selected.length} onClick={() => { try { priceUpdateCommand('apply', { proposalId: plan.proposalId, itemIds: selected }); setPlan(null); setSelected([]); useAppStore.getState().closeDialog(); } catch (e) { setError(String(e)); } }}>{uiText('pricing.apply', 'Apply selected prices')}</button>
      </div>
    )}
  </section></div>;
}
