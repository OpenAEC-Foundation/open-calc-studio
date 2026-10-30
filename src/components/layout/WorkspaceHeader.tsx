import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { useFileOperations } from '@/hooks/useFileOperations';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { uiText } from '@/i18n/uiText';
import { workspaceTitle, WorkspaceIcon } from './WorkspaceNavigation';

export function WorkspaceHeader() {
  const { t, i18n } = useTranslation();
  const schedule = useAppStore(s => s.schedule);
  const items = useAppStore(s => s.items);
  const active = useAppStore(s => s.activeContentTab);
  const doc = useAppStore(s => s.documents.find(d => d.id === s.activeDocumentId));
  const { saveFile } = useFileOperations();
  const total = useMemo(() => {
    const breakdown = getStaartBreakdown(items);
    return breakdown.aanneemsom + breakdown.afronding;
  }, [items]);
  const formatted = new Intl.NumberFormat(i18n.language || 'en', { style: 'currency', currency: /^[A-Z]{3}$/.test(schedule.currency) ? schedule.currency : 'EUR' }).format(total);
  return <header className="workspace-header">
    <div className="workspace-heading">
      <div className="workspace-breadcrumb"><span>{schedule.projectNumber || t('appName')}</span><span aria-hidden="true">/</span><span>{workspaceTitle(active)}</span></div>
      <h1 className="oa-heading oa-heading--page" title={schedule.projectName || doc?.fileName}>{schedule.projectName || doc?.fileName}</h1>
      <span className="workspace-document-status"><span className={`workspace-status-dot${doc?.isModified ? ' is-modified' : ''}`} />{doc?.isModified ? uiText('shell.unsaved', 'Unsaved changes') : doc?.filePath ? uiText('shell.saved', 'Saved') : uiText('shell.local', 'Local document')}</span>
    </div>
    <div className="workspace-total"><span className="oa-mono-label">{uiText('shell.total', 'Estimate · excl. VAT')}</span><strong className="oa-number">{formatted}</strong></div>
    <button className="oa-button oa-button--primary workspace-save" onClick={() => void saveFile()}><WorkspaceIcon path="M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8" />{t('save')}</button>
  </header>;
}
