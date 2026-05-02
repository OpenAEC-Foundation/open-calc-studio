import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { useFileOperations } from '@/hooks/useFileOperations';
import { ReleaseNotesPanel } from './ReleaseNotesPanel';
import './StartSidebar.css';

interface StartSidebarProps {
  onLoadVoorbeeld: () => void;
  onClose: () => void;
}

export function StartSidebar({ onLoadVoorbeeld, onClose }: StartSidebarProps) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const { newFile, openFile, openRecentFile } = useFileOperations();

  return (
    <aside className="start-sidebar">
      <div className="start-sidebar-toolbar">
        <span className="start-sidebar-title">Start</span>
        <button
          className="start-sidebar-close-btn"
          onClick={onClose}
          title="Inklappen"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.78 4.22a.75.75 0 010 1.06L8.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L6.94 8.53a.75.75 0 010-1.06l2.78-2.78a.75.75 0 011.06 0z" />
            <path d="M6.78 4.22a.75.75 0 010 1.06L4.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L2.94 8.53a.75.75 0 010-1.06l2.78-2.78a.75.75 0 011.06 0z" />
          </svg>
        </button>
      </div>

      <div className="start-sidebar-body">
        <div className="start-brand">
          <img src="/app-icon.svg" alt="" width="40" height="40" className="start-brand-icon" />
          <div className="start-brand-text">
            <h2>{t('appName')}</h2>
            <p>{t('noDocumentHint')}</p>
          </div>
        </div>

        <div className="start-actions">
          <button className="start-action-btn" onClick={newFile}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6m-3 3h6" />
            </svg>
            <span>{t('newBudget')}</span>
          </button>
          <button className="start-action-btn" onClick={() => void openFile()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <span>{t('open')}</span>
          </button>
          <button className="start-action-btn" onClick={onLoadVoorbeeld}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2h-4M12 2v13M9 6l3-3 3 3" />
            </svg>
            <span>Voorbeeldbegroting</span>
          </button>
        </div>

        {(settings.recentFiles?.length ?? 0) > 0 && (
          <div className="start-recent">
            <h3 className="start-recent-title">{t('backstage:recentFiles')}</h3>
            <div className="start-recent-list">
              {settings.recentFiles.map((filePath: string) => {
                const name = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.(ifcx|json|ocs|calc)$/i, '') ?? filePath;
                return (
                  <button
                    key={filePath}
                    className="start-recent-item"
                    onClick={() => void openRecentFile(filePath)}
                    title={filePath}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="start-releases">
          <ReleaseNotesPanel />
        </div>
      </div>
    </aside>
  );
}
