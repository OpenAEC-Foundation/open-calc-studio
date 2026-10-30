import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { ContentTab } from '@/state/slices/uiSlice';
import { uiText } from '@/i18n/uiText';
import appIcon from '@/assets/app-icon.svg';
import { useBudgetReview } from '@/components/review/useBudgetReview';

const views: { tab: ContentTab; key: string; label: string; path: string; group: 'estimate' | 'sources' }[] = [
  { tab: 'grid', key: 'estimate', label: 'Estimate', path: 'M3 3h18v18H3zM3 9h18M9 3v18M3 15h18', group: 'estimate' },
  { tab: 'review', key: 'review', label: 'Review center', path: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6', group: 'estimate' },
  { tab: 'promptBudget', key: 'prompt', label: 'Prompt & Estimate', path: 'M4 4h16v12H9l-5 4zM8 8h8M8 12h5', group: 'estimate' },
  { tab: 'wizard', key: 'wizard', label: 'Guided estimate', path: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6', group: 'estimate' },
  { tab: 'urenstaart', key: 'hours', label: 'Hours & markups', path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2', group: 'estimate' },
  { tab: 'rapport', key: 'report', label: 'Reports', path: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8', group: 'estimate' },
  { tab: 'viewer3d', key: 'model', label: '3D & quantities', path: 'm12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10', group: 'sources' },
  { tab: 'pdf', key: 'pdf', label: 'PDF & measurements', path: 'M4 3h11l5 5v13H4zM14 3v6h6M7 14h10M7 14v3M12 14v2M17 14v3', group: 'sources' },
  { tab: 'spreadsheet', key: 'sheets', label: 'Spreadsheets', path: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 9v11', group: 'sources' },
  { tab: 'ifc', key: 'ifc', label: 'IFC data', path: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5', group: 'sources' },
];

export function WorkspaceIcon({ path }: { path: string }) {
  return <svg className="oa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export function workspaceTitle(tab: ContentTab): string {
  const view = views.find(v => v.tab === tab);
  return view ? uiText(`shell.${view.key}`, view.label) : tab === 'offerte' ? uiText('shell.quotation', 'Quotation') : uiText('shell.summary', 'Summary');
}

export function WorkspaceNavigation({ onStart, onSettings }: { onStart: () => void; onSettings: () => void }) {
  const { t } = useTranslation();
  const active = useAppStore(s => s.activeContentTab);
  const hasDocument = useAppStore(s => s.documents.length > 0);
  const report = useBudgetReview();
  const navigate = (tab: ContentTab) => {
    const state = useAppStore.getState();
    if (tab === 'spreadsheet') state.setActiveSubSheet(state.activeSubSheetId ?? state.subSheets[0]?.id ?? state.addSubSheet());
    else state.setActiveSubSheet(null);
    state.setActiveContentTab(tab);
  };
  return <nav className="workspace-nav" aria-label={uiText('shell.navigation', 'Workspace navigation')}>
    <button className="workspace-brand" onClick={onStart} title={t('start')}>
      <img src={appIcon} width="30" height="30" alt="" />
      <span><strong>Open Calc</strong><small>OpenAEC Studio</small></span>
    </button>
    <button className="oa-button workspace-open" onClick={onStart} aria-label={uiText('shell.projects', 'Projects & files')} title={uiText('shell.projects', 'Projects & files')}><WorkspaceIcon path="M3 7h7l2 3h9v10H3zM3 7V4h6l2 3" />{uiText('shell.projects', 'Projects & files')}</button>
    <div className="workspace-nav-sections">
      {(['estimate', 'sources'] as const).map(group => <section key={group}>
        <h2 className="oa-mono-label">{group === 'estimate' ? uiText('shell.workspace', 'Workspace') : uiText('shell.sources', 'Drawings & data')}</h2>
        {views.filter(v => v.group === group).map(view => <button key={view.tab} className="workspace-nav-item" disabled={!hasDocument} aria-label={uiText(`shell.${view.key}`, view.label)} title={uiText(`shell.${view.key}`, view.label)} aria-current={active === view.tab && hasDocument ? 'page' : undefined} onClick={() => navigate(view.tab)}>
          <WorkspaceIcon path={view.path} /><span>{uiText(`shell.${view.key}`, view.label)}</span>
          {view.tab === 'review' && hasDocument && <small className="workspace-review-count" aria-label={uiText('review.badge', '{{count}} review issues', { count: report.counts.all })}>{report.counts.all}</small>}
        </button>)}
      </section>)}
    </div>
    <div className="workspace-nav-footer">
      <button className="workspace-nav-item" onClick={onSettings} aria-label={t('preferences')} title={t('preferences')}><WorkspaceIcon path="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6" /><span>{t('preferences')}</span></button>
      <span className="workspace-version">Open Calc Studio · {__APP_VERSION__}</span>
    </div>
  </nav>;
}
