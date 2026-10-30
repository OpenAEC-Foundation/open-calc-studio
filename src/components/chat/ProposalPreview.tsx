import { useTranslation } from 'react-i18next';
import type { AssistantProposalSummary } from '@/services/assistant/assistantProposal';
import { uiText } from '@/i18n/uiText';

export function ProposalPreview({ proposal }: { proposal: AssistantProposalSummary }) {
  const { i18n } = useTranslation();
  const currency = new Intl.NumberFormat(i18n.language || 'en', { style: 'currency', currency: /^[A-Z]{3}$/.test(proposal.currency) ? proposal.currency : 'EUR' });
  const money = (value: number) => currency.format(value);
  const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(i18n.language || 'en', { maximumFractionDigits: 4 });
  const rows = [ ['direct', uiText('proposal.direct', 'Direct costs')], ['excludingVat', uiText('proposal.excludingVat', 'Total excl. VAT')], ['vat', uiText('proposal.vat', 'VAT')], ['includingVat', uiText('proposal.includingVat', 'Total incl. VAT')] ] as const;
  return <section className="proposal-preview" aria-label={uiText('proposal.title', 'Financial preview')}>
    <strong>{uiText('proposal.title', 'Financial preview')}</strong>
    <div className="proposal-table-scroll"><table className="proposal-totals"><thead><tr><th scope="col">{uiText('proposal.amount', 'Amount')}</th><th scope="col">{uiText('proposal.before', 'Before')}</th><th scope="col">{uiText('proposal.after', 'After')}</th><th scope="col">{uiText('proposal.difference', 'Difference')}</th></tr></thead>
      <tbody>{rows.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{money(proposal.beforeTotals[key])}</td><td>{money(proposal.afterTotals[key])}</td><td>{money(proposal.afterTotals[key] - proposal.beforeTotals[key])}</td></tr>)}</tbody></table></div>
    {proposal.errors.length > 0 && <div role="alert">{proposal.errors.join('\n')}</div>}
    <details open><summary>{uiText('proposal.rows', 'Changed rows: {{count}}', { count: proposal.changes.length })}</summary>
      <div className="proposal-table-scroll"><table className="proposal-changes"><thead><tr><th>{uiText('proposal.change', 'Change')}</th><th>{uiText('proposal.row', 'Estimate row')}</th><th>{uiText('proposal.quantity', 'Quantity: before → after')}</th><th>{uiText('proposal.price', 'Purchase price: before → after')}</th><th>{uiText('proposal.rowTotal', 'Row total: before → after')}</th></tr></thead>
        <tbody>{proposal.changes.map(change => <tr key={change.id}><td>{uiText(`proposal.${change.kind}`, change.kind)}</td><th scope="row">{change.after?.nr ?? change.before?.nr} {change.after?.description ?? change.before?.description}{change.before && change.after && change.before.description !== change.after.description && <small>{change.before.description} → {change.after.description}</small>}
            {change.before?.normQuantity !== change.after?.normQuantity && <small>{uiText('proposal.norm', 'Labour norm')}: {number(change.before?.normQuantity)} → {number(change.after?.normQuantity)}</small>}
            {change.before?.tariefGroep !== change.after?.tariefGroep && <small>{uiText('proposal.rateGroup', 'Rate group')}: {change.before?.tariefGroep ?? '—'} → {change.after?.tariefGroep ?? '—'}</small>}</th>
          <td>{number(change.before?.quantity)} {change.before?.unit} → {number(change.after?.quantity)} {change.after?.unit}</td><td>{change.before ? money(change.before.normUnitPrice ?? 0) : '—'} → {change.after ? money(change.after.normUnitPrice ?? 0) : '—'}</td><td>{change.before ? money(change.before.total) : '—'} → {change.after ? money(change.after.total) : '—'}</td></tr>)}</tbody></table></div>
      <p className="oa-secondary">{uiText('proposal.rollups', 'Parent totals and markups are shown too; do not add the row differences together.')}</p>
    </details>
    <details><summary>{uiText('proposal.assumptions', 'Assumptions and pricing basis')}</summary><ul>{proposal.assumptions.map((value, index) => <li key={index}>{value}</li>)}</ul></details>
  </section>;
}
