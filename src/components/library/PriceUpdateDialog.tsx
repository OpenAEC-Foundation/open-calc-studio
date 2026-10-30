import '@/components/common/SafeguardDialogs.css';
import { useRef, useState } from 'react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAppStore } from '@/state/appStore';
import { priceUpdateCommand } from '@/services/pricing/priceUpdateCommands';
import type { PriceUpdatePlan } from '@/services/pricing/priceUpdates';
import { uiText } from '@/i18n/uiText';
import { formatCurrency } from '@/utils/formatting';
const money = (value: number) => value === 0 ? '0,00' : formatCurrency(value);

export function PriceUpdateDialog() {
  const [plan, setPlan] = useState<(PriceUpdatePlan & { proposalId: string }) | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState('');
  const [limit, setLimit] = useState(100);
  const dialog = useRef<HTMLElement>(null);
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
    try { if (file.size > 10 * 1024 * 1024) throw Error('Catalogue exceeds 10 MiB.'); preview(JSON.parse(await file.text())); }
    catch (e) { setError(String(e)); }
  }
  function close() { if (plan) { try { priceUpdateCommand('discard', { proposalId: plan.proposalId }); } catch { /* Expired previews require no cleanup. */ } } useAppStore.getState().closeDialog(); }
  return <div className="resource-picker-overlay"><section ref={dialog} tabIndex={-1} className="resource-picker safeguard-dialog" role="dialog" aria-modal="true" aria-labelledby="price-update-title" style={{ width: 'min(960px,96vw)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
    <header><h2 id="price-update-title">{uiText('pricing.updates', 'Review price updates')}</h2><button onClick={close}>{uiText('close', 'Close')}</button></header>
    <p>{uiText('pricing.explain', 'Import a newer JSON catalogue with the same catalogue and article IDs. Select compatible changes to apply. Project overrides are preserved.')}</p>
    <label>{uiText('pricing.catalogue', 'Catalogue JSON')} <input type="file" accept=".json" onChange={e => void importCatalogue(e.target.files?.[0])} /></label>
    <button onClick={() => preview()}>{uiText('pricing.current', 'Compare loaded catalogue')}</button>
    {error && <p role="alert">{error}</p>}
    {plan && <>
      <p>{uiText('pricing.total', 'Estimate total including VAT, all compatible changes:')} {money(plan.beforeTotal)} → {money(plan.afterTotal)}</p>
      <p>{uiText('pricing.selectionPreview', 'The total above assumes every compatible change; only checked rows will be applied.')}</p>
      <ul>{plan.chapters.filter(c => c.before !== c.after).map(c => <li key={c.id}>{c.description}: {money(c.before)} → {money(c.after)}</li>)}</ul>
      <table><thead><tr><th>{uiText('pricing.select', 'Select')}</th><th>{uiText('pricing.article', 'Article')}</th><th>{uiText('pricing.old', 'Old')}</th><th>{uiText('pricing.new', 'New')}</th><th>{uiText('pricing.statusLabel', 'Status')}</th></tr></thead>
        <tbody>{plan.rows.slice(0, limit).map(row => <tr key={row.itemId}><td><input aria-label={row.description} type="checkbox" disabled={row.status !== 'changed'} checked={selected.includes(row.itemId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.itemId] : ids.filter(id => id !== row.itemId))} /></td><td>{row.description}</td><td>{row.before == null ? '—' : money(row.before)}</td><td>{row.after == null ? '—' : money(row.after)}</td><td>{uiText(`pricing.status.${row.status}`, row.status)}</td></tr>)}</tbody></table>
      {plan.rows.length > limit && <button onClick={() => setLimit(value => value + 100)}>{uiText('revisions.more', 'Show more')}</button>}
      <button disabled={!selected.length} onClick={() => { try { priceUpdateCommand('apply', { proposalId: plan.proposalId, itemIds: selected }); setPlan(null); setSelected([]); useAppStore.getState().closeDialog(); } catch (e) { setError(String(e)); } }}>{uiText('pricing.apply', 'Apply selected prices')}</button>
    </>}
  </section></div>;
}
