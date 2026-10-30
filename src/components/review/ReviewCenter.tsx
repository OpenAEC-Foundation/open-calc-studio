import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { ReviewFilter } from '@/services/review/budgetReview';
import { useBudgetReview } from './useBudgetReview';
import { QuantityOriginCard } from '@/components/common/QuantityOriginCard';
import { WorkspaceIcon } from '@/components/layout/WorkspaceNavigation';
import './ReviewCenter.css';

const categories: ReviewFilter[] = ['all', 'price', 'source', 'unit'];

export function ReviewCenter({ onOpenItem }: { onOpenItem?: (itemId: string) => void } = {}) {
  const { t, i18n } = useTranslation();
  const report = useBudgetReview();
  const filter = useAppStore(s => s.reviewFilter), selected = useAppStore(s => s.reviewIssueId);
  const items = useAppStore(s => s.items), documentId = useAppStore(s => s.activeDocumentId);
  const [error, setError] = useState(''), [limit, setLimit] = useState(100);
  const filtered = report.issues.filter(issue => filter === 'all' || issue.category === filter);
  const issue = filtered.find(issue => issue.id === selected) ?? filtered[0];
  const item = items.find(item => item.id === issue?.itemId);
  useEffect(() => { setLimit(100); setError(''); }, [documentId, filter]);
  const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(i18n.language, { maximumFractionDigits: 6 });
  function openItem() {
    if (!issue) return;
    try { useAppStore.getState().openReviewItem(issue.itemId); onOpenItem?.(issue.itemId); }
    catch (error) { setError((error as Error).message); }
  }
  return <section className="review-center" aria-label={t('review.title')}>
    <div className="review-filters">
      <button className="oa-button" onClick={() => useAppStore.getState().openDialog('priceUpdates')}>{i18n.language.startsWith('nl') ? 'Prijsupdates beoordelen' : 'Review price updates'}</button>
      <button className="oa-button" onClick={() => useAppStore.getState().openDialog('revisions')}>{i18n.language.startsWith('nl') ? 'Bronrevisies vergelijken' : 'Compare source revisions'}</button>
    </div>
    <header className="review-heading"><h2 className="oa-heading oa-heading--section">{t('review.title')}</h2><p role="status">{t('review.summary', { count: report.counts.all, rows: report.rowCount, affected: report.affectedRows })}</p><p>{t('review.scope')}</p></header>
    <div className="review-filters" role="group" aria-label={t('review.filterLabel')}>
      {categories.map(category => <button key={category} type="button" className="oa-button oa-button--quiet" aria-pressed={filter === category} onClick={() => useAppStore.getState().setReviewFilter(category)}>{t(`review.filters.${category}`)} <span className="oa-number">{report.counts[category]}</span></button>)}
    </div>
    {filtered.length === 0 ? <p className="review-empty" role="status">{t(report.counts.all ? 'review.emptyFilter' : 'review.empty')}</p> : <div className="review-content">
      <div className="review-list"><ul aria-label={t('review.issueList')}>
        {filtered.slice(0, limit).map(entry => <li key={entry.id}><button type="button" className="review-issue" aria-pressed={issue?.id === entry.id} onClick={() => { useAppStore.getState().setReviewIssue(entry.id); setError(''); }}>
          <span className={`review-severity review-severity-${entry.severity}`}><WorkspaceIcon path={entry.category === 'price' ? 'M12 3v18M16 7H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7' : entry.category === 'unit' ? 'm3 16 13-13 5 5L8 21zM7 12l3 3M11 8l3 3M15 4l3 3' : 'M4 3h10l6 6v12H4zM14 3v6h6M12 12v3M12 18h.01'} /><span>{t(`review.severity.${entry.severity}`)}</span></span>
          <span className="review-issue-text"><strong>{t(`review.messages.${entry.code}.title`)}</strong><span>{entry.description || t('noDescription')}</span>{entry.source?.label && <small>{entry.source.label}</small>}</span>
          <span className="review-row-number oa-number">{entry.number || '—'}</span>
        </button></li>)}
      </ul>{filtered.length > limit && <button type="button" className="oa-button" onClick={() => setLimit(value => value + 100)}>{t('review.showMore', { count: filtered.length - limit })}</button>}</div>
      {issue && item && <section className="review-detail" aria-label={t('review.details')}>
        <div className="review-detail-heading"><h3 className="oa-heading oa-heading--panel">{t(`review.messages.${issue.code}.title`)}</h3><span className="oa-chip">{t('review.open')}</span></div>
        <p>{t(`review.messages.${issue.code}.detail`)}</p>
        <dl><div><dt>{t('review.row')}</dt><dd>{issue.number || '—'} · {issue.description || t('noDescription')}</dd></div><div><dt>{t('review.quantity')}</dt><dd className="oa-number">{number(item.quantity)} {item.unit}</dd></div>
          {issue.source && <div><dt>{t('review.sourceValue')}</dt><dd className="oa-number">{number(issue.source.value)} {issue.source.unit}</dd></div>}
        </dl>
        <button type="button" className="oa-button oa-button--primary" onClick={openItem}>{t('review.showRow', { number: issue.number || '—' })}</button>
        {issue.category !== 'price' && <QuantityOriginCard key={item.id} item={item} allowNavigate={false} />}
        {error && <p role="alert">{error}</p>}
      </section>}
    </div>}
    <footer className="review-footer">{t('review.readOnly')}</footer>
  </section>;
}

export function ReviewReturnBar() {
  const { t } = useTranslation();
  const id = useAppStore(s => s.reviewReturnItemId), item = useAppStore(s => s.items.find(item => item.id === s.reviewReturnItemId));
  if (!id || !item) return null;
  return <div className="review-return-bar"><span>{t('review.selected', { number: item.nr || item.code || '—' })}</span><button type="button" className="oa-button oa-button--quiet oa-button--compact" onClick={() => { const state = useAppStore.getState(); state.setActiveSubSheet(null); state.setActiveContentTab('review'); }}>{t('review.back')}</button></div>;
}
