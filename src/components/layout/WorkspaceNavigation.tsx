import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { localStore } from '@/utils/browserStorage';
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

/** Tandwiel voor Voorkeuren (zelfde als in de titelbalk); de schuifjes zijn van Begeleid begroten. */
const GEAR_PATH = 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';

export function WorkspaceIcon({ path }: { path: string }) {
  return <svg className="oa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export function workspaceTitle(tab: ContentTab): string {
  const view = views.find(v => v.tab === tab);
  return view ? uiText(`shell.${view.key}`, view.label) : tab === 'offerte' ? uiText('shell.quotation', 'Quotation') : uiText('shell.summary', 'Summary');
}

const COLLAPSED_KEY = 'ocs-nav-collapsed';
/** In een smal venster is de zijbalk altijd alleen icoontjes (dezelfde stijl als ingeklapt). */
const NARROW_QUERY = '(max-width: 980px)';
const narrowMedia = typeof window !== 'undefined' ? window.matchMedia?.(NARROW_QUERY) : undefined;
const subscribeNarrow = (notify: () => void) => {
  narrowMedia?.addEventListener('change', notify);
  return () => narrowMedia?.removeEventListener('change', notify);
};
const isNarrow = () => !!narrowMedia?.matches;

export function WorkspaceNavigation({ onStart, onSettings }: { onStart: () => void; onSettings: () => void }) {
  const { t } = useTranslation();
  // Open of ingeklapt tot alleen icoontjes (meer breedte voor de begroting); de keuze blijft bewaard.
  const [collapsed, setCollapsedState] = useState(() => localStore.getItem(COLLAPSED_KEY) === '1');
  const setCollapsed = (value: boolean) => { setCollapsedState(value); localStore.setItem(COLLAPSED_KEY, value ? '1' : '0'); };
  const toggleCollapsed = () => setCollapsed(!collapsed);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const toggleLabel = collapsed ? uiText('shell.expandNav', 'Expand menu') : uiText('shell.collapseNav', 'Collapse menu');
  const active = useAppStore(s => s.activeContentTab);
  const hasDocument = useAppStore(s => s.documents.length > 0);
  const report = useBudgetReview();
  // Alleen met icoontjes heeft een tooltip zin; open herhaalt hij de zichtbare tekst.
  const iconsOnly = collapsed || narrow;
  const tip = (label: string) => iconsOnly ? label : undefined;
  const navigate = (tab: ContentTab) => {
    const state = useAppStore.getState();
    if (tab === 'spreadsheet') state.setActiveSubSheet(state.activeSubSheetId ?? state.subSheets[0]?.id ?? state.addSubSheet());
    else state.setActiveSubSheet(null);
    state.setActiveContentTab(tab);
  };
  const projectsLabel = uiText('shell.projects', 'Projects & files');
  const settingsLabel = t('preferences');
  return <nav className={`workspace-nav${iconsOnly ? ' is-collapsed' : ''}`} aria-label={uiText('shell.navigation', 'Workspace navigation')}>
    <button className="workspace-brand" onClick={onStart} title={t('start')}>
      <img src={appIcon} width="30" height="30" alt="" />
      <span><strong>Open Calc</strong><small>OpenAEC Studio</small></span>
    </button>
    <button className="oa-button workspace-open" onClick={onStart} aria-label={projectsLabel} title={tip(projectsLabel)}><WorkspaceIcon path="M3 7h7l2 3h9v10H3zM3 7V4h6l2 3" /><span>{projectsLabel}</span></button>
    <div className="workspace-nav-sections">
      {(['estimate', 'sources'] as const).map(group => <section key={group}>
        <h2 className="oa-mono-label">{group === 'estimate' ? uiText('shell.workspace', 'Workspace') : uiText('shell.sources', 'Drawings & data')}</h2>
        {views.filter(v => v.group === group).map(view => {
          const label = uiText(`shell.${view.key}`, view.label);
          return <button key={view.tab} className="workspace-nav-item" disabled={!hasDocument} aria-label={label} title={tip(label)} aria-current={active === view.tab && hasDocument ? 'page' : undefined} onClick={() => navigate(view.tab)}>
            <WorkspaceIcon path={view.path} /><span>{label}</span>
            {view.tab === 'review' && hasDocument && <small className="workspace-review-count" aria-label={uiText('review.badge', '{{count}} review issues', { count: report.counts.all })}>{report.counts.all}</small>}
          </button>;
        })}
      </section>)}
    </div>
    <div className="workspace-nav-footer">
      <button className="workspace-nav-item workspace-nav-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={toggleLabel} title={tip(toggleLabel)}><WorkspaceIcon path={collapsed ? 'M6 6l6 6-6 6M13 6l6 6-6 6' : 'M18 6l-6 6 6 6M11 6l-6 6 6 6'} /><span>{toggleLabel}</span></button>
      <button className="workspace-nav-item" onClick={onSettings} aria-label={settingsLabel} title={tip(settingsLabel)}><WorkspaceIcon path={GEAR_PATH} /><span>{settingsLabel}</span></button>
      <span className="workspace-version">Open Calc Studio · {__APP_VERSION__}</span>
    </div>
  </nav>;
}
