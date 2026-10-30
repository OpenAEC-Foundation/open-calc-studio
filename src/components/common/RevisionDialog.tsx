import '@/components/common/SafeguardDialogs.css';
import { useRef, useState } from 'react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAppStore } from '@/state/appStore';
import { revisionCommand, type RevisionPreview } from '@/services/revisions/revisionCommands';
import { uiText } from '@/i18n/uiText';

export function RevisionDialog() {
  const schedule = useAppStore(s => s.schedule);
  const [kind, setKind] = useState<'ifc' | 'pdf'>('ifc');
  const sources = kind === 'ifc' ? schedule.ifcTakeoff?.models ?? [] : schedule.pdfWorkspace?.sources ?? [];
  const [previousId, setPrevious] = useState(''), [nextId, setNext] = useState('');
  const [plan, setPlan] = useState<RevisionPreview | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [pdf, setPdf] = useState<{ rows: { id: string; label: string; before: number | null; after: number | null; status: string; verified: boolean }[] } | null>(null);
  const [error, setError] = useState(''), [limit, setLimit] = useState(100);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, true, () => { reset(); useAppStore.getState().closeDialog(); });
  function reset() { if (plan) { try { revisionCommand('discard', { proposalId: plan.proposalId }); } catch { /* Expired previews require no cleanup. */ } } setPlan(null); setPdf(null); setSelected([]); setLimit(100); }
  function compare() {
    try { reset(); const result = revisionCommand(kind === 'ifc' ? 'preview' : 'pdf', { previousId, nextId });
      if (kind === 'ifc') setPlan(result as RevisionPreview); else setPdf(result as typeof pdf);
      setError('');
    } catch (e) { setError(String(e)); }
  }
  return <div className="resource-picker-overlay"><section ref={dialog} tabIndex={-1} className="resource-picker safeguard-dialog" role="dialog" aria-modal="true" aria-labelledby="revision-title" style={{ width: 'min(1000px,96vw)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
    <header><h2 id="revision-title">{uiText('revisions.title', 'Compare source revisions')}</h2><button onClick={() => { reset(); useAppStore.getState().closeDialog(); }}>{uiText('close', 'Close')}</button></header>
    <p>{uiText('revisions.explain', 'Add both source files first. IFC matches use unique GlobalIds and the exact quantity key. PDF comparisons show imported measurements; calibration and geometry require review in the drawing.')}</p>
    <select aria-label={uiText('revisions.type', 'Source type')} value={kind} onChange={e => { reset(); setKind(e.target.value as typeof kind); setPrevious(''); setNext(''); }}><option value="ifc">IFC</option><option value="pdf">PDF</option></select>
    <label>{uiText('revisions.previous', 'Previous revision')}<select value={previousId} onChange={e => { reset(); setPrevious(e.target.value); }}><option value="">—</option>{sources.map(source => <option key={source.id} value={source.id}>{source.fileName} · {source.id.slice(0, 10)}</option>)}</select></label>
    <label>{uiText('revisions.next', 'New revision')}<select value={nextId} onChange={e => { reset(); setNext(e.target.value); }}><option value="">—</option>{sources.map(source => <option key={source.id} value={source.id}>{source.fileName} · {source.id.slice(0, 10)}</option>)}</select></label>
    <button disabled={!previousId || !nextId || previousId === nextId} onClick={compare}>{uiText('revisions.compare', 'Compare')}</button>
    {error && <p role="alert">{error}</p>}
    {plan && <>
      <h3>{uiText('revisions.objects', 'IFC quantity and identity differences')}</h3>
      <table><thead><tr><th>GlobalId</th><th>{uiText('revisions.name', 'Name')}</th><th>{uiText('revisions.statusLabel', 'Status')}</th><th>{uiText('revisions.values', 'Quantities')}</th></tr></thead><tbody>{plan.differences.filter(row => row.status !== 'unchanged').slice(0, limit).map(row => <tr key={row.globalId}><td>{row.globalId}</td><td>{row.name}</td><td>{uiText(`revisions.status.${row.status}`, row.status)}</td><td>{row.quantities.filter(q => q.before !== q.after).map(q => `${q.key}: ${q.before ?? '—'} → ${q.after ?? '—'} ${q.unit}`).join('; ')}</td></tr>)}</tbody></table>
      <h3>{uiText('revisions.linked', 'Linked estimate rows')}</h3>
      <table><thead><tr><th>{uiText('pricing.select', 'Select')}</th><th>{uiText('revisions.name', 'Name')}</th><th>{uiText('revisions.values', 'Quantities')}</th><th>{uiText('revisions.statusLabel', 'Status')}</th></tr></thead><tbody>{plan.rows.slice(0, limit).map(row => <tr key={row.itemId}><td><input type="checkbox" aria-label={row.description} disabled={row.status !== 'changed'} checked={selected.includes(row.itemId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.itemId] : ids.filter(id => id !== row.itemId))} /></td><td>{row.description}</td><td>{row.before ?? '—'} → {row.after ?? '—'} {row.unit}</td><td>{uiText(`revisions.status.${row.status}`, row.status)}</td></tr>)}</tbody></table>
      <button disabled={!selected.length} onClick={() => { try { revisionCommand('apply', { proposalId: plan.proposalId, itemIds: selected }); setPlan(null); useAppStore.getState().closeDialog(); } catch (e) { setError(String(e)); } }}>{uiText('revisions.apply', 'Apply selected quantity links')}</button>
    </>}
    {pdf && <table><thead><tr><th>{uiText('revisions.name', 'Name')}</th><th>{uiText('revisions.values', 'Quantities')}</th><th>{uiText('revisions.statusLabel', 'Status')}</th></tr></thead><tbody>{pdf.rows.slice(0, limit).map(row => <tr key={row.id}><td>{row.label}</td><td>{row.before ?? '—'} → {row.after ?? '—'}</td><td>{uiText(`revisions.status.${row.status}`, row.status)}{!row.verified && ` · ${uiText('revisions.unverified', 'Review source identity')}`}</td></tr>)}</tbody></table>}
    {((plan && (plan.differences.filter(row => row.status !== 'unchanged').length > limit || plan.rows.length > limit)) || (pdf && pdf.rows.length > limit)) && <button onClick={() => setLimit(value => value + 100)}>{uiText('revisions.more', 'Show more')}</button>}
  </section></div>;
}
